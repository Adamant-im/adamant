#!/usr/bin/env bash
set -Eeuo pipefail

on_error() {
  local exit_status=$?
  printf "\n[ERROR] Line %s failed. Installation stopped.\n\n" "${BASH_LINENO[0]}" >&2
  exit "$exit_status"
}
trap on_error ERR

readonly INSTALLER_VERSION="2.4.5"
readonly NVM_VERSION="0.40.5"
readonly POSTGRESQL_VERSION="18"

branch="master"
network="mainnet"
username="adamant"
databasename="adamant_main"
configfile="config.json"
processname="adamant"
port="36666"
nodejs="24"
image_url="https://explorer.adamant.im/db_backup.sql.gz"

usage() {
  printf "Usage: %s [-h] [-b branch] [-n mainnet|testnet] [-j 22|24|26]\n" "${0##*/}"
  printf "       Node.js aliases: jod=22, krypton=24. Version 24 is the default.\n"
}

require_interactive_tty() {
  if [[ ! -r /dev/tty || ! -w /dev/tty ]]; then
    printf "\nThis installer requires an interactive terminal for confirmations and passwords.\n" >&2
    printf "Run it from a normal shell session, for example:\n" >&2
    printf "    curl -fsSL https://adamant.im/install_node_centos.sh | sudo bash -s -- -n mainnet\n\n" >&2
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

read_secret_from_tty() {
  local prompt_text="$1"
  local response

  printf "%s" "$prompt_text" > /dev/tty
  IFS= read -r -s response < /dev/tty
  printf "\n" > /dev/tty
  printf "%s" "$response"
}

detect_installed_postgresql_services() {
  rpm -qa --qf '%{NAME}\n' \
    | awk '
        /^postgresql[0-9]+-server$/ {
          service = $0
          sub(/^postgresql/, "", service)
          sub(/-server$/, "", service)
          print "postgresql-" service
        }
        /^postgresql-server$/ {
          print "postgresql"
        }
      ' \
    | sort -Vu
}

repair_node_user_permissions() {
  for path in "$NODE_HOME/.nvm" "$NODE_HOME/.pm2" "$REPO_DIR"; do
    if [[ -e "$path" ]]; then
      chown -R "$username:$username" "$path"
      chmod -R u+rwX "$path"
    fi
  done
}

while getopts ":b:n:j:h" OPTION; do
  case "$OPTION" in
    b)
      branch="$OPTARG"
      ;;
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
    j)
      case "$OPTARG" in
        22|jod) nodejs="22" ;;
        24|krypton) nodejs="24" ;;
        26) nodejs="26" ;;
        *)
          printf "\nNode.js must be version 22, 24, or 26. Version 24 is the default.\n\n" >&2
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
  printf "\nRun this installer as root, for example: sudo bash %s\n\n" "${0##*/}" >&2
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
el_major="$(rpm -E '%{rhel}' 2>/dev/null || true)"
if [[ ! "$el_major" =~ ^(8|9|10)$ ]]; then
  el_major="${VERSION_ID%%.*}"
fi
if [[ ! "$el_major" =~ ^(8|9|10)$ ]]; then
  printf "\nUnsupported operating system '%s'. This installer supports RHEL-compatible releases 8-10.\n\n" \
    "${PRETTY_NAME:-unknown OS}" >&2
  trap - ERR
  exit 1
fi

case "${ID:-} ${ID_LIKE:-}" in
  *rhel*|*centos*|*rocky*|*almalinux*|*ol*) ;;
  *)
    printf "\nUnsupported operating system family: %s.\n\n" "${PRETTY_NAME:-unknown OS}" >&2
    trap - ERR
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64) pgdg_arch="x86_64" ;;
  aarch64|arm64) pgdg_arch="aarch64" ;;
  *)
    printf "\nUnsupported architecture '%s'. Supported architectures: x86_64 and aarch64.\n\n" \
      "$(uname -m)" >&2
    trap - ERR
    exit 1
    ;;
esac

image_filename="$(basename "$image_url")"
LOGFILE="/var/log/adamant_${network}_install.log"

exec > >(tee -a "$LOGFILE") 2>&1
if [[ -s "$LOGFILE" ]]; then
  printf "\n\n\n===========================\n"
fi
printf "\n%s ADAMANT %s node installation started\n" \
  "$(date -u '+%Y-%m-%d %H:%M UTC')" "$network"

printf "\nWelcome to the ADAMANT Node Installer v%s for RHEL-compatible releases 8-10.\n" \
  "$INSTALLER_VERSION"
printf "Supported distributions include CentOS Stream, Rocky Linux, AlmaLinux, and RHEL.\n"
printf "The installer updates system packages and preserves existing ADAMANT configuration and local Git changes.\n"
printf "Package upgrades may restart PostgreSQL, Redis, and other affected system services.\n"
printf "Review backups and custom service configuration before continuing on an existing server.\n\n"
printf "Installation guide: https://docs.adamant.im/own-node/installation.html\n\n"

printf "Operating system:  %s\n" "$PRETTY_NAME"
printf "Selected network:  %s\n" "$network"
printf "Selected branch:   %s\n" "$branch"
printf "Selected Node.js:  %s\n\n" "$nodejs"

require_interactive_tty
agreement="$(read_from_tty "The script will upgrade packages, may restart services, and configure ADAMANT. Type \"yes\" to continue: ")"
if [[ "$agreement" != "yes" ]]; then
  printf "\nInstallation cancelled.\n\n"
  exit 1
fi

IMAGE=false
printf "\nA blockchain image can reduce synchronization time, but its source must be trusted.\n"
printf "Without an image, the node verifies the blockchain from height 1, which may take several days.\n"
useimage="$(read_from_tty "Use the official ADAMANT blockchain image to bootstrap? [Y/n]: ")"
case "${useimage:-Y}" in
  [yY][eE][sS]|[yY]|[jJ]|'') IMAGE=true ;;
  *) printf "The node will synchronize from scratch.\n" ;;
esac

hostname_value="$(hostname)"
if ! awk -v hostname="$hostname_value" '
  $1 !~ /^#/ {
    for (field = 2; field <= NF; field++) {
      if ($field == hostname) {
        found = 1
      }
    }
  }
  END { exit !found }
' /etc/hosts; then
  printf "\nAdding hostname '%s' to /etc/hosts.\n" "$hostname_value"
  printf '\n127.0.1.1\t%s\n' "$hostname_value" >> /etc/hosts
else
  printf "\nThe /etc/hosts hostname entry is already present.\n"
fi

get_database_password() {
  local password confirmation

  while true; do
    password="$(read_secret_from_tty "$(printf '\nSet the PostgreSQL database password for role %s.\nThis is not the Linux user login password.\n> ' "$username")")"
    confirmation="$(read_secret_from_tty "$(printf 'Confirm the PostgreSQL database password:\n> ')")"

    if [[ -z "$password" ]]; then
      printf 'The database password cannot be empty. Try again.\n' >&2
    elif [[ "$password" != "$confirmation" ]]; then
      printf 'The passwords do not match. Try again.\n' >&2
    else
      printf '%s' "$password"
      return
    fi
  done
}

DB_PASSWORD="$(get_database_password)"
DB_PASSWORD_SQL=${DB_PASSWORD//\'/\'\'}
DB_PASSWORD_BASE64="$(printf '%s' "$DB_PASSWORD" | base64 | tr -d '\n')"
unset DB_PASSWORD

printf "\nInstalling package-management and build prerequisites.\n"
dnf -y install \
  ca-certificates curl git gzip jq tar wget \
  gcc gcc-c++ make automake autoconf libtool pkgconf-pkg-config python3

# Use the official PGDG repository on fresh installations. Installing the
# repository is harmless on reruns and keeps installed PostgreSQL packages
# eligible for security updates.
pgdg_rpm="https://download.postgresql.org/pub/repos/yum/reporpms/EL-${el_major}-${pgdg_arch}/pgdg-redhat-repo-latest.noarch.rpm"
pgdg_enabled=false
if curl -fsSL -o /dev/null "$pgdg_rpm"; then
  dnf -y install "$pgdg_rpm"
  pgdg_enabled=true
else
  printf "WARNING: PGDG RPM is unavailable; using distribution PostgreSQL packages.\n"
fi

printf "\nUpdating installed system packages.\n"
dnf -y upgrade --refresh

printf "\nInstalling Redis and PostgreSQL client development files.\n"
dnf -y install redis libpq-devel

if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
  printf "Invalid Git branch name: '%s'.\n" "$branch" >&2
  exit 2
fi

postgresql_service=""
postgresql_installed_services="$(detect_installed_postgresql_services || true)"
if [[ -n "$postgresql_installed_services" ]]; then
  printf "Existing PostgreSQL server installation detected; preserving its major version.\n"
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
  if [[ "$pgdg_enabled" == "true" ]]; then
    printf "Installing PostgreSQL %s from the official PGDG repository.\n" "$POSTGRESQL_VERSION"
    dnf -qy module disable postgresql || true
    dnf -y install \
      "postgresql${POSTGRESQL_VERSION}" \
      "postgresql${POSTGRESQL_VERSION}-server" \
      "postgresql${POSTGRESQL_VERSION}-contrib"
    postgresql_service="postgresql-${POSTGRESQL_VERSION}"
    if [[ ! -s "/var/lib/pgsql/${POSTGRESQL_VERSION}/data/PG_VERSION" ]]; then
      "/usr/pgsql-${POSTGRESQL_VERSION}/bin/postgresql-${POSTGRESQL_VERSION}-setup" initdb
    fi
  else
    printf "Installing PostgreSQL from the distribution repository.\n"
    dnf -y install postgresql postgresql-server postgresql-contrib
    postgresql_service="postgresql"
    if [[ ! -s /var/lib/pgsql/data/PG_VERSION ]]; then
      postgresql-setup --initdb
    fi
  fi
fi

if [[ -z "$postgresql_service" ]]; then
  printf "Cannot determine the installed PostgreSQL systemd service.\n" >&2
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
  printf "\nSystem user '%s' already exists; preserving it.\n" "$username"
else
  printf "\nCreating system user '%s'.\n" "$username"
  useradd --create-home --shell /bin/bash "$username"
fi

NODE_HOME="$(getent passwd "$username" | cut -d: -f6)"
if [[ -z "$NODE_HOME" || ! -d "$NODE_HOME" ]]; then
  printf "Cannot determine a valid home directory for user '%s'.\n" "$username" >&2
  exit 1
fi
REPO_DIR="${NODE_HOME}/adamant"
repair_node_user_permissions

PSQL_BIN="$(command -v psql || true)"
if [[ -z "$PSQL_BIN" && -x "/usr/pgsql-${POSTGRESQL_VERSION}/bin/psql" ]]; then
  PSQL_BIN="/usr/pgsql-${POSTGRESQL_VERSION}/bin/psql"
fi
if [[ -z "$PSQL_BIN" ]]; then
  PSQL_BIN="$(find /usr/pgsql-* -maxdepth 2 -type f -name psql 2>/dev/null | sort -V | tail -1)"
fi
if [[ -z "$PSQL_BIN" ]]; then
  printf "Cannot locate the PostgreSQL client.\n" >&2
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

role_exists="$(runuser -u postgres -- "$PSQL_BIN" -XAtqc \
  "SELECT 1 FROM pg_roles WHERE rolname = '${username}'" postgres)"
if [[ "$role_exists" == "1" ]]; then
  printf "\nUpdating the password for existing PostgreSQL role '%s'.\n" "$username"
  runuser -u postgres -- "$PSQL_BIN" -X --set=ON_ERROR_STOP=1 postgres <<EOSQL
ALTER ROLE ${username} WITH LOGIN PASSWORD '${DB_PASSWORD_SQL}';
EOSQL
else
  printf "\nCreating PostgreSQL role '%s'.\n" "$username"
  runuser -u postgres -- "$PSQL_BIN" -X --set=ON_ERROR_STOP=1 postgres <<EOSQL
CREATE ROLE ${username} WITH LOGIN PASSWORD '${DB_PASSWORD_SQL}';
EOSQL
fi

database_exists="$(runuser -u postgres -- "$PSQL_BIN" -XAtqc \
  "SELECT 1 FROM pg_database WHERE datname = '${databasename}'" postgres)"
if [[ "$database_exists" == "1" ]]; then
  printf "Database '%s' already exists; preserving its contents.\n" "$databasename"
else
  printf "Creating database '%s'.\n" "$databasename"
  runuser -u postgres -- "$PG_BIN_DIR/createdb" -O "$username" "$databasename"
fi
runuser -u postgres -- "$PSQL_BIN" -X --set=ON_ERROR_STOP=1 -c \
  "ALTER DATABASE ${databasename} OWNER TO ${username};" postgres

database_has_tables="$(runuser -u postgres -- "$PSQL_BIN" -XAtqc \
  "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema'))" \
  "$databasename")"
if [[ "$database_has_tables" == "t" && "$IMAGE" == "true" ]]; then
  printf "Database '%s' already contains tables; skipping the blockchain image to avoid overwriting data.\n" \
    "$databasename"
  IMAGE=false
fi

runuser -u "$username" -- env \
  HOME="$NODE_HOME" \
  PATH="${PG_BIN_DIR}:/usr/local/bin:/usr/bin:/bin" \
  NETWORK="$network" \
  BRANCH="$branch" \
  NODEJS_VERSION="$nodejs" \
  NVM_INSTALL_VERSION="$NVM_VERSION" \
  REPO_DIR="$REPO_DIR" \
  CONFIG_FILE="$configfile" \
  PROCESS_NAME="$processname" \
  DATABASE_NAME="$databasename" \
  DB_PASSWORD_BASE64="$DB_PASSWORD_BASE64" \
  USE_IMAGE="$IMAGE" \
  IMAGE_URL="$image_url" \
  IMAGE_FILENAME="$image_filename" \
  bash <<'EOSU'
set -Eeuo pipefail
trap 'status=$?; printf "\n[ERROR] User setup failed at line %s.\n\n" "$LINENO" >&2; exit "$status"' ERR

run_quiet() {
  local description="$1"
  local log_file

  shift
  log_file="$(mktemp)"
  printf "%s\n" "$description"
  if "$@" > "$log_file" 2>&1; then
    rm -f "$log_file"
    return 0
  fi
  cat "$log_file" >&2
  rm -f "$log_file"
  return 1
}

cd "$HOME"
printf "\nInstalling or updating nvm v%s and Node.js %s.\n" "$NVM_INSTALL_VERSION" "$NODEJS_VERSION"
export NVM_DIR="$HOME/.nvm"
if [[ -d "$NVM_DIR/.git" ]]; then
  run_quiet "Updating nvm source." \
    git -C "$NVM_DIR" fetch --quiet --depth 1 origin \
      "refs/tags/v${NVM_INSTALL_VERSION}:refs/tags/v${NVM_INSTALL_VERSION}"
  git -c advice.detachedHead=false -C "$NVM_DIR" checkout --quiet "v${NVM_INSTALL_VERSION}"
else
  rm -rf "$NVM_DIR"
  run_quiet "Cloning nvm source." \
    git -c advice.detachedHead=false clone --quiet --depth 1 --branch "v${NVM_INSTALL_VERSION}" \
      https://github.com/nvm-sh/nvm.git "$NVM_DIR"
fi
nvm_profile="$HOME/.bashrc"
if ! grep -q 'NVM_DIR="$HOME/.nvm"' "$nvm_profile" 2>/dev/null; then
  {
    printf '\nexport NVM_DIR="$HOME/.nvm"\n'
    printf '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"\n'
  } >> "$nvm_profile"
fi
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
nvm install "$NODEJS_VERSION" --latest-npm
nvm alias default "$NODEJS_VERSION"
nvm use "$NODEJS_VERSION"
run_quiet "Installing or updating pm2." npm install --global pm2@latest
run_quiet "Refreshing the pm2 daemon." pm2 update
printf "Using Node.js %s, npm %s, and pm2 %s.\n" "$(node --version)" "$(npm --version)" "$(pm2 --version)"

printf "\nConfiguring pm2 log rotation.\n"
if pm2 describe pm2-logrotate >/dev/null 2>&1; then
  run_quiet "Updating pm2-logrotate module." pm2 module:update pm2-logrotate
else
  run_quiet "Installing pm2-logrotate module." pm2 install pm2-logrotate
fi
run_quiet "Setting pm2-logrotate:max_size=500M." pm2 set pm2-logrotate:max_size 500M
run_quiet "Setting pm2-logrotate:retain=5." pm2 set pm2-logrotate:retain 5
run_quiet "Setting pm2-logrotate:compress=true." pm2 set pm2-logrotate:compress true
run_quiet "Setting pm2-logrotate:rotateInterval='0 0 0 1 *'." \
  pm2 set pm2-logrotate:rotateInterval '0 0 0 1 *'

if [[ ! -e "$REPO_DIR" ]]; then
  printf "\nCloning ADAMANT branch '%s'.\n" "$BRANCH"
  git clone --branch "$BRANCH" --single-branch https://github.com/Adamant-im/adamant "$REPO_DIR"
elif [[ ! -d "$REPO_DIR/.git" ]]; then
  printf "\nExisting path '%s' is not an ADAMANT Git checkout. Refusing to overwrite it.\n" "$REPO_DIR" >&2
  exit 1
else
  printf "\nExisting ADAMANT checkout found. Fetching branch '%s'.\n" "$BRANCH"
  cd "$REPO_DIR"
  git fetch --prune origin "$BRANCH"
  if [[ -n "$(git status --porcelain)" ]]; then
    printf "Local repository changes detected; preserving the current checkout without switching branches.\n"
  else
    if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
      git checkout "$BRANCH"
    else
      git checkout --track -b "$BRANCH" "origin/$BRANCH"
    fi
    if ! git merge --ff-only "origin/$BRANCH"; then
      printf "WARNING: The local branch cannot be fast-forwarded; preserving its current history.\n"
    fi
  fi
fi

cd "$REPO_DIR"
printf "\nInstalling Node.js dependencies.\n"
npm install

printf "\nConfiguring the ADAMANT node.\n"
if [[ ! -f "$CONFIG_FILE" ]]; then
  if [[ "$CONFIG_FILE" == "config.json" ]]; then
    cp config.default.json "$CONFIG_FILE"
  else
    cp test/config.default.json "$CONFIG_FILE"
  fi
else
  printf "Configuration file '%s' already exists; preserving its settings.\n" "$CONFIG_FILE"
fi

DB_PASSWORD_DECODED="$(printf '%s' "$DB_PASSWORD_BASE64" | base64 --decode)"
export DB_PASSWORD_DECODED
config_tmp="$(mktemp "${CONFIG_FILE}.tmp.XXXXXX")"
jq '.db.password = env.DB_PASSWORD_DECODED' "$CONFIG_FILE" > "$config_tmp"
chmod 0600 "$config_tmp"
mv "$config_tmp" "$CONFIG_FILE"
unset DB_PASSWORD_DECODED DB_PASSWORD_BASE64

if [[ "$USE_IMAGE" == "true" ]]; then
  printf "\nDownloading the %s blockchain image.\n" "$NETWORK"
  rm -f "${IMAGE_FILENAME}.part" "$IMAGE_FILENAME"
  wget --progress=dot:giga "$IMAGE_URL" -O "${IMAGE_FILENAME}.part"
  mv "${IMAGE_FILENAME}.part" "$IMAGE_FILENAME"
  gzip --test "$IMAGE_FILENAME"
  printf "Streaming the blockchain image into PostgreSQL.\n"
  gzip -dc "$IMAGE_FILENAME" | psql -X --set=ON_ERROR_STOP=1 "$DATABASE_NAME"
  rm -f "$IMAGE_FILENAME"
fi

printf "\nStarting the ADAMANT %s node.\n" "$NETWORK"
if pm2 describe "$PROCESS_NAME" >/dev/null 2>&1; then
  pm2 restart "$PROCESS_NAME" --update-env
elif [[ "$NETWORK" == "mainnet" ]]; then
  pm2 start --name "$PROCESS_NAME" app.js
else
  pm2 start --name "$PROCESS_NAME" app.js -- \
    --config test/config.json --genesis test/genesisBlock.json
fi
pm2 save
EOSU

unset DB_PASSWORD_BASE64 DB_PASSWORD_SQL

if command -v systemctl >/dev/null 2>&1 && [[ "$(ps -p 1 -o comm=)" == "systemd" ]]; then
  # shellcheck disable=SC2016
  NODE_BIN_DIR="$(runuser -u "$username" -- env HOME="$NODE_HOME" bash -c \
    'cd "$HOME" && source "$HOME/.nvm/nvm.sh" && dirname "$(command -v node)"')"
  printf "\nEnabling pm2 startup for user '%s'.\n" "$username"
  env PATH="${NODE_BIN_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    "${NODE_BIN_DIR}/pm2" startup systemd -u "$username" --hp "$NODE_HOME"
else
  printf "\nWARNING: systemd was not detected. Configure pm2 startup manually for user '%s'.\n" "$username"
fi

minutes=$(( (SECONDS + 59) / 60 ))
printf "\n\nADAMANT %s node installation completed successfully.\n" "$network"
printf "Total installation time: %d minutes.\n" "$minutes"
printf "Installation log: %s\n\n" "$LOGFILE"
printf "Check the node as user '%s':\n" "$username"
printf "    su - %s\n" "$username"
printf "    pm2 list\n"
printf "    pm2 show %s\n" "$processname"
printf "    pm2 logs %s\n\n" "$processname"
printf "Query the current blockchain height:\n"
printf "    curl http://localhost:%s/api/blocks/getHeight\n\n" "$port"
