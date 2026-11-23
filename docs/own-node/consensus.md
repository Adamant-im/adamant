# Consensus

Consensus is the process that makes sure all nodes in the network agree on the state of the blockchain. It controls how transactions are confirmed and how new blocks are added, keeping the network consistent and secure.

ADAMANT uses a **Delegated Proof of Stake (DPoS)** consensus mechanism, where a fixed set of 101 active delegates take turns forging blocks in a deterministic round-robin order. The active delegate set is selected by token-holder votes and refreshed every round (101 blocks).

This page describes changes to the consensus rules and how they activate.

## Consensus Activation Heights

Consensus upgrades are not applied retroactively. Instead, each upgrade activates at a specific block height defined in the node's `consensusActivationHeights` configuration:

```json
{
  "consensusActivationHeights": {
    "fairSystem": 4359465,
    "spaceship": 100000000
  }
}
```

Nodes that diverge from these activation heights will fork from the network. **Do not change these values on a mainnet node.**

For testnet or localnet testing, you can override activation heights using [configuration overrides](./configuration.md#configuration-overrides):

```sh
node app.js \
  --config test/config.json \
  --genesis test/genesisBlock.json \
  --config-set consensusActivationHeights.fairSystem=203 \
  --config-set consensusActivationHeights.spaceship=405
```

This is useful when running a [Localnet](./localnet.md) to test consensus behavior in an isolated environment.

## fairSystem

- **Activation height:** `4,359,465` (mainnet)

- **Description**

  Before this upgrade, delegate ranking was based on raw vote weight — the total ADM staked by all voters who voted for each delegate. This allowed large holders to dominate the active delegate set disproportionately.

  The `fairSystem` upgrade replaces raw `vote` with **productivity-adjusted `votesWeight`** for delegate ranking, active-delegate selection, and approval calculation:

  - Each voter's balance is divided proportionally across all delegates they voted for (so voting for more delegates dilutes each vote).
  - The resulting per-delegate weight is then multiplied by that delegate's **productivity** (the fraction of their scheduled block slots that they successfully forged).
  - Delegates with low productivity receive less effective voting weight, incentivizing consistent block production.
  - The approval percentage shown for a delegate is calculated as their adjusted `votesWeight` divided by the current token supply.

  This makes voting influence fairer while keeping delegate ordering deterministic.

- **Pre-activation behavior**

  Before height `4,359,465`, delegate ranking uses raw `vote` totals. API responses for delegates include the `vote` field.

- **Post-activation behavior**

  From height `4,359,465` onward, delegate ranking uses `votesWeight`. API responses include the `votesWeight` field for ranking and approval calculations.

## spaceship

- **Target block for activation:** `100,000,000` (mainnet)

- **Description**

  Transactions can now include a new optional field: `timestampMs`.

  - `timestampMs` is a client-side timestamp in milliseconds, using the same ADAMANT epoch as `timestamp` (seconds since September 2, 2017, 17:00:00 UTC).
  - It records when the transaction was **created on the client side**, providing sub-second ordering precision.
  - This field is **optional**. Transactions without it remain valid.
  - If included, `timestampMs` must be within the same ADAMANT second as `timestamp` (i.e., `Math.floor(timestampMs / 1000) === timestamp`). Transactions that violate this constraint are rejected.

  Before this upgrade, nodes strip `timestampMs` from transactions during normalization to preserve compatibility. After activation, nodes preserve and return `timestampMs` for transactions that include it.

  This change improves the display order of messages and events in messenger applications.

- **Example**

  ```json
  {
    "timestamp": 212457600,
    "timestampMs": 212457600456,
    "signature": "..."
  }
  ```

- **Client compatibility note**

  Historical transactions and transactions from older clients may have `timestampMs: null`. Clients should prefer `timestampMs` for ordering when it is present and fall back to `timestamp * 1000` otherwise.

  See [Core Concepts — Timestamps](/core-concepts.md#timestamps) for the conversion formulas.
