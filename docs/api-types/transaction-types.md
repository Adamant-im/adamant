# Transaction Types

Transactions are an essential part of the ADAMANT blockchain. They represent different types of data recorded on the blockchain on behalf of an account. Transactions can be used for sending messages or tokens, receiving push notifications, storing data, and much more.

## General transaction structure

> AIP 10: [General transaction structure for API calls](https://aips.adamant.im/AIPS/aip-10)

Although each transaction type has its own structure and required properties, all transactions share the following common properties:

- `id` — Transaction ID, generated from the transaction data
- `height` — Block height number in which the transaction was forged
- `blockId` — Block ID that includes the transaction and was forged
- `type` — Transaction type
- `timestamp` — Transaction time specified by the sender, measured in seconds since the epoch (Sep 02, 2017, 17:00:00 GMT+0000)
- `timestampMs` — Optional transaction time specified by the sender, measured in milliseconds since the ADAMANT epoch. After the `spaceship` consensus activation, upgraded nodes can store and return this field for transactions that include it. It is not included in transaction signatures or IDs. When present, it belongs to the same ADAMANT second as `timestamp`; clients should create `timestamp` with `Math.floor(timestampMs / 1000)`, prefer `timestampMs` for ordering, and fall back to `timestamp * 1000` when it is missing.
- `block_timestamp` — Transaction's block timestamp. It's up to the client how to interpret this field. It's recommended to consider both `timestamp` and `block_timestamp` when determining the transaction timestamp
- `senderPublicKey` — Sender's public key in hex
- `senderId` — Sender's ADAMANT address
- `recipientPublicKey` — Recipient's public key in hex
- `fee` — Transaction fee, depending on the transaction type and asset size
- `signature` — Cryptographic signature generated using the sender's private key

## Type 0: Token Transfer Transaction

Token Transfer Transaction is used for transferring ADM tokens between accounts.

- **Properties**

  - `type` — Must be `0`
  - `amount` — Amount to be transferred in 1/10⁸ ADM tokens (1 ADM = 100000000)
  - `fee` — Must be `50000000` (0.5 ADM)
  - `asset` — Must be empty

- **API Endpoints**

  To get transfer transactions, use [`/api/transactions`](/api-endpoints/transactions.md#get-list-of-transactions) endpoint.

  To post new Token Transfer transaction, you can use the endpoints:

  - [`/api/transactions/process`](/api-endpoints/transactions.md#register-token-transfer-transaction)
  - [`/api/transactions`](/api-endpoints/transactions.md#register-transaction)

- **Example**

  ```json{8,15,16,20}
  {
    "success": true,
    "nodeTimestamp": 63653372,
    "transaction": {
      "id": "18403419073955198807",
      "height": 3246897,
      "blockId": "1696318970118109075",
      "type": 0,
      "block_timestamp": 23290655,
      "timestamp": 23290649,
      "timestampMs": null,
      "senderPublicKey": "cdab95b082b9774bd975677c868261618c7ce7bea97d02e0f56d483e30c077b6",
      "senderId": "U15423595369615486571",
      "recipientId": "U3589996151080018161",
      "recipientPublicKey": "8932a618c01337a02bfd6786aca1daa355e0e6540372596fdef7ccf8b5b948c8",
      "amount": 9000000,
      "fee": 50000000,
      "signature": "c325f8c9d727f42b37451c80d247a3306cfa79f49eb4beae18c5e5ab11be29dc4a137959522b363bf82a5fb0bb91c96001be41ec465a5b68295fe184b673100d",
      "signatures": [],
      "confirmations": 8000117,
      "asset": {}
    }
  }
  ```

## Type 2: Delegate Registration Transaction

Creates a new delegate in ADAMANT's blockchain.

> [How to become an ADAMANT Delegate](https://news.adamant.im/how-to-become-an-adamant-delegate-745f01d032f)

- **Properties**

  - `type` — Must be `2`
  - `recipientId` — Must be `null`
  - `amount` — Must be `0`
  - `fee` — Must be `300000000000` (3000 ADM)
  - `asset` — Contains delegate info

- **API Endpoints**

  To get registered delegates, see [Delegates and Voting](/api-endpoints/delegates.md).

  To broadcast a new Delegate Registration Transaction, you can use the endpoints:

  - [`/api/accounts/delegates`](/api-endpoints/delegates.md#register-delegate-transaction)
  - [`/api/transactions`](/api-endpoints/transactions.md#register-transaction)

- **Example**

  ```json{8,12,14,15,19-25}
  {
    "success": true,
    "nodeTimestamp": 63646785,
    "transaction": {
      "id": "9970337616987571803",
      "height": 9130911,
      "blockId": "2640582970042287242",
      "type": 2,
      "timestamp": 52956148,
      "timestampMs": null,
      "senderPublicKey": "6b99151b0e79146a40ab7f6f065e9e2f354fe1e64af8bc35bfa7f5fa5f510ee3",
      "senderId": "U2850997466368415658",
      "recipientId": null,
      "recipientPublicKey": null,
      "amount": 0,
      "fee": 300000000000,
      "signature": "07180f9934394af1223f607dffb6d4a27229ecadbef5dd1a8bc32f27f8778915ecbe1af052b8bb4e38dc1fb8d62207956e257ad63ec10cd590f4f1ca6f12720a",
      "signatures": [],
      "confirmations": 2114803,
      "asset": {
        "delegate": {
          "username": "mawi",
          "publicKey": "6b99151b0e79146a40ab7f6f065e9e2f354fe1e64af8bc35bfa7f5fa5f510ee3",
          "address": "U2850997466368415658"
        }
      }
    }
  }
  ```

## Type 3: Vote for Delegate Transaction

> For background on delegate voting, see [this article](https://news.adamant.im/how-to-vote-for-adamant-delegates-2b415e694f72)

Used to vote or downvote for delegates.

- **Properties**

  - `type` — Must be `3`
  - `amount` — Must be `0`
  - `fee` — Must be `5000000000` (50 ADM)
  - `asset` — Contains upvotes/downvotes

- **API Endpoints**

  - Get transactions: [Delegates and Voting](/api-endpoints/delegates.md)
  - Post transactions:
    - [`/api/accounts/delegates`](/api-endpoints/delegates.md#register-vote-for-delegate-transaction)
    - [`/api/transactions`](/api-endpoints/transactions.md#register-transaction)

- **Example**

  ```json{8,12,14,15,19-23}
  {
    "success": true,
    "nodeTimestamp": 63585715,
    "transaction": {
      "id": "9888167852341777698",
      "height": 10488572,
      "blockId": "16481510969712463150",
      "type": 3,
      "timestamp": 59782601,
      "timestampMs": null,
      "senderPublicKey": "9560562121cdc41112a0b288101079346d9c67f5bbff1f4d5a29483258c9477a",
      "senderId": "U9221911598904803004",
      "recipientId": "U9221911598904803004",
      "recipientPublicKey": "9560562121cdc41112a0b288101079346d9c67f5bbff1f4d5a29483258c9477a",
      "amount": 0,
      "fee": 5000000000,
      "signature": "fe199a4a5790186c1c482c6f5c0de5b7baa0a66e4b97abcb96f47e197880ea8333dc57e1b497e32eabdb157ac834dbd85d58d7c550e8aabe208af79026279c04",
      "signatures": [],
      "confirmations": 745088,
      "asset": {
        "votes": [
          "-c0c580c3fb89409f32181fef58935f286f0c1bbf61bd727084ed915b3a4bc95b"
        ]
      },
      "votes": {
        "added": [],
        "deleted": [
          "c0c580c3fb89409f32181fef58935f286f0c1bbf61bd727084ed915b3a4bc95b"
        ]
      }
    }
  }
  ```

## Type 8: Chat/Message Transaction

Used to send any [Message Type](/api-types/message-types.md) between accounts.

- **Properties**

  - `type` — Must be `8`
  - `amount` — `0` for message only or ADM amount for token transfer with comment
  - `fee` — `100000` (0.001 ADM) per 255 symbols or `50000000` (0.5 ADM) for token transfer with comment
  - `asset` - Transaction asset

    - `chat` — Contains encrypted message content

      - `type` — **Message** type (not to be confused with the transaction type). See [Message Types](./message-types.md).
      - `message` — Encrypted message text

        :::: info
        Nodes accept a maximum **encrypted** text length of 20,480 characters, so the approximate maximum **unencrypted** text length is around 13,000 UTF-8 characters.
        ::::

      - `own_message` - The message's nonce

- **API Endpoints**

  - Get messages: [Chats and Chatrooms](/api-endpoints/chatrooms.md)
  - Post messages:
    - [`/api/chats/process`](/api-endpoints/chatrooms.md#register-chat-message-transaction)
    - [`/api/transactions/process`](/api-endpoints/transactions.md#register-token-transfer-transaction)
    - [`/api/transactions`](/api-endpoints/transactions.md#register-transaction)

- **Example**

  ```json{5,12,13,18-24}
  {
    "id": "9175562912139726777",
    "height": 10288885,
    "blockId": "10475460465898092643",
    "type": 8,
    "timestamp": 58773228,
      "timestampMs": null,
    "senderPublicKey": "2ac5eef60303003c90f662d89e60570d8661c8ba569e667296f5c7c97a0413ee",
    "requesterPublicKey": null,
    "senderId": "U8916295525136600565",
    "recipientId": "U2707535059340134112",
    "recipientPublicKey": "5a3c1da429ae925422892e69dc4f0ab6d7ac00cef229d2d992242dcfeca27b91",
    "amount": 0,
    "fee": 100000,
    "signature": "287dc2554025d8074d674d50ec785d530588e2b828f2d3f29687a4f05c8afc623e185896abc739ea2af8db199ec6e31c57426937343ff5ec154341cee8f72f0a",
    "signSignature": null,
    "signatures": [],
    "confirmations": null,
    "asset": {
      "chat": {
        "message": "9ae819297240f00bdc3627133c2e41efd27b022fcd0d011dfdda0941ba08399697f3e3bb5c46a43aff714ae1bac616b84617ce446d808523a14f278e5d88909837848e7aa69d9d4f9a95baae56df6ad4c274248d3d01a2cfccae51367dfab265a055d5ce991af654ee418839f94885876638863d172226b0369cd488c5727e6b1a42ba46fed014c1bf586dd2cab3afe7f10cb54864c099a680d5963778c9c4052df305497edc43082a7d60193650c331c6db9c9d9c0c8bbc004e53ac56586331453164b984c57a495810d709c9b984e4f367888d8a8ce1b26f528c1abdec08747e",
        "own_message": "6802a9e744aa3ba570d7e48fce5fe0f49184d0ce38ea40f7",
        "type": 1
      }
    }
  }
  ```

## Type 9: Store Data in KVS Transaction

Key-Value Storage (KVS) is a special type of transaction for storing private (encrypted) or public (plain value) data in ADAMANT's blockchain.

> Read more: [Storing Data in KVS](/essentials/storing-data-in-kvs.md).

- **Properties**

  - `type` — Must be `9`
  - `amount` — Must be `0`
  - `fee` — `100000` (0.001 ADM) per 255 unencrypted symbols
  - `asset` — Contains `state` JSON with content

- **API Endpoints**

  - Fetch KVS data: [`/api/states/get`](/api-endpoints/kvs.md#get-states)
  - Post transactions:
    - [`/api/states/store`](/api-endpoints/kvs.md#register-store-in-kvs-transaction)
    - [`/api/transactions`](/api-endpoints/transactions.md#register-transaction)

- **Example**

  ```json{8,14,15,19-25}
  {
    "success": true,
    "nodeTimestamp": 63585642,
    "transaction": {
      "id": "11325216963059857859",
      "height": 3377231,
      "blockId": "14121859709526400688",
      "type": 9,
      "timestamp": 23943500,
      "timestampMs": null,
      "senderPublicKey": "ac903ab58135cd5f0613a929d876953214d224034b73c33e63bc153d669447f4",
      "senderId": "U5517006347330072401",
      "recipientId": null,
      "recipientPublicKey": null,
      "amount": 0,
      "fee": 100000,
      "signature": "4c3bcca1f6c921cef7ce07f4e641f668c5c0660bb6432335d5e2117c7a4d8378b352e7fa4fac3126bd7228f5b9ac5d57100bb161da02f7efc16df9f7e602b10d",
      "signatures": [],
      "confirmations": 7856415,
      "asset": {
        "state": {
          "value": "0x2391EEaEc07B927D2BA4Fa5cB3cE4b490Fa6fffC",
          "key": "eth:address",
          "type": 0
        }
      }
    }
  }
  ```
