-- Create analysis_reports table
CREATE TABLE IF NOT EXISTS analysis_reports (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    name VARCHAR(50),
    job_id VARCHAR(36) UNIQUE,
    status VARCHAR(20) DEFAULT 'pending',
    recommendation VARCHAR(10),
    confidence FLOAT,
    composite_score INTEGER,
    technical_score INTEGER,
    fundamental_score INTEGER,
    sentiment_score INTEGER,
    cycle_predictions JSONB,
    technical_details JSONB,
    fundamental_details JSONB,
    sentiment_details JSONB,
    support_level FLOAT,
    resistance_level FLOAT,
    risk_warnings JSONB,
    report TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analysis_reports_symbol ON analysis_reports(symbol);
CREATE INDEX IF NOT EXISTS idx_analysis_reports_job_id ON analysis_reports(job_id);
