#!/bin/sh
set -eu

echo "Running database migrations..."
bun run migration:up:prod

echo "Starting application..."
exec bun run dist/main.js
