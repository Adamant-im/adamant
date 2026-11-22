# Localnet

A localnet runs multiple ADAMANT nodes on one machine without connecting to any public peers. It is useful when you need an isolated environment to test consensus behavior, transaction handling, or multi-node scenarios.

::: tip
For single-node local testing against testnet peers, use [Testnet](./testnet.md) instead. Localnet is designed for multi-node isolation.
:::

## Starting a Localnet

Start a localnet with a given number of nodes:

```sh
npm run start:localnet -- --nodes 3
```

Each node gets isolated ports, PostgreSQL database names, Redis database indexes, process output files, and ADAMANT log files.

`start:localnet` uses the following defaults:

- `test/config.default.json` as the base config
- `test/genesisBlock.json` as the genesis block
- `test/genesisPasses.json` as the genesis delegate passphrase source
- `test/config.localnet.json` as additional config overrides
- One generated per-node override file under `.localnet/node-N/`

`test/config.default.json` sets public REST and peer HTTP `limit` and `max` to `0`, so localnet HTTP limits stay off and startup warns for both surfaces. Remove the `limits` block or set `limit` above `0` to inherit or enable caps. See [Configuration — API Configuration](./configuration.md#api-configuration).

The localnet manifest is written to `.localnet/manifest.json` and includes node endpoints, PIDs, database names, Redis URLs, log paths, and delegate counts.

## Managing the Localnet

**Check status:**

```sh
npm run status:localnet
```

Reports each managed node's height, loader state, cached and live broadhash consensus, configured delegate counts, and last forging timestamp.

**Stop nodes:**

```sh
npm run stop:localnet
```

Sends `SIGTERM` to every managed node and waits for graceful shutdown. Databases are not dropped by default.

**Stop and drop databases in one step:**

```sh
npm run stop:localnet -- --drop-on-stop
```

**Drop databases without stopping (e.g., for a clean restart):**

```sh
npm run drop:localnet
```

Drops the isolated PostgreSQL databases and flushes only the Redis databases assigned to localnet nodes.

## Log Layout

```
logs-localnet/
  node-1/
    adamant_localnet.log
    adamant_localnet_debug.log
  node-2/
  node-3/
```

## PostgreSQL Databases

By default, `start:localnet` tries to create missing per-node databases:

```
adamant_localnet_node_1
adamant_localnet_node_2
adamant_localnet_node_3
```

Databases are owned by the configured DB user (`adamanttest` by default). If your local PostgreSQL user cannot create databases, pass a PostgreSQL admin user:

```sh
npm run start:localnet -- --nodes 3 --db-admin-user postgres
```

Or create the databases manually and start with `--skip-db-create`.

## Delegate Distribution

By default, genesis delegate passphrases are distributed evenly across nodes. For one to three nodes, all nodes receive delegate passphrases. For more than three nodes, the last node is non-forging and the remaining nodes share the passphrases as evenly as possible.

## Configuration Overrides

You can override localnet configuration values at startup. For example, to set custom consensus activation heights for testing:

```sh
npm run start:localnet -- --nodes 3 \
  --config-set consensusActivationHeights.fairSystem=203 \
  --config-set consensusActivationHeights.spaceship=405
```

See [Configuration Overrides](./configuration.md#configuration-overrides) for the full syntax.

## Nethash

Localnet uses the testnet genesis block by default. The node derives `nethash` from `genesisBlock.payloadHash` — the SHA-256 payload hash of the genesis block transactions. All localnet nodes must use the same genesis block.

## Running Scenario Tests Against Localnet

```sh
npm run start:localnet -- --nodes 3
npm run scenario:localnet -- --all
```

For full details on available scenarios and live consensus activation runs, see [Testing & Live Scenarios](./testing.md#live-scenario-tests).
