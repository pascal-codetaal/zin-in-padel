#!/usr/bin/env sh
# Eerste keer: fly auth login
# Daarna: sh scripts/fly-deploy.sh

set -e
cd "$(dirname "$0")/.."

APP_NAME="${FLY_APP_NAME:-zin-in-padel}"

if ! fly auth whoami >/dev/null 2>&1; then
  echo "Niet ingelogd. Run eerst: fly auth login"
  exit 1
fi

if ! fly apps list 2>/dev/null | grep -q "$APP_NAME"; then
  echo "App $APP_NAME bestaat nog niet — launch..."
  fly launch --no-deploy --name "$APP_NAME" --region ams --copy-config
fi

echo "Deploy (app + worker images)..."
fly deploy

echo "Process groups: 1x app, 1x worker"
fly scale count app=1 worker=1

echo "Status:"
fly status
fly machines list

echo ""
echo "Secrets nog instellen (eenmalig), bv.:"
echo "  fly secrets set INVITE_QUEUE_ENABLED=true"
echo "  fly secrets set BULLMQ_REDIS_URL='rediss://...'"
echo "  fly secrets set DATABASE_URL='...'"
echo "  fly secrets set DIRECT_URL='...'"
echo "  (+ Twilio vars)"
