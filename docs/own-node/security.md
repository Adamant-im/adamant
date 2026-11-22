# Security Recommendations

::: info Operator responsibility
These recommendations are a collection of practical notes contributed by independent node operators. There is no central ADAMANT company, operations team, or support service managing network hosts. Every operator selects their own architecture and tools and is solely responsible for the security and availability of their nodes and services. Following these recommendations reduces common operational risks, but cannot guarantee protection against compromise; adapt and verify every step in your own environment.
:::

## Access

- **Use SSH keys only**: Disable password authentication and root password login in `sshd_config`. Issue a separate SSH key per person and per device so a single lost laptop or rotated key can be revoked without affecting other access.
- **Protect provider console and recovery channels**: Enable hardware or TOTP multi-factor authentication on your VPS provider account, DNS registrar, and out-of-band console. Host-level SSH hardening does not protect against a compromised hosting control panel.
- **Non-default SSH ports and port knocking (optional)**: Moving SSH to a non-default port or placing it behind a port-knocking daemon (for example `knockd`) reduces automated scan noise and log clutter. Treat these measures as noise reduction only — they are not access control and do not replace strong key management or firewall allowlists.
- **Least-privilege service accounts**: Run the ADAMANT node under its dedicated unprivileged user (for example `adamant`) rather than `root`, and avoid granting unnecessary `sudo` privileges to service accounts.

## Firewall

- **Keep one firewall owner on the host**: Pick a single firewall manager (for example `nftables` or `ufw`) rather than mixing tools that silently overwrite each other's rules.
- **Cover both IPv4 and IPv6**: Apply matching default-deny inbound policies on both address families (for example allowing SSH only from your administration ranges such as `198.51.100.0/24` or `2001:db8::/32`).
- **Expose only required ports**:
  - Public P2P/HTTP port (`36666` mainnet / `36667` testnet) if participating directly in peer exchange, or reverse-proxied HTTPS (`443`) for a public API node.
  - Client WebSocket port (`36668` mainnet / `36665` testnet) only when intentionally serving WebSocket clients (directly or behind a TLS reverse proxy).
  - Keep PostgreSQL (`5432`), Redis (`6379`), local monitoring agents, and the forging Unix control socket (`0600` in a `0700` directory) strictly private.
- **Container networking caveat**: Container runtimes (such as Docker) publish `-p` ports via NAT rules that can bypass simple host `INPUT` firewall policies. Bind container-only services explicitly to `127.0.0.1` (for example `-p 127.0.0.1:36666:36666`) or enforce rules in the container runtime's forward chain.
- **Public coin-node RPC frontends**: If operating companion coin nodes or wallet backends on the same infrastructure, note that RPC proxies expose every daemon method that the frontend does not explicitly filter. Never hold an active wallet or unencrypted funds on a host that serves public RPC traffic.

## Updates and Vulnerability Checks

- **Automate OS security updates, but exclude databases**: Enable unattended security patches for base OS packages, while explicitly excluding PostgreSQL and Redis server packages from unattended upgrades. An unexpected PostgreSQL restart can interrupt active node operations; coordinate database updates with a graceful node stop first.
- **Cover third-party repositories**: PostgreSQL installed from the PGDG repository (as configured by `tools/install_node.sh`) is not covered by Ubuntu's default `unattended-upgrades` origins. Maintain a separate scheduled update routine for PGDG, Node.js, and any reverse-proxy packages.
- **Audit OS and runtime versions regularly**: Periodically scan installed OS packages and the Node.js runtime (for example with `trivy` or distribution advisories) and keep Node.js on a supported release (`^22.22.2 || >=24.15.0` as defined in `package.json`).
- **Verify installation sources**: Run `tools/install_node.sh`, `tools/install_node_centos.sh`, and `tools/fix_node.sh` from a reviewed Git checkout rather than piping unverified remote scripts directly into a root shell. Verify any downloaded blockchain snapshot against a SHA-256 digest obtained from an independent trust channel.

## Node Exposure

- **Public API access (`api.access.public` and `api.access.whiteList`)**: Keep `api.access.public` set to `false` on private or forging-only nodes.
- **Reverse proxy and Tor onion loopback pitfall**: Placing a reverse proxy (Nginx, Caddy, HAProxy) or a Tor onion service in front of the node makes every proxied request arrive from `127.0.0.1`. With `trustProxy: false`, every remote visitor matches the default `api.access.whiteList: ["127.0.0.1"]` and shares a single rate-limit bucket.
  - Enable `trustProxy: true` **only** when the node is reachable exclusively through one immediate reverse proxy that appends the real client IP to `X-Forwarded-For` (the node trusts only the single rightmost hop).
  - Never expose the node port directly to untrusted networks while `trustProxy: true`.
  - When serving a Tor onion service, keep in mind that Tor does not provide per-client IP addresses, so apply outer rate limits at the proxy layer.
- **Enable anti-abuse limits**: Review [`api.options.limits`](./configuration.md#api-configuration), [`peers.options.limits`](./configuration.md#peer-configuration), [`wsClient.limits`](./configuration.md#websocket-client-configuration), and [`wsNode`](./configuration.md#websocket-node-configuration) against `config.default.json`. Existing configs copied from older versions that still set `max: 0` remain unprotected until you delete the `limits` block or set `limit` above `0`.
- **Apply proxy or firewall rate limits to `/peer/*` in v0.11.0**: For mixed-version rollout compatibility with older `v0.10.x` peers, `v0.11.0` skips in-node `/peer/*` rate-limit and slow-down middleware for requests that omit `X-Adamant-Rate-Limit: 1`. Because callers control that header, hostile clients omitting it are not rate-limited by the node on `/peer/*` (including `GET /peer/blocks`). Enforce outer rate limits or connection limits on `/peer/*` at your reverse proxy or firewall until unconditional `/peer/*` rate limiting ships after network rollout.
- **Legacy control APIs removed**: As of v0.11.0, forging control routes and DApp runtime routes are no longer exposed over HTTP. Forging is controlled solely through `forging.secret`, graceful restarts, and (for encrypted passphrases) the local `0600` Unix control socket.
- **Directory permissions for the control socket**: Verify that the node checkout directory and its ancestors are not group- or world-writable (avoid `0775` from a `002` umask; use `chmod g-w,o-w`), or the node will refuse to open its local forging control socket.

## Process Lifecycle

- **Graceful shutdown only**: Always stop the node with one catchable signal (`SIGINT` or `SIGTERM`) and wait until the log prints `Cleaned up successfully` (see `AGENTS.md` and [Installation — Graceful Shutdown](./installation.md#graceful-shutdown-and-database-maintenance)).
- **Timeouts and service ordering**:
  - Do not rely on PM2's default 1600 ms `kill_timeout`. Use at least `120000` ms (`120` seconds), matching the ecosystem file created by `tools/install_node.sh`.
  - Give systemd stop timeouts enough headroom for graceful drain and order the node service to stop **before** PostgreSQL and Redis stop.
  - Disable core dumps for the node process in systemd so process memory containing keypairs is not written to disk on crash.
- **Database restarts**: Even with v0.11.0 PostgreSQL reconnect and query-timeout improvements, stop the node cleanly before planned PostgreSQL restarts and verify synchronization resumes normally afterward.
- **Encrypted signers start locked**: When using [encrypted delegate passphrases](./configuration.md#encrypted-delegate-passphrases), every reboot, crash recovery, or planned restart leaves forging locked until an operator unlocks it via `npm run adm-node -- forging unlock`.

## Monitoring

Track both local host health and independent public chain state (for example with Zabbix, Prometheus, or simple cron checks):

- **Chain height and sync status**: Compare the node's height (`/api/blocks/getHeight` or `/api/node/status`) against several independent peers and alert on sustained drift or `syncing: true`.
- **Disk space and inodes**: Alert well before root or PostgreSQL volumes fill up (disk exhaustion can corrupt database writes or block checkpoint rotation).
- **TLS certificate expiry**: Check certificate expiration against the live public HTTPS URL (for example `https://node.example.com`), not only files on disk, to catch reload failures.
- **Backup freshness**: Alert when scheduled backups stop completing or fail verification.
- **Forging lock state and delegate outcome**: Monitor local lock state through the owner-only control socket and monitor public missed blocks / productivity from a separate logical host so delegate identities are not linked to the forging host's address. See [Monitoring](./monitoring.md).

## Secrets and Backups

- **Keep secrets out of command lines and logs**: Never pass delegate passphrases or operator passwords via CLI flags, environment variables, shell history, or shared chat/clipboard tools. Encrypt delegate passphrases in `config.json` with `npm run adm-node -- forging encrypt` (see [Configuration — Encrypted Delegate Passphrases](./configuration.md#encrypted-delegate-passphrases)).
- **Encrypt off-host backups**: Encrypt configuration and database backups before transferring them off-host, and restrict access to backup credentials.
- **Test restores without double-signing**: Periodically verify backup restores on an isolated host, and make sure `forging.secret` is empty during any restore test so a second host never starts forging with the same delegate key.

## If Something Goes Wrong

If you suspect host compromise or unauthorized access:

1. **Restrict access**: Block inbound/outbound traffic at the provider firewall or isolate the host immediately while preserving forensic access if needed.
2. **Preserve logs and evidence**: Copy system logs, SSH auth logs, PM2/node logs, and process/network snapshots off the compromised host for review.
3. **Rebuild from a clean image**: Do not try to clean an untrusted host in place. Provision a fresh OS image, reinstall from reviewed sources, and restore only verified data.
4. **Rotate credentials**: Replace all SSH keys, database passwords, Redis passwords, monitoring PSKs/certificates, TLS private keys, and operator passwords that were present on the affected host.
5. **Protect funds on a clean device**: If a delegate passphrase or account key may have been exposed, transfer funds and update delegate/voting setup from a separate, clean device.
