#!/bin/bash

# Define ports
BACKEND_PORT=8000
FRONTEND_PORT=5173

# Function to check and kill process by port
free_port() {
    local port=$1
    # Find the PID of the process using the port
    local pid=$(lsof -t -i:$port)
    
    if [ ! -z "$pid" ]; then
        echo "⚠️  Port $port is currently occupied by PID(s): $pid"
        echo "🔪 Killing process(es) on port $port..."
        kill -9 $pid
        sleep 1
        echo "✅ Process(es) killed. Port $port is now free."
    else
        echo "✅ Port $port is free."
    fi
}

echo "========================================="
echo "🔍 Checking ports before starting..."
echo "========================================="
free_port $BACKEND_PORT
free_port $FRONTEND_PORT
echo ""

echo "========================================="
echo "🚀 Starting KLineAI Quantitative Trading System..."
echo "========================================="

# Start backend
echo "📦 Starting backend server on port $BACKEND_PORT..."

# Determine python/uvicorn paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/venv/bin/uvicorn" ]; then
    UVICORN="$SCRIPT_DIR/venv/bin/uvicorn"
    PYTHON="$SCRIPT_DIR/venv/bin/python"
else
    UVICORN=$(which uvicorn)
    PYTHON=$(which python3)
fi

if [ -z "$UVICORN" ]; then
    echo "❌ uvicorn not found! Installing dependencies..."
    "$SCRIPT_DIR/venv/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"
    UVICORN="$SCRIPT_DIR/venv/bin/uvicorn"
fi

cd "$SCRIPT_DIR"
$UVICORN app.main:app --host 0.0.0.0 --port $BACKEND_PORT --reload > backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started with PID: $BACKEND_PID (Logging to backend.log)"

# Start frontend
echo "🎨 Starting frontend server on port $FRONTEND_PORT..."
cd "$SCRIPT_DIR/frontend"
npm run dev -- --port $FRONTEND_PORT > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo "✅ Frontend started with PID: $FRONTEND_PID (Logging to frontend.log)"
cd "$SCRIPT_DIR"

echo ""
echo "========================================="
echo "🎉 All services are running!"
echo "📡 Backend URL:  http://localhost:$BACKEND_PORT"
echo "🖥️  Frontend URL: http://localhost:$FRONTEND_PORT"
echo "🛑 Press Ctrl+C to stop all services"
echo "========================================="

# Trap Ctrl+C to kill both services
trap "echo -e '\n🛑 Stopping services...'; kill -9 $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '✅ Services stopped.'; exit 0" SIGINT SIGTERM

# Wait for all background processes
wait
