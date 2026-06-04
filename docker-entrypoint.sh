#!/bin/sh
set -eu

pnpm --filter @itatti/server db:deploy
exec "$@"
