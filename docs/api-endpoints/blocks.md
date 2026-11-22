# Blocks

List of endpoints giving information of blocks in ADAMANT blockchain.

## Get Block by ID

```sh
GET /api/blocks/get?id={block's id}
```

- **Description**

  Get full information about a specific block in the ADAMANT blockchain using the `/api/blocks/` endpoint. Pass the block's `id` as a parameter.

  Block info includes:

  - `id` — block's id: reversed first 8 bytes of SHA256 hash of signed block header
  - `version` — versioning for future upgrades of the ADAMANT protocol
  - `timestamp` — block's 32-bit integer epoch timestamp (in seconds starting from Sep 02 2017 17:00:00 GMT+0000)
  - `height` — block's height position in ADAMANT blockchain
  - `previousBlock` — `id` of the previous block in ADAMANT blockchain relative to the current one
  - `numberOfTransactions` — number of transactions included in the block
  - `totalAmount` — integer amount of 1/10^8 ADM tokens transferred within all transactions in the block
  - `totalFee` — integer amount of 1/10^8 ADM tokens paid to delegates to forge this block
  - `reward` — integer amount of 1/10^8 ADM tokens created by delegates to forge this block
  - `totalForged` — sum of `totalFee` and `reward`
  - `payloadLength` — byte size of the payload hash
  - `payloadHash` — hash of the block's payload (comprised of the transactions it contains)
  - `generatorPublicKey` — delegate's public key who generated the block
  - `generatorId` — delegate's [ADAMANT address](/api-endpoints/accounts.md) who generated the block
  - `blockSignature` — derived from an SHA-256 hash of the block header, signed by the delegate's private key
  - `confirmations` — count of network confirmations (number of blocks generated after this block on the current node's height)

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/blocks/get?id=11114690216332606721
  ```

  Response:

  ```jsonc
  {
    "success": true,
    "nodeTimestamp": 61747603,
    "block": {
      "id": "11114690216332606721",
      "version": 0,
      "timestamp": 61741820,
      "height": 10873829,
      "previousBlock": "11483763337863654141",
      "numberOfTransactions": 1,
      "totalAmount": 10000000,
      "totalFee": 50000000,
      "reward": 45000000,
      "payloadLength": 117,
      "payloadHash": "f7c0fa338a3a848119cad999d8035ab3fcb3d274a4555e141ebeb86205e41345",
      "generatorPublicKey": "134a5de88c7da1ec71e75b5250d24168c6c6e3965ff16bd71497bd015d40ea6a",
      "generatorId": "U3238410389688281135",
      "blockSignature": "18607b15417a6b0a56b4c74cacd713ad7a10df16ec3ab45a697fa72b6f811f9213d895b7e0fbca71cf74323d60148d0991668e5368386408f4d841496ed2280d",
      "confirmations": 1093,
      "totalForged": "95000000"
    }
  }
  ```

## Get Multiple Blocks

```sh
GET /api/blocks
```

- **Description**

  Get a list of blocks from the ADAMANT blockchain using the `/api/blocks/` endpoint. Returns an
  array of [blocks](#get-block-by-id) ordered by `orderBy` (default: `height:desc`, from newest to
  oldest).

  Available parameters:

  | Parameter | Description |
  | --- | --- |
  | `limit` | Number of blocks to retrieve, from 1 to 100 (default: 100) |
  | `offset` | Number of rows to skip after applying the requested order, starting from 0 (default: 0) |
  | `orderBy` | Sort expression in `field:direction` form (default: `height:desc`) |
  | `generatorPublicKey` | 64-character hexadecimal public key of the delegate who generated the block |
  | `numberOfTransactions` | Exact non-negative number of transactions in the block |
  | `previousBlock` | ID of the preceding block |
  | `height` | Exact positive block height |
  | `totalAmount` | Exact non-negative integer amount of 1/10^8 ADM tokens transferred within all transactions in the block |
  | `totalFee` | Exact non-negative integer amount of 1/10^8 ADM tokens paid as transaction fees in the block |
  | `reward` | Exact non-negative integer amount of 1/10^8 ADM tokens created as the forging reward |

  `orderBy` accepts `asc` or `desc` for the following fields: `id`, `timestamp`, `height`,
  `previousBlock`, `totalAmount`, `totalFee`, `reward`, `numberOfTransactions`, and
  `generatorPublicKey`.

- **Example**

  Request:

  ```sh
  GET https://endless.adamant.im/api/blocks?limit=3
  ```

  Response:

  ```jsonc
  {
    "success": true,
    "nodeTimestamp": 58045353,
    "blocks": [
      {
        "id": "15416108601994762552",
        "version": 0,
        "timestamp": 58045350,
        "height": 10144920,
        "previousBlock": "16611488400968379374",
        "numberOfTransactions": 0,
        "totalAmount": 0,
        "totalFee": 0,
        "reward": 45000000,
        "payloadLength": 0,
        "payloadHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "generatorPublicKey": "7f4697859d3ff3a0196d1092b525a6565f427361406182d6a1f7500f16371a60",
        "generatorId": "U11788972648641670458",
        "blockSignature": "586b57db36f05990d83b568da59a3abb8f2a3cf3401e4db66b8145fab4bdf4067b05a0d51197161640bd6c2091609eec5b0ec8f2ad6dfb450f5e433601089001",
        "confirmations": 1,
        "totalForged": "45000000"
      },
      {
        "id": "16611488400968379374",
        "version": 0,
        "timestamp": 58045345,
        "height": 10144919,
        "previousBlock": "17869865393675106520",
        "numberOfTransactions": 0,
        "totalAmount": 0,
        "totalFee": 0,
        "reward": 45000000,
        "payloadLength": 0,
        "payloadHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "generatorPublicKey": "6d8004c56928fa5f42ff739dc2b9bb3562b62c5f9a16f5abcfedbdd83481bb32",
        "generatorId": "U15874113746950200763",
        "blockSignature": "56439af79e087c07b558a919f1276aa8d637c55acc3b36267deca7e824bbe96161aec4c8edd8d9fa1a447cb08beb56fc13e8ae7cb5171b32161c6fa2a716680b",
        "confirmations": 2,
        "totalForged": "45000000"
      }
    ]
  }
  ```
