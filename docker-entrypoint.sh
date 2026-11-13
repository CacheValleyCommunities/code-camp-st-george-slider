#!/bin/sh
set -eu
chown -R app:app /app/data
exec su-exec app /app/server
