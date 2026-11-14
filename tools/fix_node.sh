#!/usr/bin/env bash
# Replace an Ubuntu ADAMANT node's database with a published blockchain image.
# The image is downloaded and verified before the database is dropped when the
# filesystem has room for both. -d drops the database first and can leave the
# node without a database if the download fails.
set -Eeuo pipefail
umask 022
export LC_ALL=C

_adamant_entry="${BASH_SOURCE[0]:-}"
if [[ ! -f "$_adamant_entry" ]]; then
  printf '\nRun this repair tool from a verified Git checkout:\n' >&2
  printf '    git clone --branch dev https://github.com/Adamant-im/adamant.git\n' >&2
  printf '    cd adamant && git rev-parse HEAD\n' >&2
  printf '    sudo bash tools/fix_node.sh -n mainnet\n\n' >&2
  exit 1
fi
_adamant_root="$(cd "$(dirname "$_adamant_entry")" && pwd)"
if [[ ! -f "${_adamant_root}/lib/adamant_node_common.sh" ]]; then
  printf 'Missing %s\n' "${_adamant_root}/lib/adamant_node_common.sh" >&2
  exit 1
fi
# shellcheck source=lib/adamant_node_common.sh
source "${_adamant_root}/lib/adamant_node_common.sh"
network=""
username=""
databasename=""
configfile=""
processname=""
port=""
image_url=""

database_dropped="false"
on_error() {
  local exit_status=$?
  printf '\n[ERROR] Line %s failed. Repair stopped.\n' "${BASH_LINENO[0]}" >&2
  if [[ "$database_dropped" == "true" ]]; then
    printf 'The database was already dropped. Do not start the node until a verified image has been restored.\n' >&2
  else
    printf 'The existing database was not dropped.\n' >&2
  fi
  printf '\n' >&2
  exit "$exit_status"
}
trap on_error ERR

adamant_apply_network mainnet
drop_first="false"

usage() {
  printf 'Usage: %s [-h] [-d] [-n mainnet|testnet]\n' "${0##*/}"
  printf '       -d  Drop the database before downloading the image.\n'
  printf '           Use this only when free space cannot hold the snapshot next to the live database.\n'
  printf '           A failed download then leaves the node without that database.\n'
}

while getopts ":n:dh" OPTION; do
  case "$OPTION" in
    n)
      if ! adamant_apply_network "$OPTARG"; then
        printf '\nNetwork must be mainnet or testnet.\n\n' >&2
        usage
        trap - ERR
        exit 2
      fi
      ;;
    d) drop_first="true" ;;
    h)
      usage
      exit 0
      ;;
    :)
      printf '\nOption -%s requires an argument.\n\n' "$OPTARG" >&2
      usage
      trap - ERR
      exit 2
      ;;
    \?)
      printf '\nUnknown option: -%s.\n\n' "$OPTARG" >&2
      usage
      trap - ERR
      exit 2
      ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  printf '\nRun this repair tool as root, for example: sudo bash %s\n\n' "${0##*/}" >&2
  trap - ERR
  exit 1
fi
if [[ ! -r /etc/os-release ]]; then
  printf '\nCannot identify the operating system: /etc/os-release is missing.\n\n' >&2
  trap - ERR
  exit 1
fi
# shellcheck disable=SC1091
. /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  printf '\nThis repair tool supports Ubuntu. Detected: %s.\n\n' \
    "${PRETTY_NAME:-unknown OS}" >&2
  trap - ERR
  exit 1
fi
case "${VERSION_ID:-}" in
  20.04|22.04|24.04|26.04) ;;
  *)
    printf '\nUnsupported Ubuntu release %q. Supported releases: 20.04, 22.04, 24.04, and 26.04.\n\n' \
      "${VERSION_ID:-unknown}" >&2
    trap - ERR
    exit 1
    ;;
esac

image_filename="$(basename "$image_url")"
LOGFILE="/var/log/adamant_${network}_fix.log"
touch "$LOGFILE"
chmod 0600 "$LOGFILE"
exec > >(tee -a "$LOGFILE") 2>&1
if [[ -s "$LOGFILE" ]]; then
  printf '\n\n\n===========================\n'
fi
printf '%s ADAMANT %s node repair started\n' \
  "$(date -u '+%Y-%m-%d %H:%M UTC')" "$network"
printf '\nADAMANT Node Repair and Bootstrap Tool v%s for Ubuntu 20.04-26.04 LTS.\n' \
  "$ADAMANT_REPAIR_VERSION"
printf 'Make sure this checkout matches the commit you reviewed.\n'
if [[ "$drop_first" == "true" ]]; then
  printf 'This run drops database %s before downloading the replacement image.\n' "$databasename"
else
  printf 'This run downloads and verifies the replacement image before dropping database %s.\n' "$databasename"
  printf 'If there is not enough free disk space, it stops without dropping the database.\n'
  printf 'Re-run with -d only when you accept that a failed download removes the database first.\n'
fi
printf 'Installation and recovery guide: https://docs.adamant.im/own-node/installation.html\n\n'
printf 'Operating system: %s\n' "$PRETTY_NAME"
printf 'Selected network: %s\n' "$network"
printf 'Node user:        %s\n' "$username"
printf 'Database:         %s\n' "$databasename"
printf 'PM2 process:      %s\n\n' "$processname"

adamant_require_interactive_tty
if [[ "$drop_first" == "true" ]]; then
  confirm_prompt="WARNING: This will stop the node and drop database '${databasename}' before downloading the replacement image. Type \"yes\" to continue: "
else
  confirm_prompt="WARNING: This will stop the node and replace database '${databasename}' after the image is verified. Type \"yes\" to continue: "
fi
if ! adamant_confirm_exact_yes "$confirm_prompt"; then
  printf '\nRepair cancelled.\n\n'
  trap - ERR
  exit 1
fi

if ! id -u "$username" >/dev/null 2>&1; then
  printf '\nSystem user %s was not found. This tool expects a standard ADAMANT installation.\n\n' \
    "$username" >&2
  exit 1
fi
NODE_HOME="$(getent passwd "$username" | cut -d: -f6)"
REPO_DIR="${NODE_HOME}/adamant"
CFG_PATH="${REPO_DIR}/${configfile}"
if [[ -z "$NODE_HOME" || ! -d "$REPO_DIR/.git" ]]; then
  printf '\nADAMANT repository %s was not found.\n\n' "$REPO_DIR" >&2
  exit 1
fi
adamant_repair_node_user_permissions "$username" "$NODE_HOME" "$REPO_DIR"
if [[ ! -f "$CFG_PATH" ]]; then
  printf '\nADAMANT configuration %s was not found.\n\n' "$CFG_PATH" >&2
  exit 1
fi
if [[ ! -s "${NODE_HOME}/.nvm/nvm.sh" ]]; then
  printf '\nnvm was not found for user %s.\n\n' "$username" >&2
  exit 1
fi

printf '\nUpdating required repair packages.\n'
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1
APT_OPTIONS=(-y -o Dpkg::Options::=--force-confold)
apt-get update
apt-get "${APT_OPTIONS[@]}" install ca-certificates curl gzip jq postgresql-client python3

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
    done <<<"$postgresql_units"
    postgresql_started=true
  elif systemctl list-unit-files postgresql.service >/dev/null 2>&1; then
    systemctl start postgresql
    postgresql_started=true
  fi
elif [[ -x /etc/init.d/postgresql ]]; then
  service postgresql start
  postgresql_started=true
fi
if [[ "$postgresql_started" == "true" ]] && ! runuser -u postgres -- pg_isready -q; then
  postgresql_started=false
fi
if [[ "$postgresql_started" != "true" ]]; then
  printf 'Cannot find a PostgreSQL cluster or service to start. Check installed PostgreSQL packages and cluster status.\n' >&2
  printf 'Useful diagnostics: dpkg -l '\''postgresql-*'\''; pg_lsclusters; systemctl list-units --all '\''postgresql*'\''\n' >&2
  exit 1
fi

PSQL_BIN="$(command -v psql)"
adamant_assert_pg_identifier "$username" "PostgreSQL role"
adamant_assert_pg_identifier "$databasename" "PostgreSQL database"
if ! adamant_role_exists "$PSQL_BIN" "$username"; then
  printf '\nPostgreSQL role %s was not found. Refusing to recreate the database without its owner.\n\n' \
    "$username" >&2
  exit 1
fi

adamant_publish_library_to_user "$username" "$NODE_HOME"
if ! adamant_image_checksum_published "$image_url" "$image_filename"; then
  printf '\nRefusing to repair from %s.\n' "$image_url" >&2
  printf 'Publish a SHA-256 file at %s before loading this image. The database was not dropped.\n\n' \
    "$(adamant_checksum_url "$image_url")" >&2
  trap - ERR
  exit 1
fi

image_dir="${NODE_HOME}/.adamant/images"
mkdir -p "$image_dir"
chown "$username:$username" "$image_dir"
if [[ "$drop_first" != "true" ]]; then
  image_bytes="$(adamant_remote_content_length "$image_url")"
  free_bytes="$(adamant_free_bytes "$image_dir")"
  if ! adamant_space_allows_bytes "$free_bytes" "$image_bytes" "$ADAMANT_IMAGE_MARGIN_BYTES"; then
    printf '\nNot enough free disk space to download %s bytes before dropping %s (free %s, margin %s).\n' \
      "$image_bytes" "$databasename" "$free_bytes" "$ADAMANT_IMAGE_MARGIN_BYTES" >&2
    printf 'The database was not dropped. Free space and re-run, or re-run with -d if you accept a drop-first repair.\n\n' >&2
    trap - ERR
    exit 1
  fi
  printf '\nDownloading and verifying the image before stopping the node.\n'
  runuser -u "$username" -- env \
    HOME="$NODE_HOME" \
    IMAGE_URL="$image_url" \
    IMAGE_FILENAME="$image_filename" \
    ADAMANT_LIB="${NODE_HOME}/.adamant/adamant_node_common.sh" \
    bash --noprofile --norc -s <<'EOSU'
set -Eeuo pipefail
# shellcheck disable=SC1091
source "$ADAMANT_LIB"
adamant_download_verified_archive "$HOME/.adamant/images" "$IMAGE_URL" "$IMAGE_FILENAME"
EOSU
fi

app_args=""
if [[ "$network" != "mainnet" ]]; then
  app_args="--config test/config.json --genesis test/genesisBlock.json"
fi
printf '\nStopping ADAMANT %s process %s.\n' "$network" "$processname"
runuser -u "$username" -- env \
  HOME="$NODE_HOME" \
  REPO_DIR="$REPO_DIR" \
  PROCESS_NAME="$processname" \
  APP_ARGS="$app_args" \
  ADAMANT_LIB="${NODE_HOME}/.adamant/adamant_node_common.sh" \
  bash --noprofile --norc -s <<'EOSU'
set -Eeuo pipefail
# shellcheck disable=SC1091
source "$HOME/.nvm/nvm.sh"
# shellcheck disable=SC1091
source "$ADAMANT_LIB"
interpreter="$(command -v node)"
ecosystem="$HOME/.adamant/ecosystem.${PROCESS_NAME}.json"
adamant_stop_process_for_repair "$ecosystem" "$PROCESS_NAME" "$interpreter"
printf '%s\n' "$ecosystem" >"$HOME/.adamant/ecosystem-path"
printf '%s\n' "$(dirname "$interpreter")" >"$HOME/.adamant/node-bin-dir"
EOSU

adamant_terminate_database_connections "$PSQL_BIN" "$databasename"
adamant_drop_database "$PSQL_BIN" "$databasename"
database_dropped="true"
printf 'Creating database %s.\n' "$databasename"
runuser -u postgres -- createdb -O "$username" "$databasename"
adamant_set_database_owner "$PSQL_BIN" "$databasename" "$username"

if [[ "$drop_first" == "true" ]]; then
  printf '\nDownloading and verifying the image after dropping the database.\n'
  runuser -u "$username" -- env \
    HOME="$NODE_HOME" \
    IMAGE_URL="$image_url" \
    IMAGE_FILENAME="$image_filename" \
    ADAMANT_LIB="${NODE_HOME}/.adamant/adamant_node_common.sh" \
    bash --noprofile --norc -s <<'EOSU'
set -Eeuo pipefail
# shellcheck disable=SC1091
source "$ADAMANT_LIB"
adamant_download_verified_archive "$HOME/.adamant/images" "$IMAGE_URL" "$IMAGE_FILENAME"
EOSU
fi

printf '\nStreaming the verified blockchain image into %s.\n' "$databasename"
runuser -u "$username" -- env \
  HOME="$NODE_HOME" \
  DATABASE_NAME="$databasename" \
  IMAGE_FILENAME="$image_filename" \
  bash --noprofile --norc -s <<'EOSU'
set -Eeuo pipefail
gzip -dc "$HOME/.adamant/images/${IMAGE_FILENAME}" | psql -X --set=ON_ERROR_STOP=1 "$DATABASE_NAME"
rm -f -- "$HOME/.adamant/images/${IMAGE_FILENAME}" "$HOME/.adamant/images/${IMAGE_FILENAME}.sha256"
EOSU
database_dropped="false"

printf '\nRestarting ADAMANT %s process %s.\n' "$network" "$processname"
runuser -u "$username" -- env \
  HOME="$NODE_HOME" \
  REPO_DIR="$REPO_DIR" \
  PROCESS_NAME="$processname" \
  ADAMANT_LIB="${NODE_HOME}/.adamant/adamant_node_common.sh" \
  bash --noprofile --norc -s <<'EOSU'
set -Eeuo pipefail
# shellcheck disable=SC1091
source "$HOME/.nvm/nvm.sh"
# shellcheck disable=SC1091
source "$ADAMANT_LIB"
interpreter="$(command -v node)"
ecosystem="$HOME/.adamant/ecosystem.${PROCESS_NAME}.json"
adamant_start_process_from_ecosystem "$ecosystem" "$PROCESS_NAME" "$interpreter"
EOSU

node_bin_dir="$(cat "${NODE_HOME}/.adamant/node-bin-dir")"
ecosystem_path="$(cat "${NODE_HOME}/.adamant/ecosystem-path")"
# shellcheck disable=SC2119
mapfile -t database_units < <(adamant_detect_database_units | tr ' ' '\n')
adamant_install_pm2_systemd "$username" "$NODE_HOME" "$node_bin_dir" "${database_units[@]}"
adamant_print_database_maintenance debian "$username" "$ecosystem_path"

port_read="$(jq -r '.port // empty' "$CFG_PATH" 2>/dev/null || true)"
if [[ "$port_read" =~ ^[0-9]+$ ]]; then
  port="$port_read"
fi
minutes="$(( (SECONDS + 59) / 60 ))"
adamant_print_operator_footer repair "$network" "$username" "$processname" "$port" "$LOGFILE" "$minutes"
