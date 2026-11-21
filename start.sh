#!/usr/bin/env bash
# Conservative variant of start.sh.backup (renamed the original): same Compose stack, but it never installs
# software, never uses sudo, never pulls from a mirror and never probes cloud
# metadata. Install Docker + Compose yourself first.
#
# Usage:
#   ./start.sh            configure (first run), build this checkout locally
#                         (compose.dev.yaml), start, load SQL
#   ./start.sh logs       follow platform logs
#   ./start.sh stop       stop containers (keep data)
#   ./start.sh down       remove containers (keep data volumes)
#   ./start.sh restart    restart the platform container
#   ./start.sh pull       refresh mysql + base images, rebuild, recreate, reload SQL
#
# The platform image is always built from source as loopforge-platform:local;
# it is never pulled from ghcr.io. Only mysql:8.4 comes from Docker Hub.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

fail() { printf '\n✗ %s\n' "$1" >&2; exit 1; }
step() { printf '\n▸ %s\n' "$1"; }

# compose.dev.yaml swaps the ghcr.io image for a local build of this checkout.
compose() { docker compose -f compose.yaml -f compose.dev.yaml --profile platform "$@"; }

load_env() {
  [[ -f .env ]] || fail 'Not installed yet. Run ./start.sh first.'
  set -a; source .env; set +a
}

# Replace or append KEY=VALUE in .env (mktemp keeps the file at mode 600).
set_env_key() {
  local tmp; tmp="$(mktemp .env.XXXXXX)"
  grep -v "^$1=" .env > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  mv "$tmp" .env
  export "$1=$2"
}

# --- Windows (Git Bash / MSYS) + Docker Desktop -----------------------------
# compose.yaml mounts LOOPFORGE_DATA_DIR at the same path inside the container,
# so it must be a Linux path that Docker Desktop maps to the Windows drive:
# D:\x  ->  /mnt/d/x. MSYS would also rewrite such paths into
# "C:/Program Files/Git/..." when calling docker.exe, so turn that off.
is_windows_shell() { case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; esac; return 1; }
if is_windows_shell; then
  export MSYS_NO_PATHCONV=1 MSYS2_ENV_CONV_EXCL='*'
fi

# /d/x, D:/x or D:\x  ->  /mnt/d/x   (path as Docker sees it)
docker_path() {
  local p="${1//\\//}" drive rest
  if [[ "$p" =~ ^([A-Za-z]):(/.*)?$ || "$p" =~ ^/([A-Za-z])(/.*)?$ ]]; then
    drive="$(printf '%s' "${BASH_REMATCH[1]}" | tr 'A-Z' 'a-z')"; rest="${BASH_REMATCH[2]}"
    p="/mnt/$drive$rest"
  fi
  printf '%s' "$p"
}

# /mnt/d/x  ->  /d/x   (same directory, as Git Bash sees it)
local_path() {
  if is_windows_shell && [[ "$1" =~ ^/mnt/([a-z])(/.*)?$ ]]; then
    printf '/%s%s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
  else
    printf '%s' "$1"
  fi
}

require_docker() {
  command -v docker >/dev/null || fail 'Docker is not installed. Install Docker Desktop / Docker Engine yourself, then rerun.'
  docker info >/dev/null 2>&1 || fail 'Docker is not running, or this user cannot access it.'
  docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 plugin is missing.'
}

random_hex() { od -An -tx1 -N"$1" /dev/urandom | tr -d ' \n'; }

# Step 2: same keys as scripts/configure.sh, generated in bash (no python
# needed). Safer defaults: bind to 127.0.0.1, never overwrite an existing .env.
configure() {
  if [[ -f .env ]]; then
    echo 'Keeping existing .env'
  else
    local data_dir="${LOOPFORGE_DATA_DIR:-$PWD/.data}"
    local db_password; db_password="$(random_hex 24)"
    local mysql_port="${LOOPFORGE_MYSQL_PORT:-33315}"
    ( umask 077
      cat > .env <<EOF
LOOPFORGE_DB_PASSWORD=$db_password
LOOPFORGE_DB_ROOT_PASSWORD=$(random_hex 24)
LOOPFORGE_MYSQL_PORT=$mysql_port
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-loopforge}
AGENTFLOW_HTTP_PORT=${AGENTFLOW_HTTP_PORT:-8090}
AGENTFLOW_MYSQL_DSN='loopforge:$db_password@tcp(127.0.0.1:$mysql_port)/loopforge'
AGENTFLOW_SESSION_SECRET=$(random_hex 32)
AGENTFLOW_AUTH_REQUIRED=true
LOOPFORGE_DATA_DIR=$data_dir
LOOPFORGE_BIND=${LOOPFORGE_BIND:-127.0.0.1}
LOOPFORGE_PUBLIC_URL=
LOOPFORGE_IMAGE=
AGENTFLOW_GITHUB_CLIENT_ID=
LOOPFORGE_DOCKER_SOCKET=${LOOPFORGE_DOCKER_SOCKET:-/var/run/docker.sock}
EOF
    )
    echo 'Created .env with unique local secrets (bound to 127.0.0.1)'
  fi
  set -a; source .env; set +a
  [[ -n "${LOOPFORGE_DATA_DIR:-}" ]] || fail 'LOOPFORGE_DATA_DIR is missing from .env.'
  if [[ -z "${LOOPFORGE_DOCKER_SOCKET:-}" ]]; then
    printf '\nLOOPFORGE_DOCKER_SOCKET=/var/run/docker.sock\n' >> .env
    export LOOPFORGE_DOCKER_SOCKET=/var/run/docker.sock
  fi
  if is_windows_shell; then
    local docker_dir; docker_dir="$(docker_path "$LOOPFORGE_DATA_DIR")"
    if [[ "$docker_dir" != "$LOOPFORGE_DATA_DIR" ]]; then
      set_env_key LOOPFORGE_DATA_DIR "$docker_dir"
      echo "Windows: LOOPFORGE_DATA_DIR set to the Docker Desktop path $docker_dir"
    fi
  fi
  local data_local; data_local="$(local_path "$LOOPFORGE_DATA_DIR")"
  mkdir -p "$data_local/home" "$data_local/workspaces" \
    || fail 'The data directory is not writable. Set LOOPFORGE_DATA_DIR in .env.'
  local port="${AGENTFLOW_HTTP_PORT:-8090}"
  if ! compose ps --status running --services 2>/dev/null | grep -qx platform \
     && (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    fail "Port $port is already in use. Set AGENTFLOW_HTTP_PORT in .env to a free port."
  fi
}

mysql_exec() {
  compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --batch --skip-column-names -u loopforge loopforge'
}

# Step 4: what scripts/install-schema-extensions.sh does, without python.
# 001 is not repeatable, so each generated column is added only when absent.
load_sql() {
  step 'Installing the schema extensions and the starter catalog'
  local entry table column count
  for entry in 'run_telemetry adapter' 'run_logs level'; do
    read -r table column <<< "$entry"
    count="$(printf "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='%s' AND column_name='%s';\n" "$table" "$column" | mysql_exec | tr -dc '0-9')"
    case "$count" in
      1) echo "Already installed: $table.$column" ;;
      0) sed -n "/^ALTER TABLE $table\$/,/;/p" migrations/001_run_obs_generated_columns.sql | mysql_exec
         echo "Installed: $table.$column" ;;
      *) fail "Could not inspect $table.$column" ;;
    esac
  done
  cat migrations/seed/*.sql \
    migrations/031_generic_backend_openssh.sql \
    migrations/033_generic_sop_mr_node.sql \
    migrations/038_generic_sop_host_credentials.sql \
    | mysql_exec
}

finish() {
  local users
  users="$(echo 'select count(*) from users;' | mysql_exec 2>/dev/null | tr -dc '0-9' || true)"
  printf '\n✓ LoopForge is running: http://%s:%s\n' "${LOOPFORGE_BIND:-127.0.0.1}" "${AGENTFLOW_HTTP_PORT:-8090}"
  if [[ "${users:-0}" == 0 ]]; then
    echo '  Open it and create the administrator account (the first account is admin).'
  else
    echo '  Open it and sign in.'
  fi
  echo '  Stop: ./start.sh stop   ·   Logs: ./start.sh logs'
}

# Pull mysql ($1 = pull policy), build the platform from source, start, load SQL.
start_stack() {
  local policy="$1"
  step 'Pulling mysql from Docker Hub'
  compose pull --policy "$policy" mysql
  step 'Building LoopForge from this checkout (several minutes on first build)'
  local build_args=()
  [[ "$policy" == always ]] && build_args+=(--pull)   # refresh base images too
  LOOPFORGE_COMMIT="${LOOPFORGE_COMMIT:-$(git rev-parse HEAD 2>/dev/null || true)}" \
    compose build ${build_args[@]+"${build_args[@]}"} platform
  compose up -d --no-build --wait --wait-timeout 180
  load_sql; finish
}

cmd="${1:-up}"
shift || true
case "$cmd" in
  up|-d|build|dev)
    require_docker; configure
    start_stack missing ;;
  pull)
    require_docker; load_env
    start_stack always ;;
  logs)    require_docker; load_env; compose logs -f "${@:-platform}" ;;
  stop)    require_docker; load_env; compose stop ;;
  down)    require_docker; load_env; compose down --remove-orphans ;;
  restart) require_docker; load_env; compose restart platform ;;
  *) echo "usage: ./start.sh [up|logs|stop|down|restart|pull]" >&2; exit 1 ;;
esac
