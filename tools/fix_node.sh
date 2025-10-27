#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo -e "\n[ERROR] Line $LINENO failed. Aborting.\n\n" >&2' ERR

# Defaults for mainnet
network="mainnet"
username="adamant"
databasename="adamant_main"
configfile="config.json"
processname="adamant"
port="36666" # Default mainnet REST port; later re-read from config
image_url="https://explorer.adamant.im/db_backup.sql.gz"

# Options
while getopts ":n:" OPTION; do
  case "$OPTION" in
    n)
      case "$OPTARG" in
        testnet)
          network="testnet"
          username="adamanttest"
          databasename="adamant_test"
          configfile="test/config.json"
          processname="adamanttest"
          port="36667" # Default testnet REST port; later re-read from config
          image_url="https://testnet.adamant.im/db_test_backup.sql.gz"
          ;;
        mainnet) : ;; # keep defaults
        *)
          printf "\nNetwork should be 'mainnet' or 'testnet'.\n\n"
          trap - ERR; exit 2
          ;;
      esac
      ;;
    \?)
      printf "\nWrong parameters. Use '-n' to choose 'mainnet' or 'testnet'.\n\n"
      trap - ERR; exit 2
      ;;
  esac
done

image_filename="$(basename "$image_url")"        # db_backup.sql.gz
image_unzipped_filename="${image_filename%.gz}"  # db_backup.sql

# Logging: Everything goes both to screen and logfile
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGFILE="${SCRIPT_DIR}/adamant_${network}_fix.log"
exec > >(tee -a "$LOGFILE") 2>&1
if [ -s "$LOGFILE" ]; then
  printf "\n\n\n===========================\n" >> "$LOGFILE"
fi
printf "%s ADAMANT %s Node Repair/Bootstrap started…\n" \
  "$(date -u '+%Y-%m-%d %H:%M UTC+0')" "$network" >> "$LOGFILE"

SECONDS=0

printf "\nADAMANT mainnet/testnet Node Repair/bootstrap Tool v1.3.0 for Ubuntu 20–24.\n"
printf "Make sure you obtained this file from the adamant.im website or GitHub.\n"
printf "This tool resets the ADM mainnet/testnet blockchain DB, loads a fresh image, and restarts your node.\n"
printf "Alternatively, follow the step-by-step manual guide: https://news.adamant.im/how-to-run-your-adamant-node-on-ubuntu-990e391e8fcc\n"
printf "If you prefer full validation from height 0, syncing may take days.\n\n"

printf "Selected network: '%s'\n" "$network"
printf "ADM Node user:    '%s'\n" "$username"
printf "Database:         '%s'\n" "$databasename"
printf "Process name:     '%s'\n\n" "$processname"

read -r -p "WARNING! Intended for ADM nodes installed via the ADAMANT installer or with default setup. Type \"yes\" to proceed: " agreement
if [[ $agreement != "yes" ]]; then
  printf "\nExecution cancelled.\n\n"; exit 1
fi

# Pre-flight
if [ "$(id -u)" -ne 0 ]; then
  printf "\n\nRun the script as a user with sudo privileges as it modifies PostgreSQL and installs missing packages."
  printf "\nExecution cancelled.\n\n"
  trap - ERR; exit 1
fi

if ! id -u "$username" >/dev/null 2>&1; then
  printf "\n\nSystem user '%s' not found. This tool expects the environment created by the ADAMANT installer or with default setup." "$username"
  printf "\nExecution cancelled.\n\n"
  trap - ERR; exit 1
fi

# Ensure tools are present (jq/wget/gzip/psql)
printf "\n\nChecking required packages (jq, wget, gzip, psql)…\n"
if ! command -v jq >/dev/null 2>&1 || ! command -v wget >/dev/null 2>&1 || ! command -v gunzip >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1; then
  printf "Installing missing packages…\n"
  apt update
  DEBIAN_FRONTEND=noninteractive apt install -y jq wget gzip postgresql-client || true
fi

# Stop node process under the ADM node user
printf "\n\nStopping ADAMANT '%s' node process '%s' via pm2…\n\n" "$network" "$processname"
su - "$username" -c "source ~/.nvm/nvm.sh >/dev/null 2>&1 || true; pm2 stop '$processname' || true"
su - "$username" -c "source ~/.nvm/nvm.sh >/dev/null 2>&1 || true; pm2 save || true"

# PostgreSQL: Terminate sessions, drop & recreate DB
printf "\n\nResetting '%s' database. Terminating active '%s' DB connections…\n\n" "$network" "$databasename"
systemctl is-active --quiet postgresql || service postgresql start || true
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${databasename}' AND pid <> pg_backend_pid();" || true

printf "\nDropping '%s' database…\n\n" "$databasename"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${databasename} WITH (FORCE);" || \
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${databasename};"

printf "\n\nRecreating '%s' database owned by '%s'…\n\n" "$databasename" "$username"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${databasename} OWNER ${username};"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER DATABASE ${databasename} OWNER TO ${username};"

# Heavy lifting under node user
NODE_HOME="$(eval echo "~$username")"
REPO_DIR="${NODE_HOME}/adamant"

su - "$username" <<EOSU
set -Eeuo pipefail

echo
echo
echo "Entering ADM node directory…"
cd "$REPO_DIR" || { printf "\nCannot enter ='%s'. Aborting.\n\n" "$REPO_DIR"; exit 1; }

# Load nodejs environment (ignore errors if not present)
source ~/.nvm/nvm.sh >/dev/null 2>&1 || true
source ~/.profile  >/dev/null 2>&1 || true
source ~/.bashrc   >/dev/null 2>&1 || true

echo
echo "Downloading '$network' blockchain image…"
rm -f "$image_unzipped_filename" "$image_filename" || true
wget --progress=bar:force:noscroll "$image_url" -O "$image_filename" 2>/dev/tty

echo
echo "Unzipping blockchain image (may take minutes)…"
gunzip -f "$image_filename"

echo
echo "Loading image into database '$databasename'…"
echo
psql "$databasename" < "$image_unzipped_filename"

echo
echo
echo "Cleaning up temp files…"
rm -f "$image_unzipped_filename"

# Restart if exists, otherwise start new process
echo
if pm2 show "$processname" >/dev/null 2>&1; then
  echo "Restarting existing pm2 process '$processname'…"
  echo
  pm2 restart "$processname"
else
  echo "Starting new pm2 process '$processname'…"
  echo
  if [[ "$network" == "mainnet" ]]; then
    pm2 start --name "$processname" app.js
  else
    pm2 start --name "$processname" app.js -- --config "test/config.json" --genesis "test/genesisBlock.json"
  fi
fi
pm2 save || true
EOSU

# Read port from config file for curl hint
CFG_PATH="${REPO_DIR}/${configfile}"
if [ -f "$CFG_PATH" ]; then
  port_read="$(jq -r '.port // empty' "$CFG_PATH" 2>/dev/null || true)"
  if [[ -n "${port_read:-}" ]]; then
    port="$port_read"
  fi
fi

# Done
minutes=$(( (SECONDS + 59) / 60 ))
printf "\n\nADAMANT '%s' node repair/bootstrap completed successfully.\n" "$network"
printf "Total execution time: %d minutes.\n" "$minutes"
printf "See repair logs in: %s\n\n" "$LOGFILE"

printf "To check your node status:\n"
printf "    su - %s    # Use pm2 while logged in as '%s'\n" "$username" "$username"
printf "    pm2 list\n"
printf "    pm2 show %s\n" "$processname"
printf "    pm2 logs %s\n\n" "$processname"
printf "To query current blockchain height:\n    curl http://localhost:%s/api/blocks/getHeight\n\n" "$port"

printf "Thank you for supporting the truly decentralized ADAMANT Messenger! 🚀\n\n"

# Remind the user that a 'screen' session is currently running
if [[ -n ${STY:-} ]]; then
  printf "You are running inside a 'screen' session (%s). To finish cleanly,\n" "$STY"
  printf "    Detach:    Press Ctrl-A D (screen keeps running in background)\n"
  printf "    Exit:      Type 'exit' or press Ctrl-D (screen will terminate)\n\n\n"
fi
