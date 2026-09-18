#!/usr/bin/env python3
import importlib.util, os, sys, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parent
FEATURE = ROOT / 'features' / 'acquisition_os' / 'trace_server.py'
PORT = 8765
spec = importlib.util.spec_from_file_location('trace_acq_server', FEATURE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
os.chdir(ROOT)
from http.server import ThreadingHTTPServer
server = ThreadingHTTPServer(('127.0.0.1', PORT), mod.Handler)
URL=f'http://127.0.0.1:{PORT}/index.html'
print(f'TRACE Consultant local server: {URL}')
try:
    subprocess.Popen(['open', URL], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
except Exception:
    pass
print('Press Ctrl+C to stop.')
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
