# Accounts

Endpoints intended to interact with ADAMANT accounts.

See also:

- [Generating account](/essentials/generating-account.md)

## Get Account by Address

```sh
GET /api/accounts?address={ADAMANT address}
```

- **Description**

  One of the ways to get actual account's information in ADAMANT blockchain. Send _GET_ request to `/api/accounts` endpoint with ADAMANT's `address` as parameter.

  Response includes:

  - `address` — ADAMANT address starting with `U`
  - `balance` — actual confirmed balance of ADAMANT account. Integer amount of 1/10^8 ADM tokens (1 ADM = 100000000)
  - `unconfirmedBalance` — balance of ADAMANT account, which includes unconfirmed transactions
  - `publicKey` — 256-bit public key of ADAMANT address in hex format

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/accounts?address=U777355171330060015
  ```

  Response:

  ```jsonc
  {
    "success": true,
    "nodeTimestamp": 58030181,
    "account": {
      "address": "U777355171330060015",
      "unconfirmedBalance": "4509718944753",
      "balance": "4509718944753",
      "publicKey": "a9407418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34",
      "unconfirmedSignature": 0,
      "secondSignature": 0,
      "secondPublicKey": null,
      "multisignatures": [],
      "u_multisignatures": []
    }
  }
  ```

## Get Account by Public Key

```sh
GET /api/accounts?publicKey={publicKey}
```

- **Description**

  One of the ways to get actual account's information in ADAMANT blockchain. Send _GET_ request to `/api/accounts` endpoint with ADAMANT's `publicKey` as parameter.

  Response is in the same format as [Get Account by Address](#get-account-by-address).

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/accounts?publicKey=a9407418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34
  ```

  Response:

  ```jsonc
  {
    "success": true,
    "nodeTimestamp": 58665858,
    "account": {
      "address": "U777355171330060015",
      "unconfirmedBalance": "4509718944753",
      "balance": "4509718944753",
      "publicKey": "a9407418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34",
      "unconfirmedSignature": 0,
      "secondSignature": 0,
      "secondPublicKey": null,
      "multisignatures": [],
      "u_multisignatures": []
    }
  }
  ```

## Get Account Balance

```sh
GET /api/accounts/getBalance?address={ADAMANT address}
```

- **Description**

  Request endpoint `/api/accounts/getBalance` with known ADAMANT's `address` to get `balance` and `unconfirmedBalance` of account.

  Response includes:

  - `balance` — actual confirmed balance of ADAMANT account. Integer amount of 1/10^8 ADM tokens (1 ADM = 100000000)
  - `unconfirmedBalance` — balance of ADAMANT account, which includes unconfirmed transactions

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/accounts/getBalance?address=U777355171330060015
  ```

  Response:

  ```jsonc
  {
    "success": true,
    "nodeTimestamp": 58043462,
    "balance": "4453802755711",
    "unconfirmedBalance": "4453802755711"
  }
  ```

## Get Account Public Key

```sh
GET /api/accounts/getPublicKey?address={ADAMANT address}
```

- **Description**

  If you need `publicKey` of ADAMANT account, get it from endpoint `/api/accounts/getPublicKey` with known ADAMANT's `address` as parameter.

  Response includes:

  - `publicKey` — 256-bit public key of ADAMANT address in hex format

  :::: warning
  For a `publicKey` to become available in the blockchain, the account must have at least one outgoing transaction. Read more: [Chats and uninitialized accounts in ADAMANT](https://news.adamant.im/chats-and-uninitialized-accounts-in-adamant-5035438e2fcd).
  ::::

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/accounts/getPublicKey?address=U777355171330060015
  ```

  Response:

  ```jsonc
  {
    "success": true,
    "nodeTimestamp": 58043820,
    "publicKey": "a9407418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34"
  }
  ```

## Get Top Accounts

```sh
GET /api/accounts/top?limit={limit}&offset={offset}&isDelegate={isDelegate}
```

- **Description**

  Returns non-zero-balance accounts sorted by confirmed `balance` in descending order. Accounts with the same balance
  are sorted by `address` in ascending order, so pagination stays stable between requests.

  The `count` field reports how many non-zero-balance accounts match the current filter before pagination is applied.

  This endpoint is available on every node that supports it; it does not require a node-side feature flag.

- **Parameters**

  | Parameter    | Type    | Required | Description                                                                                                                       |
  | ------------ | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
  | `limit`      | integer | No       | Number of accounts to return. Default is `100`, maximum is `100`. Use `0` to return only `count`, `limit`, and `offset` metadata. |
  | `offset`     | integer | No       | Number of sorted accounts to skip. Default is `0`.                                                                                |
  | `isDelegate` | integer | No       | Filter by delegate status. Use `1` for delegate accounts and `0` for non-delegate accounts.                                       |

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/accounts/top?limit=1&offset=0&isDelegate=1
  ```

  Response:

  ```jsonc
  {
    "success": true,
    "nodeTimestamp": 63205623,
    "accounts": [
      {
        "address": "U777355171330060015",
        "balance": "4509718944753",
        "publicKey": "a9407418dafb3c8aeee28f3263fd55bae0f528a5697a9df0e77e6568b19dfe34",
        "username": "adamant_delegate",
        "isDelegate": 1
      }
    ],
    "count": 254,
    "limit": 1,
    "offset": 0
  }
  ```

## Create New Account

```sh
POST /api/accounts/new
```

- **Description**

  Note: To create an ADAMANT account, [generate pass phrase and key pair](/essentials/generating-account.md) **locally** in your application.

  After that, you can send (_it's optional_) _POST_ request to `/api/accounts/new` endpoint with payload of JSON object which includes:

  - `publicKey` — 256-bit public key of ADAMANT address in hex format

  Response contains [ADAMANT account info](#get-account-by-address).

  :::: warning
  **Created account is only known to the node where it was presented.**
  This means _other apps_ cannot request this account information yet from the blockchain. To become available, the account must have at least one outgoing transaction.
  Read more: [Chats and uninitialized accounts in ADAMANT](https://news.adamant.im/chats-and-uninitialized-accounts-in-adamant-5035438e2fcd).
  ::::

- **Example**

  Request:

  ```sh
  POST https://clown.adamant.im/api/accounts/new
  ```

  ```jsonc
  {
    "publicKey": "bee368cc0ce2974adcbcc97e649ac18a031492a579034abed5f77d667001d450"
  }
  ```

  Response:

  ```jsonc
  {
    "success": true,
    "nodeTimestamp": 63205623,
    "account": {
      "address": "U4697606961271319613",
      "unconfirmedBalance": "0",
      "balance": "0",
      "publicKey": "bee368cc0ce2974adcbcc97e649ac18a031492a579034abed5f77d667001d450",
      "unconfirmedSignature": 0,
      "secondSignature": 0,
      "secondPublicKey": null,
      "multisignatures": null,
      "u_multisignatures": null
    }
  }
  ```
