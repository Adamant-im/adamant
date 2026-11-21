# ADAMANT forging monitoring for Zabbix

The ADAMANT node intentionally does not expose local forging lock state through
public HTTP or peer APIs. Use the owner-only Unix control socket and run the
check on the node host through a Zabbix agent `UserParameter`.

The node-side command prints one JSON line and no delegate address or public
key:

```sh
/usr/bin/node /home/adamant/adamant/tools/adm-node.js \
  forging status --json \
  --socket /home/adamant/adamant/.run/control-36666.sock \
  --timeout 2000
```

Run the command as the node service user. The socket is `0600`, and the
command checks that the socket and its parent directory belong to that user.
Use absolute paths rather than `npm run`, because npm can add output that makes
the one-line JSON payload invalid.

## Privilege boundary

1. Edit `adm-forging-status` and keep only the instances this host runs. Replace
   the example users, interpreter paths, repository paths, ports, and socket
   paths with the exact values from the running pm2/systemd processes. The
   default path is `<node checkout>/.run/control-<port>.sock` and does not depend
   on `TMPDIR`, `XDG_RUNTIME_DIR`, systemd `PrivateTmp`, or the shell environment.
2. Install it as a root-owned executable:

   ```sh
   sudo install -o root -g root -m 0755 \
     tools/zabbix/adm-forging-status /usr/local/bin/adm-forging-status
   ```

3. Copy the matching exact commands into
   `/etc/sudoers.d/zabbix-adamant-forging`. Validate the complete file with
   `visudo -cf /etc/sudoers.d/zabbix-adamant-forging` before reloading the
   agent. Do not use wildcards, and remove the example rule for an instance
   that is not installed.
4. Install `userparameter_adamant_forging.conf` in the Zabbix agent include
   directory. Keep `UnsafeUserParameters=0`, which is the default. The wrapper
   rejects every instance name outside its fixed allow-list.
5. Reload the agent and test as the agent account:

   ```sh
   sudo -u zabbix /usr/local/bin/adm-forging-status mainnet
   ```

Do not add the Zabbix account to the node user's group or to the Docker group.
Docker access is root-equivalent. For a container, place a separate root-owned
wrapper behind an exact sudoers rule and use one fixed
`docker exec -u <node-user> <container> node ...` command; never derive the
container, user, path, or command from a Zabbix item argument.

## Transport

Use Zabbix agent PSK or certificate encryption on hosts that forge. The JSON
payload has no delegate identities, but it still reveals that the node carries
encrypted delegate keys and whether local forging is locked.

## Template

Import `template_adamant_forging.yaml` into Zabbix 7.0 LTS or later and link it
only to hosts expected to forge. It defines:

- the master item `adm.forging.status[{$ADM.FORGING.INSTANCE}]`;
- dependent counts;
- numeric state mapping (`loading=0`, `disabled=1`, `unlocked=2`,
  `partial=3`, `locked=4`, `unavailable=5`);
- locked, loading, invalid-config, unavailable, and plaintext reminders.

Set `{$ADM.FORGING.INSTANCE}` to one allowed wrapper name. The default is
`mainnet`. A `loading` value distinguishes node rebuild/synchronization from a
node that does not answer. The master item uses a passive Zabbix agent check
and a 5-second item timeout. The wrapper suppresses command stderr and emits a
deterministic `unavailable` JSON state when the socket is absent, the command
times out, or the wrapper fails. `nodata()` is retained only for the case where
the agent itself sends no value at all.

The per-item timeout reaches only Zabbix agents 7.0 and newer. Older agents
answer the 7.0 JSON passive-check protocol as unsupported, the server falls back
to sending only the item key, and the agent applies its own `Timeout` setting
(3 seconds by default). On pre-7.0 agents, set `Timeout=5` or higher in the
agent configuration, or the item can flap to unsupported on a loaded host.

The state triggers use `min()`/`max()` over their windows, so every value in a
window must match. They use only functions available in Zabbix 7.0. After
import, verify each trigger once, for example by pushing `locked`, `loading`, and
`unavailable` payloads to a trapper copy of the master item with
`zabbix_sender`.

The unavailable trigger has no hard-coded dependency on a host availability
trigger because that trigger is deployment-specific. After import, add a
dependency on the existing ADAMANT node availability trigger to avoid duplicate
alerts for a stopped node.

## End-to-end outcome check

Lock state explains why local forging may miss blocks; public chain data
measures the outcome. Import `template_adamant_delegate_outcome.yaml` on a
separate logical Zabbix host, not on the forging-node host. Set:

- `{$ADM.PUBLIC.API}` to a trusted public node base URL;
- `{$ADM.DELEGATE.PUBLIC_KEY}` to the delegate public key.

That template requests the generic active-delegate list, selects the configured
delegate only in Zabbix preprocessing, and alerts after `missedblocks`
increases inside the configured window or `productivity` falls below the
configured minimum. The public node therefore does not receive a query naming
the watched delegate. It also alerts when no outcome value arrives during that
window: the public API failed, returned an invalid payload, or the delegate is
no longer in the active delegate list. This catches missed slots caused by lock
state as well as sync, fork, or clock problems. Keeping it on a separate logical host avoids
linking a delegate identity to the forging node's host/address in Zabbix
inventory and events.

## Operations

A process restart leaves every encrypted delegate locked. Add `forging unlock`
to every planned restart procedure and keep the lock-state item enabled. A
node can remain synced, serve APIs, exchange peers, and process the mempool
while forging is locked.
