"""
后台批量任务服务
使用 Redis 存储任务进度
"""
import uuid
import time
from typing import Dict, Optional, List
from datetime import datetime
from sqlalchemy.orm import Session

from app.services.cache.cache_manager import cache_manager
from app.services.data_collector.batch_collector import BatchCollector


class BatchJobService:
    """批量采集任务服务"""

    # 任务状态
    STATUS_PENDING = "pending"
    STATUS_RUNNING = "running"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"

    # Redis key patterns
    KEY_JOB = "batch:job:{job_id}"
    KEY_JOB_RESULTS = "batch:job:{job_id}:results"
    TTL_JOB = 3600 * 24  # 24小时

    @classmethod
    def _get_job_key(cls, job_id: str) -> str:
        return cls.KEY_JOB.format(job_id=job_id)

    @classmethod
    def _get_results_key(cls, job_id: str) -> str:
        return cls.KEY_JOB_RESULTS.format(job_id=job_id)

    @classmethod
    def start_batch_job(
        cls,
        db: Session,
        symbols: List[str],
        start_date: str,
        end_date: str,
        source: str = "baostock",
        adjust: str = "qfq"
    ) -> str:
        """
        启动批量采集任务，返回 job_id
        """
        job_id = str(uuid.uuid4())[:8]

        # 初始化任务状态
        job_data = {
            "job_id": job_id,
            "status": cls.STATUS_PENDING,
            "total": len(symbols),
            "current": 0,
            "success": 0,
            "failed": 0,
            "symbols": symbols,
            "start_date": start_date,
            "end_date": end_date,
            "source": source,
            "adjust": adjust,
            "created_at": datetime.now().isoformat(),
            "started_at": None,
            "completed_at": None,
            "error": None
        }

        # 保存任务状态到 Redis
        cache_manager.set(cls._get_job_key(job_id), job_data, ttl=cls.TTL_JOB)

        # 在后台线程中执行任务（不传递 db session，在线程内创建新的）
        cls._run_job_async(job_id, symbols, start_date, end_date, source, adjust)

        return job_id

    @classmethod
    def _run_job_async(
        cls,
        job_id: str,
        symbols: List[str],
        start_date: str,
        end_date: str,
        source: str,
        adjust: str
    ):
        """异步执行批量采集任务"""
        import threading
        from app.core.db import SessionLocal

        def run():
            # 在线程内创建新的数据库 session
            db = SessionLocal()
            try:
                # 更新状态为运行中
                job_data = cache_manager.get(cls._get_job_key(job_id))
                job_data["status"] = cls.STATUS_RUNNING
                job_data["started_at"] = datetime.now().isoformat()
                cache_manager.set(cls._get_job_key(job_id), job_data, ttl=cls.TTL_JOB)

                # 分批处理，每批100个
                batch_size = 100
                collector = BatchCollector()
                total_success = 0
                total_failed = 0

                for i in range(0, len(symbols), batch_size):
                    batch_symbols = symbols[i:i + batch_size]

                    # 采集当前批次
                    result = collector.batch_fetch(
                        db,
                        batch_symbols,
                        start_date,
                        end_date,
                        source,
                        adjust=adjust
                    )

                    total_success += result.get("success", 0)
                    total_failed += result.get("failed", 0)

                    # 更新进度
                    job_data = cache_manager.get(cls._get_job_key(job_id))
                    job_data["current"] = min(i + batch_size, len(symbols))
                    job_data["success"] = total_success
                    job_data["failed"] = total_failed
                    cache_manager.set(cls._get_job_key(job_id), job_data, ttl=cls.TTL_JOB)

                # 任务完成
                job_data = cache_manager.get(cls._get_job_key(job_id))
                job_data["status"] = cls.STATUS_COMPLETED
                job_data["completed_at"] = datetime.now().isoformat()
                job_data["current"] = len(symbols)
                cache_manager.set(cls._get_job_key(job_id), job_data, ttl=cls.TTL_JOB)

            except Exception as e:
                # 任务失败
                job_data = cache_manager.get(cls._get_job_key(job_id))
                if job_data:
                    job_data["status"] = cls.STATUS_FAILED
                    job_data["error"] = str(e)
                    job_data["completed_at"] = datetime.now().isoformat()
                    cache_manager.set(cls._get_job_key(job_id), job_data, ttl=cls.TTL_JOB)
            finally:
                db.close()

        thread = threading.Thread(target=run, daemon=True)
        thread.start()

        thread = threading.Thread(target=run, daemon=True)
        thread.start()

    @classmethod
    def get_job_status(cls, job_id: str) -> Optional[Dict]:
        """获取任务状态"""
        return cache_manager.get(cls._get_job_key(job_id))

    @classmethod
    def get_active_jobs(cls) -> List[Dict]:
        """获取所有活跃任务（运行中或待处理）"""
        try:
            keys = cache_manager.keys("batch:job:*")
            active_jobs = []
            for key in keys:
                # 提取 job_id
                parts = key.split(":")
                if len(parts) >= 3:
                    job_id = parts[2]
                    job_data = cache_manager.get(f"batch:job:{job_id}")
                    if job_data and job_data.get("status") in [cls.STATUS_PENDING, cls.STATUS_RUNNING]:
                        active_jobs.append(job_data)
            return active_jobs
        except Exception as e:
            print(f"Error getting active jobs: {e}")
            return []


# 全局单例
batch_job_service = BatchJobService()
