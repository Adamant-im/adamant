# States: Key-Value Storage (KVS)

Endpoints intended to store data in ADAMANT Key-Value Storage (KVS).

See also:

- [Storing Data in KVS](/essentials/storing-data-in-kvs.md)
- [Working with Contact List](/essentials/working-with-contact-list.md)

## Get States

```sh
GET /api/states/get
```

```sh
POST /api/states/get
```

- **Description**

  Use endpoint `/api/states/get` to fetch data from KVS. Available with `GET` or `POST` requests. Use `POST` when maximum URI lengths are exceeded. All filters combine with `AND`: plain names and `and:`-prefixed aliases are supported (`fromHeight`, `toHeight`, `senderId`, `senderIds`, `key`, `keyIds`, `type`), while `or:` filters, unknown parameters, and conflicting plain/`and:` values are rejected. See [Transactions Query Language](/api/transactions-query-language.md).

  As a result, you'll get a list of transactions of `type = 9` with KVS data, stored in `asset.state` fields. Structure of `state` is described in [Storing Data in KVS](/essentials/storing-data-in-kvs.md) section.

- **Example**

  For a single key:

  ```sh
  GET https://endless.adamant.im/api/states/get?key=eth:address&senderId=U14236667426471084862&orderBy=timestamp:desc
  ```

  For multiple keys:

  ```sh
  GET https://ahead.adamant.im/api/states/get?keyIds=eth:address,doge:address,dash:address,btc:address&senderIds=U3461022864428928223,U17790659840463725618,U43512412354440829,U10666556853857590034,U15677078342684640219,U10879891600431315092,U15677078342684640219,U16189664252187503076,U15738334853882270577,U11051173936218114255,U5149447931090026688,U18064911620565010636,U11962817086029207137,U14236667426471084862,U3857204090751960756,U18290410688451164219,U15506276306084215695,U18009522315196199993,U17325711452096864732,U16634908687170714645,U9203183357885757380,U12382044996701379416,U3938345682225572184,U116971041436569303,U11163081294512846715,U5517006347330072401,U7972131227889954319,U7578227434840718692&orderBy=timestamp:desc
  ```

  For more keys than GET request allows:

  ```sh
  curl -XPOST -H "Content-type: application/json" -d '{"keyIds":["eth:address","doge:address","dash:address","btc:address"], "senderIds":["U3461022864428928223","U17790659840463725618","U43512412354440829","U10666556853857590034","U15677078342684640219","U10879891600431315092","U15677078342684640219","U16189664252187503076","U15738334853882270577","U11051173936218114255","U5149447931090026688","U18064911620565010636","U11962817086029207137","U14236667426471084862","U3857204090751960756","U18290410688451164219","U15506276306084215695","U18009522315196199993","U17325711452096864732","U16634908687170714645","U9203183357885757380","U12382044996701379416","U3938345682225572184","U116971041436569303","U11163081294512846715","U5517006347330072401","U7972131227889954319","U7578227434840718692"]}' 'https://ahead.adamant.im/api/states/get'
  ```

  Example response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 63647706,
    "transactions": [
      {
        "id": "13920471299012339255",
        "height": 6361977,
        "blockId": "14557933175886918347",
        "type": 9,
        "block_timestamp": 39015790,
        "timestamp": 39015780,
        "timestampMs": null,
        "senderPublicKey": "8cd9631f9f634a361ea3b85cbd0df882633e39e7d26d7bc615bbcf75e41524ef",
        "requesterPublicKey": null,
        "senderId": "U14236667426471084862",
        "recipientId": null,
        "recipientPublicKey": null,
        "amount": 0,
        "fee": 100000,
        "signature": "56ac1fe17631e16197cd76398f300ab331a79469af18403d0b0f22156d03843bf2917f46e368d72dd91962eaacc91736e2f696d41738d6b573f92bdcaf335505",
        "signSignature": null,
        "signatures": [],
        "confirmations": null,
        "asset": {
          "state": {
            "value": "0x84609a38fedbcd02b657233340e6a8cb09db61a8",
            "key": "eth:address",
            "type": 0
          }
        }
      }
    ],
    "count": 1
  }
  ```

## Register Store in KVS Transaction

```sh
POST /api/states/store
```

- **Description**

  Use endpoint `/api/states/store` to broadcast transactions of [type 9 — Store in KVS](/api-types/transaction-types.md). Make _POST_ request to the endpoint, with payload of [transaction object](/api-endpoints/transactions.md#get-list-of-transactions), where:

  - `type` is set to `9`
  - `asset` is filled with `key`, `value`, and `type`

  If needed, `asset` can be [encrypted](/essentials/encrypting-messages.md#encrypting-a-kvs-records).

  See also: [Storing Data in KVS](/essentials/storing-data-in-kvs.md).

  Transaction must be [formed and signed](/essentials/signing-transactions.md).

  As a successful result, you'll get the id of the transaction registered in the ADAMANT blockchain.

- **Example**

  Request:

  ```sh
  POST https://endless.adamant.im/api/states/store
  ```

  ```json
  {
    "transaction": {
      "type": 9,
      "amount": 0,
      "senderId": "U13670390070364760381",
      "senderPublicKey": "2640b667910a362a0fac4ca3b54b90052086b63e603c4df8758b6713e70e61a2",
      "asset": {
        "state": {
          "key": "eth:address",
          "value": "0x00777c36204bca77569ce5ed4233d91ea92a170b",
          "type": 0
        }
      },
      "timestamp": 63410860,
      "timestampMs": null,
      "signature": "bce364378b145e79909c31bc3a77cd3b70dff8f0d410f8c791642b826bc193fa59c154e71639d82f5b8f6ef82dc92e8f7fcb9086bb03d0f78a3d50c46b268606"
    }
  }
  ```

  Response:

  ```json
  {
    "success": true,
    "nodeTimestamp": 63410860,
    "transactionId": "3888802408802922744"
  }
  ```
