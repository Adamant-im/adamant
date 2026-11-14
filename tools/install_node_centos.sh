#!/usr/bin/env bash
# ADAMANT node installer for RHEL-compatible releases 8-10
# (CentOS Stream, Rocky Linux, AlmaLinux, and RHEL).
# Run it from a verified Git checkout so tools/lib/adamant_node_common.sh is the
# copy you reviewed. See README.md, "Verified install".
set -Eeuo pipefail
umask 022
export LC_ALL=C

_adamant_entry="${BASH_SOURCE[0]:-}"
if [[ ! -f "$_adamant_entry" ]]; then
  printf '\nRun this installer from a verified Git checkout:\n' >&2
  printf '    git clone --branch dev https://github.com/Adamant-im/adamant.git\n' >&2
  printf '    cd adamant && git rev-parse HEAD\n' >&2
  printf '    sudo bash tools/install_node_centos.sh -b dev -n mainnet\n\n' >&2
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

db_password_file=""
on_error() {
  local exit_status=$?
  if [[ -n "${db_password_file:-}" ]]; then
    rm -f -- "$db_password_file"
  fi
  printf '\n[ERROR] Line %s failed. Installation stopped.\n\n' "${BASH_LINENO[0]}" >&2
  exit "$exit_status"
}
trap on_error ERR

readonly POSTGRESQL_VERSION="18"
adamant_apply_network mainnet
branch="master"
nodejs="24"
force_restart="false"
use_image="false"

usage() {
  printf 'Usage: %s [-h] [-f] [-b branch] [-n mainnet|testnet] [-j 22|24|26]\n' "${0##*/}"
  printf '       Node.js aliases: jod=22, krypton=24. Version 24 is the default.\n'
  printf '       -f  Restart even if the node is syncing or rebuilding.\n'
}

while getopts ":b:n:j:fh" OPTION; do
  case "$OPTION" in
    b) branch="$OPTARG" ;;
    n)
      if ! adamant_apply_network "$OPTARG"; then
        printf '\nNetwork must be mainnet or testnet.\n\n' >&2
        usage
        trap - ERR
        exit 2
      fi
      ;;
    j)
      if ! adamant_apply_node_major "$OPTARG"; then
        printf '\nNode.js must be version 22, 24, or 26. Version 24 is the default.\n\n' >&2
        trap - ERR
        exit 2
      fi
      ;;
    f) force_restart="true" ;;
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
  printf '\nRun this installer as root, for example: sudo bash %s\n\n' "${0##*/}" >&2
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
el_major="$(rpm -E '%{rhel}' 2>/dev/null || true)"
if [[ ! "$el_major" =~ ^(8|9|10)$ ]]; then
  el_major="${VERSION_ID%%.*}"
fi
if [[ ! "$el_major" =~ ^(8|9|10)$ ]]; then
  printf '\nUnsupported operating system %q. This installer supports RHEL-compatible releases 8-10.\n\n' \
    "${PRETTY_NAME:-unknown OS}" >&2
  trap - ERR
  exit 1
fi
case "${ID:-} ${ID_LIKE:-}" in
  *rhel*|*centos*|*rocky*|*almalinux*|*ol*) ;;
  *)
    printf '\nUnsupported operating system family: %s.\n\n' "${PRETTY_NAME:-unknown OS}" >&2
    trap - ERR
    exit 1
    ;;
esac
case "$(uname -m)" in
  x86_64) pgdg_arch="x86_64" ;;
  aarch64|arm64) pgdg_arch="aarch64" ;;
  *)
    printf '\nUnsupported architecture %q. Supported architectures: x86_64 and aarch64.\n\n' \
      "$(uname -m)" >&2
    trap - ERR
    exit 1
    ;;
esac

image_filename="$(basename "$image_url")"
LOGFILE="/var/log/adamant_${network}_install.log"
touch "$LOGFILE"
chmod 0600 "$LOGFILE"
exec > >(tee -a "$LOGFILE") 2>&1
if [[ -s "$LOGFILE" ]]; then
  printf '\n\n\n===========================\n'
fi
printf '\n%s ADAMANT %s node installation started\n' \
  "$(date -u '+%Y-%m-%d %H:%M UTC')" "$network"
printf '\nWelcome to the ADAMANT Node Installer v%s for RHEL-compatible releases 8-10.\n' \
  "$ADAMANT_INSTALLER_VERSION"
printf 'Supported distributions include CentOS Stream, Rocky Linux, AlmaLinux, and RHEL.\n'
printf 'Make sure this checkout matches the commit you reviewed.\n'
printf 'The installer updates system packages and preserves existing ADAMANT configuration and local Git changes.\n'
printf 'Package upgrades may restart PostgreSQL, Redis, and other affected system services.\n'
printf 'Review backups and custom service configuration before continuing on an existing server.\n\n'
printf 'Installation guide: https://docs.adamant.im/own-node/installation.html\n\n'
printf 'Operating system:  %s\n' "$PRETTY_NAME"
printf 'Selected network:  %s\n' "$network"
printf 'Selected branch:   %s\n' "$branch"
printf 'Selected Node.js:  %s\n\n' "$nodejs"

adamant_require_interactive_tty
if ! adamant_confirm_exact_yes "The script will upgrade packages, may restart services, and configure ADAMANT. Type \"yes\" to continue: "; then
  printf '\nInstallation cancelled.\n\n'
  trap - ERR
  exit 1
fi

printf '\nInstalling download tools needed to verify the blockchain image.\n'
dnf -y install ca-certificates curl

adamant_prompt_blockchain_image
if [[ "$use_image" == "true" ]] && ! adamant_image_checksum_published "$image_url" "$image_filename"; then
  printf 'WARNING: %s has no usable SHA-256 file at %s.\n' \
    "$image_url" "$(adamant_checksum_url "$image_url")"
  printf 'The installer will not load an unverified blockchain image.\n'
  if adamant_confirm_exact_yes "Continue without a blockchain image and synchronize from height 1? Type \"yes\": "; then
    use_image="false"
  else
    printf '\nInstallation cancelled.\n\n'
    trap - ERR
    exit 1
  fi
fi

adamant_ensure_hosts_entry

NODE_HOME=""
if id -u "$username" >/dev/null 2>&1; then
  NODE_HOME="$(getent passwd "$username" | cut -d: -f6)"
  if [[ -n "$NODE_HOME" && -d "$NODE_HOME" ]]; then
    adamant_refuse_if_node_busy "$username" "$NODE_HOME" "$processname" "$port" \
      "${NODE_HOME}/adamant/${configfile}" "$force_restart"
  fi
fi

DB_PASSWORD="$(adamant_prompt_db_password "$username")"

printf '\nInstalling package-management and build prerequisites.\n'
dnf -y install \
  ca-certificates curl git gzip jq tar \
  gcc gcc-c++ make automake autoconf libtool pkgconf-pkg-config python3

pgdg_rpm="https://download.postgresql.org/pub/repos/yum/reporpms/EL-${el_major}-${pgdg_arch}/pgdg-redhat-repo-latest.noarch.rpm"
pgdg_enabled=false
if curl --proto '=https' --proto-redir '=https' -fsSL -o /dev/null "$pgdg_rpm"; then
  if dnf -y install "$pgdg_rpm"; then
    pgdg_enabled=true
  else
    printf 'WARNING: The PGDG repository package did not install; using distribution PostgreSQL packages.\n'
  fi
else
  printf 'WARNING: PGDG RPM is unavailable; using distribution PostgreSQL packages.\n'
fi

printf '\nUpdating installed system packages.\n'
printf 'If an ADAMANT node is running, a PostgreSQL or Redis upgrade may restart it without a graceful node shutdown.\n'
dnf -y upgrade --refresh
dnf -y install redis libpq-devel

if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
  printf 'Invalid Git branch name: %q.\n' "$branch" >&2
  exit 2
fi

detect_installed_postgresql_services() {
  rpm -qa --qf '%{NAME}\n' \
    | awk '
        /^postgresql[0-9]+-server$/ {
          service = $0
          sub(/^postgresql/, "", service)
          sub(/-server$/, "", service)
          print "postgresql-" service
        }
        /^postgresql-server$/ { print "postgresql" }
      ' \
    | sort -Vu
}

postgresql_service=""
postgresql_installed_services="$(detect_installed_postgresql_services || true)"
if [[ -n "$postgresql_installed_services" ]]; then
  printf 'Existing PostgreSQL server installation detected; preserving its major version.\n'
  if command -v systemctl >/dev/null 2>&1 && [[ "$(ps -p 1 -o comm=)" == "systemd" ]]; then
    while IFS= read -r service_name; do
      if systemctl is-active --quiet "$service_name"; then
        postgresql_service="$service_name"
        break
      fi
      if [[ -z "$postgresql_service" ]]; then
        postgresql_service="$service_name"
      fi
    done < <(systemctl list-unit-files --type=service --no-legend \
      | awk '$1 ~ /^postgresql(-[0-9]+)?\.service$/ { sub(/\.service$/, "", $1); print $1 }')
  fi
  if [[ -z "$postgresql_service" ]]; then
    postgresql_service="$(printf '%s\n' "$postgresql_installed_services" | tail -1)"
  fi
else
  postgresql_installed=false
  if [[ "$pgdg_enabled" == "true" ]]; then
    printf 'Installing PostgreSQL %s from the official PGDG repository.\n' "$POSTGRESQL_VERSION"
    dnf -qy module disable postgresql || true
    if dnf -y install \
      "postgresql${POSTGRESQL_VERSION}" \
      "postgresql${POSTGRESQL_VERSION}-server" \
      "postgresql${POSTGRESQL_VERSION}-contrib"; then
      postgresql_service="postgresql-${POSTGRESQL_VERSION}"
      if [[ ! -s "/var/lib/pgsql/${POSTGRESQL_VERSION}/data/PG_VERSION" ]]; then
        "/usr/pgsql-${POSTGRESQL_VERSION}/bin/postgresql-${POSTGRESQL_VERSION}-setup" initdb
      fi
      postgresql_installed=true
    else
      printf 'WARNING: PGDG PostgreSQL %s packages are not installable; falling back to distribution packages.\n' \
        "$POSTGRESQL_VERSION"
      dnf -y remove pgdg-redhat-repo || true
      pgdg_enabled=false
    fi
  fi
  if [[ "$postgresql_installed" != "true" ]]; then
    printf 'Installing PostgreSQL from the distribution repository.\n'
    dnf -y install postgresql postgresql-server postgresql-contrib
    postgresql_service="postgresql"
    if [[ ! -s /var/lib/pgsql/data/PG_VERSION ]]; then
      postgresql-setup --initdb
    fi
  fi
fi

if [[ -z "$postgresql_service" ]]; then
  printf 'Cannot determine the installed PostgreSQL systemd service.\n' >&2
  exit 1
fi
if command -v systemctl >/dev/null 2>&1 && [[ "$(ps -p 1 -o comm=)" == "systemd" ]]; then
  systemctl enable --now "$postgresql_service"
  systemctl enable --now redis
else
  service "$postgresql_service" start
  service redis start
fi

if id -u "$username" >/dev/null 2>&1; then
  printf '\nSystem user %s already exists; preserving it.\n' "$username"
else
  printf '\nCreating system user %s.\n' "$username"
  useradd --create-home --shell /bin/bash "$username"
fi
NODE_HOME="$(getent passwd "$username" | cut -d: -f6)"
if [[ -z "$NODE_HOME" || ! -d "$NODE_HOME" ]]; then
  printf 'Cannot determine a valid home directory for user %s.\n' "$username" >&2
  exit 1
fi
REPO_DIR="${NODE_HOME}/adamant"
adamant_repair_node_user_permissions "$username" "$NODE_HOME" "$REPO_DIR"
adamant_publish_library_to_user "$username" "$NODE_HOME"

previous_umask="$(umask)"
umask 077
db_password_file="$(mktemp "${NODE_HOME}/.adamant-db-password.XXXXXX")"
umask "$previous_umask"
printf '%s' "$DB_PASSWORD" >"$db_password_file"
chown "$username:$username" "$db_password_file"
unset DB_PASSWORD

PSQL_BIN="$(command -v psql || true)"
if [[ -z "$PSQL_BIN" && -x "/usr/pgsql-${POSTGRESQL_VERSION}/bin/psql" ]]; then
  PSQL_BIN="/usr/pgsql-${POSTGRESQL_VERSION}/bin/psql"
fi
if [[ -z "$PSQL_BIN" ]]; then
  PSQL_BIN="$(find /usr/pgsql-* -maxdepth 2 -type f -name psql 2>/dev/null | sort -V | tail -1 || true)"
fi
if [[ -z "$PSQL_BIN" ]]; then
  printf 'Cannot locate the PostgreSQL client.\n' >&2
  exit 1
fi
PG_BIN_DIR="$(dirname "$PSQL_BIN")"
for _ in {1..30}; do
  if runuser -u postgres -- "$PG_BIN_DIR/pg_isready" -q; then
    break
  fi
  sleep 1
done
runuser -u postgres -- "$PG_BIN_DIR/pg_isready" -q

adamant_assert_pg_identifier "$username" "PostgreSQL role"
adamant_assert_pg_identifier "$databasename" "PostgreSQL database"
adamant_set_role_password "$PSQL_BIN" "$username" "$(cat "$db_password_file")"
if adamant_database_exists "$PSQL_BIN" "$databasename"; then
  printf 'Database %s already exists; preserving its contents.\n' "$databasename"
else
  printf 'Creating database %s.\n' "$databasename"
  runuser -u postgres -- "$PG_BIN_DIR/createdb" -O "$username" "$databasename"
fi
adamant_set_database_owner "$PSQL_BIN" "$databasename" "$username"
if [[ "$use_image" == "true" ]] && adamant_database_has_tables "$PSQL_BIN" "$databasename"; then
  printf 'Database %s already contains tables; skipping the blockchain image to avoid overwriting data.\n' \
    "$databasename"
  use_image="false"
fi

runuser -u "$username" -- env \
  HOME="$NODE_HOME" \
  PATH="${PG_BIN_DIR}:/usr/local/bin:/usr/bin:/bin" \
  NETWORK="$network" \
  BRANCH="$branch" \
  NODEJS_VERSION="$nodejs" \
  REPO_DIR="$REPO_DIR" \
  CONFIG_FILE="$configfile" \
  PROCESS_NAME="$processname" \
  DATABASE_NAME="$databasename" \
  DB_PASSWORD_FILE="$db_password_file" \
  USE_IMAGE="$use_image" \
  IMAGE_URL="$image_url" \
  IMAGE_FILENAME="$image_filename" \
  FORCE_RESTART="$force_restart" \
  API_PORT="$port" \
  ADAMANT_LIB="${NODE_HOME}/.adamant/adamant_node_common.sh" \
  bash --noprofile --norc -s <<'EOSU'
set -Eeuo pipefail
trap 'status=$?; printf "\n[ERROR] User setup failed at line %s.\n\n" "$LINENO" >&2; exit "$status"' ERR
# shellcheck disable=SC1091
source "$ADAMANT_LIB"
adamant_user_install
EOSU

rm -f -- "$db_password_file"
db_password_file=""

node_bin_dir="$(cat "${NODE_HOME}/.adamant/node-bin-dir")"
ecosystem_path="$(cat "${NODE_HOME}/.adamant/ecosystem-path")"
mapfile -t database_units < <(adamant_detect_database_units "${postgresql_service}.service" | tr ' ' '\n')
adamant_install_pm2_systemd "$username" "$NODE_HOME" "$node_bin_dir" "${database_units[@]}"
adamant_print_database_maintenance rhel "$username" "$ecosystem_path"

minutes="$(( (SECONDS + 59) / 60 ))"
adamant_print_operator_footer installation "$network" "$username" "$processname" "$port" "$LOGFILE" "$minutes"
