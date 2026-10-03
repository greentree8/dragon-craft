#!/usr/bin/env bash
# One-time (and re-runnable) setup of the multiplayer server. Run as root:  sudo ./deploy/mp-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SITE=/etc/nginx/sites-available/dragon
(cd server && sudo -u devuser npm install --omit=dev --silent)
mkdir -p /var/lib/dragon-craft && chown devuser /var/lib/dragon-craft
cp deploy/dragon-mp.service /etc/systemd/system/dragon-mp.service
systemctl daemon-reload
systemctl enable --now dragon-mp
systemctl restart dragon-mp

# add the /ws websocket proxy to the live nginx site (certbot has edited it, so patch rather than replace)
if ! grep -q 'location = /ws' "$SITE"; then
  python3 - "$SITE" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
block = """    location = /ws {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
"""
needle = "    location / { return 404; }"
assert needle in s, "could not find the catch-all location in " + p
open(p, "w").write(s.replace(needle, block + needle, 1))
PY
fi
nginx -t
systemctl reload nginx
systemctl --no-pager status dragon-mp | head -5
echo "Multiplayer is up. Friends join at https://dragon.gordhamer.com/?world=<room name>"
