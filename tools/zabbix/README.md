# ADAMANT Forging Monitoring for Zabbix

Ready-to-copy Zabbix 7.0+ monitoring assets for nodes running [encrypted delegate passphrases](../../docs/own-node/configuration.md#encrypted-delegate-passphrases).

For complete installation, privilege boundary, transport encryption, template tuning, and separate-host delegate outcome monitoring instructions, see the canonical **[Monitoring guide](../../docs/own-node/monitoring.md)** ([docs.adamant.im/own-node/monitoring.html](https://docs.adamant.im/own-node/monitoring.html)).

## Included Files

- `adm-forging-status` — fixed-allowlist wrapper invoking `tools/adm-node.js forging status --json` over the owner-only Unix control socket (`0600` in a `0700` directory)
- `zabbix-adamant-forging.sudoers` — exact `sudoers` rules (edit for your host and verify with `visudo -cf`; never use wildcards)
- `userparameter_adamant_forging.conf` — Zabbix agent `UserParameter` (`UnsafeUserParameters=0`)
- `template_adamant_forging.yaml` — Zabbix 7.0+ template for local forging lock-state monitoring on the forging host
- `template_adamant_delegate_outcome.yaml` — Zabbix 7.0+ template for public missed-block / productivity monitoring on a **separate logical Zabbix host**

## Quick Check

```sh
# Install root-owned wrapper after editing allowed instances and paths
sudo install -o root -g root -m 0755 \
  tools/zabbix/adm-forging-status /usr/local/bin/adm-forging-status

# Verify as the zabbix agent user
sudo -u zabbix /usr/local/bin/adm-forging-status mainnet
```
