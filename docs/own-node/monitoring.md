# Monitoring

Monitoring a forging or public ADAMANT node combines local process/lock-state checks with independent public blockchain checks. This guide covers the ready-to-use Zabbix assets shipped in [`tools/zabbix/`](https://github.com/Adamant-im/adamant/tree/dev/tools/zabbix).

## Forging Lock State Monitoring

The ADAMANT node intentionally does **not** expose local forging lock state through public HTTP or peer APIs. When using [encrypted delegate passphrases](./configuration.md#encrypted-delegate-passphrases), every planned or unattended restart leaves encrypted delegates locked until an operator runs `npm run adm-node -- forging unlock`.

Monitor local lock state over the owner-only Unix control socket (`0600` inside a `0700` directory) using a Zabbix agent `UserParameter`.

The underlying node command prints one JSON line containing no delegate addresses or public keys:

```sh
/usr/bin/node /home/adamant/adamant/tools/adm-node.js \
  forging status --json \
  --socket /home/adamant/adamant/.run/control-36666.sock \
  --timeout 2000
```

Example output:

```json
{"state":"locked","encrypted":3,"encryptedLoaded":0,"plaintext":0,"invalidEncrypted":0,"loadedKeypairs":0}
```

- Run the command as the node service user. The CLI verifies that the socket and its parent directory belong to that user and are not group- or world-writable.
- Use absolute binary and script paths instead of `npm run`, because `npm` may print extra output that breaks single-line JSON parsing.
- The standalone CLI exits with `0` on a valid response and non-zero on missing socket, timeout, or malformed output. The Zabbix wrapper script converts those local errors into a deterministic `{"state":"unavailable",...}` JSON payload while suppressing stderr.

## Privilege Boundary and Installation

The `tools/zabbix/` directory provides:

- `adm-forging-status` — fixed-allowlist wrapper script
- `zabbix-adamant-forging.sudoers` — exact `sudoers` rules (no wildcards)
- `userparameter_adamant_forging.conf` — Zabbix agent `UserParameter`
- `template_adamant_forging.yaml` — Zabbix 7.0+ template for local forging lock state
- `template_adamant_delegate_outcome.yaml` — Zabbix 7.0+ template for public missed-block / productivity monitoring

Setup steps:

1. Edit `tools/zabbix/adm-forging-status` so it contains only the node instances running on that host. Replace example usernames, interpreter paths, repository paths, ports, and socket paths with the exact values from your running PM2/systemd processes. (The default socket path `<node checkout>/.run/control-<port>.sock` does not depend on `TMPDIR`, `XDG_RUNTIME_DIR`, systemd `PrivateTmp`, or shell environment.)
2. Install the wrapper as a root-owned executable:

   ```sh
   sudo install -o root -g root -m 0755 \
     tools/zabbix/adm-forging-status /usr/local/bin/adm-forging-status
   ```

3. Install exact matching commands into `/etc/sudoers.d/zabbix-adamant-forging` (remove rules for unused instances and never use wildcards), and validate with `visudo`:

   ```sh
   sudo visudo -cf /etc/sudoers.d/zabbix-adamant-forging
   ```

4. Copy `tools/zabbix/userparameter_adamant_forging.conf` into the Zabbix agent include directory. Keep `UnsafeUserParameters=0` (the default); the wrapper rejects any instance name outside its fixed allowlist.
5. Reload the Zabbix agent and verify execution as the agent account:

   ```sh
   sudo -u zabbix /usr/local/bin/adm-forging-status mainnet
   ```

::: warning Do not broaden group or Docker privileges
Do not add the `zabbix` account to the node user's group or to the `docker` group (Docker group membership is root-equivalent). For containerized nodes, place a separate root-owned wrapper behind an exact `sudoers` rule running one fixed `docker exec -u <node-user> <container> node ...` command — never derive container names, users, paths, or commands from a Zabbix item argument.
:::

## Transport Security

Use Zabbix agent-to-server PSK or TLS certificate encryption on hosts that forge. Although the JSON payload omits delegate addresses and public keys, it still reveals whether the host carries encrypted delegate keys and whether forging is currently locked.

## Local Forging State Template

Import `tools/zabbix/template_adamant_forging.yaml` into Zabbix 7.0 LTS or newer and link it only to hosts expected to forge.

It defines:

- Master passive agent item `adm.forging.status[{$ADM.FORGING.INSTANCE}]` with a 5-second item timeout
- Dependent count items (`encrypted`, `encryptedLoaded`, `plaintext`, `invalidEncrypted`, `loadedKeypairs`)
- Numeric state mapping: `loading=0`, `disabled=1`, `unlocked=2`, `partial=3`, `locked=4`, `unavailable=5`
- Triggers for `locked`, `loading`, invalid encrypted entries, `unavailable`, and plaintext secret reminders

Operational notes:

- Set `{$ADM.FORGING.INSTANCE}` to an allowlisted wrapper name (default: `mainnet`).
- `loading` distinguishes startup rebuild/synchronization from an unresponsive node (`unavailable`). `nodata()` is kept only for when the agent itself sends no value.
- Per-item timeouts apply to Zabbix agents 7.0+. On pre-7.0 agents, set `Timeout=5` or higher in `zabbix_agentd.conf` so the item does not flap to unsupported on busy hosts.
- State triggers use `min()`/`max()` over their windows so every sample in the window must match. Test triggers once after import (for example with `zabbix_sender` against a trapper copy of the master item).
- Add a trigger dependency from the `unavailable` trigger to your host's ADAMANT node availability trigger to avoid duplicate alerts when a node is intentionally stopped.

## End-to-End Delegate Outcome Check

Lock state explains why local forging might miss blocks; public chain data measures actual block production. Import `tools/zabbix/template_adamant_delegate_outcome.yaml` on a **separate logical Zabbix host** (not the forging-node host) and set:

- `{$ADM.PUBLIC.API}` — base URL of a trusted public ADAMANT node (for example `https://node.example.com`)
- `{$ADM.DELEGATE.PUBLIC_KEY}` — the delegate's public key

The template queries the generic active-delegate list and filters for the configured delegate inside Zabbix preprocessing, so the public node never receives a query naming the watched delegate. It alerts when `missedblocks` increases within the configured window, `productivity` drops below threshold, or no valid outcome payload arrives (API failure, invalid response, or delegate leaving the active list). Keeping this template on a separate logical host prevents linking a delegate identity to the forging node's host or IP in Zabbix inventory and events.
