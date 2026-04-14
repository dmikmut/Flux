#!/bin/zsh
cd "$(dirname "$0")/backend"
pip3 install -r requirements.txt
python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
