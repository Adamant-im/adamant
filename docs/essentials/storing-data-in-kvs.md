# Storing Data in KVS

**ADAMANT's Key-Value Storage (KVS)** is a special [transaction type](/api-types/transaction-types.md#Type-9-Storing-data) used for storing private (encrypted) or public (plain) data in ADAMANT's blockchain. Examples include a [contact list](/essentials/working-with-contact-list.md) for private data and an Ether address for public data.

Endpoints:

- To fetch KVS data, use [`/api/states/get`](/api-endpoints/kvs.md#get-states) endpoint.

- To store KVS data, use [`/api/states/store`](/api-endpoints/kvs.md#register-store-in-kvs-transaction) endpoint.

## KVS Transaction

KVS [transaction](/api-types/transaction-types.md) is of type `9` and contains `asset` field with `state` object:

- [`key`](#kvs-keys) — describes contents of KVS record
- [`value`](#kvs-data) — is data for key. Can be private (encrypted) or public (plain value)
- [`type`](#kvs-store-types) — incremental data or full re-write of previous values

Example transaction that writes public Ether address for `U11977883563659338220`:

```json{3,7-13}
{
  "transaction": {
    "type": 9,
    "amount": 0,
    "senderId": "U11977883563659338220",
    "senderPublicKey": "d2cbc26c2ef6...",
    "asset": {
      "state": {
        "key": "eth:address",
        "value": "0xf4a2d5997eb0575b7ad7c10b0b178524c336f9e9",
        "type": 0
      }
    },
    "timestamp": 45603372,
    "timestampMs": null,
    "signature": "86cbe525042bf83802..."
  }
}
```

## KVS keys

`key` field describes contents of KVS record. You can use own `key` to store special kind of data, or refer to known keys:

- `contact_list` — store [contact list](/essentials/working-with-contact-list.md) encrypted
- `<coin>:address` — store crypto wallet address, linked to ADAMANT account, in plain text. Used for in-Chat crypto transfers. See [AIP 13: Public non-ADM wallet addresses](https://aips.adamant.im/AIPS/aip-13).

Examples for `<coin>:address`:

- `eth:address` — Ethereum wallet address (ETH and ERC-20)
- `lsk:address` — Lisk wallet address (LSK)
- `dash:address` — Dash wallet address (DASH)
- `doge:address` — Doge wallet address (DOGE)
- `btc:address` — Bitcoin wallet address (BTC)

## KVS data

Data for `key` is included in `value` field can be private (encrypted) or public (plain value).

Unencrypted values are stored as-is in `value` field. Private values [should be encrypted] and that way `value` represents object:

- `message`: encrypted value for `key`
- `nonce`: nonce

Any KVS value that is a valid JSON and has both `nonce` and `message` fields should be treated as encrypted.

Example:

```json{3,7-15}
{
  "transaction": {
    "type": 9,
    "amount": 0,
    "senderId": "U15677078342684640219",
    "senderPublicKey": "e16e624fd0...",
    "asset": {
      "state": {
        "key": "contact_list",
        "value": "{
            \"message\": \"6df8c172feef228d930130...\",
            \"nonce\": \"f6c7b76d55db945bb026cd221d5...\"}",
        "type": 0
      }
    },
    "timestamp": 45603645,
    "timestampMs": null,
    "signature": "dbafce549f1..."
  }
}
```

## KVS store types

KVS `type` describes how to store `value` for `key`:

- `1` for incremental appending contents
- `0` for full re-writing of the `value`

Default is `0`.

See [AIP 11: Behavior for KVS data](https://aips.adamant.im/AIPS/aip-11).

## Related information

- [Medium: What is ‘Key-Value Store’ in ADAMANT and How is it used to Store Contact Names?](https://news.adamant.im/what-is-key-value-store-in-adamant-and-how-is-it-used-to-store-contact-names-4ee5f82ab77f)
- [AIP 3: Storing data in chain (KVS)](https://aips.adamant.im/AIPS/aip-3)
