#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo -e "\n[ERROR] Line $LINENO failed. Aborting.\n\n" >&2' ERR

branch="master"
network="mainnet"
username="adamant"
databasename="adamant_main"
configfile="config.json"
processname="adamant"
port="36666"
nodejs="jod" # LTS=22 by default
image_url="https://explorer.adamant.im/db_backup.sql.gz"

# Parse options
while getopts ":b:n:j:" OPTION; do
  case "$OPTION" in
    b)
      branch="$OPTARG"
      ;;
    n)
      if [[ "$OPTARG" == "testnet" ]]; then
        network="testnet"
        username="adamanttest"
        databasename="adamant_test"
        configfile="test/config.json"
        processname="adamanttest"
        port="36667"
        image_url="https://testnet.adamant.im/db_test_backup.sql.gz"
      elif [[ "$OPTARG" == "mainnet" ]]; then
        network="mainnet"
      else
        printf "\nNetwork should be 'mainnet' or 'testnet'.\n\n"
        trap - ERR; exit 2
      fi
      ;;
    j)
      if [[ "$OPTARG" == "20" || "$OPTARG" == "iron" ]]; then
        nodejs="iron"
      elif [[ "$OPTARG" == "22" || "$OPTARG" == "jod" ]]; then
        nodejs="jod"
      else
        printf "\nNodejs should be 'iron' = '20', or 'jod' = '22'.\n\n"
        trap - ERR; exit 2
      fi
      ;;
    :)
      printf "\nOption '-%s' requires an argument.\n\n" "$OPTARG"
      trap - ERR; exit 2
      ;;
    \?)
      printf "\nWrong parameters. Use '-b' for branch, '-n' for network, '-j' for Nodejs version.\n\n"
      trap - ERR; exit 2
      ;;
  esac
done

image_filename="$(basename "$image_url")"       # db_backup.sql.gz
image_unzipped_filename="${image_filename%.gz}" # db_backup.sql

# Everything sent to stdout/stderr → goes both to the log and to the screen
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGFILE="${SCRIPT_DIR}/adamant_${network}_install.log"
exec > >(tee -a "$LOGFILE") 2>&1
if [ -s "$LOGFILE" ]; then
  printf "\n\n\n===========================\n" >> "$LOGFILE"
fi
printf "%s Installing ADAMANT %s node…\n" \
  "$(date -u '+%Y-%m-%d %H:%M UTC+0')" "$network" >> "$LOGFILE"

printf "\nWelcome to the ADAMANT Node Installer v2.3.0 for Ubuntu 20, 22, and 24.\n"
printf "Make sure you obtained this file from the adamant.im website or GitHub.\n"
printf "This installer is the easiest way to run an ADAMANT node. However, if you're not familiar with Linux, consult an IT specialist.\n\n"
printf "Full guide: https://news.adamant.im/how-to-run-your-adamant-node-on-ubuntu-990e391e8fcc\n\n"
printf "The installer will prompt you to set database and user passwords.\n"
printf "The system may also ask for locale/keyboard/GRUB options — defaults are usually fine.\n\n"

printf "Selected network: '%s'\n" "$network"
printf "Selected branch:  '%s'\n" "$branch"
printf "Selected Node.js: '%s' LTS\n\n" "$nodejs"

read -r -p "WARNING! Intended for NEW droplets. Existing data MAY BE DAMAGED. Type \"yes\" to continue: " agreement
if [[ $agreement != "yes" ]]; then
  printf "\nInstallation cancelled.\n\n"; exit 1
fi

# Choosing whether to use blockchain image for bootstrapping
IMAGE=false
printf "\nUsing a blockchain image can significantly reduce sync time, but you must fully trust its source.\n"
printf "If you skip it, your '%s' node will verify every transaction (may take several days).\n" "$network"
read -r -p "Use the ADAMANT blockchain image to bootstrap? [Y/n]: " useimage
case ${useimage:-Y} in
  [yY][eE][sS]|[yY]|[jJ]|'') IMAGE=true; printf "\nThe '%s' image will be downloaded; your node should reach the current height in minutes.\n\n" "$network" ;;
  *) printf "\nYour '%s' node will sync from scratch; reaching current height may take several days.\n\n" "$network" ;;
esac

# Fix /etc/hosts hostname record if missing
hostname="$(cat /etc/hostname)"
if ! grep -qE "^[[:space:]]*127\.0\.1\.1[[:space:]]+.*\b$hostname\b" /etc/hosts; then
  printf "No hostname record in /etc/hosts. Adding it…\n\n"
  printf '\n127.0.1.1\t%s\n' "$hostname" >> /etc/hosts
else
  printf "Hostname /etc/hosts looks good.\n\n"
fi

# Ask for DB password
get_database_password () {
  printf 'Set the database password:\n> ' >&2
  read -r -s postgrespwd; printf '\n' >&2

  printf 'Confirm password:\n> ' >&2
  read -r -s postgrespwdconfirmation; printf '\n' >&2

  if [[ $postgrespwd == "$postgrespwdconfirmation" ]]; then
    echo "$postgrespwd"
  else
    printf '\nPassword mismatch. Try again.\n\n' >&2
    get_database_password
  fi
}
DB_PASSWORD="$(get_database_password)"
# Escape single quotes for SQL, then encode the password in Base64 to safely pass into an unquoted heredoc (su - "$username" <<EOSU)
DB_PASSWORD_SQL=${DB_PASSWORD//\'/\'\'}
DB_PASSWORD_BASE64="$(printf '%s' "$DB_PASSWORD" | base64 -w0 2>/dev/null || printf '%s' "$DB_PASSWORD" | base64)"

# Create system user if needed
printf "\n\nChecking if user '%s' exists…\n\n" "$username"
if ! id -u "$username" >/dev/null 2>&1; then
  printf "Creating system user '%s'…\n" "$username"
  adduser --gecos "" "$username"
  printf "User '%s' has been created.\n\n" "$username"
fi

# Don't disturb with dialogs about restarting services
# needrestart: temporary override (removed later)
printf "Configuring needrestart to skip dialogs during installation…\n"
mkdir -p /etc/needrestart/conf.d
cat >/etc/needrestart/conf.d/99-adamant-temp.conf <<'NREOF'
$nrconf{restart} = 'a';
$nrconf{kernelhints} = 0;
NREOF

# Packages
printf "\nUpdating system packages…\n\n"
apt update
apt -y upgrade

printf "\n\nInstalling PostgreSQL and prerequisites…\n\n"
install -d -m 0755 /etc/apt/keyrings || true
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor >/etc/apt/trusted.gpg.d/postgresql.gpg
# shellcheck disable=SC1091
. /etc/os-release
echo "deb http://apt.postgresql.org/pub/repos/apt/ ${VERSION_CODENAME}-pgdg main" >/etc/apt/sources.list.d/pgdg.list
apt update
DEBIAN_FRONTEND=noninteractive apt install -y \
  build-essential curl automake autoconf libtool htop jq rpl mc git wget \
  postgresql postgresql-contrib libpq-dev redis-server

# Ensure postgres is running (Windows Subsystem for Linux case)
systemctl is-active --quiet postgresql || service postgresql start

# PostgreSQL: DB & role
printf "\n\nCreating database '%s' and role '%s'…\n\n" "$databasename" "$username"
cd /tmp || exit 1
sudo -u postgres psql -c "CREATE ROLE ${username} LOGIN PASSWORD '${DB_PASSWORD_SQL}';" || true
sudo -u postgres psql -c "CREATE DATABASE ${databasename} OWNER ${username};" || true
sudo -u postgres psql -c "ALTER DATABASE ${databasename} OWNER TO ${username};" || true

# ------- Commands below run as the ADM node user; Variables expanded by parent -------
su - "$username" <<EOSU
set -Eeuo pipefail

# NodeJS
printf "\n\nInstalling nvm & Node.js…\n\n"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
export NVM_DIR="\$HOME/.nvm"
source "\$NVM_DIR/nvm.sh"
nvm i --lts=$nodejs
npm i -g pm2

# pm2-logrotate
printf "\n\n"
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 500M
pm2 set pm2-logrotate:retain 5
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 0 1 *'

# ADAMANT
printf "\n\nInstalling ADAMANT '$network' node. Cloning the '$branch' branch from GitHub…\n\n"
git clone --branch $branch https://github.com/Adamant-im/adamant
cd adamant || { printf "\n\nCannot enter 'adamant' blockchain directory. Aborting.\n\n"; exit 1; }
npm i

# ADAMANT node configuration
printf "\n\nSetting up the ADM node configuration…\n"
if [[ "$configfile" == "config.json" ]]; then
  cp config.default.json config.json
else
  cp test/config.default.json test/config.json
fi

# Inject DB password into $configfile. Decode Base64 **inside** the child shell (parent never sees the raw password).
# Using env.DB_PASSWORD_DECODED avoids any '$' in the jq filter, so the parent shell won't expand it.
DB_PASSWORD_DECODED=\$(printf '%s' "$DB_PASSWORD_BASE64" | base64 -d)
export DB_PASSWORD_DECODED
jq '.db.password = env.DB_PASSWORD_DECODED' $configfile > "$configfile.tmp" && mv "$configfile.tmp" $configfile

# Download actual blockchain image for mainnet/testnet network, bootstrapping the ADM node
if [[ "$IMAGE" == "true" ]]; then
  printf "\n\nDownloading '$network' blockchain image…\n\n"
  wget --progress=bar:force:noscroll "$image_url" -O "$image_filename" 2>/dev/tty
  printf "\nUnzipping the blockchain image (may take a few minutes)…\n\n"
  gunzip -f "$image_filename"
  printf "\nLoading the image into '$databasename' database…\n\n"
  psql "$databasename" < "$image_unzipped_filename"
  printf "\nCleaning up temp image…\n"
  rm -f "$image_unzipped_filename"
fi

printf "\n\nRunning ADAMANT '$network' node…\n\n"
if [[ "$network" == "mainnet" ]]; then
  pm2 start --name adamant app.js
else
  pm2 start --name adamanttest app.js -- --config test/config.json --genesis test/genesisBlock.json
fi

pm2 save
EOSU
# ------- End of run-as-user block -------

printf "\n\nEnabling ADAMANT '%s' node auto-restart on system reboot…\n\n" "$network"
adamant_startup_output=$(su - "$username" -c "source ~/.nvm/nvm.sh; pm2 startup" || true)
adamant_startup=$(echo "$adamant_startup_output" | grep -oP 'sudo env PATH=.*' || true)
bash -c "$adamant_startup"

# Remove temporary needrestart override
rm -f /etc/needrestart/conf.d/99-adamant-temp.conf

# Done
minutes=$(( (SECONDS + 59) / 60 ))
printf "\n\nADAMANT '%s' node installation completed successfully.\n" "$network"
printf "Total installation time: %d minutes.\n" "$minutes"
printf "See installation logs in: %s\n\n" "$LOGFILE"
printf "To check your node status:\n"
printf "    su - %s    # Use pm2 while logged in as '%s'\n" "$username" "$username"
printf "    pm2 list\n"
printf "    pm2 show %s\n" "$processname"
printf "    pm2 logs %s\n\n" "$processname"
printf "To query current blockchain height:\n    curl http://localhost:%s/api/blocks/getHeight\n\n" "$port"
printf "Thank you for supporting the truly decentralized ADAMANT Messenger! 🚀\n\n"
if [[ "$network" == "mainnet" ]]; then
  printf "Tip: You can also install the ADAMANT testnet node on the same server using this script.\n"
  printf "Mainnet and testnet run under different users, ports, and databases, so they do not conflict.\n"
  printf "Example:\n    sudo bash -c \"\$(wget -O - https://adamant.im/install_node.sh)\" -O -b dev -n testnet -j jod\n\n"
fi

read -n1 -r -p "Press any key to continue…"
printf "\n\n"

# Remind the user that a 'screen' session is currently running
if [[ -n ${STY:-} ]]; then
  printf "You are running inside a 'screen' session (%s). To finish cleanly,\n" "$STY"
  printf "    Detach:    Press Ctrl-A D (screen keeps running in background)\n"
  printf "    Exit:      Type 'exit' or press Ctrl-D (screen will terminate)\n\n\n"
fi
