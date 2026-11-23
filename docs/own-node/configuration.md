# Configuration

The configuration file locations are `config.json` for mainnet and `test/config.json` for testnet:

```text
├── config.json
└── test
    └── config.json
```

Copy the configuration files from the default templates:

- For mainnet:

  ```sh
  cp config.default.json config.json
  ```

- For testnet:

  ```sh
  cp test/config.default.json test/config.json
  ```

See also [Installation](./installation.md), [Security Recommendations](./security.md), [Upgrading](./upgrading.md), and [Testnet](./testnet.md).

## Configuration Overrides

You can override specific configuration values at startup without editing `config.json` or `test/config.json` directly. Overrides are applied in this order:

1. Selected config file (`--config`)
2. Each `--config-overrides` file in command-line order
3. Repeated `--config-set` values
4. Legacy CLI shortcuts (`--port`, `--address`, `--peers`, `--log`, `--snapshot`)

The final resolved config is validated against the node config schema before startup.

Use `--config-set` for individual dot-path values:

```sh
node app.js \
  --config test/config.json \
  --genesis test/genesisBlock.json \
  --config-set consensusActivationHeights.fairSystem=4359465 \
  --config-set 'redis={ "url": "redis://127.0.0.1:6379/1", "password": null }'
```

The same flags work through npm scripts:

```sh
npm run start -- --config-set port=36667
npm run start:testnet -- --config-set api.access.public=true
```

Use `--config-overrides` for a file with multiple overrides. Non-`.json` files are parsed as env-style `key=value` pairs (one per line):

```dotenv
consensusActivationHeights.fairSystem=4359465
redis={ "url": "redis://127.0.0.1:6379/1", "password": null }
```

Files ending in `.json` are parsed as nested JSON partial overrides:

```json
{
  "consensusActivationHeights": {
    "fairSystem": 4359465
  },
  "redis": {
    "url": "redis://127.0.0.1:6379/1",
    "password": null
  }
}
```

Values are parsed as JSON first, so numbers, booleans, `null`, arrays, and objects keep their types. Unknown paths, unsafe path segments, malformed JSON values, and schema-invalid values fail before startup.

::: warning
Be careful when overriding `consensusActivationHeights.*`: using activation heights that do not match the selected network can cause a node to diverge from that network. See [Consensus](./consensus.md).
:::

## Logging

The node has three configurable log outputs: a general log, a debug log, and console output.

- **General Log**

  ```json
  {
    "generalLog": {
      "enabled": true,
      "fileName": "logs-mainnet/adamant.log",
      "level": "warn",
      "rotate": {
        "enabled": true,
        "maxSize": "300M",
        "retain": 5,
        "rotateInterval": "0 0 0 1 *",
        "rotateOnRestart": true
      }
    }
  }
  ```

  - `enabled`: Enable or disable this log output.
  - `fileName`: Path to the log file.
  - `level`: Minimum log level to write.
  - `rotate.enabled`: Enable log rotation.
  - `rotate.maxSize`: Maximum log file size before rotation (e.g., `"300M"`).
  - `rotate.retain`: Number of rotated files to keep.
  - `rotate.rotateInterval`: Cron expression for scheduled rotation.
  - `rotate.rotateOnRestart`: Rotate the log file on every node restart.

- **Debug Log**

  Accepts the same properties as `generalLog` (typically set to `level: "trace"`).

  ```json
  {
    "debugLog": {
      "enabled": true,
      "fileName": "logs-mainnet/adamant_debug.log",
      "level": "trace",
      "rotate": {
        "enabled": true,
        "maxSize": "300M",
        "retain": 7,
        "rotateInterval": "0 0 * * *",
        "rotateOnRestart": true
      }
    }
  }
  ```

- **Console Log**

  ```json
  {
    "consoleLog": {
      "enabled": true,
      "level": "info"
    }
  }
  ```

  - `enabled`: Enable or disable console output.
  - `level`: Minimum log level to print.

Possible log levels (from least to most verbose): `fatal`, `error`, `warn`, `info`, `log`, `debug`, `trace`, `none` (disables all output for that target).

## Server Configuration

- **Port**

  ```json
  {
    "port": 36666
  }
  ```

- **Address**

  ```json
  {
    "address": "0.0.0.0"
  }
  ```

  Example: `0.0.0.0` (binds to all network interfaces).

- **Trust Proxy**

  ```json
  {
    "trustProxy": false
  }
  ```

  Set `trustProxy` to `true` **only** when the node is reachable exclusively through one immediate reverse proxy. When enabled, the node trusts the single closest hop (`app.set('trust proxy', 1)` for HTTP and the rightmost `X-Forwarded-For` value for client WebSockets), so a proxy that appends the real client address is protected from caller-supplied header prefixes.

  - **Do not** expose the node directly to untrusted callers while `trustProxy` is `true`, or a caller can spoof `X-Forwarded-For` to select arbitrary rate-limit keys.
  - With `trustProxy: false`, every client arriving through a single reverse proxy or Tor onion service shares that proxy's address (for example `127.0.0.1`), which puts all proxied clients in one rate-limit bucket and causes them to match loopback IP whitelists.
  - Public REST, peer HTTP, and client WebSocket abuse limiters use the resolved IP as the limit key, grouping IPv6 addresses on a `/56` allocation boundary. Peer WebSocket authorization always compares the exact normalized IP without `trustProxy`.

- **Cache**

  ```json
  {
    "cacheEnabled": false
  }
  ```

  Cache is disabled by default on mainnet and enabled on testnet. Enabling Redis caching can improve API response times on high-traffic public nodes.

## Database Configuration

```json
{
  "db": {
    "host": "localhost",
    "port": 5432,
    "database": "adamant_main",
    "user": "adamant",
    "password": "password",
    "poolSize": 95,
    "poolIdleTimeout": 30000,
    "reapIntervalMillis": 1000,
    "logEvents": ["error"]
  }
}
```

- `host`: Database host (default: `localhost`).
- `port`: Database port (default: `5432`).
- `database`: Database name (e.g., `adamant_main`).
- `user`: Database username (e.g., `adamant`).
- `password`: Database password.
- `poolSize`: Maximum connections in the pool (recommended: `95`).
- `poolIdleTimeout`: Time in ms before idle connections close (recommended: `30000`).
- `reapIntervalMillis`: Interval in ms to clean idle connections (recommended: `1000`).
- `logEvents`: Events logged by `pg-monitor` (e.g., `["error"]`).

::: info Connection recovery in v0.11.0
Starting in v0.11.0, the database pool applies a 10-second connect timeout, 10-second TCP keepalive (pure-JS driver), and a 300-second post-migration query timeout. When PostgreSQL drops an idle or active connection (or a query times out), the node marks that client dead so `pg-promise` closes it rather than reusing it, allowing subsequent queries to open fresh connections. Coordinated graceful node shutdown before planned PostgreSQL restarts is still strongly recommended.
:::

## Redis Configuration

Redis is used for API caching and is required.

```json
{
  "redis": {
    "url": "redis://127.0.0.1:6379/0",
    "password": null
  }
}
```

- `url`: Redis server URL (e.g., `redis://127.0.0.1:6379/0`).
- `password`: Redis password (string or `null`).

## API Configuration

::: info
Even when a node's Public API is disabled (`api.enabled: false` or `api.access.public: false`), other nodes can still connect for block and transaction exchange on peer routes.
:::

::: warning
Nodes serving a Public API handle significantly more SQL query load and need extra CPU headroom.
:::

Control Public API access and anti-abuse limits with the `api` object. The `limits` values below are the v0.11.0 production defaults from `config.default.json`:

```json
{
  "api": {
    "enabled": true,
    "access": {
      "public": false,
      "whiteList": ["127.0.0.1"]
    },
    "options": {
      "limits": {
        "limit": 15300,
        "max": 15300,
        "delayMs": 25,
        "delayAfter": 1000,
        "maxDelayMs": 1000,
        "windowMs": 60000,
        "standardHeaders": true,
        "legacyHeaders": false,
        "statusCode": 429,
        "message": "Too many requests, please try again later.",
        "requestPropertyName": "rateLimit",
        "routes": {
          "status": {
            "limit": 12000,
            "delayMs": 0,
            "delayAfter": 0,
            "maxDelayMs": 0
          },
          "read": {
            "limit": 3000,
            "delayMs": 25,
            "delayAfter": 1000,
            "maxDelayMs": 1000
          },
          "publish": {
            "limit": 300,
            "delayMs": 50,
            "delayAfter": 120,
            "maxDelayMs": 1500
          }
        }
      }
    }
  }
}
```

- `enabled`: Enable or disable the Public API (default: `true`).
- `access.public`: Allow Public API access from any IP address (recommended: `false` unless intentionally operating a public API node).
- `access.whiteList`: Allowed IP addresses when `access.public` is `false` (default: `["127.0.0.1"]`). Note that behind a local reverse proxy or Tor onion service with `trustProxy: false`, remote requests appear as `127.0.0.1` and match this whitelist.
- `options.limits`: Public REST anti-abuse limits (per IP, with IPv6 grouped by `/56`):
  - `limit`: Preferred aggregate hard cap for the complete `/api/` surface over `windowMs`. Setting `0` disables the entire public API limiter, including all `routes`.
  - `max`: Legacy alias for `limit`. Applies only when `limit` is absent. When both are present, `limit` wins (including `0`).
  - `delayMs`: Extra delay (ms) added per request once `delayAfter` is exceeded (`0` disables slow-down).
  - `delayAfter`: Requests allowed per window before slow-down begins (`0` disables slow-down).
  - `maxDelayMs`: Maximum slow-down delay in milliseconds (`0` disables slow-down for that policy).
  - `windowMs`: Window duration in milliseconds (default: `60000`; `0` is treated as `60000`).
  - `standardHeaders`: Send standard `RateLimit-*` headers (`RateLimit-Policy`, `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`). Default: `true`.
  - `legacyHeaders`: Send legacy `X-RateLimit-*` headers. Default: `false`.
  - `statusCode`: HTTP status code returned on hard limit (integer `400`–`599`, default: `429`).
  - `message`: `error` text in the JSON response body (default: `"Too many requests, please try again later."`).
  - `requestPropertyName`: Express request property storing rate-limit state (default: `"rateLimit"`).
  - `routes`: Optional per-class policies (`status`, `read`, `publish`). Each class accepts `limit`, `max`, `delayMs`, `delayAfter`, `maxDelayMs`, and `windowMs`. When `routes` is present, both the aggregate `limit` and the matching route-class `limit` are enforced, and response headers report whichever budget has the lowest remaining allowance along with `RateLimit-Scope`.

### Public REST Route Classes

When `routes` is configured, each counted request (excluding `OPTIONS` CORS preflight) is billed to the aggregate `all` budget and its route class:

- `status` (`GET` cheap node/fee/version reads; default cap `12000`, no slow-down):
  `/api/loader/status`, `/api/loader/status/sync`, `/api/loader/status/ping`, `/api/node/status`, `/api/blocks/getheight`, `/api/blocks/getepoch`, `/api/blocks/getnethash`, `/api/blocks/getbroadhash`, `/api/blocks/getfee`, `/api/blocks/getfees`, `/api/blocks/getmilestone`, `/api/blocks/getreward`, `/api/blocks/getsupply`, `/api/blocks/getstatus`, `/api/peers/version`.
- `publish` (`POST` and `PUT` state-changing submissions; default cap `300`, slow-down after `120` by `50` ms/request, max `1500` ms):
  `/api/transactions`, `/api/transactions/process`, `/api/accounts/new`, `/api/accounts/delegates`, `/api/delegates`, `/api/chats/process`, `/api/states/store`, `/api/signatures`, `/api/multisignatures`, `/api/multisignatures/sign`.
- `read` (every other counted public API request, including `GET /api/transactions`, `/api/chatrooms/*`, `/api/states/get`, etc.; default cap `3000`, slow-down after `1000` by `25` ms/request, max `1000` ms).

### Migrating Legacy `limits` Blocks

::: warning Legacy `max: 0` configs remain unprotected until migrated
If an existing `config.json` already contains an `api.options.limits` block with only `max: 0`, the node preserves `max: 0` and does **not** overwrite it with default `limit` or `routes`. Public REST remains unlimited and startup logs:

`Public API request limits are disabled. Set api.options.limits.limit above 0, or remove the limits block to inherit defaults.`

- Delete the entire `api.options.limits` block from `config.json` to inherit the full v0.11.0 defaults (including per-class `routes`).
- Setting only `limit` (without `routes`) enables a single shared bucket for the surface.
- `test/config.default.json` intentionally sets `limit: 0` and `max: 0` so the local API test suite can issue many requests from localhost.
:::

::: info Process-local counters
All HTTP and WebSocket anti-abuse counters are process-local. Multi-process deployments or externally load-balanced replicas enforce limits independently in each process; add a shared outer rate limiter at your load balancer or reverse proxy when global enforcement is required.
:::

## Peer Configuration

Configure peer discovery, HTTP rate limits, outbound verification, and peer-table bounds with the `peers` object:

```json
{
  "peers": {
    "enabled": true,
    "list": [
      { "ip": "95.216.114.252", "port": 36666 },
      { "ip": "169.58.72.175", "port": 36666 },
      { "ip": "46.4.37.157", "port": 36666 }
    ],
    "access": { "blackList": [] },
    "options": {
      "limits": {
        "limit": 44000,
        "max": 44000,
        "delayMs": 5,
        "delayAfter": 6000,
        "maxDelayMs": 200,
        "windowMs": 60000,
        "standardHeaders": true,
        "legacyHeaders": false,
        "statusCode": 429,
        "message": "Too many requests, please try again later.",
        "requestPropertyName": "rateLimit",
        "routes": {
          "status": {
            "limit": 20000,
            "delayMs": 0,
            "delayAfter": 0,
            "maxDelayMs": 0
          },
          "sync": {
            "limit": 12000,
            "delayMs": 5,
            "delayAfter": 8000,
            "maxDelayMs": 200
          },
          "broadcast": {
            "limit": 12000,
            "delayMs": 5,
            "delayAfter": 6000,
            "maxDelayMs": 200
          }
        }
      },
      "timeout": 5000,
      "updateConcurrency": 8,
      "probeSpacingMs": 50,
      "maxProbeTargets": 20,
      "unverifiedProbeLimit": 5,
      "unreachableBackoffInitialMs": 30000,
      "unreachableBackoffMaxMs": 3600000,
      "unreachableEvictAfter": 6,
      "unreachableEvictAfterMs": 86400000,
      "minConnectedPeers": 10,
      "maxPeers": 500,
      "maxPeersPerIp": 6,
      "maxPeersPerSubnet": 64,
      "subnetMaskIpv4": 24,
      "subnetMaskIpv6": 64
    }
  }
}
```

- `enabled`: Enable or disable peer connections (default: `true`).
- `list`: Initial seed peers (IP and port). See the full list in [`config.default.json`](https://github.com/Adamant-im/adamant/blob/master/config.default.json).
- `access.blackList`: Blocked peer IPs (e.g., `["198.51.100.10"]`).
- `options.limits`: Peer HTTP (`/peer/*`) anti-abuse limits. Field semantics and legacy `max: 0` migration match [API Configuration](#api-configuration), with two peer-specific rules:
  - Hard-limit status code is fixed to `429` (not overridable).
  - **Mixed-version rollout negotiation**: Upgraded outbound peers send `X-Adamant-Rate-Limit: 1`. In `v0.11.0`, peer requests without that header skip both hard limits and slow-down so older `v0.10.x` nodes are not evicted during upgrades. Because callers control this header, it is a rollout-compatibility mechanism rather than protection against hostile clients omitting the header — enforce outer rate limits on `/peer/*` at your reverse proxy or firewall (see [Security Recommendations](./security.md#node-exposure)). Outbound peers treat `429` as scoped, bounded temporary backpressure (capped at 60 seconds via `Retry-After`) without banning the peer or changing its health score, deferring only the reported `RateLimit-Scope` (`status`, `sync`, `broadcast`, or `all`).
  - Route classes (budgets per IP over `windowMs`, `OPTIONS` skipped):
    - `status`: `GET /peer/ping`, `GET /peer/height`, `GET /peer/list` (default cap `20000`, no slow-down).
    - `sync`: `GET /peer/blocks`, `GET /peer/blocks/common`, `GET /peer/transactions`, `GET /peer/signatures` (default cap `12000`, slow-down after `8000`, `5` ms/request, max `200` ms).
    - `broadcast`: All other `/peer/*` requests, including block/transaction/signature posts (default cap `12000`, slow-down after `6000`, `5` ms/request, max `200` ms).

  ::: warning Legacy `peers.options.limits` with `max: 0`
  Just like Public API limits, a copied `peers.options.limits` block with `max: 0` stays disabled and logs:

  `Peer HTTP request limits are disabled. Set peers.options.limits.limit above 0, or remove the limits block to inherit defaults.`

  Delete `peers.options.limits` from `config.json` to inherit the v0.11.0 defaults.
  :::

- **Peer Probing, Backoff, and Table Bounds (v0.11.0)**:
  - `options.timeout`: Peer HTTP socket inactivity timeout in ms (default: `5000`); also acts as the absolute deadline for `status` and `broadcast` requests, while streaming `sync` requests allow up to `max(timeout, 270000)` ms for `/peer/blocks` and `max(timeout, 60000)` ms for other `sync` endpoints.
  - `options.allowPrivatePeers`: Optional boolean; allow private/loopback peer addresses (used in isolated localnets; default `false` on mainnet).
  - `options.updateConcurrency`: Maximum concurrent outbound peer update probes (default: `8`).
  - `options.probeSpacingMs`: Minimum spacing in ms between outbound peer probes (default: `50`).
  - `options.maxProbeTargets`: Maximum peers probed per update cycle (default: `20`).
  - `options.unverifiedProbeLimit`: Maximum unverified/discovered peers probed per cycle (default: `5`).
  - `options.unreachableBackoffInitialMs`: Initial backoff in ms after a peer fails a probe (default: `30000`).
  - `options.unreachableBackoffMaxMs`: Maximum exponential backoff in ms for unreachable peers (default: `3600000`).
  - `options.unreachableEvictAfter`: Consecutive failures before an unreachable peer becomes eligible for eviction (default: `6`).
  - `options.unreachableEvictAfterMs`: Minimum elapsed unreachable duration in ms before eviction (default: `86400000`).
  - `options.minConnectedPeers`: Minimum connected peer target below which discovery probes prioritize replenishing peers (default: `10`).
  - `options.maxPeers`: Maximum total peers retained in the peer table (default: `500`).
  - `options.maxPeersPerIp`: Maximum peers admitted from a single IP (default: `6`; `0` disables).
  - `options.maxPeersPerSubnet`: Maximum peers admitted from a single subnet (default: `64`; `0` disables).
  - `options.subnetMaskIpv4`: IPv4 prefix length used for `maxPeersPerSubnet` (default: `24`).
  - `options.subnetMaskIpv6`: IPv6 prefix length used for `maxPeersPerSubnet` (default: `64`).

## Broadcast Configuration

```json
{
  "broadcasts": {
    "broadcastInterval": 1500,
    "broadcastLimit": 20,
    "parallelLimit": 20,
    "releaseLimit": 25,
    "relayLimit": 4
  }
}
```

- `broadcastInterval`: Interval (ms) between unconfirmed transaction broadcasts (recommended: `1500`).
- `broadcastLimit`: Number of peers broadcast to per interval (recommended: `20`).
- `parallelLimit`: Maximum concurrent asynchronous broadcast requests (recommended: `20`).
- `releaseLimit`: Number of items included per broadcast batch (recommended: `25`).
- `relayLimit`: Maximum relay hop count for rebroadcasting an unconfirmed transaction (recommended: `4`).

## Transaction Configuration

```json
{
  "transactions": {
    "maxTxsPerQueue": 1000
  }
}
```

- `maxTxsPerQueue`: Maximum transactions per queue (recommended: `1000`).

## Consensus Activation Heights

```json
{
  "consensusActivationHeights": {
    "fairSystem": 4359465,
    "spaceship": 100000000
  }
}
```

- `fairSystem`: Height at which the Fair dPoS voting system activates (mainnet: `4359465`). See [Consensus](./consensus.md#fairsystem).
- `spaceship`: Height at which `timestampMs` preservation activates (mainnet: `100000000`). See [Consensus](./consensus.md#spaceship).

**Do not change these values on a mainnet node**, or your node will diverge from the network.

## Forging Configuration

Configure forging with the `forging` object. Starting in v0.11.0, forging is configured **only** through `forging.secret`, and changing the configured delegate set requires editing `config.json` and performing a graceful node restart.

```json
{
  "forging": {
    "force": false,
    "secret": [],
    "controlSocket": ""
  }
}
```

- `force`: Force forging regardless of network consensus state (default: `false`).
- `secret`: Array of delegate forging passphrases. Plaintext passphrases continue to work. Starting in v0.11.0, an entry is treated as encrypted only when it starts with `admnode-enc-v1.` (including the trailing dot).
- `controlSocket`: Optional path to the local Unix domain socket used to unlock, lock, and inspect encrypted forging state. An empty string uses `<node directory>/.run/control-<port>.sock`, which is independent of `TMPDIR`, `XDG_RUNTIME_DIR`, systemd `PrivateTmp`, `sudo`, and shell changes. The socket file is mode `0600` inside a mode `0700` directory.

::: warning Removed legacy forging HTTP control APIs (v0.11.0)
The legacy forging HTTP routes (`enable`, `disable`, `status`, `enableAll`, `disableAll`) were removed in v0.11.0. The legacy `forging.access` (`whiteList`) setting is deprecated — it remains loadable in existing config files for upgrade compatibility, but is ignored. See [Upgrading](./upgrading.md).
:::

### Encrypted Delegate Passphrases

Starting in v0.11.0, delegate passphrases in `forging.secret` can be encrypted with a single operator password so a leaked `config.json` no longer exposes raw forging keys. Encryption is optional until a separate deprecation notice, and plaintext entries in the same array continue to forge without unlocking.

- **Format**: `admnode-enc-v1.<payload>` using AES-256-GCM with a key derived via scrypt (`N=131072`, `r=8`, `p=1`). Decryption accepts only these pinned parameters; future format or cost changes require a new prefix version. The envelope also stores the delegate's public key and address (already public on-chain) so a locked node can report which delegates are configured without decrypting.
- **Password policy**: All encrypted delegates on one node share one operator password, which must be at least 12 characters long and must differ from the delegate passphrase.
- **Memory & persistence**: The operator password and decrypted passphrases are never written back to `config.json` and never logged. After unlock, only derived keypairs stay in memory (temporary key/hash buffers are overwritten after use; JavaScript strings remain until garbage collection). Decryption uses async scrypt so live unlock does not block peer, API, or block processing. Restarting the node requires unlocking again.

#### Migrating a Plaintext Config

1. Run the encryption CLI from the node directory as the node's service user:

   ```sh
   npm run adm-node -- forging encrypt
   ```

   Before prompting for any secret, the command checks whether the node can safely open its control socket. Older installation scripts running under a `002` umask could leave the node checkout group-writable (mode `0775`), which prevents the default socket from opening. Check and fix directory permissions before restarting:

   ```sh
   stat -c '%a %U:%G %n' /home/adamant/adamant /home/adamant
   chmod g-w,o-w /home/adamant/adamant
   ```

   If using a custom `controlSocket`, check that path with `npm run adm-node -- forging encrypt --socket <path>`.

2. Replace each plaintext passphrase in `forging.secret` with the printed `admnode-enc-v1.` string (using the same operator password for every delegate on the node). Keep `forging.secret` as an array:

   ```json
   {
     "forging": {
       "force": false,
       "secret": [
         "admnode-enc-v1.<encrypted-passphrase>"
       ],
       "controlSocket": ""
     }
   }
   ```

   A malformed `admnode-enc-v1.` entry is ignored and logged without aborting node startup.

3. Gracefully restart the node.

#### Starting, Unlocking, and Locking

When encrypted secrets are configured, the node starts, syncs, serves APIs, exchanges peers, and processes the mempool normally while encrypted delegates stay locked until unlocked:

- **Foreground terminal**: After blockchain readiness, the node prompts once for the operator password (press Enter to remain locked).
- **Service managers (PM2 / systemd)**: Start locked and unlock over the local control socket:

  ```sh
  npm run adm-node -- forging status
  npm run adm-node -- forging unlock
  npm run adm-node -- forging lock
  ```

The operator password is deliberately **not** accepted via command-line arguments or environment variables, because those can be exposed to other local processes.

- `forging status`: Prints lock state (`loading`, `disabled`, `locked`, `partial`, or `unlocked`), delegate counts, and the address and public key of each encrypted delegate and loaded plaintext delegate. While loading or rebuilding, the state is `loading`.
- `forging unlock`: Prompts for the operator password and atomically loads all valid encrypted delegates. If any encrypted entry fails decryption, the unlock fails and no partial batch is kept. Works while `loading` (forging starts once the chain is ready). Plaintext delegates keep forging during async scrypt key derivation.
- `forging lock`: Clears only keypairs unlocked from encrypted entries; delegates also configured in plaintext remain loaded.

Run `adm-node` as the node service user and pass the same `--config`, `--config-overrides`, `--config-set`, or `--port` flags used to start the node (or pass `--socket <path>` directly to bypass config loading):

```sh
npm run adm-node -- forging unlock --config test/config.json
```

A custom `controlSocket` must sit inside an owner-only `0700` directory with no group- or world-writable ancestors below a shared sticky root (such as `/tmp`). The node creates a missing parent as `0700` but never alters permissions on an existing directory. For `/run/adamant`, configure systemd `RuntimeDirectory=adamant` or `tmpfiles.d` first.

#### Monitoring Encrypted Forging

Forging lock state is intentionally **not** exposed on public HTTP or peer APIs. The control socket opens at module initialization whenever at least one encrypted secret or an explicit `controlSocket` is configured. For automation:

```sh
npm run adm-node -- forging status --json --timeout 2000
```

Prints one JSON line without delegate addresses or public keys:

```json
{"state":"locked","encrypted":3,"encryptedLoaded":0,"plaintext":0,"invalidEncrypted":0,"loadedKeypairs":0}
```

Because every planned or unattended restart leaves encrypted delegates locked, lock-state monitoring is strongly recommended. See [Monitoring](./monitoring.md) for the complete Zabbix integration guide (`tools/zabbix/`).

## Loading Configuration

```json
{
  "loading": {
    "loadPerIteration": 5000,
    "memCheckpoints": {
      "enabled": true
    }
  }
}
```

- `loadPerIteration`: Maximum blocks verified per iteration during rebuild (recommended: `5000`).
- `memCheckpoints.enabled`: Persist rotating checkpoints of derived `mem_*` tables at completed round boundaries (default: `true`). See [Installation — Mem-Table Checkpoint Recovery](./installation.md#mem-table-checkpoint-recovery).

## SSL Configuration

```json
{
  "ssl": {
    "enabled": false,
    "options": {
      "port": 443,
      "address": "0.0.0.0",
      "key": "./ssl/adamant.key",
      "cert": "./ssl/adamant.crt"
    }
  }
}
```

- `enabled`: Enable or disable direct TLS termination in the node (default: `false`; many operators prefer a reverse proxy such as Nginx or Caddy — see [Security Recommendations](./security.md)).
- `options.port`, `options.address`, `options.key`, `options.cert`: TLS listener settings and certificate/key paths.

## Legacy DApp Configuration (Removed in v0.11.0)

The legacy `dapp` runtime configuration (`dapp.masterrequired`, `dapp.masterpassword`, `dapp.autoexec`) and DApp runtime/control/signing HTTP and peer routes were removed in v0.11.0. Existing `dapp` blocks in older `config.json` files remain loadable for upgrade compatibility and are ignored.

DApp transaction types `5`, `6`, and `7` remain consensus-supported with unchanged validation, serialization, fees, apply/undo, and replay behavior. Clients must sign those transactions locally and submit them via the standard transaction API (`POST /api/transactions`). See [Upgrading](./upgrading.md).

## WebSocket Client Configuration

Configure the client-facing Socket.IO server and its anti-abuse limits with `wsClient`:

```json
{
  "wsClient": {
    "portWS": 36668,
    "enabled": true,
    "limits": {
      "maxConnections": 1000,
      "maxConnectionsPerIp": 30,
      "maxPendingConnections": 100,
      "maxPendingConnectionsPerIp": 4,
      "pendingTimeoutMs": 10000,
      "maxConnectionAttempts": 120,
      "connectionWindowMs": 60000,
      "maxAddresses": 100,
      "maxTypes": 16,
      "maxAssetChatTypes": 8,
      "maxSubscriptionEvents": 60,
      "windowMs": 10000
    }
  }
}
```

- `enabled`: Enable or disable client WebSocket server (default: `true`).
- `portWS`: Client WebSocket port (`36668` for mainnet, `36665` for testnet).
- `limits`: Client WebSocket anti-abuse limits (omitted keys inherit defaults; `0` disables count caps; IP resolution follows [`trustProxy`](#server-configuration) with IPv6 `/56` grouping):
  - `maxConnections`: Maximum active client sockets node-wide (default: `1000`).
  - `maxConnectionsPerIp`: Maximum active client sockets per IP key (default: `30`).
  - `maxPendingConnections`: Maximum pending Engine.IO transport sessions node-wide before promotion to an active socket (default: `100`).
  - `maxPendingConnectionsPerIp`: Maximum pending transport sessions per IP key (default: `4`).
  - `pendingTimeoutMs`: Timeout in ms after which raw Engine.IO sessions that never reach the namespace are closed (default: `10000`).
  - `maxConnectionAttempts`: Maximum connection attempts per IP key during `connectionWindowMs` (default: `120`).
  - `connectionWindowMs`: Connection-attempt rate window in ms (default: `60000`).
  - `maxAddresses`: Maximum address subscriptions per socket (default: `100`).
  - `maxTypes`: Maximum transaction-type subscriptions per socket (default: `16`).
  - `maxAssetChatTypes`: Maximum chat-subtype subscriptions per socket (default: `8`).
  - `maxSubscriptionEvents`: Maximum subscription change events accepted per socket during `windowMs` (default: `60`). Excess `address`, `types`, `assetChatTypes`, `balances`, and `blocks` events in the window are ignored.
  - `windowMs`: Subscription-change window in ms (default: `10000`).

Validated client sockets are promoted from the pending transport pool into the active connection pool. These defaults also apply in `test/config.default.json`.

## WebSocket Node Configuration

Configure node-to-node WebSocket broadcasting and handshake/event bounds with `wsNode`:

```json
{
  "wsNode": {
    "enabled": true,
    "maxBroadcastConnections": 15,
    "maxReceiveConnections": 25,
    "handshakeLimit": 60,
    "handshakeLimitPerNonce": 30,
    "handshakeWindowMs": 60000,
    "maxPendingConnections": 16,
    "maxPendingConnectionsPerIp": 2,
    "pendingTimeoutMs": 10000,
    "eventLimit": 12000,
    "eventWindowMs": 60000
  }
}
```

- `enabled`: Enable or disable node-to-node WebSocket transport (default: `true`).
- `maxBroadcastConnections`: Maximum active inbound peer sockets promoted to receive broadcasts (default: `15`).
- `maxReceiveConnections`: Maximum outbound peer WebSocket connections maintained to receive broadcasts (default: `25`).
- `handshakeLimit`: Maximum inbound handshakes per IP key during `handshakeWindowMs` (default: `60`; `0` disables).
- `handshakeLimitPerNonce`: Maximum handshakes per peer nonce during `handshakeWindowMs` (default: `30`; `0` disables). Nonce, exact normalized IP, and banned-peer checks still run for attempts under the IP cap, and valid peers are promoted from the pending pool into the live broadcast pool.
- `handshakeWindowMs`: Handshake rate window in ms (default: `60000`).
- `maxPendingConnections`: Maximum pending inbound peer transport sessions node-wide before nonce/IP validation (default: `16`).
- `maxPendingConnectionsPerIp`: Maximum pending inbound peer transport sessions per IP key (default: `2`).
- `pendingTimeoutMs`: Timeout in ms for unpromoted peer Engine.IO sessions (default: `10000`).
- `eventLimit`: Maximum peer events accepted per outbound peer socket during `eventWindowMs` (default: `12000`; `0` disables).
- `eventWindowMs`: Peer event window in ms (default: `60000`).

## Nethash Configuration

The `nethash` uniquely identifies the blockchain network and prevents cross-network mixing. It is derived from `genesisBlock.payloadHash` (the SHA-256 payload hash of the genesis block transactions).

- **Mainnet**:

  ```json
  {
    "nethash": "bd330166898377fb28743ceef5e43a5d9d0a3efd9b3451fb7bc53530bb0a6d64"
  }
  ```

- **Testnet**:

  ```json
  {
    "nethash": "38f153a81332dea86751451fd992df26a9249f0834f72f58f84ac31cceb70f43"
  }
  ```

## CORS

By default, ADAMANT Node allows any origin to make requests. Control [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) with the `cors` object:

- `origin`: Configures `Access-Control-Allow-Origin` (`true`, `false`, a single origin string, or an array of origins).
- `methods`: Configures `Access-Control-Allow-Methods` (comma-delimited string or array).
- `exposedHeaders`: Additional response headers exposed to browsers (comma-delimited string or array).

CORS middleware runs before HTTP rate limiters and automatically appends the rate-limit response headers (`RateLimit`, `RateLimit-Policy`, `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `RateLimit-Scope`, `Retry-After`, and `X-RateLimit-*`) to `exposedHeaders` so browser clients can read `429` retry guidance.

```json
{
  "cors": {
    "origin": "https://example.com",
    "methods": "GET,PUT,POST"
  }
}
```
