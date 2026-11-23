# Java Examples

These examples are created based on the original JavaScript implementation.

## Generating ADAMANT account and key pair

To generate a key pair (consisting of a public and private key) from a passphrase, you can use the [tweetnacl-java](https://github.com/InstantWebP2P/tweetnacl-java/blob/master/src/main/java/com/iwebpp/crypto/TweetNaclFast.java) library

Example:

```java
while (true) {
    SecureRandom secureRandom = new SecureRandom();
    byte[] seedBytes = secureRandom.generateSeed(32);

    //example seed
    seedBytes = Hex.decode("da0a94cf753b583db3367a58d83e525dba42044b4cbb0d39a492c3594b92eb2e");

    Signature.KeyPair keyPair = Signature.keyPair_fromSeed(seedBytes);
    byte[] publicKeyBytes = keyPair.getPublicKey();

    String pubKeyStr = Hex.toHexString(publicKeyBytes);
}
```

## Signing Transactions

All transactions in the ADAMANT blockchain are being signed with the robust cryptosigning algorithm Ed25519 EdDSA.

To generate a signature, we must combine `type, senderPublicKey, recipientId, amount, timestamp` properties into one byte array and then, obtain the `sha256` from this array:

```java
private byte[] getTrsBytes(int type, String senderPublicKey, String recipientId, BigInteger amount, long timestamp) throws Exception {
    int assetSize = 0;
    byte[] assetBytes = null;

    ByteArrayOutputStream baos = new ByteArrayOutputStream();
    baos.write(type); // 1 byte
    uint32ToByteStreamLE(timestamp, baos); // 4 byte

    byte[] senderPublicKeyBytes = Hex.decode(senderPublicKey);//32 byte
    baos.write(senderPublicKeyBytes, 0, senderPublicKeyBytes.length);

    if (recipientId != null && recipientId.trim().length() > 0) {
        byte[] recipientIdBytes = new BigInteger(recipientId.substring(1)).toByteArray();// 8 byte
        if (recipientIdBytes.length == 9) {
            for (int i = 1; i < 9; i++) {
                baos.write(recipientIdBytes[i]);
            }
        } else if (recipientIdBytes.length == 8) {
            for (int i = 0; i < 8; i++) {
                baos.write(recipientIdBytes[i]);
            }
        }
    } else {
        for (int i = 0; i < 8; i++) {
            baos.write(0);
        }
    }

    uint64ToByteStreamLE(amount, baos); // 8 byte
    if (assetSize > 0) {
        for (int i = 0; i < assetSize; i++) {
            baos.write(assetBytes[i]);
        }
    }

    return sha256(baos.toByteArray());
}
```

This hash needs to be signed with our private key:

```java
byte[] hash = getTrsBytes(type, senderPublicKey, recipientId, amount, timestamp);
Ed25519PrivateKeyParameters ed25519PrivateKeyParameters = new Ed25519PrivateKeyParameters(Hex.decode(senderSeedStr), 0);
Ed25519Signer ed25519Signer = new Ed25519Signer();
ed25519Signer.init(true, ed25519PrivateKeyParameters);
ed25519Signer.update(hash, 0, hash.length);
byte[] signatureBytes = ed25519Signer.generateSignature();
```

After that, convert the result to a hex string:

```java
Hex.toHexString(signatureBytes);
```

Full example:

```java
public class AdmOffLineSign {
    private static final String ADM_ADDRESS_PREFIX = "U";

    //address:U608202877917124896
    //seed:da0a94cf753b583db3367a58d83e525dba42044b4cbb0d39a492c3594b92eb2e
    //pubkey:cc64001d0017d6af363d6922295e1e78bde915cded0c7dc061d9f746b5673d88

    public static void main(String[] args) throws Exception {
        AdmOffLineSign adm = new AdmOffLineSign();

        //Tx offline sign
        /**
         * block's 32 bit integer epoch timestamp (in seconds starting from Sep 02 2017 17:00:00 GMT+0000)
         * export const EPOCH = Date.UTC(2017, 8, 2, 17, 0, 0, 0)
         * Math.floor((Date.now() - Date.UTC(2017, 8, 2, 17, 0, 0, 0)) / 1000)
         */
        long timestamp = (System.currentTimeMillis() - 1504371600000L) / 1000;
        int type = 0;
        String senderId = "U608202877917124896";
        String recipientId = "U5456189205862450820";
        BigInteger amount = BigInteger.valueOf(10_000_000);
        String senderPubKeyStr = "cc64001d0017d6af363d6922295e1e78bde915cded0c7dc061d9f746b5673d88";
        String senderSeedStr = "da0a94cf753b583db3367a58d83e525dba42044b4cbb0d39a492c3594b92eb2e";

        String signature = adm.signTx(type, senderSeedStr, senderPubKeyStr, recipientId, amount, timestamp);

        JSONObject txJO = new JSONObject();
        txJO.put("type", type);
        txJO.put("amount", amount);
        txJO.put("senderId", senderId);
        txJO.put("senderPublicKey", senderPubKeyStr);
        txJO.put("signature", signature);
        txJO.put("recipientId", recipientId);
        txJO.put("timestamp", timestamp);

        JSONObject broadcastTxJO = new JSONObject();
        broadcastTxJO.put("transaction", txJO);

        System.out.println("tx for broadcast:" + broadcastTxJO);
    }

    private String getAdmAddress(byte[] hexPublicKey) throws NoSuchAlgorithmException {
        byte[] temp = new byte[8];
        for (int i = 0; i < 8; i++) {
            temp[i] = sha256(hexPublicKey)[7 - i];
        }
        return ADM_ADDRESS_PREFIX + new BigInteger(temp);
    }

    private String signTx(int type, String senderSeedStr, String senderPublicKey,
                          String recipientId, BigInteger amount, long timestamp) throws Exception {
        byte[] hash = getTrsBytes(type, senderPublicKey, recipientId, amount, timestamp);
        Ed25519PrivateKeyParameters ed25519PrivateKeyParameters = new Ed25519PrivateKeyParameters(Hex.decode(senderSeedStr), 0);
        Ed25519Signer ed25519Signer = new Ed25519Signer();
        ed25519Signer.init(true, ed25519PrivateKeyParameters);
        ed25519Signer.update(hash, 0, hash.length);
        byte[] signatureBytes = ed25519Signer.generateSignature();
        return Hex.toHexString(signatureBytes);
    }

    private byte[] getTrsBytes(int type, String senderPublicKey, String recipientId, BigInteger amount, long timestamp) throws Exception {
        int assetSize = 0;
        byte[] assetBytes = null;

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        baos.write(type); // 1 byte
        uint32ToByteStreamLE(timestamp, baos); // 4 byte

        byte[] senderPublicKeyBytes = Hex.decode(senderPublicKey);//32 byte
        baos.write(senderPublicKeyBytes, 0, senderPublicKeyBytes.length);

        if (recipientId != null && recipientId.trim().length() > 0) {
            byte[] recipientIdBytes = new BigInteger(recipientId.substring(1)).toByteArray();// 8 byte
            if (recipientIdBytes.length == 9) {
                for (int i = 1; i < 9; i++) {
                    baos.write(recipientIdBytes[i]);
                }
            } else if (recipientIdBytes.length == 8) {
                for (int i = 0; i < 8; i++) {
                    baos.write(recipientIdBytes[i]);
                }
            }
        } else {
            for (int i = 0; i < 8; i++) {
                baos.write(0);
            }
        }

        uint64ToByteStreamLE(amount, baos); // 8 byte
        if (assetSize > 0) {
            for (int i = 0; i < assetSize; i++) {
                baos.write(assetBytes[i]);
            }
        }

        return sha256(baos.toByteArray());
    }

    private byte[] sha256(byte[] contentBytes) throws NoSuchAlgorithmException {
        byte[] resultBytes = null;
        if (contentBytes == null || contentBytes.length == 0) {
            return resultBytes;
        }

        MessageDigest messageDigest = MessageDigest.getInstance("SHA-256");
        messageDigest.update(contentBytes);
        return messageDigest.digest();
    }

    private static void uint32ToByteStreamLE(long val, OutputStream stream) throws IOException {
        stream.write((int)(255L & val));
        stream.write((int)(255L & val >> 8));
        stream.write((int)(255L & val >> 16));
        stream.write((int)(255L & val >> 24));
    }

    private static void uint64ToByteStreamLE(BigInteger val, OutputStream stream) throws IOException {
        byte[] bytes = val.toByteArray();
        if (bytes.length > 8) {
            throw new RuntimeException("Input too large to encode into a uint64");
        } else {
            bytes = reverseBytes(bytes);
            stream.write(bytes);
            if (bytes.length < 8) {
                for (int i = 0; i < 8 - bytes.length; ++i) {
                    stream.write(0);
                }
            }
        }
    }

    private static byte[] reverseBytes(byte[] bytes) {
        byte[] buf = new byte[bytes.length];

        for (int i = 0; i < bytes.length; ++i) {
            buf[i] = bytes[bytes.length - 1 - i];
        }
        return buf;
    }
}
```
