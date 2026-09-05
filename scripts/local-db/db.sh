#!/usr/bin/env bash
# scripts/local-db/db.sh
#
# Throwaway local PostgreSQL 16 instance for validating supabase/migrations/
# without a real Supabase project.
#
# Subcommands:
#   start   - initdb a cluster (if not already present), start it, create the
#             `equipqr` database and `postgres` superuser role if missing.
#             Idempotent — safe to run repeatedly.
#   stop    - stop the running cluster.
#   reset   - drop + recreate the `equipqr` database, apply the Supabase shim,
#             then apply every supabase/migrations/*.sql file in lexical
#             order, each in its own transaction. Fails loudly (non-zero
#             exit, prints the offending filename) on the first error.
#   psql    - open a psql shell against the `equipqr` database (extra args
#             are passed through to psql).
#   url     - print the DATABASE_URL connection string.
#
# Quirk: postgres refuses to initdb/run as root. If this script is invoked as
# root, it creates (if needed) and re-execs itself as a dedicated non-root
# OS user, `pguser`, via `su`, and the cluster lives under pguser's home
# ($HOME/.equipqr-pg from pguser's point of view). If invoked as a normal
# (non-root) user, everything runs directly as that user and the cluster
# lives under that user's own $HOME/.equipqr-pg. Either way, `db.sh url` /
# `db.sh psql` from any user/session gives you a working connection, since
# postgres is just listening on localhost:54329.

set -euo pipefail

PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PORT="${PORT:-54329}"
SOCKET_DIR="${SOCKET_DIR:-/tmp}"
PGSUPERUSER="${PGSUPERUSER:-postgres}"
DBNAME="${DBNAME:-equipqr}"

# Resolve an absolute path to this script and the repo root, before any
# possible re-exec under a different user (cwd may differ post-su).
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
SHIM_FILE="$REPO_ROOT/scripts/local-db/supabase-shim.sql"

log() { echo "[db.sh] $*" >&2; }

# ----------------------------------------------------------------------------
# Re-exec as a non-root user if we're root. `initdb`/`pg_ctl` refuse to run
# as the root OS user, and we intentionally don't want to run postgres as
# root even if some future postgres build allowed it.
# ----------------------------------------------------------------------------
if [[ "$(id -u)" -eq 0 ]]; then
  PGUSER_OS_NAME="${PGUSER_OS_NAME:-pguser}"
  if ! id "$PGUSER_OS_NAME" >/dev/null 2>&1; then
    log "creating OS user '$PGUSER_OS_NAME' to own the local postgres cluster"
    useradd -m -s /bin/bash "$PGUSER_OS_NAME"
  fi
  # `su` (without -p) resets HOME/USER/LOGNAME to the target user, which is
  # what makes "$HOME/.equipqr-pg" land under the dedicated user's home.
  exec su -s /bin/bash "$PGUSER_OS_NAME" -c "exec '$SCRIPT_PATH' ${*@Q}"
fi

PGDATA="${PGDATA:-$HOME/.equipqr-pg}"
export PATH="$PG_BIN:$PATH"

pg_is_running() {
  "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1
}

psql_c() {
  "$PG_BIN/psql" -h "$SOCKET_DIR" -p "$PORT" -U "$PGSUPERUSER" -v ON_ERROR_STOP=1 "$@"
}

cmd_url() {
  echo "postgresql://$PGSUPERUSER@localhost:$PORT/$DBNAME"
}

cmd_start() {
  if [[ ! -s "$PGDATA/PG_VERSION" ]]; then
    log "initializing cluster at $PGDATA"
    mkdir -p "$(dirname "$PGDATA")"
    if ! "$PG_BIN/initdb" -D "$PGDATA" -U "$PGSUPERUSER" -A trust -E UTF8 \
        > "$PGDATA.initdb.log" 2>&1; then
      cat "$PGDATA.initdb.log" >&2
      exit 1
    fi

    cat >> "$PGDATA/postgresql.conf" <<EOF

# --- equipqr local throwaway config (scripts/local-db/db.sh) ---
port = $PORT
listen_addresses = 'localhost'
unix_socket_directories = '$SOCKET_DIR'
EOF
  else
    log "cluster already initialized at $PGDATA"
  fi

  if pg_is_running; then
    log "postgres already running (PGDATA=$PGDATA, port=$PORT)"
  else
    log "starting postgres on port $PORT (socket dir $SOCKET_DIR)"
    "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/server.log" -w start
  fi

  # Idempotent safety net: initdb -U "$PGSUPERUSER" already creates this
  # role as a superuser, but re-assert it in case the cluster predates this
  # script or was created some other way.
  psql_c -d postgres <<SQL
do \$\$
begin
  if not exists (select 1 from pg_roles where rolname = '$PGSUPERUSER') then
    create role $PGSUPERUSER superuser login;
  end if;
end
\$\$;
SQL

  if ! psql_c -d postgres -tAc "select 1 from pg_database where datname = '$DBNAME'" | grep -q 1; then
    log "creating database $DBNAME"
    "$PG_BIN/createdb" -h "$SOCKET_DIR" -p "$PORT" -U "$PGSUPERUSER" "$DBNAME"
  fi

  log "ready. DATABASE_URL=$(cmd_url)"
}

cmd_stop() {
  if [[ ! -d "$PGDATA" ]]; then
    log "no cluster at $PGDATA; nothing to stop"
    return 0
  fi
  if pg_is_running; then
    log "stopping postgres (PGDATA=$PGDATA)"
    "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast -w stop
  else
    log "postgres not running"
  fi
}

# Applies one .sql file with ON_ERROR_STOP, wrapped in a single transaction
# (`-1`) unless the file's first line is the opt-out marker
# `-- local-db: no-transaction` (needed for files using
# `alter type ... add value`, which cannot run in the same transaction as
# later statements that reference the new enum value).
apply_sql_file() {
  local file="$1"
  local psql_args=(-h "$SOCKET_DIR" -p "$PORT" -U "$PGSUPERUSER" -d "$DBNAME" -v ON_ERROR_STOP=1)

  if IFS= read -r first_line < "$file" && [[ "$first_line" == "-- local-db: no-transaction" ]]; then
    log "applying $(basename "$file") (no wrapping transaction, per opt-out marker)"
  else
    psql_args+=(-1)
    log "applying $(basename "$file")"
  fi

  if ! "$PG_BIN/psql" "${psql_args[@]}" -f "$file" 2> "$PGDATA/last-apply-error.log"; then
    log "FAILED applying $file"
    cat "$PGDATA/last-apply-error.log" >&2
    exit 1
  fi
}

cmd_reset() {
  if ! pg_is_running; then
    log "postgres is not running; run '$SCRIPT_PATH start' first"
    exit 1
  fi

  log "dropping + recreating database $DBNAME"
  "$PG_BIN/dropdb" -h "$SOCKET_DIR" -p "$PORT" -U "$PGSUPERUSER" --if-exists "$DBNAME"
  "$PG_BIN/createdb" -h "$SOCKET_DIR" -p "$PORT" -U "$PGSUPERUSER" "$DBNAME"

  apply_sql_file "$SHIM_FILE"

  shopt -s nullglob
  local files=("$MIGRATIONS_DIR"/*.sql)
  shopt -u nullglob
  if [[ ${#files[@]} -eq 0 ]]; then
    log "no migrations found in $MIGRATIONS_DIR"
  fi
  local f
  for f in "${files[@]}"; do
    apply_sql_file "$f"
  done

  log "reset complete: shim + ${#files[@]} migration file(s) applied to $DBNAME"
}

cmd_psql() {
  exec "$PG_BIN/psql" -h "$SOCKET_DIR" -p "$PORT" -U "$PGSUPERUSER" -d "$DBNAME" "$@"
}

case "${1:-}" in
  start)
    cmd_start
    ;;
  stop)
    cmd_stop
    ;;
  reset)
    cmd_reset
    ;;
  psql)
    shift
    cmd_psql "$@"
    ;;
  url)
    cmd_url
    ;;
  *)
    echo "usage: $SCRIPT_PATH {start|stop|reset|psql [psql-args...]|url}" >&2
    exit 1
    ;;
esac
