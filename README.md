# Adamant

Adamant is decentralized chat platform based on Lisk codebase and written in javascript.  For more information please refer to our website: TBA.

[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](http://www.gnu.org/licenses/gpl-3.0)

**NOTE:** The following information is applicable to: **Ubuntu 16.04 (LTS) or 16.10 - x86_64**.

For making process simple you can use tools/install_ubuntu_dependencies.sh script.

## Prerequisites - In order

- Tool chain components -- Used for compiling dependencies

  `sudo apt-get install -y python build-essential curl automake autoconf libtool`

- Git (<https://github.com/git/git>) -- Used for cloning and updating Lisk

  `sudo apt-get install -y git`

- Node.js (<https://nodejs.org/>) -- Node.js serves as the underlying engine for code execution.

  System wide via package manager:

  ```
  curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

  Locally using [nvm](https://github.com/creationix/nvm):

  ```
  curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.0/install.sh | bash
  nvm install v6.10.1
  ```

- Install PostgreSQL (version 9.6.2):

  ```
  sudo apt-get purge -y postgres*
  sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt/ `lsb_release -cs`-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
  wget -q https://www.postgresql.org/media/keys/ACCC4CF8.asc -O - | sudo apt-key add -
  sudo apt-get update
  sudo apt-get install -y postgresql postgresql-contrib libpq-dev
  
  # Create user 
  adduser adamant
  sudo usermod -aG sudo adamant
  su - adamant
  
  # Create db
  sudo -u postgres createuser --createdb $USER
  createdb adamant_test
  createdb adamant_main
  sudo -u postgres psql -d adamant_test -c "alter user "$USER" with password 'password';"
  sudo -u postgres psql -d adamant_main -c "alter user "$USER" with password 'password';"
  ```

- PM2 (<https://github.com/Unitech/pm2>) -- PM2 manages the node process for Adamant (Optional)

  `sudo npm install -g pm2`




## Installation Steps

Clone the Adamant repository using Git and initialize the modules.

```
git clone https://github.com/Adamant-im/adamant
cd adamant
npm install
```

## Alternative ubuntu install process

Alternative way to install Adamant with prerequisites. You need only git installed locally. Or instead of cloning you could download and unpack zip from github.

```
# Create user 
adduser adamant
sudo usermod -aG sudo adamant
su - adamant

git clone https://github.com/zyuhel/adamant
cd adamant
sh tools/install_ubuntu_dependencies.sh

sudo -u postgres createuser --createdb $USER
createdb adamant_test
createdb adamant_main
sudo -u postgres psql -d adamant_test -c "alter user "$USER" with password 'password';"
sudo -u postgres psql -d adamant_main -c "alter user "$USER" with password 'password';"
  
  
npm install
```

## Managing Adamant

To test that Adamant is built and configured correctly, run the following command:

`node app.js`

In a browser navigate to: <http://localhost:36666> (for the mainnet) or <http://localhost:36667> (for the testnet). If Lisk is running on a remote system, switch `localhost` for the external IP Address of the machine.

Once the process is verified as running correctly, `CTRL+C` and start the process with `pm2`. This will fork the process into the background and automatically recover the process if it fails.

`pm2 start --name adamant app.js`

After the process is started, its runtime status and log location can be retrieved by issuing the following command:

`pm2 show adamant`

To stop Lisk after it has been started with `pm2`, issue the following command:

`pm2 stop adamant`

**NOTE:** The **port**, **address** and **config-path** can be overridden by providing the relevant command switch:

```
pm2 start --name adamant app.js -- -p [port] -a [address] -c [config-path]
```

## Tests

Before running any tests, please ensure Secu is configured to run on the same testnet that is used by the test-suite.

Replace **config.json** and **genesisBlock.json** with the corresponding files under the **test** directory:

```
cp test/config.json test/genesisBlock.json .
```

**NOTE:** If the node was started with a different genesis block previous, trauncate the database before running tests.

```
dropdb adamant_test
createdb adamant_test
```

**NOTE:** The master passphrase for this genesis block is as follows:

```
wagon stock borrow episode laundry kitten salute link globe zero feed marble
```

Launch Adamant (runs on port 4000):

```
node app.js
```

Run the test suite:

```
npm test
```

Run individual tests:

```
npm test -- test/lib/accounts.js
npm test -- test/lib/transactions.js
```

## Authors

- Boris Povod <boris@crypti.me>
- Pavel Nekrasov <landgraf.paul@gmail.com>
- Sebastian Stupurac <stupurac.sebastian@gmail.com>
- Oliver Beddows <oliver@lightcurve.io>
- Isabella Dell <isabella@lightcurve.io>
- Marius Serek <mariusz@serek.net>
- Maciej Baj <maciej@lightcurve.io>
- Dmitriy Soloduhin <zyuhel@yandex.ru>


## License

Copyright © 2016-2017 Lisk Foundation

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the [GNU General Public License](https://github.com/LiskHQ/lisk/tree/master/LICENSE) along with this program.  If not, see <http://www.gnu.org/licenses/>.

***

This program also incorporates work previously released with lisk `0.7.0` (and earlier) versions under the [MIT License](https://opensource.org/licenses/MIT). To comply with the requirements of that license, the following permission notice, applicable to those parts of the code only, is included below:

Copyright © 2016-2017 Lisk Foundation  
Copyright © 2015 Crypti

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
