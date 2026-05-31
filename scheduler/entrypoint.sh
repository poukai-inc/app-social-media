#!/bin/sh
set -eu

apk add --no-cache curl >/dev/null

echo "Waiting for app health at $APP_URL/api/health ..."
until curl -sf "$APP_URL/api/health" >/dev/null; do
  sleep 2
done

echo "Writing scheduler config..."
# Keep the secret out of a world-readable, env-sourced file. Write APP_URL
# (non-secret) and CRON_SECRET to separate files, and lock the secret to
# 0600 so only root can read it; cron-call.sh reads it at call time. (issue #38)
mkdir -p /etc/scheduler
printf '%s' "$APP_URL" > /etc/scheduler/app_url
umask 077
printf '%s' "$CRON_SECRET" > /etc/scheduler/cron_secret
chmod 600 /etc/scheduler/cron_secret

mkdir -p /var/log
: > /var/log/cron-publish.log
: > /var/log/cron-engage.log
: > /var/log/cron-auto-generate.log
: > /var/log/cron-collect-metrics.log
: > /var/log/cron-icp-engage.log
: > /var/log/cron-token-refresh.log
: > /var/log/cron-conversation-monitor.log

CRONTAB=/etc/crontabs/root
# Keep the default Alpine periodic entries, just append ours once.
if ! grep -q "/scheduler/cron-call.sh publish" "$CRONTAB" 2>/dev/null; then
  echo "*/5 * * * * sh /scheduler/cron-call.sh publish >> /var/log/cron-publish.log 2>&1" >> "$CRONTAB"
fi
if ! grep -q "/scheduler/cron-call.sh engage" "$CRONTAB" 2>/dev/null; then
  echo "*/15 * * * * sh /scheduler/cron-call.sh engage >> /var/log/cron-engage.log 2>&1" >> "$CRONTAB"
fi
if ! grep -q "/scheduler/cron-call.sh auto-generate" "$CRONTAB" 2>/dev/null; then
  echo "0 6 * * * sh /scheduler/cron-call.sh auto-generate >> /var/log/cron-auto-generate.log 2>&1" >> "$CRONTAB"
fi
if ! grep -q "/scheduler/cron-call.sh collect-metrics" "$CRONTAB" 2>/dev/null; then
  echo "0 */6 * * * sh /scheduler/cron-call.sh collect-metrics >> /var/log/cron-collect-metrics.log 2>&1" >> "$CRONTAB"
fi
# ICP Engagement - Find and reply to ICP tweets every 12 hours (cost optimization)
if ! grep -q "/scheduler/cron-call.sh icp-engage" "$CRONTAB" 2>/dev/null; then
  echo "0 */12 * * * sh /scheduler/cron-call.sh icp-engage >> /var/log/cron-icp-engage.log 2>&1" >> "$CRONTAB"
fi
# Token Refresh - Check and refresh expiring tokens 10 minutes BEFORE other hourly crons
# Runs at :50 to ensure fresh tokens are in DB before ICP/conversation/metrics crons fire at :00
if ! grep -q "/scheduler/cron-call.sh token-refresh" "$CRONTAB" 2>/dev/null; then
  echo "50 * * * * sh /scheduler/cron-call.sh token-refresh >> /var/log/cron-token-refresh.log 2>&1" >> "$CRONTAB"
fi
# Conversation Monitor - Monitor and respond to Twitter conversation replies every 6 hours
# Offset by 5 minutes to avoid colliding with ICP engage cron at :00
if ! grep -q "/scheduler/cron-call.sh conversation-monitor" "$CRONTAB" 2>/dev/null; then
  echo "5 */6 * * * sh /scheduler/cron-call.sh conversation-monitor >> /var/log/cron-conversation-monitor.log 2>&1" >> "$CRONTAB"
fi

echo "Cron jobs installed:"
cat "$CRONTAB"

echo "Starting crond..."
exec crond -f -l 2
