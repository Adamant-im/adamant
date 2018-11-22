'use strict';

const node = require('./../node.js');
const modulesLoader = require('./../common/initModule.js').modulesLoader;
const Transaction = require('../../logic/transaction.js');
const Rounds = require('../../modules/rounds.js');
const AccountLogic = require('../../logic/account.js');
const AccountModule = require('../../modules/accounts.js');
const Chat = require('../../logic/chat.js');
const async = require('async');
const Transfer = require('../../logic/transfer.js');

const sender = node.randomAccount();
const recipient = node.randomAccount();

function sendADM(params, done) {
    node.put('/api/transactions/', params, function (err, res) {
        done(err, res);
    });
}

describe('GET /api/chatrooms/:ID', function () {

    let transaction;
    let accountModule;

    const attachTransferAsset = function (transaction, accountLogic, rounds, done) {
        modulesLoader.initModuleWithDb(AccountModule, function (err, __accountModule) {
            const transfer = new Transfer();
            transfer.bind(__accountModule, rounds);
            transaction.attachAssetType(node.txTypes.SEND, transfer);
            accountModule = __accountModule;
            done();
        }, {
            logic: {
                account: accountLogic,
                transaction: transaction
            }
        });
    };

    before(function (done) {
        sendADM({
            secret: node.gAccount.password,
            amount: 500000000000,
            recipientId: sender.address
        }, function (err, res) {
            node.expect(res.body).to.have.property('success').to.be.ok;
            node.expect(res.body).to.have.property('transactionId');
            node.expect(res.body.transactionId).to.be.not.empty;
        });
        async.auto({
            rounds: function (cb) {
                modulesLoader.initModule(Rounds, modulesLoader.scope, cb);
            },
            accountLogic: function (cb) {
                modulesLoader.initLogicWithDb(AccountLogic, cb);
            },
            transaction: ['accountLogic', function (result, cb) {
                modulesLoader.initLogicWithDb(Transaction, cb, {
                    ed: require('../../helpers/ed'),
                    account: result.accountLogic
                });
            }]
        }, function (err, result) {
            transaction = result.transaction;
            transaction.bindModules(result);
            attachTransferAsset(transaction, result.accountLogic, result.rounds, done);
            transaction.attachAssetType(node.txTypes.CHAT_MESSAGE, new Chat());
        });
        node.onNewBlock(function () {
            done();
        });
    });
});