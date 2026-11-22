# Core Concepts

Basic concepts of the ADAMANT blockchain you need to know if you're interacting with the blockchain or just running a node.

## Native Token

**ADM** is the native token of the ADAMANT blockchain. It's used to pay transaction fees and can be transferred between accounts. For consistency and precision, ADM amounts and **fees** are stored as strings in transactions and measured in 1/10<sup>8</sup> ADM (1 ADM = 100,000,000).

## Transaction Fees

Every transaction in ADAMANT requires a fee, paid in ADM. Fees help prevent spam and support the network. Fees are intentionally very low, making ADAMANT affordable for active messaging.

Most transaction types have a fixed fee, but **Message** and **Key-Value Store** (KVS) transaction fees scale with content length.

You can get blockchain fees using the [`/api/blocks/getFees`](/api-endpoints/blockchain.md#get-blockchain-fees) API endpoint.

## Timestamps

A **timestamp** in ADAMANT shows how many seconds have passed since the creation of the blockchain — the **blockchain epoch**, set at September 2, 2017, 17:00:00 GMT+0.

For example, to convert time to ADAMANT's timestamp using TypeScript:

```ts
const EPOCH = Date.UTC(2017, 8, 2, 17, 0, 0, 0);

/**
 * Converts provided timestamp into ADAMANT's epoch timestamp
 * @param time - timestamp in ms
 */
const getEpochTime = (time: number = Date.now()) =>
  Math.floor((time - EPOCH) / 1000);
```

Some upgraded transaction responses also include **`timestampMs`**. This value uses the same ADAMANT epoch, but in milliseconds. It is not a Unix timestamp.

```ts
/**
 * Converts provided timestamp into ADAMANT's epoch timestamp in ms
 * @param time - timestamp in Unix ms
 */
const getEpochTimeMs = (time: number = Date.now()) => time - EPOCH;

const timestampMs = getEpochTimeMs();
const timestamp = Math.floor(timestampMs / 1000);
```

Clients should derive `timestamp` from `timestampMs` with `Math.floor(timestampMs / 1000)`. Do not use `Math.round()` or `Math.ceil()`, because this can make `timestampMs` belong to the previous ADAMANT second while `timestamp` points to the next one.

After the [`spaceship`](/own-node/consensus.md#spaceship) consensus activation, nodes can store and return `timestampMs` for transactions that include it. Historical transactions and transactions from older clients may still have `timestampMs: null`, so clients should prefer `timestampMs` for ordering when it exists and fall back to `timestamp * 1000` otherwise.

You can get the blockchain epoch time using the [`/blocks/getEpochTime`](/api-endpoints/blockchain.md#get-blockchain-epoch) endpoint. Additionally, consider using [`/blocks/getStatus`](/api-endpoints/blockchain.md#get-adamant-blockchain-network-info) or [`/node/status`](/api-endpoints/blockchain.md#get-blockchain-and-network-status) endpoints to get more blockchain and network information in a single request.

## Blocks and Rounds

The ADAMANT blockchain is organized into **blocks**. Each block is produced by a delegate and contains a set of confirmed transactions.

A **round** consists of exactly **101 blocks** — one block slot per active delegate. At the end of each round, the set of active delegates may change based on updated vote weights. Forging order within a round is deterministic and shuffled from the active delegate list.

Each block slot has a fixed duration of **5 seconds**. If a delegate misses their slot (e.g., due to downtime), that slot is skipped and the next delegate's slot begins on schedule.

## Delegates and Voting

ADAMANT uses **Delegated Proof of Stake (DPoS)**. There are exactly **101 active delegates** at any given time. They are selected by token-holder votes and take turns forging blocks in each round.

Any ADAMANT account can register as a delegate and receive votes. Token holders can vote for up to **33 delegates** at once. Each vote is weighted by the voter's ADM balance.

After the [`fairSystem`](/own-node/consensus.md#fairsystem) consensus upgrade, vote weight is also adjusted by each delegate's **productivity** (the fraction of block slots they successfully forged). This discourages inactive delegates from maintaining their position purely through accumulated votes.

Delegates earn ADM rewards for each block they forge. You can query delegate information using the [Delegates API](/api-endpoints/delegates.md).

## Milestones

Milestones define block rewards for delegates and are triggered at specific block heights.

You can use the REST API to:

- [Get blockchain reward](/api-endpoints/blockchain.md#get-blockchain-reward)
- [Get current milestone number](/api-endpoints/blockchain.md#get-blockchain-milestone)
- [Retrieve both reward and milestone info in one call](/api-endpoints/blockchain.md#get-blockchain-and-network-status)
