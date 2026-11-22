# Swift Examples

These examples are created based on the original JavaScript implementation.

## Generating ADAMANT account and key pair

To generate a key pair (consisting of a public and private key) from a passphrase, you can use the [createKeypairFor](https://github.com/Adamant-im/adamant-iOS/blob/6a5c8d7b108d9b9df3ad7a5067fa8085a01a2bb2/CommonKit/Sources/CommonKit/Core/NativeAdamantCore.swift#L118) function.

Example:

```swift
let passphrase = "kid close devote jungle culture weird run sure reward shiver stable topple"

guard let keypair = adamantCore.createKeypairFor(passphrase: passphrase) else {
    throw TransfersProviderError.internalError(message: "Failed to get keypair", error: nil)
}
```

## Signing Transactions

All transactions in the ADAMANT blockchain are being signed with the robust cryptosigning algorithm Ed25519 EdDSA.

The ADM transaction has the following structure:

```swift
protocol SignableTransaction {
    var type: TransactionType { get }
    var amount: Decimal { get }
    var senderPublicKey: String { get }
    var requesterPublicKey: String? { get }
    var timestamp: UInt64 { get }
    var recipientId: String? { get }

    var asset: TransactionAsset { get }
}
```

To generate a signature, we must combine these properties into one byte array ([check out the iOS repository](https://github.com/Adamant-im/adamant-iOS/blob/6a5c8d7b108d9b9df3ad7a5067fa8085a01a2bb2/Adamant/Services/NativeCore%2BAdamantCore.swift#L39)):

```swift
extension SignableTransaction {
    var bytes: [UInt8] {
        typeBytes
        + timestampBytes
        + senderPublicKeyBytes
        + requesterPublicKeyBytes
        + recipientIdBytes
        + amountBytes
        + assetBytes
        + signatureBytes
        + signSignatureBytes
    }
}
```

Then, obtain the `sha256` from this array (in this example, the function `sha256()` is from the `CryptoSwift` library):

```swift
let hash = transaction.bytes.sha256()
```

This hash needs to be signed with our private key:

```swift
let signBytes = Ed25519.sign(message: sha, privateKey: keyPair.privateKey)
```

After that, convert the result to a hex string:

```swift
let sign = signBytes.hexString()
```

Full example:

```swift
let passphrase = "kid close devote jungle culture weird run sure reward shiver stable topple"
guard let keypair = adamantCore.createKeypairFor(passphrase: passphrase) else {
    throw TransfersProviderError.internalError(message: "Failed to get keypair", error: nil)
}

guard let encodedMessage = adamantCore.encodeMessage(
    "Hello!",
    recipientPublicKey: "3af27b283de3ce76bdcb0d4a341208b6bc1a375c46610dfa11ca20a106ed43a8",
    privateKey: keypair.privateKey
) else {
    throw TransfersProviderError.internalError(message: "Failed to encode message", error: nil)
}

let signedTransaction = try? makeSendMessageTransaction(
    senderId: "U15569355592082325507",
    recipientId: "U380651761819723095",
    keypair: keypair,
    message: encodedMessage.message,
    type: .message,
    nonce: encodedMessage.nonce,
    amount: 1
)

func makeSendMessageTransaction(
    senderId: String,
    recipientId: String,
    keypair: Keypair,
    message: String,
    type: ChatType,
    nonce: String,
    amount: Decimal?
) throws -> UnregisteredTransaction {
    let normalizedTransaction = NormalizedTransaction(
        type: .chatMessage,
        amount: amount ?? .zero,
        senderPublicKey: keypair.publicKey,
        requesterPublicKey: nil,
        date: Date(),
        recipientId: recipientId,
        asset: TransactionAsset(
            chat: ChatAsset(message: message, ownMessage: nonce, type: type),
            state: nil,
            votes: nil
        )
    )

    guard let transaction = makeSignedTransaction(
        transaction: normalizedTransaction,
        senderId: senderId,
        keypair: keypair
    ) else {
        throw InternalAPIError.signTransactionFailed
    }

    return transaction
}

func makeSignedTransaction(
    transaction: SignableTransaction,
    senderId: String,
    keypair: Keypair
) -> UnregisteredTransaction? {
    guard let signature = sign(transaction: transaction, senderId: senderId, keypair: keypair) else {
        return nil
    }

    return .init(
        type: transaction.type,
        timestamp: transaction.timestamp,
        senderPublicKey: transaction.senderPublicKey,
        senderId: senderId,
        recipientId: transaction.recipientId,
        amount: transaction.amount,
        signature: signature,
        asset: transaction.asset,
        requesterPublicKey: transaction.requesterPublicKey
    )
}

/// Signs a given transaction using the Ed25519 algorithm.
///
/// - Parameters:
///   - transaction: The transaction to be signed.
///   - keypair: The keypair containing the private key for signing.
/// - Returns: The hex-encoded signature of the transaction.
func sign(transaction: SignableTransaction, keypair: Keypair) -> String? {
    let privateKey = keypair.privateKey.hexBytes()
    let hash = transaction.bytes.sha256()

    let signBytes = Ed25519.sign(message: hash, privateKey: privateKey)
    return signBytes?.hexString()
}

struct NormalizedTransaction: SignableTransaction {
    let type: TransactionType
    let amount: Decimal
    let senderPublicKey: String
    let requesterPublicKey: String?
    let timestamp: UInt64
    let recipientId: String?
    let asset: TransactionAsset

    var date: Date {
        return AdamantUtilities.decodeAdamant(timestamp: TimeInterval(timestamp))
    }
}

struct UnregisteredTransaction: Hashable {
    let type: TransactionType
    let timestamp: UInt64
    let senderPublicKey: String
    let senderId: String
    let recipientId: String?
    let amount: Decimal
    let signature: String
    let asset: TransactionAsset
    let requesterPublicKey: String?
}
```
