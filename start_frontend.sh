#!/bin/bash

# Define frontend port
FRONTEND_PORT=5173

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

# Check frontend port
free_port $FRONTEND_PORT

# Start frontend server
cd frontend
npm run dev -- --port $FRONTEND_PORT > ../frontend.log 2>&1 &
FRONTEND_PID=$!

echo "✅ Frontend started with PID: $FRONTEND_PID (Logging to frontend.log)"

# Trap Ctrl+C / termination signals to stop the frontend
trap "echo '🛑 Stopping frontend...'; kill -9 $FRONTEND_PID 2>/dev/null; echo '✅ Frontend stopped.'; exit 0" SIGINT SIGTERM

# Wait for the frontend process to finish
wait $FRONTEND_PID
