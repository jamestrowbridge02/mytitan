#!/usr/bin/env sh
set -eu

URL="${1:-http://127.0.0.1:3000/health}"

python3 - "$URL" <<'PY'
import sys
import urllib.request

url = sys.argv[1]
try:
    with urllib.request.urlopen(url, timeout=3) as r:
        body = r.read(1024).decode("utf-8", "replace")
        print(f"HTTP/{r.version/10:.1f} {r.status} {r.reason}")
        print(body)
        sys.exit(0 if 200 <= r.status < 300 else 1)
except Exception as e:
    print(f"healthcheck failed: {e}", file=sys.stderr)
    sys.exit(1)
PY
