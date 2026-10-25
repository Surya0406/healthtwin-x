#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

# Ensure Node.js is available (check nvm fallback if not in PATH)
if ! command -v node >/dev/null 2>&1; then
    if [ -d "$HOME/.nvm/versions/node" ]; then
        LATEST_NODE=$(find "$HOME/.nvm/versions/node" -maxdepth 2 -name "bin" | sort -V | tail -n 1)
        if [ -n "$LATEST_NODE" ]; then
            export PATH="$LATEST_NODE:$PATH"
        fi
    fi
fi

# Install frontend dependencies if needed
if [ ! -d "$DIR/frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    (cd "$DIR/frontend" && npm install)
fi

echo "Starting Backend API on http://localhost:8000..."
python3 -m uvicorn backend.main:app --port 8000 &
BACKEND_PID=$!

echo "Starting Frontend Dashboard on http://localhost:5173..."
(cd "$DIR/frontend" && npm run dev -- --port 5173) &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true" EXIT INT TERM

wait
