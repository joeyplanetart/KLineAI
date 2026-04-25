"""Analysis service with async job management."""
import asyncio
import logging
from datetime import datetime
from typing import Optional

from app.core.db import SessionLocal
from app.models.analysis import AnalysisReport, AnalysisStatus
from app.services.llm import LLMService
from app.services.analysis.macro_fetcher import MacroFetcher
from app.services.analysis.technical import TechnicalAnalyzer
from app.services.analysis.prompt_builder import PromptBuilder
from app.services.analysis.report_generator import ReportGenerator

logger = logging.getLogger(__name__)

class AnalysisService:
    """AI analysis service with async job management."""

    def __init__(self):
        self.llm_service = LLMService()
        self.macro_fetcher = MacroFetcher()
        self.technical_analyzer = TechnicalAnalyzer()
        self.prompt_builder = PromptBuilder()
        self.report_generator = ReportGenerator()

    def create_analysis(self, symbol: str, name: str = None) -> str:
        """
        Create a new analysis job, return job_id immediately.

        Args:
            symbol: Stock symbol (e.g., 'sh600000')
            name: Optional stock name

        Returns:
            job_id (UUID string)
        """
        db = SessionLocal()
        try:
            report = AnalysisReport(
                symbol=symbol,
                name=name or symbol,
                status=AnalysisStatus.PENDING
            )
            db.add(report)
            db.commit()

            return report.job_id
        finally:
            db.close()

    async def _run_analysis(self, report_id: int):
        """Execute analysis task in background."""
        db = SessionLocal()
        try:
            report = db.query(AnalysisReport).filter(AnalysisReport.id == report_id).first()
            if not report:
                logger.warning(f"Report {report_id} not found")
                return

            # Update status to processing
            report.status = AnalysisStatus.PROCESSING
            db.commit()

            # 1. Get stock data from database
            from app.models.stock import StockDaily
            stock_data_list = db.query(StockDaily).filter(
                StockDaily.symbol == report.symbol
            ).order_by(StockDaily.trade_date.desc()).limit(100).all()

            if not stock_data_list:
                logger.warning(f"No stock data for {report.symbol}")
                report.status = AnalysisStatus.FAILED
                db.commit()
                return

            # 2. Calculate technical indicators
            technical_result = self.technical_analyzer.analyze(stock_data_list)

            # 3. Fetch macro data
            macro_data = self.macro_fetcher.fetch_all()

            # 4. Build prompts
            stock_data_for_prompt = {
                "symbol": report.symbol,
                "latest": {
                    "close": stock_data_list[0].close if stock_data_list else 0,
                    "pct_change": stock_data_list[0].pct_change if stock_data_list else 0
                }
            }
            system_prompt, user_prompt = self.prompt_builder.build(
                report.symbol,
                report.name or report.symbol,
                stock_data_for_prompt,
                macro_data,
                technical_result
            )

            # 5. Call LLM
            try:
                llm_response = self.llm_service.call_llm_api(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    model=None,  # Use default model from config
                    temperature=0.3,
                    use_json_mode=True
                )
            except Exception as e:
                logger.error(f"LLM call failed: {e}")
                report.status = AnalysisStatus.FAILED
                db.commit()
                return

            # 6. Parse LLM response
            try:
                parsed = self.report_generator.parse(llm_response)
            except ValueError as e:
                logger.error(f"Failed to parse LLM response: {e}")
                report.status = AnalysisStatus.FAILED
                db.commit()
                return

            # 7. Update report with analysis results
            report.recommendation = parsed.get("recommendation", "HOLD")
            report.confidence = float(parsed.get("confidence", 50))
            report.composite_score = int(parsed.get("composite_score", 50))
            report.technical_score = int(parsed.get("technical_score", 50))
            report.fundamental_score = int(parsed.get("fundamental_score", 50))
            report.sentiment_score = int(parsed.get("sentiment_score", 50))
            report.cycle_predictions = parsed.get("cycle_predictions", {})
            report.technical_details = parsed.get("technical_details", {})
            report.fundamental_details = parsed.get("fundamental_details", {})
            report.sentiment_details = parsed.get("sentiment_details", {})
            report.risk_warnings = parsed.get("risk_warnings", [])
            report.report = parsed.get("report", "")

            # Set support/resistance from technical analysis
            if technical_result:
                report.support_level = technical_result.get("support_level")
                report.resistance_level = technical_result.get("resistance_level")

            report.status = AnalysisStatus.COMPLETED
            report.updated_at = datetime.utcnow()
            db.commit()

            logger.info(f"Analysis completed for {report.symbol}")

        except Exception as e:
            logger.error(f"Analysis failed for report {report_id}: {e}")
            try:
                report.status = AnalysisStatus.FAILED
                db.commit()
            except:
                pass
        finally:
            db.close()

    def get_status(self, job_id: str) -> Optional[dict]:
        """Get analysis job status."""
        db = SessionLocal()
        try:
            report = db.query(AnalysisReport).filter(AnalysisReport.job_id == job_id).first()
            if not report:
                return None
            return {
                "job_id": report.job_id,
                "status": report.status.value,
                "symbol": report.symbol
            }
        finally:
            db.close()

    def get_latest(self, symbol: str) -> Optional[AnalysisReport]:
        """Get latest completed analysis for a symbol."""
        db = SessionLocal()
        try:
            return db.query(AnalysisReport).filter(
                AnalysisReport.symbol == symbol,
                AnalysisReport.status == AnalysisStatus.COMPLETED
            ).order_by(AnalysisReport.created_at.desc()).first()
        finally:
            db.close()


# Singleton instance
analysis_service = AnalysisService()