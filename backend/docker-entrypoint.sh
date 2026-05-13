#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  ./node_modules/.bin/sequelize-cli db:migrate
fi

exec "$@"
