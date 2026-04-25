"""Analysis API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional

from app.core.db import get_db
from app.models.analysis import AnalysisReport, AnalysisStatus
from app.services.analysis.service import analysis_service
from pydantic import BaseModel

router = APIRouter()

class AnalysisResponse(BaseModel):
    """Response for starting analysis."""
    job_id: str
    status: str
    symbol: str

class AnalysisResultResponse(BaseModel):
    """Response for getting analysis result."""
    id: int
    symbol: str
    name: str
    recommendation: str
    confidence: float
    composite_score: int
    technical_score: int
    fundamental_score: int
    sentiment_score: int
    cycle_predictions: dict
    technical_details: dict
    fundamental_details: dict
    sentiment_details: dict
    support_level: float
    resistance_level: float
    risk_warnings: list
    report: str
    created_at: str

    class Config:
        from_attributes = True

def _run_analysis_task(job_id: str):
    """Synchronous wrapper to run async analysis in thread pool."""
    import asyncio
    import concurrent.futures
    import logging

    logger = logging.getLogger(__name__)

    # Get report_id from job_id
    from app.core.db import SessionLocal
    from app.models.analysis import AnalysisReport

    db = SessionLocal()
    try:
        report = db.query(AnalysisReport).filter(AnalysisReport.job_id == job_id).first()
        if not report:
            logger.error(f"No report found for job_id: {job_id}")
            return
        report_id = report.id
        logger.info(f"Starting background analysis for report_id: {report_id}")
    finally:
        db.close()

    def _async_run():
        try:
            asyncio.run(analysis_service._run_analysis(report_id))
            logger.info(f"Analysis completed for report_id: {report_id}")
        except Exception as e:
            logger.error(f"Analysis failed for report_id {report_id}: {e}")

    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    executor.submit(_async_run)

@router.post("/{symbol}", response_model=AnalysisResponse)
def start_analysis(symbol: str, name: Optional[str] = None, background_tasks: BackgroundTasks = None, db: Session = Depends(get_db)):
    """
    Start a new analysis for a stock symbol.

    Returns immediately with job_id for polling.
    """
    job_id = analysis_service.create_analysis(symbol, name)

    # Schedule background analysis using FastAPI's BackgroundTasks
    if background_tasks:
        background_tasks.add_task(_run_analysis_task, job_id)

    return AnalysisResponse(job_id=job_id, status="pending", symbol=symbol)

@router.get("/status/{job_id}")
def get_analysis_status(job_id: str):
    """
    Get analysis job status by job_id.

    Returns status: pending, processing, completed, failed
    """
    result = analysis_service.get_status(job_id)
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    return result

@router.get("/{symbol}", response_model=AnalysisResultResponse)
def get_latest_analysis(symbol: str, db: Session = Depends(get_db)):
    """
    Get the latest completed analysis for a symbol.
    """
    report = analysis_service.get_latest(symbol)
    if not report:
        raise HTTPException(status_code=404, detail="No analysis found")

    return AnalysisResultResponse(
        id=report.id,
        symbol=report.symbol,
        name=report.name or report.symbol,
        recommendation=report.recommendation or "HOLD",
        confidence=report.confidence or 50,
        composite_score=report.composite_score or 50,
        technical_score=report.technical_score or 50,
        fundamental_score=report.fundamental_score or 50,
        sentiment_score=report.sentiment_score or 50,
        cycle_predictions=report.cycle_predictions or {},
        technical_details=report.technical_details or {},
        fundamental_details=report.fundamental_details or {},
        sentiment_details=report.sentiment_details or {},
        support_level=report.support_level or 0,
        resistance_level=report.resistance_level or 0,
        risk_warnings=report.risk_warnings or [],
        report=report.report or "",
        created_at=report.created_at.isoformat() if report.created_at else ""
    )

@router.delete("/{symbol}")
def delete_analysis(symbol: str, db: Session = Depends(get_db)):
    """Delete analysis record for a symbol."""
    report = db.query(AnalysisReport).filter(AnalysisReport.symbol == symbol).first()
    if report:
        db.delete(report)
        db.commit()
    return {"message": "deleted"}