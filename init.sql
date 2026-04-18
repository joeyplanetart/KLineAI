-- Enable the TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Other initial schema setups can go here.
-- For now, we will manage schema migrations via SQLAlchemy/Alembic in the backend.
