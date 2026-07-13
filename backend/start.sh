#!/bin/bash

# Python Math Service'i arka planda başlat
echo "[START] Python Math Service başlatılıyor (port 8000)..."
(cd /app/math_service && .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000) &

# Python'un ayağa kalkmasını bekle
sleep 2

# Node.js Backend'i ön planda başlat
echo "[START] Node.js Backend başlatılıyor (port $PORT)..."
exec node server.js
