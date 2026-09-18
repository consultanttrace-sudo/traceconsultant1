#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8765
cd "$DIR"
if ! curl -s "http://127.0.0.1:${PORT}/index.html" >/dev/null 2>&1; then
  python3 trace_server.py >/tmp/trace_acquisition_server.log 2>&1 &
  SERVER_PID=$!
  sleep 1
fi
open "http://127.0.0.1:${PORT}/index.html"
echo "TRACE Acquisition OS running at http://127.0.0.1:${PORT}/index.html"
echo "Discovery proxy aktif. Jangan buka index.html dengan file://."
echo "Anda boleh menutup Terminal ini setelah browser terbuka."
