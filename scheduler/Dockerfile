# Pinned for reproducible builds (issue #40)
FROM alpine:3.21

# curl is installed once here; entrypoint.sh no longer re-installs it
RUN apk add --no-cache curl

WORKDIR /scheduler
COPY entrypoint.sh /scheduler/entrypoint.sh
COPY cron-call.sh /scheduler/cron-call.sh
RUN chmod +x /scheduler/entrypoint.sh /scheduler/cron-call.sh

CMD ["sh", "/scheduler/entrypoint.sh"]
