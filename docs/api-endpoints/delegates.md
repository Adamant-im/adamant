# Delegates and Voting

Endpoints useful in working with delegate system of ADAMANT blockchain — [Fair dPoS](https://news.adamant.im/fair-delegate-system-in-dpos-568e5c3c86c8).

::: info Forging control
Forging is configured exclusively through `forging.secret` in the node configuration (with optional operator-password encryption managed via the local `adm-node` CLI). Legacy HTTP forging control routes (`enable`, `disable`, `status`, `enableAll`, `disableAll`) were removed in v0.11.0. See [Forging Configuration](/own-node/configuration.md#forging-configuration).
:::

## Get Delegates

```sh
GET /api/delegates
```

- **Description**

  Endpoint `/api/delegates` retrieves a list of registered ADAMANT delegates with the `totalCount` value.

  Available parameters:

  - `limit` — how many delegates to retrieve, integer. Default is 101 (active/forging delegates).
  - `offset` — offset value for results, integer. Default is 0.

  Each delegate is presented by:

  - `username` — unique delegate's nickname, string
  - `rank` — current position in the list of delegates
  - `rate` — current rate position in the list of delegates
  - `approval` — share of votes of all votes in the system
  - `address` — delegate's [ADAMANT address](/api-endpoints/accounts.md)
  - `publicKey` — public key of a delegate
  - `vote` — vote weight (obsolete, not used)
  - `votesWeight` — vote weight (Fair Delegate System)
  - `producedblocks` — count of produced blocks
  - `missedblocks` — count of missed blocks
  - `productivity` — productivity/uptime of delegate. Will be `0` if the delegate is not active.
  - `forged` — lifetime sum of block fees and rewards as a base-10 integer string in base units
    (`1 ADM = 100000000`)

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/delegates?offset=101&limit=2
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 61762271,
    "delegates": [
      {
        "username": "donald_trump",
        "address": "U13367877040303579440",
        "publicKey": "8d844340f42ab68a95c385620b9cda64537297cb78fc899d051058e3b7fdacc1",
        "vote": "37577883802740",
        "votesWeight": "37496691795141",
        "producedblocks": 35722,
        "missedblocks": 73,
        "rate": 102,
        "rank": 102,
        "approval": 0.37,
        "productivity": 0,
        "forged": "182540750000000"
      },
      {
        "username": "bcboilermaker",
        "address": "U8782236344013228528",
        "publicKey": "f3fddc1ed168dff7d658bc93a13e8954b310367718d7c55d0635ffeb5e7b8636",
        "vote": "110714610315343",
        "votesWeight": "36198972216285",
        "producedblocks": 53828,
        "missedblocks": 741,
        "rate": 103,
        "rank": 103,
        "approval": 0.35,
        "productivity": 0,
        "forged": "275118500000000"
      }
    ],
    "totalCount": 254
  }
  ```

## Get Delegate

```sh
GET /api/delegates/get
```

- **Description**

  Get delegate using endpoint `/api/delegates/get` with one of the parameters:

  - `username`
  - `publicKey`
  - `address`

  [Delegate](#get-delegates) is returned.

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/delegates/get?username=lynx
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 66346841,
    "delegate": {
      "username": "lynx",
      "address": "U11651572364276578835",
      "publicKey": "ef5e78a3d02e6d82f4ac0c5b8923c1b86185bd17c27c9ac027c20ec62db79a84",
      "vote": "192823791678106",
      "votesWeight": "49777782590711",
      "producedblocks": 40184,
      "missedblocks": 591,
      "rate": 52,
      "rank": 52,
      "approval": 0.48,
      "productivity": 98.55,
      "forged": "204763350000000"
    }
  }
  ```

## Search for Delegates

```sh
GET /api/delegates/search?q={searchCriteria}
```

- **Description**

  Search delegates by `username` (or part of it) using endpoint `/api/delegates/search` with parameter `q` for nickname.

  Result includes the core [delegate fields](#get-delegates), except the lifetime `forged` amount, with additional
  fields:

  - `voters_cnt` — count of accounts who vote for the delegate
  - `register_timestamp` — epoch timestamp of when the delegate registered

  Value `totalCount` is not returned.

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/delegates/search?q=ly
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 58048977,
    "delegates": [
      {
        "rank": 90,
        "username": "lynx",
        "address": "U11651572364276578835",
        "publicKey": "ef5e78a3d02e6d82f4ac0c5b8923c1b86185bd17c27c9ac027c20ec62db79a84",
        "vote": "165822120828934",
        "votesWeight": "37010830605858",
        "producedblocks": 24269,
        "missedblocks": 81,
        "approval": 1.63,
        "productivity": 99.67,
        "voters_cnt": 12,
        "register_timestamp": 45523238
      },
      {
        "rank": 138,
        "username": "truly",
        "address": "U5341484442225629606",
        "publicKey": "8aad15185bd8a9bc6e690d11f9ca876bc9aa8223b21f198065124438e164e10d",
        "vote": "8712456793412",
        "votesWeight": "99328729204",
        "producedblocks": 61107,
        "missedblocks": 270,
        "approval": 0.09,
        "productivity": 99.56,
        "voters_cnt": 81,
        "register_timestamp": 0
      }
    ]
  }
  ```

## Get Delegates Count

```sh
GET /api/delegates/count
```

- **Description**

  Get total count of delegates in ADAMANT's delegate system with endpoint `/api/delegates/count`. The success response will contain `count` of registered delegates.

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/delegates/count
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 58049193,
    "count": 254
  }
  ```

## Get Delegate Stats

```sh
GET /api/delegates/forging/getForgedByAccount?generatorPublicKey={generatorPublicKey}
```

- **Description**

  Forging activity of a delegate can be retrieved using endpoint `/api/delegates/forging/getForgedByAccount` with parameter `generatorPublicKey` representing the delegate's [`publicKey`](/api-endpoints/accounts.md#get-account-public-key). In case of success, you'll get information:

  - `fees` — total sum of fees forged by delegate
  - `rewards` — total sum of rewards made by delegate
  - `forged` — total sum of forged tokens

  All values are of integer amount of 1/10^8 ADM tokens (1 ADM = 100000000).

- **Parameters**

  Additional parameters for the endpoint:

  - `start` — Unix timestamp (in seconds) for the start date
  - `end` — Unix timestamp (in seconds) for the end date

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/delegates/forging/getForgedByAccount?generatorPublicKey=a9407418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 58051994,
    "fees": "586039475511",
    "rewards": "3943485000000",
    "forged": "4529524475511"
  }
  ```

## Get Next Forgers

```sh
GET /api/delegates/getNextForgers
```

- **Description**

  Endpoint `/api/delegates/getNextForgers` returns a snapshot of the next forgers for the current chain tip.
  The `delegates` array is ordered by upcoming slots using the delegate schedule for `currentBlock + 1`, including
  when `currentBlock` closes a round. All entries in one response use this next-block schedule because the block
  height advances only after a block is accepted. Request a new snapshot after the node accepts another block.

  The response includes:

  - `currentBlock` — current [blockchain height](/api-endpoints/blockchain.md#get-blockchain-height)
  - `currentBlockSlot` — current block slot number
  - `currentSlot` — current slot number
  - `delegates` — array of next forgers' public keys ordered by upcoming slots

  Available parameters:

  - `limit` — number of public keys to retrieve, from 1 to 101. Default is 10.

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/delegates/getNextForgers
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 58052115,
    "currentBlock": 10146268,
    "currentBlockSlot": 11610422,
    "currentSlot": 11610423,
    "delegates": [
      "677c6db63548c99674fed0571da522a6a9569d0c1da9669734a3625645519641",
      "150d638714f65845b50f1ff58f3da2c2baa3a1dc8bf59a9884c10da5a8e951c6",
      "134a5de88c7da1ec71e75b5250d24168c6c6e3965ff16bd71497bd015d40ea6a",
      "15855ee1244a12560af0159ccd3ee1461b13819030724fe80566466f3ea5f467",
      "464f7e220592c144a317345d31db10c51affb144a921f2f24b2525360203f44f",
      "54428cfd871bb75a37a9f81614039008bc4d0811b38f721a38c37fb535af407b",
      "6bd642386a561027e52d5339f78d5985539ab069ada280b96d81ed9591581439",
      "6db519ac5ff7c62f91616bb742228450dd2d570be350b106c9b420f11df0894b",
      "c0c580c3fb89409f32181fef58935f286f0c1bbf61bd727084ed915b3a4bc95b",
      "331d76a735ae7a2a671774fae4bf19a095d366a2a51da25020edd4007f99541c"
    ]
  }
  ```

## Get Voters

```sh
GET /api/delegates/voters?publicKey={publicKey}
```

- **Description**

  Get the list of a delegate's voters using endpoint `/api/delegates/voters` with parameter `publicKey` representing the delegate's [`publicKey`](/api-endpoints/accounts.md#get-account-public-key). A successful response will contain:

  - `address` — voter's ADAMANT address
  - `publicKey` — voter's public key
  - `username` — voter's delegate username. `null` if `address` is not a delegate.
  - `balance` — ADM balance of voter's ADAMANT wallet. Integer amount of 1/10^8 ADM tokens (1 ADM = 100000000).

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/delegates/voters?publicKey=a9407418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 58049363,
    "accounts": [
      {
        "username": "leg",
        "address": "U12609717384103730908",
        "publicKey": "559418798f67a81b7f893aa8eab1218b9838a6b0bcd2bc8968c6d490ae0d5d77",
        "balance": "506697"
      },
      {
        "username": "thunder",
        "address": "U3247657843720097949",
        "publicKey": "fc7151dcc08bda712c075fbfc524e10828bbbaad56ac4001cd3f5a9b93b2ea27",
        "balance": "507872"
      }
    ]
  }
  ```

## Get Vote Data for Account

```sh
GET /api/accounts/delegates?address={ADAMANT address}
```

- **Description**

  To get current votes of a specific ADAMANT account, use `/api/accounts/delegates` endpoint with ADAMANT `address` parameter.
  The response will include a list of [delegates](#get-delegates) that the account has voted for.

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/accounts/delegates?address=U777355171330060015
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 58044952,
    "delegates": [
      {
        "username": "million",
        "address": "U777355171330060015",
        "publicKey": "a9407418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34",
        "vote": "164286404703970",
        "votesWeight": "37611676759702",
        "producedblocks": 100493,
        "missedblocks": 297,
        "rate": 85,
        "rank": 85,
        "approval": 0.37,
        "productivity": 99.71
      }
    ]
  }
  ```

## Register Delegate Transaction

```sh
POST /api/delegates
```

- **Description**

  Use endpoint `/api/delegates` to broadcast transactions of [type 2 — Delegate Registration](/api-types/transaction-types.md#type-2-delegate-registration-transaction). Make _POST_ request to the endpoint, with payload of [transaction object](/api-endpoints/transactions.md#get-list-of-transactions), where:

  - `type` is set to `2`
  - `recipientId` = `null`
  - `recipientPublicKey` = `null`
  - `asset` sets information for a new delegate: `username` and `publicKey`

  Transaction must be [formed and signed](/essentials/signing-transactions.md).

  As a successful result, you'll get the transaction registered in the ADAMANT blockchain.

- **Example**

  Request:

  ```sh
  POST https://endless.adamant.im/api/delegates
  ```

  ```json
  {
    "type": 2,
    "timestamp": 166805250,
    "timestampMs": null,
    "amount": 0,
    "senderPublicKey": "a339974effc141f302bd3589c603bdc9468dd66bcc424b60025b36999eb69ca3",
    "senderId": "U3031563782805250428",
    "asset": {
      "delegate": {
        "username": "kpeo",
        "publicKey": "a339974effc141f302bd3589c603bdc9468dd66bcc424b60025b36999eb69ca3"
      }
    },
    "recipientId": null,
    "signature": "c2e4a3ef7f0d363611a2b22b96feff269f1a0cbb61741a2ce55756bb9324826092fd9bff6348145e3cc384c097f101a493b9136da5236292ecf8b1ed6657dd01"
  }
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 166805153,
    "transaction": {
      "type": 2,
      "timestamp": 166805152,
      "timestampMs": null,
      "amount": 0,
      "senderPublicKey": "a339974effc141f302bd3589c603bdc9468dd66bcc424b60025b36999eb69ca3",
      "senderId": "U3031563782805250428",
      "asset": {
        "delegate": {
          "username": "kpeo",
          "publicKey": "a339974effc141f302bd3589c603bdc9468dd66bcc424b60025b36999eb69ca3"
        }
      },
      "signature": "1833a86e24d57ad6dbd30c47924500a03096fd06076fafe5bca4f23ab4629268f3b1a58a1ce275356bc0b79f64a11b8abe9bec6c3d55202d6393327f9278910b",
      "id": "14674137414602658194",
      "fee": 300000000000,
      "relays": 1,
      "receivedAt": "2022-12-16T07:45:53.717Z"
    }
  }
  ```

## Register Vote for Delegate Transaction

```sh
POST /api/accounts/delegates
```

- **Description**

  Use endpoint `/api/accounts/delegates` to broadcast transactions of [type 3 — Vote for Delegate](/api-types/transaction-types.md#type-3-vote-for-delegate-transaction). Make _POST_ request to the endpoint, with payload of [transaction object](/api-endpoints/transactions.md#get-list-of-transactions), where:

  - `type` is set to `3`
  - `senderId` = `recipientId`, ADAMANT address of the account who votes
  - `asset` represents `votes` array with publicKeys. For upvote, add leading `+` to delegate's publicKey. For downvote, add leading `-` to delegate's publicKey.

  Transaction must be [formed and signed](/essentials/signing-transactions.md).

  As a success result, you'll get the transaction registered in the ADAMANT blockchain.

- **Example**

  Request:

  ```sh
  POST https://endless.adamant.im/api/accounts/delegates
  ```

  ```json
  {
    "asset": {
      "votes": [
        "+b3d0c0b99f64d0960324089eb678e90d8bcbb3dd8c73ee748e026f8b9a5b5468",
        "-9ef1f6212ae871716cfa2d04e3dc5339e8fe75f89818be21ee1d75004983e2a8"
      ]
    },
    "recipientId": "U14236667426471084862",
    "amount": 0,
    "type": 3,
    "senderId": "U14236667426471084862",
    "senderPublicKey": "8cd9631f9f634a361ea3b85cbd0df882633e39e7d26d7bc615bbcf75e41524ef",
    "timestamp": 63394407,
    "timestampMs": null,
    "signature": "7f4f5d240fc66da1cbdb3fe291d6fcec006848236355aebe346fcd1e3ba500caeac1ed0af6f3d7f912a889a1bbedc1d7bab17b6ebd36386b81df78189ddf7c07"
  }
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 63394408,
    "transaction": {
      "asset": {
        "votes": [
          "+b3d0c0b99f64d0960324089eb678e90d8bcbb3dd8c73ee748e026f8b9a5b5468",
          "-9ef1f6212ae871716cfa2d04e3dc5339e8fe75f89818be21ee1d75004983e2a8"
        ]
      },
      "recipientId": "U14236667426471084862",
      "amount": 0,
      "type": 3,
      "senderId": "U14236667426471084862",
      "senderPublicKey": "8cd9631f9f634a361ea3b85cbd0df882633e39e7d26d7bc615bbcf75e41524ef",
      "timestamp": 63394407,
      "timestampMs": null,
      "signature": "7f4f5d240fc66da1cbdb3fe291d6fcec006848236355aebe346fcd1e3ba500caeac1ed0af6f3d7f912a889a1bbedc1d7bab17b6ebd36386b81df78189ddf7c07",
      "id": "13616514419605573351",
      "fee": 5000000000,
      "relays": 1,
      "receivedAt": "2019-09-06T10:33:28.054Z"
    }
  }
  ```
