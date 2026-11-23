# Upgrading to v0.11.0

This page summarizes breaking changes, configuration migrations, and operational updates introduced in ADAMANT Node `v0.11.0`.

## Breaking HTTP API Changes

### Removed Legacy Forging and DApp Runtime Control APIs

Starting in `v0.11.0`, the node no longer exposes:

- Legacy forging HTTP control routes: `enable`, `disable`, `status`, `enableAll`, and `disableAll`.
- Legacy DApp runtime and server-side signing routes: install, launch, stop, uninstall, state-inspection, server-side signing/withdrawal, dynamic per-DApp routes, and DApp peer runtime routes.

**Migration and consensus impact:**

- **Forging**: Configure delegates solely via `forging.secret` in `config.json`. Changing the configured delegate set requires editing `config.json` and performing a graceful restart (waiting for `Cleaned up successfully`). Legacy `forging.access` (`whiteList`) remains loadable in existing configs for upgrade compatibility and is ignored.
- **DApp transactions (types 5, 6, and 7)**: Consensus behavior is **unchanged** — DApp registration (`type 5`), in-transfer (`type 6`), and out-transfer (`type 7`) keep their exact validation, serialization, fees, apply/undo, and replay rules. Clients must sign those transactions locally and submit them through the standard transaction API (`POST /api/transactions`). Existing `dapp` blocks (`masterrequired`, `masterpassword`, `autoexec`) in older `config.json` files remain loadable and are ignored.

### Strict `and:`-Only Filter Validation on States, Chats, and Chatrooms

On `/api/states/get` (`GET` and `POST`), `/api/chats/get`, and `/api/chatrooms/*`:

- All filters combine exclusively with `AND`.
- `and:`-prefixed field names (for example `and:senderId`, `and:key`, `and:type`) are accepted and normalized to the plain field name.
- `or:`-prefixed filters are now **rejected** with `OR filters are not supported` instead of being silently ignored.
- Unknown query fields (including passing `userId` as a query parameter on `/api/chatrooms/{address}`) and conflicting values between plain and `and:`-prefixed names (for example `senderId=U...&and:senderId=U...` with different addresses) are now **rejected**.

See [Transactions Query Language](/api/transactions-query-language.md#combine-filters-and-options).

## Operator Configuration Migrations

### Node.js and npm Requirements

- Required Node.js runtime: `22.22.2+` on the `22.x` line, or `24.15.0+` (`package.json` `engines.node: ^22.22.2 || >=24.15.0`). Node.js `24.0.0–24.14.x` is not supported for the development toolchain.
- Install dependencies strictly from the reviewed lockfile (`npm ci --omit=dev` for production operators, `npm ci` for development).
- See [Installation](./installation.md#requirements).

### Anti-Abuse Limits (`max: 0` Migration)

`v0.11.0` enables production HTTP and WebSocket anti-abuse limits by default in `config.default.json`:

- Public REST (`/api/*`): aggregate cap `15300`/min with per-class caps `status` (`12000`), `read` (`3000`), and `publish` (`300`).
- Peer HTTP (`/peer/*`): aggregate cap `44000`/min with per-class caps `status` (`20000`), `sync` (`12000`), and `broadcast` (`12000`), fixed HTTP `429` status, and mixed-version negotiation via `X-Adamant-Rate-Limit: 1`. Note that in `v0.11.0`, `/peer/*` requests omitting `X-Adamant-Rate-Limit: 1` are skipped for mixed-version rollout compatibility with `v0.10.x` peers — hostile clients omitting that header are not throttled in-node, so enforce outer rate limits on `/peer/*` at your reverse proxy or firewall (see [Security Recommendations](./security.md#node-exposure)).
- Client WebSocket (`wsClient.limits`) and Node WebSocket (`wsNode`): active and pending connection pools, connection-attempt windows, per-socket subscription caps, subscription rate windows, and peer event caps.

**Action required for existing configs:**

- If your existing `config.json` still contains `api.options.limits` or `peers.options.limits` with `max: 0`, the node keeps that surface **disabled** and logs a warning at startup.
- Delete the `api.options.limits` and `peers.options.limits` blocks from `config.json` to inherit the full `v0.11.0` defaults (including per-class `routes`), or explicitly configure `limit` above `0`.
- Review `trustProxy`: enable it only when the node is reachable exclusively through one immediate reverse proxy (rightmost `X-Forwarded-For` hop). See [Configuration — Server Configuration](./configuration.md#server-configuration).

### Optional Encrypted Delegate Passphrases

Operators can now encrypt `forging.secret` entries with an operator password (`admnode-enc-v1.`, AES-256-GCM + scrypt) using `npm run adm-node -- forging encrypt`.

- Plaintext passphrases continue to work unchanged.
- Before switching to encrypted secrets, verify the node directory is not group- or world-writable (`chmod g-w,o-w /home/adamant/adamant`).
- Set up local lock-state monitoring ([Monitoring](./monitoring.md)) and include `npm run adm-node -- forging unlock` in every planned restart runbook.

## Reliability and Operational Improvements

- **Hardened installers and repair script**: Run `tools/install_node.sh`, `tools/install_node_centos.sh`, and `tools/fix_node.sh` from a verified Git checkout; snapshot restores require an independently trusted SHA-256 checksum file, and `fix_node.sh` verifies the snapshot before dropping the database by default.
- **Bounded peer probing and peer-table limits**: New `peers.options` controls (`updateConcurrency`, `probeSpacingMs`, `maxProbeTargets`, `unverifiedProbeLimit`, exponential backoff/eviction, and per-IP/per-subnet caps).
- **PostgreSQL connection recovery**: Pool connect timeout (10s), TCP keepalive (10s for pure-JS driver), and post-migration query timeout (300s) prevent stuck queues after dropped database connections; coordinated graceful shutdown before planned DB restarts remains recommended.
- **Mem-table checkpoint height validation**: Checkpoint creation validates block heights to prevent persisting state ahead of the checkpoint block.
- **WebSocket peer rotation**: Outbound WebSocket teardown consistently resets `syncProtocol` during peer rotation.
