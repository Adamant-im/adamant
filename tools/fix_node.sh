#!/usr/bin/env bash

printf "\n"
printf "Greetings!\n"
printf "Please make sure you obtained this file from the adamant.im website or GitHub.\n"
printf "Use this Node Repair Tool v1.0.1 if your ADM node has lost sync and restarted from the beginning of the blockchain.\n"
printf "While validating blocks from height 0 is a valid option, catching up to the current height can take a long time.\n"
printf "If your node is a forging delegate, you’ll likely prefer using an up-to-date blockchain image to restore it within ten minutes.\n"
printf "This script will delete the ADM blockchain database, download a fresh image, and restart your node.\n"
printf "We still recommend consulting an IT specialist if you are not familiar with Linux systems.\n"
printf "Alternatively, you can perform these steps manually. Full node installation instructions are available at:\n"
printf "https://news.adamant.im/how-to-run-your-adamant-node-on-ubuntu-990e391e8fcc\n\n"

read -r -p "WARNING! Use the script only if you initially set up the node using the ADAMANT node installer, as it expects a specific server environment. Run it under the root user. If you agree to continue, type \"yes\": " agreement
if [[ $agreement != "yes" ]]
then
  printf "\nExecution cancelled.\n\n"
  exit 1
fi

printf "\n\n"

network="mainnet"
port=36666 #Default, re-assign later
username="adamant"
databasename="adamant_main"

#Users
if [ "$(id -u)" -ne 0 ]; then
  printf "Run the script under a user with sudo permission as it modifies the ADM Postgres database."
  printf "\nExecution cancelled.\n\n"
  exit 1
fi

if ! id "$username" &>/dev/null; then
  printf "System user named '%s' is not found. Use the script only if you initially set up the node using the ADAMANT node installer, as it expects a specific server environment." "$username"
  printf "\nExecution cancelled.\n\n"
  exit 1
fi

#Stop adamant node
su - adamant -c "source ~/.nvm/nvm.sh; pm2 stop adamant"

#Postgres
printf "\n\nDeleting and recreating database '%s'…\n\n" "$databasename"
sudo -u postgres psql -c "DROP DATABASE ${databasename};"
sudo -u postgres psql -c "CREATE DATABASE ${databasename};"
sudo -u postgres psql -c "ALTER DATABASE ${databasename} OWNER TO ${username};"

#Run next commands as user
su - "$username" <<EOSU

#ADAMANT
source ~/.nvm/nvm.sh
source ~/.profile
source ~/.bashrc
cd adamant || { printf "\n\nUnable to enter the node's directory 'adamant'. Something is wrong, halting.\n\n"; exit 1; }

# Download actual blockchain image for 'mainnet' network
printf "\n\nDownloading actual blockchain image…\n\n"
[ -f db_backup.sql ] && rm db_backup.sql
wget https://explorer.adamant.im/db_backup.sql.gz
printf "\nUnzipping the blockchain image, it can take a few minutes…\n\n"
gunzip db_backup.sql.gz
printf "\nLoading the blockchain image, it takes up to 20 minutes…\n\n"
psql adamant_main < db_backup.sql
printf "\nDeleting temporary blockchain image file…\n"
rm db_backup.sql

# Extract the port number using jq
port=$(jq '.port' "config.json")

printf "\n\nRestarting ADAMANT '%s' node…\n\n" "$network"
pm2 restart adamant

EOSU

printf "\n\nADAMANT '%s' node repair script completed. Total execution time: %s seconds.\n" "$network" "$SECONDS"
printf "Check your node status with the command: 'pm2 show adamant'\n"
printf "To check the current node height, run: 'curl http://localhost:%s/api/blocks/getHeight'\n" "$port"
printf "Thank you for supporting the truly decentralized ADAMANT Messenger.\n\n"

read -n1 -r -p "Press any key to continue…"

printf "\n\n"

#Terminate screen session, if we are running it
if [ -n "$STY" ]; then
    screen -S "$STY" -X quit
fi

#Works only if run not in screen
su - "$username"
