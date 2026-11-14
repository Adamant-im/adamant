#!/usr/bin/env bash
# ADAMANT node installer for Ubuntu 20.04, 22.04, 24.04, and 26.04 LTS.
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
  printf '    sudo bash tools/install_node.sh -b dev -n mainnet\n\n' >&2
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
if [[ "${ID:-}" != "ubuntu" ]]; then
  printf '\nThis installer supports Ubuntu. Detected: %s %s.\n\n' \
    "${PRETTY_NAME:-unknown OS}" "${VERSION_ID:-}" >&2
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
LOGFILE="/var/log/adamant_${network}_install.log"
touch "$LOGFILE"
chmod 0600 "$LOGFILE"
exec > >(tee -a "$LOGFILE") 2>&1
if [[ -s "$LOGFILE" ]]; then
  printf '\n\n\n===========================\n'
fi
printf '\n%s ADAMANT %s node installation started\n' \
  "$(date -u '+%Y-%m-%d %H:%M UTC')" "$network"
printf '\nWelcome to the ADAMANT Node Installer v%s for Ubuntu 20.04-26.04 LTS.\n' \
  "$ADAMANT_INSTALLER_VERSION"
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

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1
APT_OPTIONS=(-y -o Dpkg::Options::=--force-confold)
printf '\nInstalling download tools needed to verify the blockchain image.\n'
apt-get update
apt-get "${APT_OPTIONS[@]}" install ca-certificates curl

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

printf '\nUpdating installed system packages. Existing package configuration files will be preserved.\n'
printf 'If an ADAMANT node is running, a PostgreSQL or Redis upgrade may restart it without a graceful node shutdown.\n'
apt-get update
apt-get "${APT_OPTIONS[@]}" upgrade

printf '\nInstalling ADAMANT system dependencies.\n'
apt-get "${APT_OPTIONS[@]}" install \
  build-essential automake autoconf libtool pkg-config python3 \
  ca-certificates curl git gnupg gzip jq \
  libpq-dev postgresql-client redis-server

pgdg_url="https://apt.postgresql.org/pub/repos/apt"
if [[ "$VERSION_ID" == "20.04" ]]; then
  pgdg_url="https://apt-archive.postgresql.org/pub/repos/apt"
fi
architecture="$(dpkg --print-architecture)"
pgdg_release_url="${pgdg_url}/dists/${VERSION_CODENAME}-pgdg/Release"
pgdg_enabled=false
postgresql_package="postgresql"

adamant_disable_pgdg() {
  local reason="$1"
  printf 'WARNING: %s Not using the PGDG repository; Ubuntu PostgreSQL packages will be used instead.\n' "$reason"
  rm -f -- /etc/apt/sources.list.d/pgdg.sources \
    /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  pgdg_enabled=false
  postgresql_package="postgresql"
  apt-get update
}

case "$architecture" in
  amd64|arm64|ppc64el)
    if curl --proto '=https' --proto-redir '=https' -fsSL -o /dev/null "$pgdg_release_url"; then
      adamant_install_mode_directory /usr/share/postgresql-common
      adamant_install_mode_directory /usr/share/postgresql-common/pgdg
      install -m 0644 /dev/null /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
      curl --proto '=https' --proto-redir '=https' -fsSL \
        https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
      chmod 0644 /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
      chown root:root /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
      pgdg_key_fingerprint="$(gpg --show-keys --with-colons /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
        | awk -F: '$1 == "fpr" { print $10; exit }')"
      if [[ "$pgdg_key_fingerprint" != "B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8" ]]; then
        adamant_disable_pgdg "Unexpected PostgreSQL APT key fingerprint: ${pgdg_key_fingerprint:-unknown}."
      else
        cat >/etc/apt/sources.list.d/pgdg.sources <<EOF
Types: deb
URIs: ${pgdg_url}
Suites: ${VERSION_CODENAME}-pgdg
Architectures: ${architecture}
Components: main
Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
EOF
        chmod 0644 /etc/apt/sources.list.d/pgdg.sources
        if [[ "$VERSION_ID" == "20.04" ]]; then
          postgresql_package="postgresql-17"
        else
          postgresql_package="postgresql-18"
        fi
        if ! apt-get update; then
          adamant_disable_pgdg "apt-get update rejected the PGDG source."
        elif ! adamant_pgdg_policy_usable "$(apt-cache policy "$postgresql_package" 2>/dev/null || true)"; then
          adamant_disable_pgdg "Package ${postgresql_package} is not available from PGDG."
        else
          pgdg_enabled=true
          printf 'Configured the official PostgreSQL repository for %s.\n' "$VERSION_CODENAME"
        fi
      fi
    fi
    ;;
esac

if [[ "$pgdg_enabled" != "true" ]]; then
  printf 'WARNING: PGDG is unavailable for this release or architecture; using Ubuntu PostgreSQL packages.\n'
fi

detect_installed_postgresql_server_majors() {
  dpkg-query -W -f='${db:Status-Status} ${Package}\n' 'postgresql-[0-9]*' 2>/dev/null \
    | awk '$1 == "installed" && $2 ~ /^postgresql-[0-9]+$/ {
        sub(/^postgresql-/, "", $2)
        print $2
      }' \
    | sort -Vu
}

postgresql_major_packages="$(detect_installed_postgresql_server_majors || true)"
if [[ -n "$postgresql_major_packages" ]]; then
  printf 'Existing PostgreSQL server installation detected; preserving its major version.\n'
else
  printf 'Installing PostgreSQL server package %s.\n' "$postgresql_package"
  apt-get "${APT_OPTIONS[@]}" install "$postgresql_package"
  postgresql_major_packages="$(detect_installed_postgresql_server_majors || true)"
fi

postgresql_major="$(printf '%s\n' "$postgresql_major_packages" | tail -1)"
postgresql_started=false
if command -v pg_lsclusters >/dev/null 2>&1 && command -v pg_ctlcluster >/dev/null 2>&1; then
  if ! pg_lsclusters -h | awk 'NF { found = 1 } END { exit !found }'; then
    if [[ -z "$postgresql_major" ]]; then
      printf 'Cannot determine installed PostgreSQL major version for cluster creation.\n' >&2
      exit 1
    fi
    pg_createcluster "$postgresql_major" main --start
  fi
  while read -r cluster_version cluster_name _ cluster_status _; do
    if [[ -n "$cluster_version" && -n "$cluster_name" && "$cluster_status" != "online" ]]; then
      pg_ctlcluster "$cluster_version" "$cluster_name" start
    fi
  done < <(pg_lsclusters -h)
  postgresql_started=true
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
      systemctl enable --now "$postgresql_unit" || systemctl start "$postgresql_unit"
    done <<<"$postgresql_units"
    postgresql_started=true
  elif systemctl list-unit-files postgresql.service >/dev/null 2>&1; then
    systemctl enable --now postgresql
    postgresql_started=true
  fi
elif [[ -x /etc/init.d/postgresql ]]; then
  service postgresql start
  postgresql_started=true
fi

if [[ "$postgresql_started" != "true" ]]; then
  printf 'Cannot find a PostgreSQL cluster or service to start. Check installed PostgreSQL packages and cluster status.\n' >&2
  printf 'Useful diagnostics: dpkg -l '\''postgresql-*'\''; pg_lsclusters; systemctl list-units --all '\''postgresql*'\''\n' >&2
  exit 1
fi
for _ in {1..30}; do
  if runuser -u postgres -- pg_isready -q; then
    break
  fi
  sleep 1
done
runuser -u postgres -- pg_isready -q

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files redis-server.service >/dev/null 2>&1; then
  systemctl enable --now redis-server
else
  service redis-server start
fi

if id -u "$username" >/dev/null 2>&1; then
  printf '\nSystem user %s already exists; preserving it.\n' "$username"
else
  printf '\nCreating system user %s.\n' "$username"
  adduser --disabled-password --gecos "" "$username"
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

PSQL_BIN="$(command -v psql)"
adamant_assert_pg_identifier "$username" "PostgreSQL role"
adamant_assert_pg_identifier "$databasename" "PostgreSQL database"
adamant_set_role_password "$PSQL_BIN" "$username" "$(cat "$db_password_file")"
if adamant_database_exists "$PSQL_BIN" "$databasename"; then
  printf 'Database %s already exists; preserving its contents.\n' "$databasename"
else
  printf 'Creating database %s.\n' "$databasename"
  runuser -u postgres -- createdb -O "$username" "$databasename"
fi
adamant_set_database_owner "$PSQL_BIN" "$databasename" "$username"
if [[ "$use_image" == "true" ]] && adamant_database_has_tables "$PSQL_BIN" "$databasename"; then
  printf 'Database %s already contains tables; skipping the blockchain image to avoid overwriting data.\n' \
    "$databasename"
  use_image="false"
fi

runuser -u "$username" -- env \
  HOME="$NODE_HOME" \
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
# shellcheck disable=SC2119
mapfile -t database_units < <(adamant_detect_database_units | tr ' ' '\n')
adamant_install_pm2_systemd "$username" "$NODE_HOME" "$node_bin_dir" "${database_units[@]}"
adamant_print_database_maintenance debian "$username" "$ecosystem_path"

minutes="$(( (SECONDS + 59) / 60 ))"
adamant_print_operator_footer installation "$network" "$username" "$processname" "$port" "$LOGFILE" "$minutes"
