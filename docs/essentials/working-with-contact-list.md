# Working with Contacts List

**Contacts list** is a specific case of [KVS record](/essentials/storing-data-in-kvs.md) to store and manage user-defined address book entries, allowing users to associate ADAMANT addresses with human-readable names for easier messaging.

- **AIP**: [AIP 7: Contacts List](https://aips.adamant.im/AIPS/aip-7).

## Storing Contacts List

The contacts list is stored as a JSON object using the ADAMANT KVS. This object must be [encrypted](/essentials/encrypting-messages.md#encrypting-a-kvs-records) and passed as `value` with `key` = `contact_list`.

The keys of this JSON object are ADAMANT addresses, and the values are objects where aliases are stored in the `displayName` property. Example `value` object for storing a contacts list:

```json
{
  "U9821606738809290000": {
    "displayName": "John Doe"
  },
  "U9821606738809290001": {
    "displayName": "Jane Doe"
  }
}
```

Additional properties besides `displayName` can be added to store various contact details.

### Example transaction

Example of a transaction to store a contacts list:

```json
{
  "transaction": {
    "type": 9,
    "amount": 0,
    "senderId": "U15677078342684640219",
    "senderPublicKey": "e16e624fd0...",
    "asset": {
      "state": {
        "key": "contact_list",
        "value":"{
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
