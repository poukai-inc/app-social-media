#!/bin/sh
set -eu

# Load config written by entrypoint (cron jobs may not inherit env reliably).
# The secret comes from a 0600 file read at call time, never a sourced env
# file. (issue #38)
if [ -f /etc/scheduler/app_url ]; then
  APP_URL="$(cat /etc/scheduler/app_url)"
fi
if [ -f /etc/scheduler/cron_secret ]; then
  CRON_SECRET="$(cat /etc/scheduler/cron_secret)"
fi

endpoint="${1:-}"
if [ -z "$endpoint" ]; then
  echo "Missing endpoint (publish|engage|token-refresh|...)" >&2
  exit 2
fi

: "${APP_URL:?APP_URL is required}"
: "${CRON_SECRET:?CRON_SECRET is required}"

curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/$endpoint"
