#!/usr/bin/env bash

branch="master"
network="mainnet"
username="adamant"
databasename="adamant_main"
configfile="config.json"
processname="adamant"
port="36666"

while getopts 'b:n:' OPTION; do
    OPTARG=$(echo "$OPTARG" | xargs)
    case "$OPTION" in
        b)
            branch="$OPTARG"
            ;;
        n)
            if [ "$OPTARG" == "testnet" ]
            then
                network="$OPTARG"
                username="adamanttest"
                databasename="adamant_test"
                configfile="test/config.json"
                processname="adamanttest"
                port="36667"
            elif [ "$OPTARG" != "mainnet" ]
            then
                printf "\nNetwork should be 'mainnet' or 'testnet'.\n\n"
                exit 1
            fi
            ;;
        *)
            printf "\nWrong parameters. Use '-b' for branch, '-t' for network.\n\n"
            exit 1
        ;;
    esac
done

printf "\n"
printf "Welcome to the ADAMANT node installer v2.0.2 for Ubuntu 18, 20, 22. Make sure you got this file from adamant.im website or GitHub.\n"
printf "This installer is the easiest way to run ADAMANT node. We still recommend to consult IT specialist if you are not familiar with Linux systems.\n"
printf "You can see full installation instructions on https://medium.com/adamant-im/how-to-run-your-adamant-node-on-ubuntu-990e391e8fcc\n"
printf "The installer will ask you to set database and user passwords during the installation.\n"
printf "Also, the system may ask to choose some parameters, like encoding, keyboard, and grub. Generally, you can leave them by default.\n\n"

printf "Note: You've choosed '%s' network.\n" "$network"
printf "Note: You've choosed '%s' branch.\n" "$branch"
printf "\n"

read -r -p "WARNING! Running this script is recommended for new droplets. Existing data MAY BE DAMAGED. If you agree to continue, type \"yes\": " agreement
if [[ $agreement != "yes" ]]
then
    printf "\nInstallation cancelled.\n\n"
    exit 1
fi

IMAGE=false
if [[ $network == "mainnet" ]]
then
    printf "\nBlockchain image saves time on node sync but you must completely trust the image.\n"
    printf "If you skip this step, your node will check every single transaction, which takes time (up for several days).\n"
    read -r -p "Do you want to use the ADAMANT blockchain image to bootstrap a node? [Y/n]: " useimage
    case $useimage in
        [yY][eE][sS]|[yY]|[jJ]|'')
            IMAGE=true
            printf "\nI'll download blockchain image and your node will be on the actual height in a few minutes.\n\n"
        ;;
        *)
            printf "\nI'll sync your node from the beginning. It may take several days to raise up to the actual blockchain height.\n\n"
        ;;
    esac
fi

hostname=$(cat "/etc/hostname")
if grep -q "$hostname" "/etc/hosts"
then
    printf "Hostname /etc/hosts seems to be good.\n\n"
else
    printf "File /etc/hosts has no hostname record. I'll fix it.\n\n"
    sh -c -e "echo '\n127.0.1.1    $hostname' >> /etc/hosts";
fi

get_database_password () {
    read -r -sp "Set the database password: $(echo $'\n> ')" postgrespwd
    read -r -sp "$(echo $'\n')Confirm password: $(echo $'\n> ')" postgrespwdconfirmation
    if [[ $postgrespwd = "$postgrespwdconfirmation" ]]
    then
        echo "$postgrespwd"
    else
        printf "\nPassword mismatch. Try again.\n\n"
        get_database_password
    fi
}

DB_PASSWORD="$(get_database_password)"

#User
printf "\n\nChecking if user '%s' exists…\n\n" "$username"
if [[ $(id -u "$username" > /dev/null 2>&1; echo $?) = 1 ]]
then
    printf "Creating system user named '%s'…\n" "$username"
    adduser --gecos "" "$username"
    printf "User '%s' has been created.\n\n" "$username"
fi

#Packages
printf "Updating system packages…\n\n"
sudo apt update && sudo apt upgrade -y
printf "\n\nInstalling postgresql and other prerequisites…\n\n"
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt/ `lsb_release -cs`-pgdg main" > /etc/apt/sources.list.d/pgdg.list' && wget -q https://www.postgresql.org/media/keys/ACCC4CF8.asc -O - | sudo apt-key add -
sudo apt update && sudo DEBIAN_FRONTEND=noninteractive apt-get -yq upgrade
sudo apt install -y build-essential curl automake autoconf libtool rpl mc git postgresql postgresql-contrib libpq-dev redis-server

#Start postgres. This step is necessary for Windows Subsystem for Linux machines
sudo service postgresql start

#Postgres
printf "\n\nCreating database '%s' and database user '%s'…\n\n" "$databasename" "$username"
cd /tmp || echo "/tmp: No such directory"
sudo -u postgres psql -c "CREATE ROLE ${username} LOGIN PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -c "CREATE DATABASE ${databasename};"
sudo -u postgres psql -c "GRANT ALL on DATABASE ${databasename} TO ${username};"

#Run next commands as user
su - "$username" <<EOSU

#NodeJS
printf "\n\nInstalling nvm & node.js…\n\n"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
source ~/.nvm/nvm.sh
source ~/.profile
source ~/.bashrc
nvm i --lts=gallium
npm i -g pm2

#ADAMANT
printf "\n\nInstalling ADAMANT '%s' node. Cloning project repository from GitHub ('%s' branch)…\n\n" "$network" "$branch"
git clone https://github.com/Adamant-im/adamant --branch $branch
cd adamant || { printf "\n\nUnable to enter node's directory 'adamant'. Something is wrong, halting.\n\n"; exit 1; }
npm i

#Setup node: set DB password in config.json
printf "\n\nSetting node's config…\n\n"
rpl -i -q '"password": "password",' "\"password\": \"${DB_PASSWORD}\"," "$configfile"

#By default, node's API is available only from localhost
#rpl -i -q '"public": false,' '"public": true,' "$configfile"

# Download actual blockchain image for 'mainnet' network
if [[ $IMAGE = true ]]
then
    printf "\n\nDownloading actual blockchain image…\n\n"
    wget https://explorer.adamant.im/db_backup.sql.gz
    printf "\nUnzipping the blockchain image, it can take a few minutes…\n\n"
    gunzip db_backup.sql.gz
    printf "\nLoading the blockchain image…\n\n"
    psql adamant_main < db_backup.sql
    printf "\nDeleting temporary blockchain image file…\n"
    rm db_backup.sql
fi

printf "\n\nAdding ADAMANT '%s' node to crontab for autostart after system reboot…\n\n" "$network"
if [[ $network == "mainnet" ]]
then
    crontab -l | { cat; echo "@reboot cd /home/adamant/adamant && pm2 start --name adamant app.js"; } | crontab -
else
    crontab -l | { cat; echo "@reboot cd /home/adamanttest/adamant && pm2 start --name adamanttest app.js -- --config test/config.json --genesis test/genesisBlock.json"; } | crontab -
fi

printf "\n\nRunning ADAMANT '%s' node…\n\n" "$network"
if [[ $network == "mainnet" ]]
then
    pm2 start --name adamant app.js
else
    pm2 start --name adamanttest app.js -- --config test/config.json --genesis test/genesisBlock.json
fi

EOSU

printf "\n\nFinished ADAMANT '%s' node installation script. Executed in %s seconds.\n" "$network" "$SECONDS"
printf "Check your node status with 'pm2 show %s' command.\n" "$processname"
printf "Current node's height: 'curl http://localhost:%s/api/blocks/getHeight'\n" "$port"
printf "Thank you for supporting true decentralized ADAMANT Messenger.\n\n"
su - "$username"
