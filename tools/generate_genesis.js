'use strict';

var ed=require('../helpers/ed.js');
var accounts=require('../helpers/accounts.js');
var constants=require('../helpers/constants.js');
var crypto=require('crypto');
var fs=require('fs');
var ByteBuffer = require('bytebuffer');
var bignum = require('../helpers/bignum.js');
var mnemonic = require('bitcore-mnemonic');

var nacl_factory = require('js-nacl');
var nacl_instance;
nacl_factory.instantiate(function (nacl) {
    nacl_instance = nacl;
});

function shuffle (array) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

function block_data (data) {
    var transactions = data.transactions.sort(function compare (a, b) {
        if (a.type < b.type) { return -1; }
        if (a.type > b.type) { return 1; }
        if (a.amount < b.amount) { return -1; }
        if (a.amount > b.amount) { return 1; }
        return 0;
    });

    var nextHeight = (data.previousBlock) ? data.previousBlock.height + 1 : 1;

    var reward = 0,
        totalFee = 0, totalAmount = 0, size = 0;

    var blockTransactions = [];
    var payloadHash = crypto.createHash('sha256');

    for (var i = 0; i < transactions.length; i++) {
        var transaction = transactions[i];
        var bytes = getBytes(transaction);

        if (size + bytes.length > 1024 * 1024) {
            break;
        }

        size += bytes.length;

        totalFee += transaction.fee;
        totalAmount += transaction.amount;

        blockTransactions.push(transaction);
        payloadHash.update(bytes);
    }

    var block = {
        version: 0,
        totalAmount: totalAmount,
        totalFee: totalFee,
        reward: reward,
        payloadHash: payloadHash.digest().toString('hex'),
        timestamp: data.timestamp,
        numberOfTransactions: blockTransactions.length,
        payloadLength: size,
        previousBlock: null,
        height: 1,
        generatorPublicKey: data.keypair.publicKey.toString('hex'),
        transactions: blockTransactions
    };

    try {
        //block.blockSignature = this.sign(block, data.keypair);
        var hash = getBlockHash(block);
        block.blockSignature = ed.sign(hash, data.keypair).toString('hex');
        //block = this.objectNormalize(block);
        block.id=getBlockId(block);
    } catch (e) {
        console.log(e);
    }

    return block;
}

function getBlockId (block)
{
    var hash = crypto.createHash('sha256').update(getBlockBytes(block)).digest();
    var temp = Buffer.alloc(8);
    for (var i = 0; i < 8; i++) {
        temp[i] = hash[7 - i];
    }

    return new bignum.fromBuffer(temp).toString();
}
function getBlockBytes (block)
{
    var size = 4 + 4 + 8 + 4 + 4 + 8 + 8 + 4 + 4 + 4 + 32 + 32 + 64;
    var b, i;

    try {
        var bb = new ByteBuffer(size, true);
        bb.writeInt(block.version);
        bb.writeInt(block.timestamp);

        if (block.previousBlock) {
            var pb = new bignum(block.previousBlock).toBuffer({size: '8'});

            for (i = 0; i < 8; i++) {
                bb.writeByte(pb[i]);
            }
        } else {
            for (i = 0; i < 8; i++) {
                bb.writeByte(0);
            }
        }

        bb.writeInt(block.numberOfTransactions);
        bb.writeLong(block.totalAmount);
        bb.writeLong(block.totalFee);
        bb.writeLong(block.reward);

        bb.writeInt(block.payloadLength);

        var payloadHashBuffer = Buffer.from(block.payloadHash, 'hex');
        for (i = 0; i < payloadHashBuffer.length; i++) {
            bb.writeByte(payloadHashBuffer[i]);
        }

        var generatorPublicKeyBuffer = Buffer.from(block.generatorPublicKey, 'hex');
        for (i = 0; i < generatorPublicKeyBuffer.length; i++) {
            bb.writeByte(generatorPublicKeyBuffer[i]);
        }

        if (block.blockSignature) {
            var blockSignatureBuffer = Buffer.from(block.blockSignature, 'hex');
            for (i = 0; i < blockSignatureBuffer.length; i++) {
                bb.writeByte(blockSignatureBuffer[i]);
            }
        }

        bb.flip();
        b = bb.toBuffer();
    } catch (e) {
        throw e;
    }

    return b;

}

function getBlockHash (block) {

    return crypto.createHash('sha256').update(getBlockBytes(block)).digest();


}
function getBytes (transaction) {
    var skipSignature=false;
    var skipSecondSignature=true;
    var assetSize = 0,
        assetBytes = null;

    switch (transaction.type) {
        case 2: // Delegate
            assetBytes = new Buffer(transaction.asset.delegate.username, 'utf8');
            assetSize = assetBytes.length;
            break;

        case 3: // Vote
            if (transaction.asset.votes !== null) {
                assetBytes = new Buffer(transaction.asset.votes.join(''), 'utf8');
                assetSize = assetBytes.length;
            }
            break;
    }

    var bb = new ByteBuffer(1 + 4 + 32 + 8 + 8 + 64 + 64 + assetSize, true);

    bb.writeByte(transaction.type);
    bb.writeInt(transaction.timestamp);

    var senderPublicKeyBuffer = new Buffer(transaction.senderPublicKey, 'hex');
    for (var i = 0; i < senderPublicKeyBuffer.length; i++) {
        bb.writeByte(senderPublicKeyBuffer[i]);
    }

    if (transaction.requesterPublicKey) {
        var requesterPublicKey = new Buffer(transaction.requesterPublicKey, 'hex');

        for (var i = 0; i < requesterPublicKey.length; i++) {
            bb.writeByte(requesterPublicKey[i]);
        }
    }

    if (transaction.recipientId) {
        var recipient = transaction.recipientId.slice(1);
        recipient = new bignum(recipient).toBuffer({size: 8});

        for (i = 0; i < 8; i++) {
            bb.writeByte(recipient[i] || 0);
        }
    } else {
        for (i = 0; i < 8; i++) {
            bb.writeByte(0);
        }
    }

    bb.writeLong(transaction.amount);

    if (assetSize > 0) {
        for (var i = 0; i < assetSize; i++) {
            bb.writeByte(assetBytes[i]);
        }
    }

    if (!skipSignature && transaction.signature) {
        var signatureBuffer = new Buffer(transaction.signature, 'hex');
        for (var i = 0; i < signatureBuffer.length; i++) {
            bb.writeByte(signatureBuffer[i]);
        }
    }

    if (!skipSecondSignature && transaction.signSignature) {
        var signSignatureBuffer = new Buffer(transaction.signSignature, 'hex');
        for (var i = 0; i < signSignatureBuffer.length; i++) {
            bb.writeByte(signSignatureBuffer[i]);
        }
    }

    bb.flip();
    // eslint-disable-next-line no-undef
    var arrayBuffer = new Uint8Array(bb.toArrayBuffer());
    var buffer = [];

    for (var i = 0; i < arrayBuffer.length; i++) {
        buffer[i] = arrayBuffer[i];
    }

    return new Buffer(buffer);

}
function getId (transaction) {
    var hash = crypto.createHash('sha256').update(getBytes(transaction).toString('hex'), 'hex').digest();
    var temp = new Buffer(8);
    for (var i = 0; i < 8; i++) {
        temp[i] = hash[7 - i];
    }

    return bignum.fromBuffer(temp).toString();
}

function createTransaction (recipientId, amount, secret, type, asset) {
    var transaction = {
        type: type,
        amount: amount,
        fee: 0,
        recipientId: recipientId,
        timestamp: 0,
        asset: asset
    };
    if (type===0)
    {
        delete transaction.asset;
    }
    if (transaction.amount) {
        transaction.amount = parseInt(transaction.amount);
    }
    var keypair = ed.makeKeypair(ed.createPassPhraseHash(secret));

    transaction.senderId=accounts.getAddressByPublicKey(keypair.publicKey.toString('hex'));
    transaction.senderPublicKey=keypair.publicKey.toString('hex');
    var hash = crypto.createHash('sha256').update(getBytes(transaction)).digest();
    var signature = nacl_instance.crypto_sign_detached(hash, new Buffer(keypair.privateKey, 'hex'));
    transaction.signature = new Buffer(signature).toString('hex');
    transaction.id=getId(transaction);
    return transaction;
}


var output={};

var genesis={};
var genesisSecret=new mnemonic(mnemonic.Words.ENGLISH);

genesis.secret=genesisSecret.toString();

var genesisKeypair=ed.makeKeypair(ed.createPassPhraseHash(genesis.secret));
genesis.publicKey=genesisKeypair.publicKey.toString('hex');
genesis.address=accounts.getAddressByPublicKey(genesis.publicKey);


//wallets to generate with corresponding amount 
var transfer = {
     'investors': 882000000000000,
     'bounty': 784000000000000,
     'infrastructure_reserve': 392000000000000,
     'marketing_reserve': 392000000000000,
     'ico': 7350000000000000

};


var block = {
        'version': 0,
        'totalAmount': 9800000000000000,
        'totalFee': 0,
        'reward': 0,
        'previousBlock': null,
        'timestamp':0,
        'height': 1
};

var transfer_addresses=[];
var total=0;

for (var code in transfer)
{
    var transfer_address={};
    var transferSecret=new mnemonic(mnemonic.Words.ENGLISH);
    var transferKeyPair=ed.makeKeypair(ed.createPassPhraseHash((transferSecret.toString())));
    transfer_address.secret=transferSecret.toString();
    transfer_address.publicKey=transferKeyPair.publicKey.toString('hex');
    transfer_address.address=accounts.getAddressByPublicKey(transfer_address.publicKey);
    transfer_address.code = code;
    transfer_address.amount=transfer[code];
    total += parseInt(transfer[code]);
    transfer_addresses[transfer_addresses.length]=transfer_address;
}



if (total !== block.totalAmount)
{
    throw new Error('You must send all money from genesis address');
}
var delegates=[];
//shuffle
var randoms=[];
for (var j=0; j<2048; j++)
{
    randoms[randoms.length]=j;
}
randoms=shuffle(randoms);
for (var i=0; i<constants.activeDelegates; i++)
{
    var delegate = {};
    var delegateSecret=new mnemonic(mnemonic.Words.ENGLISH);
    var delegateKeyPair=ed.makeKeypair(ed.createPassPhraseHash((delegateSecret.toString())));
    delegate.secret=delegateSecret.toString();
    delegate.publicKey=delegateKeyPair.publicKey.toString('hex');
    delegate.address=accounts.getAddressByPublicKey(delegate.publicKey);

    delegate.code = mnemonic.Words.ENGLISH[randoms[i]];
    delegates[delegates.length]=delegate;
}
var transactions=[];

for (var j in transfer_addresses) {
    var transfer=transfer_addresses[j];
    transactions[transactions.length]=createTransaction(transfer.address, transfer.amount, genesis.secret,0,{});

}

var vote_for=[];
for (var l in delegates) {
    var delegate=delegates[l];
    var transaction=createTransaction(null, 0, delegate.secret,2,{
        'delegate': {
            'username': delegate.code
        }
    });
    vote_for[vote_for.length] = '+' + delegate.publicKey;
    transactions[transactions.length]=transaction;

}

for (var m in delegates) {
    var delegate = delegates[m];
    transactions[transactions.length]=createTransaction(delegate.address, 0, delegate.secret,3,{
        'votes': vote_for
    });
}

block.transactions=transactions;
block.keypair=genesisKeypair;
var genesisBlock=block_data(block);
var json = JSON.stringify(genesisBlock, null, 4);
fs.writeFileSync('genesis.json', json, 'utf8');

output.genesis=genesis;
output.transfer=transfer_addresses;
output.delegates=delegates;

var json2 = JSON.stringify(output,null, 4);
fs.writeFileSync('passes.json', json2, 'utf8');


