-- Enable the TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Default admin user: joey01265235@163.com / Zy123456
INSERT INTO users (username, email, hashed_password, role)
VALUES ('admin', 'joey01265235@163.com', '$2b$12$lcwift8UPSUR9pCDx/JQ4OMlJia6UEy1nCE/2IOcsdWrvbvUkrdjq', 'admin')
ON CONFLICT (username) DO UPDATE SET role = 'admin', hashed_password = '$2b$12$lcwift8UPSUR9pCDx/JQ4OMlJia6UEy1nCE/2IOcsdWrvbvUkrdjq';

-- Other initial schema setups can go here.
-- For now, we will manage schema migrations via SQLAlchemy/Alembic in the backend.
