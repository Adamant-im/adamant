# Message Types

[Message](/api-types/transaction-types.md#type-8-chat-message-transaction) is a type `8` transaction. Each message type differs based on the `asset` object value. The message type number is stored in the `asset.chat.type` field.

Endpoints:

- Messages can be retrieved using the [`/api/chatrooms`](/api-endpoints/chatrooms.md#get-list-of-chats) endpoints
  - Read more about chatrooms in [AIP 14: Chatrooms API](https://aips.adamant.im/AIPS/aip-14)
- To send a new message, use [`/api/chats/process`](/api-endpoints/chatrooms.md#register-chat-message-transaction) endpoint

## Type 1: Basic Encrypted Message

A Basic Encrypted Message is a simple encrypted message transaction that stores the message text and `own_message` needed for decryption.

- **Type** — `1`

- **Description**

  Along with sending a message, a Basic Encrypted Message can also be used to transfer ADM tokens. To send tokens, include an integer amount in units of 1/10<sup>8</sup> ADM (1 ADM = 100,000,000) in the transaction object. In this case, the message field will serve as a comment for the ADM transfer.

- **AIP**: [AIP 4 Basic Encrypted Messages](https://aips.adamant.im/AIPS/aip-4)

- **Example**

  ```json{20-26}
  {
    "success": true,
    "nodeTimestamp": 63653313,
    "transaction": {
      "id": "9175562912139726777",
      "height": 10288885,
      "blockId": "10475460465898092643",
      "type": 8,
      "block_timestamp": 58773245,
      "timestamp": 58773228,
      "timestampMs": null,
      "senderPublicKey": "2ac5eef60303003c90f662d89e60570d8661c8ba569e667296f5c7c97a0413ee",
      "senderId": "U8916295525136600565",
      "recipientId": "U2707535059340134112",
      "recipientPublicKey": "5a3c1da429ae925422892e69dc4f0ab6d7ac00cef229d2d992242dcfeca27b91",
      "amount": 0,
      "fee": 100000,
      "signature": "287dc2554025d80...",
      "signatures": [],
      "confirmations": 958117,
      "asset": {
        "chat": {
          "message": "9ae8192972...",
          "own_message": "6802a9e744aa3ba570d7e48fce5fe0f49184d0ce38ea40f7",
          "type": 1
        }
      }
    }
  }
  ```

## Type 2: Rich Content Message

A Rich Content Message is a special content message transaction **that should be processed** by client applications.

- **Type** — `2`

- **Description**

  The `message` field of a Rich Content Message should contain an encrypted JSON object representing the Rich Text:

  ```json
  {
    "type": "RICH_MESSAGE_TYPE",
    "text_fallback": "OPTIONAL_FALLBACK_FOR_CLIENTS_NOT_SUPPORTING_THIS_MESSAGE_TYPE"
  }
  ```

  The `type` field is a string that describes how to handle the Rich Text. For example, see [Crypto Transfer Messages](#non-adm-crypto-transfer-message).

  An optional `text_fallback` field can be added to provide an explanation for client apps that don’t support this type.

  The Rich Text JSON may include any other fields, but the `type` field is required.

- **AIP**: [AIP 5: Rich Content Messages](https://aips.adamant.im/AIPS/aip-5)

- **Example**

  ```json{7-13}
  {
    "transaction": {
      "type": 8,
      "amount": 0,
      "senderId": "U15677078342684640219",
      "senderPublicKey": "e16e624fd0a5123294b448c21f30a07a0435533c693b146b14e66830e4e20404",
      "asset": {
        "chat": {
          "message": "70cbd07ff2ceaf0fc38a01ef9...",
          "own_message": "e98794eaedf47e...",
          "type": 2
        }
      },
      "recipientId": "U7972131227889954319",
      "timestamp": 46116887,
      "timestampMs": null,
      "signature": "8fc2a54604109a6fcdccec2..."
    }
  }
  ```

## Non-ADM Crypto Transfer Message

A Crypto Transfer Message is a type of Rich Content Message designed for displaying in-chat crypto transfers. It is used for transferring non-ADM transactions.

> For ADM transfers, see:
>
> - [Token Transfer Transactions](/api-types/transaction-types.md#type-0-token-transfer-transaction) – for ADM transfers without comments
> - [Basic Encrypted Messages](/api-types/message-types.md#type-1-basic-encrypted-message) – for ADM transfers with a comment

- **Description**

  General method for in-chat Non-ADM transfers:

  1. Send a **Non-ADM Crypto Transfer Message** in the ADM network with an external token transaction ID
  2. Send the external token transaction in its respective network
  3. Watch for the external token transaction in its network and update its status

  The `message` field of a Crypto Transfer Message should contain encrypted JSON with the following structure:

  - `type` – _Required_. Represents the token’s network in the format `<coin>_transaction`.
    - Examples: `eth_transaction`, `lsk_transaction`, `dash_transaction`, `doge_transaction`, `btc_transaction`.
    - Client apps should handle type case-insensitively (e.g., `ETH_transaction` = `eth_transaction`).
  - `amount` – _Required_. Transferred value in the token’s network.
    - Uses `.` as the decimal separator.
    - String.
  - `comments` – _Optional_. A comment for this transfer, visible to both sender and recipient.
  - `hash` – _Required_. Transaction ID in the token’s network.
    - Used to check the transaction status.
  - `text_fallback` – _Optional_. Explanation text for client apps that don’t support the specified `type`

- **AIP**: [AIP 12: Non-ADM crypto transfer messages](https://aips.adamant.im/AIPS/aip-12)

- **Example**

  Example of `message` object **before** encryption:

  ```json
  {
    "type": "eth_transaction",
    "text_fallback": "Ether transactions are not supported by application yet",
    "amount": "0.002",
    "comments": "I like to send it, send it",
    "hash": "0xfa46d2b3c99878f1f9863fcbdb0bc27d220d7065c6528543cbb83ced84487deb"
  }
  ```

## Type 3: Signal Message

A Signal Message is a special message transaction that should be hidden by client applications but processed by services (e.g., registration on a Push Notification service).

- **Type** — `3`

- **Description**

  Signal Messages must be encrypted in the same way as [Basic Encrypted Messages](#type-1-basic-encrypted-message).

- **AIP**: [AIP 6: Signal Messages](https://aips.adamant.im/AIPS/aip-6)
