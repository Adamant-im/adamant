#!/usr/bin/env bash
set -Eeuo pipefail

on_error() {
  local exit_status=$?
  if [[ -n "${db_password_file:-}" ]]; then
    rm -f -- "$db_password_file"
  fi
  printf "\n[ERROR] Line %s failed. Installation stopped.\n\n" "${BASH_LINENO[0]}" >&2
  exit "$exit_status"
}
trap on_error ERR

readonly INSTALLER_VERSION="2.4.8"
readonly NVM_VERSION="0.40.5"

branch="master"
network="mainnet"
username="adamant"
databasename="adamant_main"
configfile="config.json"
processname="adamant"
port="36666"
nodejs="24"
image_url="https://explorer.adamant.im/db_backup.sql.gz"
db_password_file=""

usage() {
  printf "Usage: %s [-h] [-b branch] [-n mainnet|testnet] [-j 22|24|26]\n" "${0##*/}"
  printf "       Node.js aliases: jod=22, krypton=24. Version 24 is the default.\n"
}

require_interactive_tty() {
  if [[ ! -r /dev/tty || ! -w /dev/tty ]]; then
    printf "\nThis installer requires an interactive terminal for confirmations and passwords.\n" >&2
    printf "Run it from a normal shell session, for example:\n" >&2
    printf "    curl -fsSL https://adamant.im/install_node.sh | sudo bash -s -- -n mainnet\n\n" >&2
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

detect_installed_postgresql_server_majors() {
  dpkg-query -W -f='${db:Status-Status} ${Package}\n' 'postgresql-[0-9]*' 2>/dev/null \
    | awk '$1 == "installed" && $2 ~ /^postgresql-[0-9]+$/ {
        sub(/^postgresql-/, "", $2)
        print $2
      }' \
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

# Parse command-line options before creating the network-specific log file.
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
if [[ "${ID:-}" != "ubuntu" ]]; then
  printf "\nThis installer supports Ubuntu. Detected: %s %s.\n\n" \
    "${PRETTY_NAME:-unknown OS}" "${VERSION_ID:-}" >&2
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
LOGFILE="/var/log/adamant_${network}_install.log"

# Send all output to both the terminal and a persistent log file.
exec > >(tee -a "$LOGFILE") 2>&1
if [[ -s "$LOGFILE" ]]; then
  printf "\n\n\n===========================\n"
fi
printf "\n%s ADAMANT %s node installation started\n" \
  "$(date -u '+%Y-%m-%d %H:%M UTC')" "$network"

printf "\nWelcome to the ADAMANT Node Installer v%s for Ubuntu 20.04-26.04 LTS.\n" \
  "$INSTALLER_VERSION"
printf "Make sure you obtained this script from adamant.im or the official GitHub repository.\n"
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

# A trusted blockchain image reduces initial synchronization time.
IMAGE=false
printf "\nA blockchain image can reduce synchronization time, but its source must be trusted.\n"
printf "Without an image, the node verifies the blockchain from height 1, which may take several days.\n"
useimage="$(read_from_tty "Use the official ADAMANT blockchain image to bootstrap? [Y/n]: ")"
case "${useimage:-Y}" in
  [yY][eE][sS]|[yY]|[jJ]|'') IMAGE=true ;;
  *) printf "The node will synchronize from scratch.\n" ;;
esac

# Add an exact hostname token only when /etc/hosts does not already contain one.
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

printf "\nUpdating package indexes and installing package-management prerequisites.\n"
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
# Skip needrestart hooks during installer-managed apt runs. Some VPS images ship
# a broken needrestart.conf, which can print scary Perl parse errors after dpkg.
export NEEDRESTART_SUSPEND=1
APT_OPTIONS=(-y -o Dpkg::Options::=--force-confold)
apt-get update
apt-get "${APT_OPTIONS[@]}" install ca-certificates curl gnupg

# Ubuntu 20.04 packages are in the official PGDG archive; newer supported LTS
# releases use the current PGDG repository. Unsupported architectures fall back
# to Ubuntu's PostgreSQL packages.
pgdg_url="https://apt.postgresql.org/pub/repos/apt"
if [[ "$VERSION_ID" == "20.04" ]]; then
  pgdg_url="https://apt-archive.postgresql.org/pub/repos/apt"
fi
architecture="$(dpkg --print-architecture)"
pgdg_release_url="${pgdg_url}/dists/${VERSION_CODENAME}-pgdg/Release"
pgdg_enabled=false
postgresql_package="postgresql"

case "$architecture" in
  amd64|arm64|ppc64el)
    if curl -fsSL -o /dev/null "$pgdg_release_url"; then
      install -d -m 0755 /usr/share/postgresql-common/pgdg
      curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
      pgdg_key_fingerprint="$(gpg --show-keys --with-colons /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
        | awk -F: '$1 == "fpr" { print $10; exit }')"
      if [[ "$pgdg_key_fingerprint" != "B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8" ]]; then
        printf "Unexpected PostgreSQL APT key fingerprint: %s\n" "${pgdg_key_fingerprint:-unknown}" >&2
        exit 1
      fi
      cat > /etc/apt/sources.list.d/pgdg.sources <<EOF
Types: deb
URIs: ${pgdg_url}
Suites: ${VERSION_CODENAME}-pgdg
Architectures: ${architecture}
Components: main
Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
EOF
      pgdg_enabled=true
      if [[ "$VERSION_ID" == "20.04" ]]; then
        postgresql_package="postgresql-17"
      else
        postgresql_package="postgresql-18"
      fi
      printf "Configured the official PostgreSQL repository for %s.\n" "$VERSION_CODENAME"
    fi
    ;;
esac

if [[ "$pgdg_enabled" != "true" ]]; then
  printf "WARNING: PGDG is unavailable for this release or architecture; using Ubuntu PostgreSQL packages.\n"
fi

printf "\nUpdating installed system packages. Existing package configuration files will be preserved.\n"
apt-get update
apt-get "${APT_OPTIONS[@]}" upgrade

printf "\nInstalling ADAMANT system dependencies.\n"
apt-get "${APT_OPTIONS[@]}" install \
  build-essential automake autoconf libtool pkg-config \
  ca-certificates curl git gnupg gzip jq wget \
  libpq-dev postgresql-client redis-server

if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
  printf "Invalid Git branch name: '%s'.\n" "$branch" >&2
  exit 2
fi

# Keep an existing PostgreSQL major version. On a fresh host, install the latest
# stable server supplied by the configured repository.
postgresql_major_packages="$(detect_installed_postgresql_server_majors || true)"
if [[ -n "$postgresql_major_packages" ]]; then
  printf "Existing PostgreSQL server installation detected; preserving its major version.\n"
else
  printf "Installing PostgreSQL server package '%s'.\n" "$postgresql_package"
  apt-get "${APT_OPTIONS[@]}" install "$postgresql_package"
  postgresql_major_packages="$(detect_installed_postgresql_server_majors || true)"
fi

postgresql_major="$(printf '%s\n' "$postgresql_major_packages" | tail -1)"
postgresql_started=false
if command -v pg_lsclusters >/dev/null 2>&1 && command -v pg_ctlcluster >/dev/null 2>&1; then
  if ! pg_lsclusters -h | awk 'NF { found = 1 } END { exit !found }'; then
    if [[ -z "$postgresql_major" ]]; then
      printf "Cannot determine installed PostgreSQL major version for cluster creation.\n" >&2
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
    done <<< "$postgresql_units"
    postgresql_started=true
  elif systemctl list-unit-files postgresql.service >/dev/null 2>&1; then
    systemctl enable --now postgresql
    postgresql_started=true
  fi
else
  if [[ -x /etc/init.d/postgresql ]]; then
    service postgresql start
    postgresql_started=true
  fi
fi

if [[ "$postgresql_started" != "true" ]]; then
  printf "Cannot find a PostgreSQL cluster or service to start. Check installed PostgreSQL packages and cluster status.\n" >&2
  printf "Useful diagnostics: dpkg -l 'postgresql-*'; pg_lsclusters; systemctl list-units --all 'postgresql*'\n" >&2
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

# Create the system account without changing an existing account or password.
if id -u "$username" >/dev/null 2>&1; then
  printf "\nSystem user '%s' already exists; preserving it.\n" "$username"
else
  printf "\nCreating system user '%s'.\n" "$username"
  adduser --disabled-password --gecos "" "$username"
fi

NODE_HOME="$(getent passwd "$username" | cut -d: -f6)"
if [[ -z "$NODE_HOME" || ! -d "$NODE_HOME" ]]; then
  printf "Cannot determine a valid home directory for user '%s'.\n" "$username" >&2
  exit 1
fi
REPO_DIR="${NODE_HOME}/adamant"
repair_node_user_permissions
db_password_file="$(mktemp "${NODE_HOME}/.adamant-db-password.XXXXXX")"
chmod 0600 "$db_password_file"
printf '%s' "$DB_PASSWORD" > "$db_password_file"
chown "$username:$username" "$db_password_file"
unset DB_PASSWORD

# Create or update the PostgreSQL role and database without masking SQL errors.
role_exists="$(runuser -u postgres -- psql -XAtqc \
  "SELECT 1 FROM pg_roles WHERE rolname = '${username}'" postgres)"
if [[ "$role_exists" == "1" ]]; then
  printf "\nUpdating the password for existing PostgreSQL role '%s'.\n" "$username"
  runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 postgres <<EOSQL
ALTER ROLE ${username} WITH LOGIN PASSWORD '${DB_PASSWORD_SQL}';
EOSQL
else
  printf "\nCreating PostgreSQL role '%s'.\n" "$username"
  runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 postgres <<EOSQL
CREATE ROLE ${username} WITH LOGIN PASSWORD '${DB_PASSWORD_SQL}';
EOSQL
fi

database_exists="$(runuser -u postgres -- psql -XAtqc \
  "SELECT 1 FROM pg_database WHERE datname = '${databasename}'" postgres)"
if [[ "$database_exists" == "1" ]]; then
  printf "Database '%s' already exists; preserving its contents.\n" "$databasename"
else
  printf "Creating database '%s'.\n" "$databasename"
  runuser -u postgres -- createdb -O "$username" "$databasename"
fi
runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 -c \
  "ALTER DATABASE ${databasename} OWNER TO ${username};" postgres

database_has_tables="$(runuser -u postgres -- psql -XAtqc \
  "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema'))" \
  "$databasename")"
if [[ "$database_has_tables" == "t" && "$IMAGE" == "true" ]]; then
  printf "Database '%s' already contains tables; skipping the blockchain image to avoid overwriting data.\n" \
    "$databasename"
  IMAGE=false
fi

# Run application setup as the dedicated node user. Values are passed through
# env arguments so branch names and passwords are not evaluated as shell code.
runuser -u "$username" -- env \
  HOME="$NODE_HOME" \
  NETWORK="$network" \
  BRANCH="$branch" \
  NODEJS_VERSION="$nodejs" \
  NVM_INSTALL_VERSION="$NVM_VERSION" \
  REPO_DIR="$REPO_DIR" \
  CONFIG_FILE="$configfile" \
  PROCESS_NAME="$processname" \
  DATABASE_NAME="$databasename" \
  DB_PASSWORD_FILE="$db_password_file" \
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

DB_PASSWORD_DECODED="$(cat "$DB_PASSWORD_FILE")"
export DB_PASSWORD_DECODED
config_tmp="$(mktemp "${CONFIG_FILE}.tmp.XXXXXX")"
jq '.db.password = env.DB_PASSWORD_DECODED' "$CONFIG_FILE" > "$config_tmp"
chmod 0600 "$config_tmp"
mv "$config_tmp" "$CONFIG_FILE"
unset DB_PASSWORD_DECODED

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

rm -f -- "$db_password_file"
db_password_file=""
unset DB_PASSWORD_SQL

# Configure boot startup directly when systemd is available.
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

if [[ "$network" == "mainnet" ]]; then
  printf "Mainnet and testnet use separate users, ports, databases, and pm2 processes.\n\n"
fi

if [[ -n "${STY:-}" ]]; then
  printf "\nThis command is running inside screen session '%s'.\n" "$STY"
  printf "Detach with Ctrl-A D, or exit the shell to close the session.\n\n"
fi
