# Installation

This guide covers installing, bootstrapping, running, and recovering an ADAMANT Node on Linux (Ubuntu LTS and RHEL-compatible distributions). For additional platform notes, see:

- [How to run ADAMANT Node on Ubuntu or CentOS Linux](https://news.adamant.im/how-to-run-your-adamant-node-on-ubuntu-990e391e8fcc)
- [How to Install an ADAMANT Node on macOS](https://news.adamant.im/how-to-install-an-adamant-node-on-macos-cfdcb9434b9a)
- [How to run ADAMANT Node on Windows](https://news.adamant.im/how-to-run-adamant-node-on-windows-ee057e6e80d5)
- [How to run ADAMANT Node using Docker (Windows or Mac)](https://news.adamant.im/how-to-run-your-adamant-node-on-docker-windows-or-mac-9a927cf7875a)

Before exposing a node on the internet, review [Security Recommendations](./security.md) and [Configuration](./configuration.md).

## Requirements

- **Operating System**:
  - **Ubuntu** 20.04, 22.04, 24.04, or 26.04 LTS (`tools/install_node.sh`). Ubuntu 20.04 is supported by the script, but its standard security maintenance has ended — use Ubuntu Pro or upgrade the OS for continued security updates.
  - **RHEL-compatible** releases 8–10, including CentOS Stream, Rocky Linux, AlmaLinux, and RHEL (`tools/install_node_centos.sh`).
- **Node.js**: `22.22.2` or newer on the `22.x` line, or `24.15.0` or newer (matches `package.json` `engines.node`: `^22.22.2 || >=24.15.0`). The installation scripts support Node.js majors `22`, `24`, and `26`, with Node.js `24` selected by default.
- **PostgreSQL** (with `libpq` headers for the native `pg-native` driver) and **Redis**.
- **RAM**: 2 GB or more.
- **Disk space**: At least 70 GB as of 2026 (mainnet), plus headroom for database maintenance and snapshot downloads. Expect the blockchain to grow by roughly _10 GB per year_.

::: warning Unsupported Node.js 24.0.0–24.14.x development versions
Node.js `24.0.0` through `24.14.x` is not a supported development toolchain for the updated ESLint/JSDoc stack (`eslint-plugin-jsdoc` requires `^22.22.2 || >=24.15.0`). Use Node.js `22.22.2+` or `24.15.0+` (or `26.x` where supported by your `libpq` build).
:::

## Linux Installation Scripts

The bundled installers share `tools/lib/adamant_node_common.sh`. Run them from a Git checkout so the shared library is the exact file you reviewed. Cloning the repository and recording the commit hash is the verified installation path:

```sh
git clone --branch master https://github.com/Adamant-im/adamant.git
cd adamant
git rev-parse HEAD
sudo bash tools/install_node.sh -b master -n mainnet -j 24
```

Use `tools/install_node_centos.sh` on RHEL-compatible hosts.

### Script Parameters

- `-b`: GitHub branch from which the ADAMANT node is installed (default: `master`; use `dev` for pre-release testing).
- `-n`: Blockchain network (`mainnet` or `testnet`, default: `mainnet`).
- `-j`: Node.js major version (`22`, `jod`=22, `24`, `krypton`=24, or `26`; default: `24`).
- `-f`: Permit restarting a node while it is actively syncing or rebuilding. Use only when you explicitly accept interrupting sync/rebuild progress.

### Installer Lifecycle and Safety Behavior

Both installers:

- Update system packages, preserve existing ADAMANT configuration files and local Git changes, and reuse existing system users and databases.
- Install dependencies from the reviewed lockfile using `npm ci`.
- Start PM2 from an ecosystem file configured with a 120-second `kill_timeout`, and install a systemd drop-in that gives the PM2 service a longer stop timeout, disables core dumps, and orders it to stop before PostgreSQL and Redis.
- Reconcile existing PM2 processes with that ecosystem and stop the node before package updates. Stopping sends a single `SIGINT` and waits for clean shutdown; a timeout aborts without sending another signal. Re-runs refuse to restart a node whose process state is unknown, and `-f` is permitted only after confirming sync or rebuild activity.
- Write installation logs with mode `0600` to `/var/log/adamant_<network>_install.log`.

### Verified Snapshot Bootstrap in the Installer

During installation, a blockchain image is loaded only after the operator supplies a local SHA-256 checksum file obtained from a trust channel independent of the image host. The file must contain a standard `sha256sum` line (`<64 hex>  <filename>`), and the downloaded archive must match it. Gzip integrity is verified after the digest check, and the SQL restore executes in a single transaction.

- The scripts never trust a checksum downloaded alongside the image.
- Snapshot import is skipped automatically when the selected database already contains tables.
- Decline the image prompt to synchronize and verify every block from height 1.

## Manual Installation

If you prefer manual setup over the installation scripts, follow the steps below on Ubuntu LTS.

### Prerequisites

- **Build toolchain** (for compiling native dependencies such as `libpq`):

  ```sh
  sudo apt-get update
  sudo apt-get install -y python3 build-essential curl git automake autoconf libtool
  ```

- **Node.js** (`22.22.2+` on `22.x`, or `24.15.0+`; Node.js 24 LTS recommended):

  Install via [nvm](https://github.com/nvm-sh/nvm) or a trusted distribution package repository:

  ```sh
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.5/install.sh | bash
  nvm install --lts=krypton  # Node.js 24 LTS (ensure >= 24.15.0)
  node -v
  ```

- **PostgreSQL and `libpq-dev`**:

  ```sh
  sudo apt-get install -y postgresql postgresql-contrib libpq-dev redis-server
  ```

  Create a dedicated `adamant` user (do not grant unnecessary root privileges in production):

  ```sh
  sudo adduser --disabled-password --gecos "" adamant
  sudo -u postgres createuser --createdb adamant
  sudo -u postgres psql -c "ALTER USER adamant WITH PASSWORD 'change-me-strong-password';"
  sudo -u adamant createdb adamant_main
  sudo -u adamant createdb adamant_test
  ```

- **PM2** (process manager):

  ```sh
  sudo npm install -g pm2
  ```

### Application Setup

Clone the repository as the `adamant` user and install production dependencies strictly from the reviewed lockfile:

```sh
sudo -iu adamant
git clone --branch master https://github.com/Adamant-im/adamant.git
cd adamant
npm ci --omit=dev
```

For development and test environments that need Mocha, Chai, and ESLint, install all dependencies from the lockfile:

```sh
npm ci
```

::: info npm `allowScripts` policy
npm 11.19 and newer blocks dependency install scripts unless listed in `package.json` `allowScripts`. ADAMANT Node allows only the reviewed native PostgreSQL addon (`libpq@1.11.0`) and denies `javascript-obfuscator`. Leave `allowScripts` unchanged. See [Testing & Live Scenarios — Native PostgreSQL driver](./testing.md#native-postgresql-driver) if you need to rebuild `libpq` after changing Node.js versions.
:::

Copy the default configuration and update at least `db.password` (and any network/API settings):

```sh
cp config.default.json config.json
nano config.json
```

See [Configuration](./configuration.md) for every setting.

### Manual Bootstrap with a Blockchain Snapshot

Using a blockchain snapshot reduces initial sync time from days to minutes, but bypasses verifying historical transactions — only use a snapshot whose origin and SHA-256 digest you independently trust.

```sh
wget https://explorer.adamant.im/db_backup.sql.gz
# Verify SHA-256 against an independently obtained digest before restoring:
sha256sum -c db_backup.sql.gz.sha256
gzip -t db_backup.sql.gz
zcat db_backup.sql.gz | psql --single-transaction -v ON_ERROR_STOP=1 adamant_main
rm db_backup.sql.gz
```

For testnet, the image URL is `https://testnet.adamant.im/db_test_backup.sql.gz`.

### Running the Node

Verify startup in the foreground first:

```sh
node app.js
```

Once the node starts cleanly and begins syncing, stop it gracefully with `Ctrl+C` (wait for `Cleaned up successfully`), then run it under PM2 with a long `kill_timeout` (at least 120 seconds, matching the installer's ecosystem file):

```sh
pm2 start app.js --name adamant --kill-timeout 120000
pm2 logs adamant
```

Verify block height and node status locally:

```sh
curl http://127.0.0.1:36666/api/blocks/getHeight
curl http://127.0.0.1:36666/api/node/status
```

Configure PM2 startup (`pm2 save` and `pm2 startup`) so the node starts after reboot, and verify that systemd orders PM2 to stop before PostgreSQL and Redis. If you use [encrypted delegate passphrases](./configuration.md#encrypted-delegate-passphrases), remember that every restart starts forging locked until you run `npm run adm-node -- forging unlock` and monitor lock state via [Monitoring](./monitoring.md).

## Graceful Shutdown and Database Maintenance

::: warning Critical Shutdown Notice
Always stop the node gracefully. When running in the foreground, press `Ctrl+C` and wait for cleanup to finish. Never use `kill -9`, PM2's default 1600 ms `kill_timeout`, or any other forced termination unless the process is already unrecoverably stuck.

After `Ctrl+C` / `SIGINT` / `SIGTERM`, shutdown is not always immediate. The node may log `Waiting for loader to finish active sync/rebuild…` or `Waiting for block processing to finish…` while draining in-flight work. Wait until the log prints `Cleaned up successfully` before restarting, upgrading PostgreSQL, or closing the terminal.

The node keeps derived consensus state in memory mirror tables (`mem_accounts`, `mem_round`, and related tables). A forced kill can leave those tables inconsistent with the persisted `blocks` table, producing on next startup:

```text
[WRN] loader Detected unapplied rounds in mem_round
[WRN] loader Recreating memory tables…
[inf] loader Rebuilding blockchain, current block height: 1…
```

Do **not** attempt to repair `mem_*` tables with manual SQL edits. Rely on automatic checkpoint recovery, a full local replay, or restoring a trusted database snapshot.
:::

Keep PostgreSQL and Redis server packages out of unattended upgrades on node hosts. Before planned PostgreSQL or Redis maintenance, stop the node gracefully (`Cleaned up successfully`), perform database maintenance, and then start the node again with the saved ecosystem file. While v0.11.0 improves reconnection after dropped PostgreSQL connections (see [Configuration — Database Configuration](./configuration.md#database-configuration)), coordinated graceful shutdown remains the safest maintenance practice.

## Mem-Table Checkpoint Recovery

When enabled (default), the node persists rotating checkpoints of derived `mem_*` tables at completed round boundaries (validated against block height so a copy cannot capture state ahead of the checkpoint block). If startup detects inconsistent memory mirrors, the loader restores the newest verified checkpoint and replays only the blocks after that height:

```text
[inf] loader Recovering from mem-table checkpoint at height 1234567…
[inf] loader Rebuilding blockchain, current block height: 1234568…
```

Checkpoints are a local recovery cache only — blocks and deterministic replay remain the source of truth. If checkpoint verification or replay fails, the node falls back to a full rebuild from genesis. You can disable checkpoints via [`loading.memCheckpoints.enabled`](./configuration.md#loading-configuration).

During catch-up sync, checkpoint creation is throttled to every 100th round so sync throughput is unaffected. Under normal operation, a checkpoint is written after every completed round.

::: info Storage impact
Checkpoints use three rotating database slots plus metadata. On mainnet, expect roughly 48 MB per slot and under 150 MB total across all retained slots.
:::

## Repairing an Ubuntu Node from a Snapshot

If a node's database is damaged (for example, after a hardware failure or disk exhaustion) and a local checkpoint/replay is not practical, use the bundled repair tool from a reviewed Git checkout:

```sh
sudo bash tools/fix_node.sh -n mainnet
```

### Repair Script Parameters and Safety Behavior

- `-n`: Blockchain network (`mainnet` or `testnet`, default: `mainnet`).
- `-d`: Drop the existing database before downloading the replacement image. Use `-d` only when disk space is too tight for an in-place download and losing the current database on a failed download is acceptable.

By default (without `-d`), `tools/fix_node.sh` downloads and verifies the image against the operator-provided, independently trusted SHA-256 checksum **before** dropping the database. If free disk space is insufficient, it exits and leaves the existing database intact. Repair logs are mode `0600` at `/var/log/adamant_<network>_fix.log`. Back up any required data before running a repair.
