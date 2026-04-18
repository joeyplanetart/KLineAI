#!/bin/bash

# Define backend port
BACKEND_PORT=8000

# Function to check and kill process by port (reuse from start.sh)
free_port() {
    local port=$1
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

# Check backend port
free_port $BACKEND_PORT

# Activate virtual environment if exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Start backend server, log to backend.log
uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT --reload > backend.log 2>&1 &
BACKEND_PID=$!

echo "✅ Backend started with PID: $BACKEND_PID (logging to backend.log)"

# Wait for termination signal to clean up
trap "echo '🛑 Stopping backend...'; kill -9 $BACKEND_PID 2>/dev/null; echo '✅ Backend stopped.'; exit 0" SIGINT SIGTERM

wait $BACKEND_PID
