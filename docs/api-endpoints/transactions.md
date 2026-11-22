# Transactions

Contains endpoints useful to interact with transactions of ADAMANT blockchain.

Every action in ADAMANT, a blockchain messenger, is a transaction — f. e., sending tokens, voting for delegate, storing contact list, or sending a message. See [Transaction Types](/api-types/transaction-types.md).

Transactions can be fetched with filtering and options using [Transactions Query Language](/api/transactions-query-language.md). To receive `asset` contents, set `returnAsset` to `1`.

## Get List of Transactions

```sh
GET /api/transactions
```

- **Description**

  To get the list of all transactions registered at the ADAMANT blockchain, use endpoint `/api/transactions`. The result includes a list of transactions with the following structure:

  - `id` — ID of transaction
  - `height` — block height where the transaction was forged
  - `blockId` — block ID where the transaction was forged
  - `type` — type of transaction. See [Transaction Types](/api-types/transaction-types.md).
  - `timestamp` — transaction timestamp, a 32-bit integer epoch timestamp (in seconds starting from Sep 02, 2017, 17:00:00 GMT+0000). Nodes do not accept transactions stamped in the future or more than 5 seconds in the past.
  - `timestampMs` — transaction timestamp in milliseconds set by the client; may be `null`. Used to display messages and transactions in the correct order. See [spaceship](/own-node/consensus.md#spaceship) consensus change.
  - `block_timestamp` — transaction's block timestamp. It is up to the client to interpret this field. It is recommended to take into account both `timestamp` and `block_timestamp` fields when determining transaction timestamp.
  - `senderPublicKey` — public key of sender
  - `senderId` — [ADAMANT address](/api-endpoints/accounts.md) of sender
  - `recipientId` — ADAMANT address of recipient
  - `recipientPublicKey` — public key of recipient
  - `amount` — amount to transfer in a 64-bit integer, 8 decimal points (100000000 equals to 1 ADM). For non-transfer transactions, this value is `0`.
  - `fee` — fee for operation. Depends on the type of transaction.
  - `signature` — transaction signature
  - `confirmations` — count of network confirmations — how many blocks were generated after this block on the current node's height.
  - `asset` — transaction data specific to different transaction/message types. See [ADAMANT Message Types](/api-types/message-types.md) and [Storing Data in KVS](/essentials/storing-data-in-kvs.md). Used also in [Signature calculation](/essentials/signing-transactions.md).

  Read more about the transaction structure in [AIP 10: General transaction structure for API calls](https://aips.adamant.im/AIPS/aip-10).

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/transactions?minAmount=100000000000001&and:fromHeight=2190516&limit=2
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 252493276,
    "transactions": [
      {
        "id": "5458692901234718347",
        "height": 37554230,
        "blockId": "13004968739774924049",
        "type": 0,
        "block_timestamp": 197143496,
        "timestamp": 197143496,
        "timestampMs": null,
        "senderPublicKey": "7b4eeff097203894753a0e62267fea580c31cea4631f8d4c9f1887a49a692022",
        "senderId": "U8898115149977182671",
        "recipientId": "U7843547643531057400",
        "recipientPublicKey": "8c9cdb5fbfa617df388647ce30217d45fb0e0b341ec0a3743d99b1029c030b60",
        "amount": 100996649833333,
        "fee": 50000000,
        "signature": "79d6c46a653fd5133842dc730218de63f31014c9b3881abe0c915f610cf924990647564e7f67023889145f71941b2350e38208bc7857ebfaee41bbd111e46b07",
        "signatures": [],
        "confirmations": 10991592,
        "asset": {}
      },
      {
        "id": "14769142577674268748",
        "height": 37206560,
        "blockId": "9377192623098204369",
        "type": 0,
        "block_timestamp": 195363165,
        "timestamp": 195363165,
        "timestampMs": null,
        "senderPublicKey": "f13ac504c5d6d8d32f654e2b42a3a0c74a95446acd6f7eefbe8d8d9c1a5677b4",
        "senderId": "U438236181740289346",
        "recipientId": "U11738346680567234000",
        "recipientPublicKey": "f345c2c447d9c8023ca1109684bfc3bf17d274b88c66fb0dde801565a49e8701",
        "amount": 700000000000000,
        "fee": 50000000,
        "signature": "ebb0e59212bfefc7f90ce6c84a5ebb031684527b34d33d208ec7bac4e24268045e964ff135da36f53eba79f326bbd00f5f2375a3972bca4610edff5eee488304",
        "signatures": [],
        "confirmations": 11339262,
        "asset": {}
      }
    ],
    "count": 22
  }
  ```

## Get Transaction by ID

```sh
GET api/transactions/get?id={id}
```

- **Description**

  Get information about a specific transaction using endpoint `/api/transactions/get` with the transaction `id` as a parameter.

- **Example**

  Request:

  ```sh
  GET https://ahead.adamant.im/api/transactions/get?id=12154642911137703318&returnAsset=1
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 63652999,
    "transaction": {
      "id": "12154642911137703318",
      "height": 3245671,
      "blockId": "13885000778367150465",
      "type": 8,
      "block_timestamp": 23284520,
      "timestamp": 23284514,
      "timestampMs": null,
      "senderPublicKey": "cdab95b082b9774bd975677c868261618c7ce7bea97d02e0f56d483e30c077b6",
      "senderId": "U15423595369615486571",
      "recipientId": "U12777528161244463452",
      "recipientPublicKey": "738a15db24bd055d65a449dee27508708a2c6b8457c3033fb5f389ac0e3b4c9e",
      "amount": 0,
      "fee": 100000,
      "signature": "8c846fbd41b84635283096bb5833745886760776a433bb050505aaf045efb0f97ce69cd9f108dc4e58392bb507848e1e75d6ea203e7c7904881c44d0f61e2901",
      "signatures": [],
      "confirmations": 8001268,
      "asset": {
        "chat": {
          "message": "6ef39d1034b368bd731c7bcbaa820f0e501bbfb1d1b15e2ffa4bd8421836fe87be10e32342e183d3",
          "own_message": "a23419efa40a9e340741325d0f5db508959c330af51e37fe",
          "type": 1
        }
      }
    }
  }
  ```

## Get Count of Transactions

```sh
GET /api/transactions/count
```

- **Description**

  Get the count of transactions with different states using endpoint `/api/transactions/count`. As a result, you'll receive:

  - `confirmed`
  - `unconfirmed`
  - `queued`

  When a node receives a new transaction, it is added to the transaction pool, where transactions are queued. A delegate then selects these queued transactions and includes them in a block. Until the network confirms the block, the transactions within it remain [unconfirmed](/api/websocket.md#understanding-unconfirmed-transactions).

  :::: warning
  Endpoint `/api/transactions/count` can return misleading `unconfirmed` and `queued` values. To get unconfirmed and queued transactions and their count, use [`/api/transactions/unconfirmed`](#get-unconfirmed-transactions) and [`/api/transactions/queued`](#get-queued-transactions) endpoints.
  ::::

  Unconfirmed and queued transactions can vary between different nodes.

  :::: tip
  Use unconfirmed and queued transactions judiciously, as they may never be included in the blockchain. There are limited use cases where retrieving unconfirmed and queued transactions is necessary.
  ::::

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/transactions/count
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 59979539,
    "confirmed": 256953,
    "multisignature": 0,
    "unconfirmed": 44,
    "queued": 42
  }
  ```

## Get Queued Transactions

```sh
GET /api/transactions/queued
```

- **Description**

  Get transactions that are in the node's queue with the endpoint `/api/transactions/queued`. As these transactions have not been included in the blockchain yet, they have no `blockId` and `height` fields, but have an additional `receivedAt` field.

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/transactions/queued
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 59979277,
    "transactions": [
      {
        "timestamp": 59979276,
        "timestampMs": null,
        "senderId": "U17362714543155685887",
        "recipientId": "U17819800352812315500",
        "type": 0,
        "senderPublicKey": "632816f2c44a08f282e85532443d73286cadc6d9820d5d25c9d50d8e01c668e0",
        "signature": "1db7e9111eaca790b73d51c32572739c46fcba3962aff55ca47ecf9a8c9fcb82c323de39ed60bc87d81a1245d43b5351b9dd44ad70128d78536250168b64c408",
        "amount": 100000000,
        "id": "16682447412632442981",
        "fee": 50000000,
        "relays": 1,
        "receivedAt": "2019-07-28T21:54:36.543Z"
      }
    ],
    "count": 1
  }
  ```

## Get Specific Queued Transaction

```sh
GET /api/transactions/queued/get?id={id}
```

- **Description**

  Get a specific transaction from the node's queue by its `id` using the endpoint `/api/transactions/queued/get`.

  :::: tip
  Typically, the time for a queued transaction to become unconfirmed and then confirmed is short. Therefore, the use cases for the `/api/transactions/queued/get` endpoint are limited.
  ::::

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/transactions/queued/get?id=16682447412632442981
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 153712825,
    "transaction": {
      "id": "16682447412632442981",
      "height": 10527806,
      "blockId": "2635215585577611518",
      "type": 0,
      "block_timestamp": 59979295,
      "timestamp": 59979276,
      "timestampMs": null,
      "senderPublicKey": "632816f2c44a08f282e85532443d73286cadc6d9820d5d25c9d50d8e01c668e0",
      "senderId": "U17362714543155685887",
      "recipientId": "U17819800352812315500",
      "recipientPublicKey": "28994b2cd075fd442e6ce78fa8c07966ed122932ff07411fed3c918e495586e2",
      "amount": 100000000,
      "fee": 50000000,
      "signature": "1db7e9111eaca790b73d51c32572739c46fcba3962aff55ca47ecf9a8c9fcb82c323de39ed60bc87d81a1245d43b5351b9dd44ad70128d78536250168b64c408",
      "signatures": [],
      "confirmations": 18431929,
      "asset": {}
    }
  }
  ```

## Get Unconfirmed Transactions

```sh
GET /api/transactions/unconfirmed
```

- **Description**

  Get transactions that are [unconfirmed](/api/websocket.md#understanding-unconfirmed-transactions) yet using the endpoint `/api/transactions/unconfirmed`. As these transactions have not been included in the blockchain yet, they have no `blockId` and `height` fields, but have an additional `receivedAt` field.

  :::: tip
  You can retrieve both confirmed and unconfirmed transactions in a single request using [`returnUnconfirmed`](/api/transactions-query-language.md#returnunconfirmed) option with the [`/api/transactions`](#get-list-of-transactions) endpoint.
  ::::

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/transactions/unconfirmed
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 58880320,
    "transactions": [
      {
        "type": 8,
        "amount": 9000000,
        "senderId": "U11987698782411545765",
        "senderPublicKey": "b87f9fe005c3533152230fdcbd7bf87a0cea83592c591f7e71be5b7a48bb6e44",
        "asset": {
          "chat": {
            "message": "6e69d547ce31dbbe0a5aba78c516e91d71e3b2",
            "own_message": "e1c00c2c8b8f59f49e176aef30915c6deba554f87c45951e",
            "type": 1
          }
        },
        "recipientId": "U5885317311990438076",
        "timestamp": 58880317,
        "timestampMs": null,
        "signature": "5ee972df476703492a667616eef428ed127e13fe5de8ba873b6579a806ddbd9fbd34147cf0321823d72e0d234466fc3dc89ebe7341e0b4a91a56b32d3bdb6a00",
        "id": "2521078418148431420",
        "fee": 50000000,
        "relays": 1,
        "receivedAt": "2019-07-16T04:38:38.492Z"
      }
    ],
    "count": 1
  }
  ```

## Get Specific Unconfirmed Transaction

```sh
GET /api/transactions/unconfirmed/get?id={id}
```

- **Description**

  Get a specific unconfirmed transaction by its `id` using the endpoint `/api/transactions/unconfirmed/get`.

  :::: tip
  Typically, the time for a unconfirmed transaction to become confirmed is short. Therefore, the use cases for the `/api/transactions/unconfirmed/get` endpoint are limited.

  You can retrieve a transaction in both confirmed and unconfirmed states using [`returnUnconfirmed`](/api/transactions-query-language.md#returnunconfirmed) option with the [`api/transactions/get`](#get-transaction-by-id) endpoint.
  ::::

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/transactions/unconfirmed/get?id=8958126469643732641
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 63137669,
    "transaction": {
      "type": 8,
      "amount": 0,
      "senderId": "U15677078342684640219",
      "senderPublicKey": "e16e624fd0a5123294b448c21f30a07a0435533c693b146b14e66830e4e20404",
      "asset": {
        "chat": {
          "message": "75582d940f2c4093929c99a6c1911b4753",
          "own_message": "58dceaa227b3fb1dd1c7d3fbf3eb5db6aeb6a03cb7e2ec91",
          "type": 1
        }
      },
      "recipientId": "U16655734187932477074",
      "timestamp": 63137661,
      "timestampMs": null,
      "signature": "e25f1aba994c7f07c03099edcbe0ada19df371ddf1a829dae8dee36ab809ce8a438111bf65056c813e9dc832a890a081ba1cd295d37e509f62f042149e62e30d",
      "id": "8958126469643732641",
      "fee": 100000,
      "relays": 1,
      "receivedAt": "2019-09-03T11:14:22.638Z"
    }
  }
  ```

## Register Token Transfer Transaction

```sh
POST /api/transactions/process
```

- **Description**

  Use the endpoint `/api/transactions/process` to broadcast transactions of [type 0 — Token transfer](/api-types/transaction-types.md#type-0-token-transfer-transaction), and [type 8 — Chat/Message](/api-types/transaction-types.md#type-8-chat-message-transaction).

  To make an in-chat ADM token transfer with a comment, you can also use [Register Chat Message Transaction](/api-endpoints/chatrooms.md#register-chat-message-transaction) or universal [Register Transaction](#register-transaction) endpoints.

  Make a _POST_ request to the endpoint, with the payload of [transaction object](/api-endpoints/transactions.md#get-list-of-transactions), where:

  - `type` is set to `0`
  - `asset` is empty
  - `amount` is integer measured in 1/10<sup>8</sup> ADM (1 ADM = 100,000,000)

  Transaction must be [formed and signed](/essentials/signing-transactions.md).

  As a successful result, you'll get the ID of the transaction registered in the ADAMANT blockchain.

- **Example**

  Request:

  ```sh
  POST https://endless.adamant.im/api/transactions/process
  ```

  ```json
  {
    "transaction": {
      "type": 0,
      "amount": 100000000,
      "senderId": "U14236667426471084862",
      "senderPublicKey": "8cd9631f9f634a361ea3b85cbd0df882633e39e7d26d7bc615bbcf75e41524ef",
      "recipientId": "U16655734187932477074",
      "timestamp": 63228852,
      "timestampMs": null,
      "signature": "b3982d603be8f0246fa663e9f012bf28b198cd28f82473db1eb4a342d890f7a2a2c1845db8d256bb5bce1e64a9425822a91e10bf960a2e0b55e20b4841e4ae0b"
    }
  }
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 63228852,
    "transactionId": "6146865104403680934"
  }
  ```

## Register Transaction

```sh
POST /api/transactions
```

- **Description**

  Use the universal endpoint `/api/transactions` to broadcast transactions of [any type](/api-types/transaction-types.md). This endpoint can be used instead of:

  - [Register Vote for Delegate Transaction](/api-endpoints/delegates.md#register-vote-for-delegate-transaction)
  - [Register Token Transfer Transaction](#register-token-transfer-transaction)
  - [Register Store in KVS Transaction](/api-endpoints/kvs.md#register-store-in-kvs-transaction)
  - [Register Chat Message Transaction](/api-endpoints/chatrooms.md#register-chat-message-transaction)

  Make a _POST_ request to the endpoint, with the payload of [transaction object](/api-endpoints/transactions.md#get-list-of-transactions). Transaction must be [formed and signed](/essentials/signing-transactions.md).

  As a successful result, you'll get the ID of the transaction registered in the ADAMANT blockchain.

- **Example**

  Request:

  ```sh
  POST https://endless.adamant.im/api/transactions
  ```

  ```json
  {
    "transaction": {
      "type": 0,
      "amount": 100000000,
      "senderId": "U14236667426471084862",
      "senderPublicKey": "8cd9631f9f634a361ea3b85cbd0df882633e39e7d26d7bc615bbcf75e41524ef",
      "recipientId": "U16655734187932477074",
      "timestamp": 63228852,
      "timestampMs": null,
      "signature": "b3982d603be8f0246fa663e9f012bf28b198cd28f82473db1eb4a342d890f7a2a2c1845db8d256bb5bce1e64a9425822a91e10bf960a2e0b55e20b4841e4ae0b"
    }
  }
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 63228852,
    "transactionId": "6146865104403680934"
  }
  ```
