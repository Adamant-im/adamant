#!/usr/bin/env bash

printf "\n"
printf "Greetings!\n"
printf "Ensure you got this file from the adamant.im website or GitHub.\n"
printf "Use this node repair tool v1.0 if your ADM node lost the current blockchain height and restarted, rising from the beginning.\n"
printf "Though validating blocks from 0 height is a decent option, catching up with the current height may take time.\n"
printf "If your node is a forging delegate, you probably prefer using an up-to-date blockchain image and enabling it back in ten minutes.\n"
printf "This script deletes the ADM blockchain database, downloads its fresh image, and restarts the node.\n"
printf "We still recommend consulting an IT specialist if you are unfamiliar with Linux systems.\n"
printf "Alternatively, follow these steps manually. Also, see full node installation instructions at https://news.adamant.im/how-to-run-your-adamant-node-on-ubuntu-990e391e8fcc.\n\n"

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

printf "\n\nFinished the ADAMANT '%s' node repair script. Executed in %s seconds.\n" "$network" "$SECONDS"
printf "Check your node status with 'pm2 show adamant' command.\n"
printf "Current node's height: 'curl http://localhost:%s/api/blocks/getHeight'\n" "$port"
printf "Thank you for supporting true decentralized ADAMANT Messenger.\n\n"

#Terminate screen session, if we are running it
if [ -n "$STY" ]; then
    screen -S "$STY" -X quit
fi

su - "$username"
