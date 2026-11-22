# WebSocket

The client WebSocket API delivers live transaction, account balance, and block events without repeated REST polling.
ADAMANT nodes use [Socket.IO](https://socket.io/), so use a
[Socket.IO client](https://socket.io/docs/v4/client-api/) instead of a bare WebSocket client.

The examples below use `socket.io-client`. Applications can also use
[adamant-api-jsclient](https://github.com/Adamant-im/adamant-api-jsclient) for higher-level ADAMANT API access.

## WebSocket vs REST API

WebSocket events are live notifications, not a durable event log:

- Connections can drop, so an application can miss events.
- Subscriptions belong to one socket and must be sent again after every connection or reconnection.
- The node suppresses duplicate transaction and block IDs for at least 60 seconds; periodic cleanup can extend the effective
  window to approximately two minutes. A block rolled back and re-applied within this window can therefore be suppressed.
  This is not a replay buffer.
- Balance subscriptions do not send an initial value.

Read initial state from REST, use WebSocket events for low-latency updates, and reconcile important state through REST after
reconnecting. For example, use `/api/accounts/getBalance` for balances and `/api/blocks` for blocks.

## Enabling WebSocket

Enable the client WebSocket server in the node
[configuration file](/own-node/configuration.md#websocket-client-configuration):

```json
{
  "wsClient": {
    "enabled": true,
    "portWS": 36668
  }
}
```

To discover whether a node offers client WebSocket connections, request `/api/node/status` over its REST API.

## Connection and subscription limits

Starting in v0.11.0, production defaults enforce both transport admission and per-socket subscription bounds:

- **Active connections**: `1000` node-wide, `30` per IP key.
- **Pending transport pool**: `100` node-wide, `4` per IP key; raw Engine.IO sessions that never promote to the Socket.IO namespace expire after `10000` ms (`pendingTimeoutMs`).
- **Connection-attempt window**: `120` attempts per IP key per `60000` ms.
- **Per-socket subscription caps**: `100` addresses, `16` transaction types, `8` chat subtypes, and `60` subscription changes per `10000` ms window.

Connections past the active, pending, or attempt caps are rejected or disconnected. Address, transaction-type, and chat-subtype entries past the per-socket cap are ignored, as are further subscription events in the window (including `balances` and `blocks`). Client IP keys follow [`trustProxy`](/own-node/configuration.md#server-configuration) and group IPv6 clients on a `/56` boundary. Operators can adjust all caps via [`wsClient.limits`](/own-node/configuration.md#websocket-client-configuration).

Example response fragment:

```json
{
  "success": true,
  "nodeTimestamp": 226901657,
  "nodeTimestampMs": 226901657123,
  "unixTimestampMs": 1731273257123,
  "wsClient": {
    "enabled": true,
    "port": 36668
  }
}
```

## Connecting and restoring subscriptions

Register subscriptions inside the `connect` handler. Socket.IO calls it again after a successful reconnection, so the new
server-side socket receives the same subscriptions.

```js
import { io } from 'socket.io-client';

const connection = io('https://endless.adamant.im/', {
  reconnection: true,
  timeout: 5000,
});

connection.on('connect', () => {
  connection.emit('address', 'U1234567890123456');
  connection.emit('types', [0, 8]);
  connection.emit('balances', ['balance', 'unconfirmedBalance']);
  connection.emit('blocks', true);
});

connection.on('disconnect', (reason) => {
  console.log(`Disconnected: ${reason}`);
});

connection.on('connect_error', (error) => {
  console.warn(`Connection error: ${error}`);
});
```

## Subscription events

Clients send the following Socket.IO events:

| Event | Payload | Effect |
|---|---|---|
| `address` | Address string or array | Filters `newTrans` and selects addresses used by balance subscriptions |
| `types` | Transaction type number or array | Filters `newTrans` by transaction type |
| `assetChatTypes` | Chat asset type number or array | Filters chat `newTrans` events by `asset.chat.type` |
| `balances` | `balance`, `unconfirmedBalance`, or an array of both | Enables requested `balances/change` fields |
| `blocks` | Boolean | `true` enables and `false` disables `newBlock` events |

Address, transaction type, chat type, and balance field subscriptions are additive for the lifetime of the socket. Unsupported
values are ignored. The `blocks` payload must be a scalar boolean; arrays and other values are ignored.

The API does not send subscription acknowledgements. A client should validate its own inputs and use REST reconciliation when
delivery matters.

## Listening to transactions

The node emits `newTrans` when it applies a transaction to the unconfirmed pool. The payload is provisional and has
`block_timestamp: null`; confirm inclusion through `newBlock` plus REST, or by querying the transaction later.

After the `spaceship` consensus activation, the payload can include `timestampMs` when the transaction was created with
millisecond precision. This value is measured from the ADAMANT epoch. Prefer it for ordering and fall back to
`timestamp * 1000` when it is missing or `null`.

```js
connection.on('newTrans', (transaction) => {
  console.log('New unconfirmed transaction:', transaction);
});
```

### Understanding unconfirmed transactions

New transactions do not appear on the blockchain immediately. Until a delegate includes a transaction in a valid block, it
can expire, be rejected, or be removed during pool revalidation.

::: danger

Any logic involving transfer transactions (`amount` greater than `0`) should verify blockchain confirmation before treating
the transfer as final.

:::

### Filtering transactions

A socket receives no `newTrans` events until it sends at least one valid `address`, `types`, or `assetChatTypes` subscription.

Filters combine as follows:

- With only `address`, the socket receives every transaction involving any subscribed sender or recipient.
- With only `types`, the socket receives those transaction types for all addresses.
- With only `assetChatTypes`, the socket receives matching type `8` chat transactions for all addresses.
- With addresses and type filters, a transaction must match a subscribed address and a subscribed type.
- `assetChatTypes` applies to chat transaction type `8` and can match alongside ordinary transaction type filters.

#### Filtering by address

```js
connection.on('connect', () => {
  connection.emit('address', 'U1234567890123456');
  // To subscribe to multiple addresses instead, use:
  // connection.emit('address', ['U1234567890123456', 'U6543210987654321']);
});
```

Addresses are validated and normalized to uppercase by the node.

#### Filtering by transaction type

```js
connection.on('connect', () => {
  connection.emit('types', 0);
  // To subscribe to transfer (0) and chat message (8) transactions instead, use:
  // connection.emit('types', [0, 8]);
});
```

See the full list of [transaction types](/api-types/transaction-types.md).

#### Filtering by message type

```js
connection.on('connect', () => {
  connection.emit('assetChatTypes', 3);
  // To subscribe to multiple asset.chat.type values instead, use:
  // connection.emit('assetChatTypes', [1, 2, 3]);
});
```

See the full list of [message types](/api-types/message-types.md).

## Listening to balance changes

Balance events require at least one subscribed `address` and an explicit `balances` subscription. The node reads the current
account only when a matching field changed and at least one socket subscribed to that address and field.

```js
connection.on('connect', () => {
  connection.emit('address', ['U1234567890123456', 'U6543210987654321']);
  connection.emit('balances', ['balance', 'unconfirmedBalance']);
});

connection.on('balances/change', (account) => {
  console.log('Balance changed:', account);
});
```

Example payload when both requested fields changed:

```json
{
  "address": "U1234567890123456",
  "balance": "100000000",
  "unconfirmedBalance": "99900000"
}
```

The payload contains only subscribed fields that changed. Balance values use the same numeric account values as the REST
account API and are serialized as decimal strings in 1/10^8 ADM units.

`balance` is confirmed blockchain state. `unconfirmedBalance` includes the node's current unconfirmed pool and can change when
a transaction is received, confirmed, expired, rolled back, or revalidated. During block application and rollback, the node
coalesces internal pool rewinds and sends the final account state instead of transient intermediate values.
Rapid independent account updates can still produce closely spaced events whose asynchronous reads complete out of order.
Treat each payload as a live hint and reconcile important state through REST instead of relying on event order.

## Listening to new blocks

Enable block events with a scalar boolean:

```js
connection.on('connect', () => {
  connection.emit('blocks', true);
});

connection.on('newBlock', (block) => {
  console.log('Applied block:', block);
});
```

Example payload:

```json
{
  "id": "1739739671268673627",
  "height": 53532078,
  "timestamp": 278966175,
  "generatorPublicKey": "24636735d64711f91f7680bb348662bc74f7b3446e66702369527e3882dd30d6",
  "numberOfTransactions": 2,
  "totalAmount": 10000000,
  "totalFee": 100000,
  "reward": 10000000
}
```

The event contains a compact public block header without the transaction list, signature, or payload hash. It is emitted after
the complete block application pipeline succeeds. Historical blocks replayed from the node's existing database are not emitted.
Use the block ID or height with REST when full block or transaction data is required.

Send `connection.emit('blocks', false)` to stop block events for the current socket.
