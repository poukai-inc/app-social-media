#!/bin/sh
set -eu

# Load env written by entrypoint (cron jobs may not inherit env reliably)
if [ -f /etc/scheduler.env ]; then
  # shellcheck disable=SC1091
  . /etc/scheduler.env
fi

endpoint="${1:-}"
if [ -z "$endpoint" ]; then
  echo "Missing endpoint (publish|engage|token-refresh|...)" >&2
  exit 2
fi

: "${APP_URL:?APP_URL is required}"
: "${CRON_SECRET:?CRON_SECRET is required}"

curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/$endpoint"
