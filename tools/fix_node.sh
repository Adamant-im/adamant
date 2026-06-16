#!/usr/bin/env bash
set -Eeuo pipefail

on_error() {
  local exit_status=$?
  printf "\n[ERROR] Line %s failed. Repair stopped.\n\n" "${BASH_LINENO[0]}" >&2
  exit "$exit_status"
}
trap on_error ERR

readonly TOOL_VERSION="1.4.5"

network="mainnet"
username="adamant"
databasename="adamant_main"
configfile="config.json"
processname="adamant"
port="36666"
image_url="https://explorer.adamant.im/db_backup.sql.gz"

usage() {
  printf "Usage: %s [-h] [-n mainnet|testnet]\n" "${0##*/}"
}

require_interactive_tty() {
  if [[ ! -r /dev/tty || ! -w /dev/tty ]]; then
    printf "\nThis repair tool requires an interactive terminal for confirmation.\n" >&2
    printf "Run it from a normal shell session, for example:\n" >&2
    printf "    curl -fsSL https://adamant.im/fix_node.sh | sudo bash -s -- -n mainnet\n\n" >&2
    exit 1
  fi
}

read_from_tty() {
  local prompt_text="$1"
  local response

  printf "%s" "$prompt_text" > /dev/tty
  IFS= read -r response < /dev/tty
  printf "%s" "$response"
}

repair_node_user_permissions() {
  for path in "$NODE_HOME/.nvm" "$NODE_HOME/.pm2" "$REPO_DIR"; do
    if [[ -e "$path" ]]; then
      chown -R "$username:$username" "$path"
      chmod -R u+rwX "$path"
    fi
  done
}

while getopts ":n:h" OPTION; do
  case "$OPTION" in
    n)
      case "$OPTARG" in
        testnet)
          network="testnet"
          username="adamanttest"
          databasename="adamant_test"
          configfile="test/config.json"
          processname="adamanttest"
          port="36667"
          image_url="https://testnet.adamant.im/db_test_backup.sql.gz"
          ;;
        mainnet) : ;;
        *)
          printf "\nNetwork must be 'mainnet' or 'testnet'.\n\n" >&2
          usage
          trap - ERR
          exit 2
          ;;
      esac
      ;;
    h)
      usage
      exit 0
      ;;
    :)
      printf "\nOption '-%s' requires an argument.\n\n" "$OPTARG" >&2
      usage
      trap - ERR
      exit 2
      ;;
    \?)
      printf "\nUnknown option: '-%s'.\n\n" "$OPTARG" >&2
      usage
      trap - ERR
      exit 2
      ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  printf "\nRun this repair tool as root, for example: sudo bash %s\n\n" "${0##*/}" >&2
  trap - ERR
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  printf "\nCannot identify the operating system: /etc/os-release is missing.\n\n" >&2
  trap - ERR
  exit 1
fi

# shellcheck disable=SC1091
. /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  printf "\nThis repair tool supports Ubuntu. Detected: %s.\n\n" \
    "${PRETTY_NAME:-unknown OS}" >&2
  trap - ERR
  exit 1
fi
case "${VERSION_ID:-}" in
  20.04|22.04|24.04|26.04) ;;
  *)
    printf "\nUnsupported Ubuntu release '%s'. Supported releases: 20.04, 22.04, 24.04, and 26.04.\n\n" \
      "${VERSION_ID:-unknown}" >&2
    trap - ERR
    exit 1
    ;;
esac

image_filename="$(basename "$image_url")"
LOGFILE="/var/log/adamant_${network}_fix.log"

exec > >(tee -a "$LOGFILE") 2>&1
if [[ -s "$LOGFILE" ]]; then
  printf "\n\n\n===========================\n"
fi
printf "%s ADAMANT %s node repair started\n" \
  "$(date -u '+%Y-%m-%d %H:%M UTC')" "$network"

printf "\nADAMANT Node Repair and Bootstrap Tool v%s for Ubuntu 20.04-26.04 LTS.\n" \
  "$TOOL_VERSION"
printf "Make sure you obtained this script from adamant.im or the official GitHub repository.\n"
printf "This tool drops the selected database first to free disk space, downloads a trusted blockchain image, and restarts the node.\n"
printf "Installation and recovery guide: https://docs.adamant.im/own-node/installation.html\n\n"

printf "Operating system: %s\n" "$PRETTY_NAME"
printf "Selected network: %s\n" "$network"
printf "Node user:        %s\n" "$username"
printf "Database:         %s\n" "$databasename"
printf "PM2 process:      %s\n\n" "$processname"

require_interactive_tty
agreement="$(read_from_tty "WARNING: This will stop the node and drop database '$databasename' before downloading the replacement image. Type \"yes\" to continue: ")"
if [[ "$agreement" != "yes" ]]; then
  printf "\nRepair cancelled.\n\n"
  exit 1
fi

if ! id -u "$username" >/dev/null 2>&1; then
  printf "\nSystem user '%s' was not found. This tool expects a standard ADAMANT installation.\n\n" \
    "$username" >&2
  exit 1
fi

NODE_HOME="$(getent passwd "$username" | cut -d: -f6)"
REPO_DIR="${NODE_HOME}/adamant"
CFG_PATH="${REPO_DIR}/${configfile}"
if [[ -z "$NODE_HOME" || ! -d "$REPO_DIR/.git" ]]; then
  printf "\nADAMANT repository '%s' was not found.\n\n" "$REPO_DIR" >&2
  exit 1
fi
repair_node_user_permissions
if [[ ! -f "$CFG_PATH" ]]; then
  printf "\nADAMANT configuration '%s' was not found.\n\n" "$CFG_PATH" >&2
  exit 1
fi
if [[ ! -s "${NODE_HOME}/.nvm/nvm.sh" ]]; then
  printf "\nnvm was not found for user '%s'.\n\n" "$username" >&2
  exit 1
fi

# Install or update the required repair tools while preserving local package
# configuration files. Do not hide failures: continuing without these tools
# could leave an empty database.
printf "\nUpdating required repair packages.\n"
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
# Skip needrestart hooks during repair-managed apt runs. Some VPS images ship
# a broken needrestart.conf, which can print scary Perl parse errors after dpkg.
export NEEDRESTART_SUSPEND=1
APT_OPTIONS=(-y -o Dpkg::Options::=--force-confold)
apt-get update
apt-get "${APT_OPTIONS[@]}" install gzip jq postgresql-client wget

postgresql_started=false
if command -v pg_lsclusters >/dev/null 2>&1 && command -v pg_ctlcluster >/dev/null 2>&1; then
  postgresql_cluster_found=false
  while read -r cluster_version cluster_name _ cluster_status _; do
    if [[ -n "$cluster_version" && -n "$cluster_name" && "$cluster_status" != "online" ]]; then
      pg_ctlcluster "$cluster_version" "$cluster_name" start
    fi
    if [[ -n "$cluster_version" && -n "$cluster_name" ]]; then
      postgresql_cluster_found=true
    fi
  done < <(pg_lsclusters -h)
  if [[ "$postgresql_cluster_found" == "true" ]]; then
    postgresql_started=true
  fi
elif command -v systemctl >/dev/null 2>&1 && [[ "$(ps -p 1 -o comm=)" == "systemd" ]]; then
  postgresql_units="$(systemctl list-units --all --type=service 'postgresql*' --no-legend 2>/dev/null \
    | awk '$1 ~ /^postgresql(@.+|-[0-9]+)?\.service$/ && $1 != "postgresql@.service" { print $1 }' || true)"
  if [[ -z "$postgresql_units" ]]; then
    postgresql_units="$(systemctl list-unit-files --type=service --no-legend 'postgresql*' 2>/dev/null \
      | awk '$1 ~ /^postgresql(@.+|-[0-9]+)?\.service$/ && $1 != "postgresql@.service" { print $1 }' || true)"
  fi

  if [[ -n "$postgresql_units" ]]; then
    while read -r postgresql_unit; do
      [[ -n "$postgresql_unit" ]] || continue
      systemctl start "$postgresql_unit"
    done <<< "$postgresql_units"
    postgresql_started=true
  elif systemctl list-unit-files postgresql.service >/dev/null 2>&1; then
    systemctl start postgresql
    postgresql_started=true
  fi
else
  if [[ -x /etc/init.d/postgresql ]]; then
    service postgresql start
    postgresql_started=true
  fi
fi

if [[ "$postgresql_started" == "true" ]] && ! runuser -u postgres -- pg_isready -q; then
  postgresql_started=false
fi

if [[ "$postgresql_started" != "true" ]]; then
  printf "Cannot find a PostgreSQL cluster or service to start. Check installed PostgreSQL packages and cluster status.\n" >&2
  printf "Useful diagnostics: dpkg -l 'postgresql-*'; pg_lsclusters; systemctl list-units --all 'postgresql*'\n" >&2
  exit 1
fi

role_exists="$(runuser -u postgres -- psql -XAtqc \
  "SELECT 1 FROM pg_roles WHERE rolname = '${username}'" postgres)"
if [[ "$role_exists" != "1" ]]; then
  printf "\nPostgreSQL role '%s' was not found. Refusing to recreate the database without its owner.\n\n" \
    "$username" >&2
  exit 1
fi

# shellcheck disable=SC2016
runuser -u "$username" -- env HOME="$NODE_HOME" PROCESS_NAME="$processname" bash -c '
  set -Eeuo pipefail
  cd "$HOME"
  source "$HOME/.nvm/nvm.sh"
  command -v pm2 >/dev/null
  if ! pm2 describe "$PROCESS_NAME" >/dev/null 2>&1; then
    printf "WARNING: pm2 process '%s' is not registered; repair will recreate it after loading the image.\n" "$PROCESS_NAME"
  fi
'

# PM2 sends a catchable signal and allows the node to run its graceful shutdown
# handlers before the database is replaced.
printf "\nStopping ADAMANT %s process '%s' through pm2.\n" "$network" "$processname"
# shellcheck disable=SC2016
runuser -u "$username" -- env HOME="$NODE_HOME" PROCESS_NAME="$processname" bash -c '
  set -Eeuo pipefail
  cd "$HOME"
  source "$HOME/.nvm/nvm.sh"
  if pm2 describe "$PROCESS_NAME" >/dev/null 2>&1; then
    pm2 stop "$PROCESS_NAME"
  else
    printf "WARNING: pm2 process '%s' is not registered; skipping stop.\n" "$PROCESS_NAME"
  fi
  pm2 save
'

printf "\nTerminating active connections to database '%s'.\n" "$databasename"
runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${databasename}' AND pid <> pg_backend_pid();" \
  postgres

printf "Dropping database '%s' to free disk space before downloading the image.\n" "$databasename"
runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 -c \
  "DROP DATABASE IF EXISTS ${databasename} WITH (FORCE);" postgres || \
runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 -c \
  "DROP DATABASE IF EXISTS ${databasename};" postgres
# DROP DATABASE removes the database files from PostgreSQL storage; VACUUM is
# only useful for live tables, not for a database that no longer exists.

printf "\nDownloading and validating the %s blockchain image after freeing database space.\n" "$network"
runuser -u "$username" -- env \
  HOME="$NODE_HOME" \
  REPO_DIR="$REPO_DIR" \
  IMAGE_URL="$image_url" \
  IMAGE_FILENAME="$image_filename" \
  bash <<'EOSU'
set -Eeuo pipefail
cd "$REPO_DIR"
rm -f "${IMAGE_FILENAME}.part" "$IMAGE_FILENAME"
wget --progress=dot:giga "$IMAGE_URL" -O "${IMAGE_FILENAME}.part"
mv "${IMAGE_FILENAME}.part" "$IMAGE_FILENAME"
gzip --test "$IMAGE_FILENAME"
EOSU

printf "\nCreating database '%s' and streaming the validated blockchain image.\n" "$databasename"
runuser -u postgres -- createdb -O "$username" "$databasename"
runuser -u "$username" -- env \
  HOME="$NODE_HOME" \
  REPO_DIR="$REPO_DIR" \
  DATABASE_NAME="$databasename" \
  IMAGE_FILENAME="$image_filename" \
  bash <<'EOSU'
set -Eeuo pipefail
cd "$REPO_DIR"
gzip -dc "$IMAGE_FILENAME" | psql -X --set=ON_ERROR_STOP=1 "$DATABASE_NAME"
rm -f "$IMAGE_FILENAME"
EOSU

printf "\nRestarting ADAMANT %s process '%s'.\n" "$network" "$processname"
# shellcheck disable=SC2016
runuser -u "$username" -- env HOME="$NODE_HOME" NETWORK="$network" PROCESS_NAME="$processname" bash -c '
  set -Eeuo pipefail
  cd "$HOME"
  source "$HOME/.nvm/nvm.sh"
  if pm2 describe "$PROCESS_NAME" >/dev/null 2>&1; then
    pm2 restart "$PROCESS_NAME" --update-env
  elif [[ "$NETWORK" == "mainnet" ]]; then
    pm2 start --name "$PROCESS_NAME" app.js
  else
    pm2 start --name "$PROCESS_NAME" app.js -- \
      --config test/config.json --genesis test/genesisBlock.json
  fi
  pm2 save
'

port_read="$(jq -r '.port // empty' "$CFG_PATH" 2>/dev/null || true)"
if [[ -n "$port_read" ]]; then
  port="$port_read"
fi

minutes=$(( (SECONDS + 59) / 60 ))
printf "\nADAMANT %s node repair completed successfully.\n" "$network"
printf "Total repair time: %d minutes.\n" "$minutes"
printf "Repair log: %s\n\n" "$LOGFILE"
printf "Check the node as user '%s':\n" "$username"
printf "    su - %s\n" "$username"
printf "    pm2 show %s\n" "$processname"
printf "    pm2 logs %s\n\n" "$processname"
printf "Query the current blockchain height:\n"
printf "    curl http://localhost:%s/api/blocks/getHeight\n\n" "$port"

if [[ -n "${STY:-}" ]]; then
  printf "This command is running inside screen session '%s'.\n" "$STY"
  printf "Detach with Ctrl-A D, or exit the shell to close the session.\n"
fi
