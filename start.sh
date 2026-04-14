#!/bin/zsh
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Installing backend dependencies..."
pip3 install -r "$ROOT/backend/requirements.txt" -q

echo "Installing frontend dependencies..."
(cd "$ROOT/frontend" && npm install --silent)

echo ""
echo "Starting backend on http://127.0.0.1:8000"
(cd "$ROOT/backend" && python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000) &
BACKEND_PID=$!

sleep 2

echo "Starting frontend on http://127.0.0.1:5173"
(cd "$ROOT/frontend" && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "Both servers running. Open http://127.0.0.1:5173"
echo "Press Ctrl+C to stop both."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
