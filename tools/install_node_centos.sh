#!/usr/bin/env bash

branch="master"
network="mainnet"
username="adamant"
databasename="adamant_main"
configfile="config.json"
processname="adamant"
port="36666"
nodejs="jod"

while getopts 'b:n:j:' OPTION; do
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
    j)
      if [ "$OPTARG" == "20" ] || [ "$OPTARG" == "iron" ]
      then
        nodejs="iron"
      elif [ "$OPTARG" != "22" ] && [ "$OPTARG" != "jod" ]
      then
        printf "\nNodejs should be 'iron' = '20', or 'jod' = '22'.\n\n"
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
printf "Welcome to the ADAMANT Node Installer v2.2.0 for CentOS 8.\n"
printf "Please ensure you obtained this file from the adamant.im website or GitHub.\n"
printf "This installer is the easiest way to run an ADAMANT node. However, we still recommend consulting an IT specialist if you are not familiar with Linux systems.\n"
printf "You can find full installation instructions (for Ubuntu) at:\nhttps://news.adamant.im/how-to-run-your-adamant-node-on-ubuntu-990e391e8fcc\n"
printf "During installation, you will be asked to set database and user passwords.\n"
printf "The system may also prompt you to choose parameters such as encoding, keyboard layout, and GRUB settings. You can generally leave the defaults.\n\n"

printf "Note: You have selected the '%s' network.\n" "$network"
printf "Note: You have selected the '%s' branch.\n" "$branch"
printf "Note: You have selected Node.js version '%s'.\n" "$nodejs"
printf "\n"

read -r -p "WARNING! This script is intended for new droplets. Existing data MAY BE DAMAGED. If you agree to continue, type \"yes\": " agreement
if [[ $agreement != "yes" ]]
then
  printf "\nInstallation cancelled.\n\n"
  exit 1
fi

IMAGE=false
if [[ $network == "mainnet" ]]
then
  printf "\nUsing a blockchain image can significantly reduce sync time, but you must fully trust its source.\n"
  printf "If you skip this step, your node will verify every single transaction, which can take several days.\n"
  read -r -p "Do you want to use the ADAMANT blockchain image to bootstrap the node? [Y/n]: " useimage
  case $useimage in
    [yY][eE][sS]|[yY]|[jJ]|'')
      IMAGE=true
      printf "\nThe blockchain image will be downloaded, and your node will reach the current height in a few minutes.\n\n"
    ;;
    *)
      printf "\nYour node will sync from scratch. This process may take several days to reach the current blockchain height.\n\n"
    ;;
  esac
fi

hostname=$(cat "/etc/hostname")
if grep -q "$hostname" "/etc/hosts"
then
  printf "Hostname /etc/hosts seems to be good.\n\n"
else
  printf "File /etc/hosts has no hostname record. I'll fix it.\n\n"
  sh -c -e "echo '\n127.0.1.1  $hostname' >> /etc/hosts";
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
  sudo adduser "$username"
  sudo passwd "$username"
  printf "User '%s' has been created.\n\n" "$username"
fi

#Packages
printf "Updating system packages…\n\n"

sudo dnf config-manager --set-enabled powertools
sudo dnf -y install epel-release
sudo dnf -y update

printf "\n\nInstalling postgresql and other prerequisites…\n\n"

sudo dnf -y install https://download.postgresql.org/pub/repos/yum/reporpms/EL-8-x86_64/pgdg-redhat-repo-latest.noarch.rpm
sudo dnf -qy module disable postgresql
sudo dnf -y install postgresql13 postgresql13-server postgresql13-contrib
sudo /usr/pgsql-13/bin/postgresql-13-setup initdb
sudo systemctl enable --now postgresql-13
sudo dnf group install "Development Tools" -y
sudo dnf -y install wget python2 curl mc git nano automake autoconf libtool jq rpl wget libpq5-devel redis
sudo systemctl enable --now redis

#Postgres
printf "\n\nCreating database '%s' and database user '%s'…\n\n" "$databasename" "$username"
cd /tmp || echo "/tmp: No such directory"
sudo -u postgres psql -c "CREATE ROLE ${username} LOGIN PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -c "CREATE DATABASE ${databasename};"
sudo -u postgres psql -c "ALTER DATABASE ${databasename} OWNER TO ${username};"

#Run next commands as user
su - "$username" <<EOSU

#NodeJS
printf "\n\nInstalling nvm & node.js…\n\n"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.nvm/nvm.sh
source ~/.profile
source ~/.bashrc
nvm i --lts=$nodejs
npm i -g pm2

#Logrotate
printf "\n\n"
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 500M
pm2 set pm2-logrotate:retain 5
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 0 1 *'

#ADAMANT
printf "\n\nInstalling ADAMANT '%s' node. Cloning project repository from GitHub ('%s' branch)…\n\n" "$network" "$branch"
git clone https://github.com/Adamant-im/adamant --branch $branch
cd adamant || { printf "\n\nUnable to enter node's directory 'adamant'. Something is wrong, halting.\n\n"; exit 1; }
npm i

#Setup node: set DB password in config.json
printf "\n\nSetting node's config…\n\n"

if [[ $configfile == "config.json" ]]
then
  cp config.default.json config.json
elif [ "$configfile" == "test/config.json" ]
then
  cp test/config.default.json test/config.json
fi

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

printf "\n\nADAMANT '%s' node installation script completed. Execution time: %s seconds.\n" "$network" "$SECONDS"
printf "Check your node status with the command: 'pm2 show %s'\n" "$processname"
printf "To check the current node height, run: 'curl http://localhost:%s/api/blocks/getHeight'\n" "$port"
printf "Thank you for supporting the truly decentralized ADAMANT Messenger.\n\n"
su - "$username"
