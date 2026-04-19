# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KLineAI is a quantitative trading system with a FastAPI backend and React/TypeScript frontend. It provides stock market data visualization (K-line charts) and AI-powered trading strategy generation.

## Architecture

- **Backend**: Python FastAPI + SQLAlchemy + PostgreSQL/TimescaleDB
- **Frontend**: React 19 + TypeScript + Material UI + ECharts
- **Task Queue**: Celery + Redis
- **Database**: PostgreSQL with TimescaleDB extension for time-series data
- **Auth**: JWT-based authentication with bcrypt password hashing

### Key Directory Structure

```
app/
├── api/endpoints/    # API route handlers (market.py, strategy.py, auth.py)
├── core/             # Config, database, security modules
├── models/           # SQLAlchemy models (StockDaily, User)
├── services/          # Business logic (backtest, data_fetcher, llm_service)
└── main.py            # FastAPI application entry point

frontend/src/
├── pages/            # Route pages (dashboard.tsx, strategy.tsx)
├── components/       # Reusable components (Layout.tsx, ProtectedRoute.tsx)
├── context/           # React contexts (ThemeContext.tsx, AuthContext.tsx)
└── theme/             # MUI theme configuration
```

## Common Commands

### Setup
```bash
# Install backend dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd frontend && npm install

# Start database and redis containers
docker-compose up -d
```

### Running the Application
```bash
# Start both backend and frontend (recommended)
./start.sh

# Or run individually:
# Backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend && npm run dev
```

### Database
```bash
# Reset database (clears volumes)
docker-compose down -v && docker-compose up -d

# Connect to PostgreSQL
docker-compose exec -T db psql -U klineai_user -d klineai
```

## API Endpoints

- `/api/v1/auth` - Authentication (register, login, refresh, logout)
- `/api/v1/market` - Stock market data (search, fetch, get daily data)
- `/api/v1/strategy` - Trading strategies (generate, backtest)

## Important Patterns

### Backend
- Database models use SQLAlchemy with `get_db()` dependency injection
- Protected endpoints use `Depends(get_current_user)` for authentication
- Admin-only endpoints use `Depends(get_current_admin)`
- Enum fields in models use `values_callable` to store string values in PostgreSQL

### Frontend
- API calls to backend use `http://localhost:8000/api/v1` prefix
- Auth state managed via `AuthContext` with `useAuth()` hook
- Protected routes wrapped in `ProtectedRoute` component
- Theme toggle via `useThemeMode()` hook from `ThemeContext`

### Database Schema
- `stock_daily` table: stock symbol, trade_date, OHLCV data, technical indicators
- `users` table: username, email, hashed_password, role (user/admin)

## Authentication

Default admin account:
- Username: `admin`
- Email: `joey01265235@163.com`
- Password: `Zy123456`
- Role: `admin`

JWT tokens are stored in localStorage and sent as `Authorization: Bearer <token>` header.
