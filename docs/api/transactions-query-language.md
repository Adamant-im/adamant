# Transactions Query Language

To expand opportunities of getting transactions use parameters to filter results and options.

Filters available for endpoints:

- [**`/api/transactions`**](/api-endpoints/transactions.md): `blockId`, `fromHeight`, `toHeight`, `minAmount`, `maxAmount`, `senderId`, `senderIds`, `recipientId`, `recipientIds`, `senderPublicKey`, `senderPublicKeys`, `recipientPublicKey`, `recipientPublicKeys`, `inId`, `type`, `types`
- [**`/api/chats/get`**](/api-endpoints/chatrooms.md#get-chat-transactions): `fromHeight`, `toHeight`, `senderId`, `recipientId`, `inId`, `isIn`, `type`
- [**`/api/chatrooms`**](/api-endpoints/chatrooms.md#get-list-of-chats): `senderId`, `recipientId`, `type`
- [**`/api/states/get`**](/api-endpoints/kvs.md#get-states): `fromHeight`, `toHeight`, `senderId`, `senderIds`, `key`, `keyIds`, `type`

You can use `limit`, `offset`, `orderBy` and `returnUnconfirmed` [options](#available-options). There are additional options for endpoints:

- [**`/api/transactions`**](/api-endpoints/transactions.md): `returnAsset`
- [**`/api/chats/get`**](/api-endpoints/chatrooms.md#get-chat-transactions): `includeDirectTransfers`
- [**`/api/chatrooms`**](/api-endpoints/chatrooms.md#get-list-of-chats): `includeDirectTransfers`

Filters and options can be joined: [Combine filters and options](#combine-filters-and-options).

## Available filter parameters

### `blockId`

Get transactions in specific block.

- **Example**

  `http://endless.adamant.im/api/transactions?blockId=7917597195203393333`

### `fromHeight`

Get transactions starting from block with specific height.

- **Example**

  `http://endless.adamant.im/api/transactions?fromHeight=10336065`

### `toHeight`

Get transactions till block with specific height.

- **Example**

  `http://endless.adamant.im/api/transactions?toHeight=11`

### `minAmount`

Get transactions with amount not less than specified Integer value of 1/10<sup>8</sup> tokens (1 ADM = 100,000,000).

- **Example**

  `http://endless.adamant.im/api/transactions?minAmount=1000000000000001`

### `maxAmount`

Get transactions with amount not more than specified Integer value of 1/10<sup>8</sup> tokens (1 ADM = 100,000,000).

- **Example**

  `http://endless.adamant.im/api/transactions?maxAmount=50000000`

### `senderId`

Get transactions sent from specified ADAMANT address.

- **Example**

  `https://endless.adamant.im/api/transactions?senderId=U15423595369615486571`

### `senderIds`

Get transactions sent from specified ADAMANT addresses, separated by commas.

:::: tip

Available for `/api/transactions` and `/api/states/get` endpoints only.

::::

- **Example**

  `https://debate.adamant.im/api/transactions?senderIds=U18132012621449491414,U15881344309699504778`

### `recipientId`

Get transactions received by specified ADAMANT address.

- **Example**

  `https://endless.adamant.im/api/transactions?recipientId=U15423595369615486571`

### `recipientIds`

Get transactions received by specified ADAMANT addresses, separated by commas.

:::: tip

Available for `/api/transactions` endpoint only.

::::

- **Example**

  `https://debate.adamant.im/api/transactions?recipientIds=U18132012621449491414,U15881344309699504778`

### `senderPublicKey`

Get transactions sent from specified ADAMANT account by public key.

**NOTE**: Available for `/api/transactions` endpoint only.

- **Example**

  `https://debate.adamant.im/api/transactions?senderPublicKey=801846655523f5e21f2d454b2f98f70aaf5d3887c806463100a1764a4e7c1457`

### `senderPublicKeys`

Get transactions sent from specified ADAMANT account by public keys, separated by commas.

:::: tip

Available for `/api/transactions` endpoint only.

::::

- **Example**

  `https://ahead.adamant.im/api/transactions?senderPublicKeys=801846655523f5e21f2d454b2f98f70aaf5d3887c806463100a1764a4e7c1457,125a9b8304ef885053c630041f57493343d7f6023107c5dc8b8148147e732c93`

### `recipientPublicKey`

Get transactions received by specified ADAMANT account by public key.

:::: tip

Available for `/api/transactions` endpoint only.

::::

- **Example**

  `https://debate.adamant.im/api/transactions?recipientPublicKey=801846655523f5e21f2d454b2f98f70aaf5d3887c806463100a1764a4e7c1457`

### `recipientPublicKeys`

Get transactions received by specified ADAMANT account by public keys, separated by commas.

:::: tip

Available for `/api/transactions` endpoint only.

::::

- **Example**

  `https://ahead.adamant.im/api/transactions?recipientPublicKeys=801846655523f5e21f2d454b2f98f70aaf5d3887c806463100a1764a4e7c1457,125a9b8304ef885053c630041f57493343d7f6023107c5dc8b8148147e732c93`

### `inId`

Get transactions sent from or received to specified ADAMANT address.

- **Example**

  `http://endless.adamant.im/api/transactions?inId=U100739400829575109`

### `type`

Parameter meaning depends on endpoint:

- `/api/transactions`: Get transactions of specified type. See [Transaction Types](/api-types/transaction-types.md). If type is not set, all types of transactions will be returned.
- `/api/chats/get` and `/api/chatrooms`: Get messages of specified type. See [ADAMANT Message Types](/api-types/message-types.md). If type is not set, all types of messages will be returned.
- `/api/states/get`: Get KVS records of incremental or full re-write of previous values. Default is `0`. See [AIP 11: Behavior for KVS data](https://aips.adamant.im/AIPS/aip-11).

- **Examples**

  To get message transactions:

  `https://endless.adamant.im/api/transactions?type=8`

  To get Rich messages:

  `https://endless.adamant.im/api/chats/get?type=2`

  or

  `https://endless.adamant.im/api/chatrooms/U17362714543155685887/U17819800352812315500?type=2`

### `types`

Get transactions of specified types, separated by commas. See [Transaction Types](/api-types/transaction-types.md).

:::: tip

Available for `/api/transactions` endpoint only.

::::

- **Example**

  `https://debate.adamant.im/api/transactions?types=9,0`

### `key`

Refers to `/api/states/get` endpoint.

Get transactions of specified KVS key. See [AIP 3: Storing data in chain (KVS)](https://aips.adamant.im/AIPS/aip-3).

- **Example**

  `https://endless.adamant.im/api/states/get?key=eth:address&senderId=U14236667426471084862&orderBy=timestamp:desc`

### `keyIds`

Refers to `/api/states/get` endpoint.

Get transactions of specified KVS keys. Combine with `senderIds` to fetch multiple values for multiple accounts, like public bound coin addresses for contact list.

- **Example**

  `https://ahead.adamant.im/api/states/get?keyIds=eth:address,doge:address,dash:address,btc:address&senderIds=U3461022864428928223,U17790659840463725618,U43512412354440829,U10666556853857590034,U15677078342684640219,U10879891600431315092,U15677078342684640219,U16189664252187503076,U15738334853882270577,U11051173936218114255,U5149447931090026688,U18064911620565010636,U11962817086029207137,U14236667426471084862,U3857204090751960756,U18290410688451164219,U15506276306084215695,U18009522315196199993,U17325711452096864732,U16634908687170714645,U9203183357885757380,U12382044996701379416,U3938345682225572184,U116971041436569303,U11163081294512846715,U5517006347330072401,U7972131227889954319,U7578227434840718692&orderBy=timestamp:desc`

## Available options

Options can be combined.

### `limit`

Limits returned items count. Default is `100` for transactions and `25` for Chatrooms.

- **Example**

  `https://endless.adamant.im/api/transactions?limit=2`

### `offset`

Offset value for results, integer. Default is `0`.

- **Example**

  `https://endless.adamant.im/api/transactions?offset=100`

### `orderBy`

Ordering request results by field name.

When ordering by `timestamp`, upgraded nodes prefer `timestampMs` when it is available and fall back to `timestamp * 1000`. This affects transaction, chat, chatroom, and KVS/state listing endpoints that expose timestamp ordering. `timestampMs` is available only for transactions that include it and, for consensus-stored blockchain data, after the `spaceship` activation.

- **Example**

  `https://endless.adamant.im/api/transactions?orderBy=timestamp:desc`

### `returnUnconfirmed`

Includes unconfirmed transactions when set to `1`. All filters and **ordering** are applied to unconfirmed transactions as well. The default value is `0`.

:::: warning
When using `blockId` or `toHeight` filters, unconfirmed transactions are NOT returned.
::::

- **Example**

  `https://endless.adamant.im/api/transactions?fromHeight=100000&returnUnconfirmed=1`

### `returnAsset`

Get transaction's `asset` when set to `1`. Default is `0`.

:::: tip

Available for `/api/transactions` endpoint only. Endpoints `/api/chats/get`, `/api/chatrooms` and `/api/states/get` always do return `asset` field.

::::

- **Example**

  `https://endless.adamant.im/api/transactions/get?id=13920471299012339255&returnAsset=1`

### `includeDirectTransfers`

When set to `0`, excludes type `0` transactions (direct token transfers) from results. Default is `1` for `/api/chatrooms` and `0` for `/api/chats/get`.

:::: tip

Available for `/api/chatrooms` and `/api/chats/get` endpoints only.

::::

- **Examples**

  `https://endless.adamant.im/api/chatrooms/U2707535059340134112?includeDirectTransfers=0`

  `https://endless.adamant.im/api/chats/get?senderId=U2707535059340134112?includeDirectTransfers=1`

## Combine filters and options

You can filter by single parameter, or by multiple parameters. Default condition `and` or `or` differs by endpoint:

- `/api/transactions`: default is `or`; supports both `and:` and `or:` prefixes
- `/api/chats/get`: **AND-only** (accepts plain names and `and:` prefixes; rejects `or:`)
- `/api/chatrooms`: **AND-only** (accepts plain names and `and:` prefixes; rejects `or:`)
- `/api/states/get` (`GET` and `POST`): **AND-only** (accepts plain names and `and:` prefixes; rejects `or:`)

Options always join with `and`.

::: warning Strict AND-only filter validation in v0.11.0
On `/api/states/get` (`GET` and `POST`), `/api/chats/get`, and `/api/chatrooms/*`, `and:`-prefixed parameters are normalized to their plain field names (for example `and:senderId` behaves identically to `senderId`, and `and:key` identically to `key`). The node strictly rejects:

- Any `or:`-prefixed parameter (`OR filters are not supported`)
- Any other colon-prefixed or unknown query parameter (for example passing `userId` as a query parameter on `/api/chatrooms/{address}`, where the account address is part of the URL path)
- Passing both a plain parameter and its `and:` alias with conflicting values (for example `senderId=U1...&and:senderId=U2...`)
:::

For `/api/transactions` confirmed queries, you can prefix filters with `and:` or `or:` to control how they are joined, and the node composes the resulting filter chain into one flat SQL `WHERE` expression:

1. Filters are appended in the same order in which they appear in the query string.
2. The first filter starts the expression, so its `and:` or `or:` prefix does not change the result.
3. The node does not add grouping parentheses around mixed `and:`/`or:` conditions.
4. Standard SQL precedence applies inside the flat expression: `AND` is evaluated before `OR`.

This makes parameter order significant. The same filters can return different transactions when they are reordered:

| Query string | Effective condition |
| --- | --- |
| `and:inId=U100739400829575109&and:minAmount=1&or:types=0,1,2,3,4,5,6,7` | `(inId AND minAmount) OR types` |
| `or:types=0,1,2,3,4,5,6,7&and:inId=U100739400829575109&and:minAmount=1` | `types AND inId AND minAmount` |
| `or:minAmount=1&and:types=0,1,2,3,4,5,6,7` | `minAmount AND types` |
| `and:types=0,1,2,3,4,5,6,7&or:minAmount=1` | `types OR minAmount` |

Grouping is not supported. You can express `(A AND B) OR C` by placing the `or:` condition after the
`and:` conditions, but you cannot express `A AND (B OR C)` in one request.

Be careful when adding `or:` filters to an address filter. For example, this request returns transactions for
`U100739400829575109` with a positive amount and also every transaction of types `0` through `7`, including
transactions unrelated to that address:

```url
https://endless.adamant.im/api/transactions?and:inId=U100739400829575109&and:minAmount=1&or:types=0,1,2,3,4,5,6,7
```

If the address must apply to all returned transactions, keep every additional filter joined with `and:` or make
separate requests for logical shapes that need grouping.

- **Examples**

  Get transactions where height greater than `1336065` **or** `blockId = 7917597195203393333`:

  ```
  https://endless.adamant.im/api/transactions?fromHeight=1336065&blockId=7917597195203393333
  ```

  Get transactions where height greater than `1336065` **and** `senderId = U15423595369615486571`, order by `timestamp` ascending and limit results by `2` transactions:

  ```
  https://endless.adamant.im/api/transactions?fromHeight=1336065&and:senderId=U15423595369615486571&limit=2&orderBy=timestamp:asc
  ```

  Get type `9` **or** type `0` transactions where `senderId = U18132012621449491414` **or** `senderId = U15881344309699504778`, order by `timestamp` descending:

  ```
  https://debate.adamant.im/api/transactions?senderIds=U18132012621449491414,U15881344309699504778&and:types=9,0&orderBy=timestamp:desc
  ```
