sudo apt-get update
sudo apt-get install -y mc git curl python build-essential curl automake autoconf libtool redis-server
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo apt-get purge -y postgres*
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt/ `lsb_release -cs`-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget -q https://www.postgresql.org/media/keys/ACCC4CF8.asc -O - | sudo apt-key add -
sudo apt-get update
sudo apt-get install -y postgresql-12 postgresql-common postgresql-server-dev-12 libnode72 libpq5 libpq-dev
sudo npm install -g bower grunt-cli pm2
