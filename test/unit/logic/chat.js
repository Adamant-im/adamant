'use strict';

const async = require('async');

const { expect } = require('chai');
const _ = require('lodash');

const TransactionLogic = require('../../../logic/transaction.js');
const Rounds = require('../../../modules/rounds.js');
const AccountLogic = require('../../../logic/account.js');
const AccountModule = require('../../../modules/accounts.js');
const Chat = require('../../../logic/chat.js');

const { modulesLoader } = require('../../common/initModule.js');

const constants = require('../../../helpers/constants.js');
const bignum = require('../../../helpers/bignum.js');

const validSender = {
  balance: 8067474861277,
  u_balance: 8067474861277,
  password:
    'rally clean ladder crane gadget century timber jealous shine scorpion beauty salon',
  username: 'market',
  publicKey: 'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
  multimin: 0,
  address: 'U810656636599221322',
};

const validTransactionData = {
  message_type: 1,
  recipientId: 'U2707535059340134112',
  message:
    '9ae819297240f00bdc3627133c2e41efd27b022fcd0d011dfdda0941ba08399697f3e3bb5c46a43aff714ae1bac616b84617ce446d808523a14f278e5d88909837848e7aa69d9d4f9a95baae56df6ad4c274248d3d01a2cfccae51367dfab265a055d5ce991af654ee418839f94885876638863d172226b0369cd488c5727e6b1a42ba46fed014c1bf586dd2cab3afe7f10cb54864c099a680d5963778c9c4052df305497edc43082a7d60193650c331c6db9c9d9c0c8bbc004e53ac56586331453164b984c57a495810d709c9b984e4f367888d8a8ce1b26f528c1abdec08747e',
  own_message: '6802a9e744aa3ba570d7e48fce5fe0f49184d0ce38ea40f7',
};

const validTransaction = {
  id: '9175562912139726777',
  height: 10288885,
  blockId: '10475460465898092643',
  type: 8,
  block_timestamp: 58773245,
  timestamp: 58773228,
  senderPublicKey:
    '2ac5eef60303003c90f662d89e60570d8661c8ba569e667296f5c7c97a0413ee',
  senderId: 'U8916295525136600565',
  recipientPublicKey:
    '5a3c1da429ae925422892e69dc4f0ab6d7ac00cef229d2d992242dcfeca27b91',
  recipientId: 'U2707535059340134112',
  fee: 100000,
  signature:
    '287dc2554025d8074d674d50ec785d530588e2b828f2d3f29687a4f05c8afc623e185896abc739ea2af8db199ec6e31c57426937343ff5ec154341cee8f72f0a',
  signatures: [],
  confirmations: 32801518,
  asset: {},
};

const rawValidTransaction = {
  srt: 'U15365455923155964650U5338684603617333081',
  t_id: '2459326385388619210',
  t_senderPublicKey:
    '9184c87b846dec0dc4010def579fecf5dad592a59b37a013c7e6975597681f58',
  m_recipientPublicKey:
    'b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae',
  t_senderId: 'U5338684603617333081',
  t_recipientId: 'U15365455923155964650',
  t_timestamp: 226474809,
  timestamp: 226474809,
  block_timestamp: 226474815,
  t_amount: '0',
  t_fee: '100000',
  c_message: '1451787721dd28b69ec768825b2f9e5473b580347f42',
  c_own_message: '543ee6e48b4348439b2d839d5cab876938c7e42b6f8d9587',
  c_type: 1,
  t_type: 8,
  b_height: 541701,
  confirmations: 18,
  b_id: '17768103885289794518',
};

const validUnconfirmedTransaction = {
  type: 8,
  amount: 0,
  senderId: 'U7771441689362721578',
  senderPublicKey:
    'e16e624fd0a5123294b448c21f30a07a0435533c693b146b14e66830e4e20404',
  asset: {
    chat: {
      message: '75582d940f2c4093929c99a6c1911b4753',
      own_message: '58dceaa227b3fb1dd1c7d3fbf3eb5db6aeb6a03cb7e2ec91',
      type: 1,
    },
  },
  recipientId: 'U810656636599221322',
  timestamp: 63137661,
  signature:
    'e25f1aba994c7f07c03099edcbe0ada19df371ddf1a829dae8dee36ab809ce8a438111bf65056c813e9dc832a890a081ba1cd295d37e509f62f042149e62e30d',
  id: '8958126469643732641',
  fee: 100000,
  relays: 1,
  receivedAt: '2019-09-03T11:14:22.638Z',
};

describe('Chat', () => {
  let chatBindings;
  /**
   * @type {Chat}
   */
  let chat;
  let accountsModule;

  before((done) => {
    async.auto(
      {
        rounds: function (cb) {
          modulesLoader.initModule(Rounds, modulesLoader.scope, cb);
        },
        accountLogic: function (cb) {
          modulesLoader.initLogicWithDb(AccountLogic, cb, {});
        },
        transactionLogic: [
          'rounds',
          'accountLogic',
          function (result, cb) {
            modulesLoader.initLogicWithDb(
              TransactionLogic,
              function (err, __transaction) {
                __transaction.bindModules(result);
                cb(err, __transaction);
              },
              {
                ed: modulesLoader.scope.ed,
                account: result.account,
              }
            );
          },
        ],
        accountModule: [
          'accountLogic',
          'transactionLogic',
          function (result, cb) {
            modulesLoader.initModuleWithDb(AccountModule, cb, {
              logic: {
                account: result.accountLogic,
                transaction: result.transactionLogic,
              },
            });
          },
        ],
      },
      function (err, result) {
        expect(err).to.not.exist;
        chat = new Chat(
          modulesLoader.db,
          modulesLoader.scope.ed,
          modulesLoader.scope.schema,
          modulesLoader.scope.logger
        );
        chatBindings = {
          rounds: result.rounds,
          accounts: result.accountModule,
        };
        chat.bind(chatBindings.accounts, chatBindings.rounds);
        accountsModule = result.accountModule;
        done();
      }
    );
  });

  describe('bind', () => {
    it('should be okay with correct params', () => {
      expect(() => {
        chat.bind(chatBindings.accounts, chatBindings.rounds);
      }).to.not.throw();
    });

    after(() => {
      chat.bind(chatBindings.accounts, chatBindings.rounds);
    });
  });

  describe('create', () => {
    it('should throw with empty parameters', () => {
      expect(() => {
        chat.create();
      }).to.throw();
    });

    it('should be okay with valid parameters', () => {
      expect(chat.create(validTransactionData, validTransaction)).to.be.an(
        'object'
      );
    });
  });

  describe('calculateFee', () => {
    it('should set higher fees for very long messages', () => {
      const shortMessage = {
        id: '438452752317142988',
        height: 10224582,
        blockId: '5808058151912629759',
        type: 8,
        block_timestamp: 58449060,
        timestamp: 58449055,
        senderPublicKey:
          '12d6b3f80221a2b0b6d2ef07ae33fce28204c1906ec1bba1d15be693d3353ec4',
        senderId: 'U839357947177758191',
        recipientId: 'U18018989827016540480',
        recipientPublicKey:
          'ec48de9b438ae9f12e271ba28d56eb0b3f3bba7b120df7685eddda97c9f79160',
        amount: 0,
        fee: 100000,
        signatures: [],
        confirmations: null,
        asset: {
          chat: {
            message: '3e5314dfc9a1095eb874d76cd878ea5a8420ab2a',
            own_message: 'e26b9454b0927c904863e44bca30aa4d05bf3ee3f9084976',
            type: 1,
          },
        },
      };
      const longMessage = {
        id: '11526778501097815775',
        height: 43309687,
        blockId: '4836663956106296575',
        type: 8,
        block_timestamp: 226029230,
        timestamp: 226029223,
        senderPublicKey:
          '1ed651ec1c686c23249dadb2cb656edd5f8e7d35076815d8a81c395c3eed1a85',
        senderId: 'U3716604363012166999',
        recipientId: 'U15348108860160945984',
        recipientPublicKey:
          '37916bde1d49df4041fdc5869cb47f2836df11be48a0a88aafa6152d86f217b2',
        amount: 0,
        fee: 1700000,
        signature:
          'ddf895f70c9ff5c513c0acafc77789d01f9a31032d51c6a85fd629983ee63c03dae5312f990fc3ad41fc1d64d593b359618f424b62e6532cc529a06dc8de3c05',
        signatures: [],
        confirmations: 1,
        asset: {
          chat: {
            message:
              '3b993b1d6d0fc6d97cff9ac72abc65faa46f554acf799095b32a0cd3b7dca693634b89b9e4e3d600ef72ede2ca69ca7024631d55e74af938035b0c6a6db22e0be1dba549b8afe1e67db3440263c5ffba55115caf1d6a8e51bb80b61cee2fe4a31d8a9b22ce5030967aabd74c985e3c8eaae15db3700daad84eb8271d48cf62e04f33b65df6ad2f098631627c5ea5f43611e631fa1aef832b560d533a12b2ea26a59b020430f7b281f6a149a6d37fc6c838b0dd5ebcf60b95c770c6a89ac78a3a21528f2131360560d1edf43bb93b106978de5b691fdc2699dd40d129a2e124c101cafef2c05eef99422b55a158001cab4528117ffa16b740acf3169c73256bf8b55a6d1003f1e9a3368ded8bef1426385164e6af86d3d7fe73e0e63e62bda514eadfb4993ff406be26a69fd90102cd76e0d419a800144f7a88ff880eb09e56fc28cfa1234d19a1f7902cbdf82609ce5ddbdf2798a6f64b4af7cb8164f83992af2f599a9e63ec848a3027bfbe14b9c9ef37863a1b835b800679a358f6a6058051efc734bfe6470b103e72df1aa250be3cfa197236255f7f40379a4791d4b581fb5bb58fbbbcddf2634e652c2c72745e7d43bde3302214e1688a79b94bb068b9be9a12db27a4c529e66c86e1e574fd06a0484c8d798ac5d53617fb1a522a6d94602ed5a27e7eaf3070360ea20d84ac0089085f99672254a70a234dab9bffb10d6897080ed123dbf473f006d53d5e122fb47398a0a6fb322a1c63f271a01e0f7407901603e8a29d9ab91d3ac460065a80b4fda5ae4b335b819286d7dfadce9b2b3b7817874ddda62bf515445e02e57ee9dc7efa09f6df2b1c838beed73ddd6fd24cd5fd8e7a5e0d6be735ae57b8eba056981647b9c4213842903e3e3368d4b62ebe702886e5185c45d3440559939e90babad2d487a734602aed154083219c90e3ddf2abc7d7b3eb314b386ef593d2f7a8b87e23f836556b36350c4ef3e400e9433e1f6cf4af6ad8ae0823b525fdf999c6fb0875f4aec0f56cf37ccb83d229e39994df22ac7a27bf85d96a9684358f61c0278321c84c4cc6df3b58c20d4d858e323be57f02b32c847ad085985031b5c3872f8858655689881f7fc1984993d931c3e76139e50d6ae39129c957ec1f1c40730c0243d17753449051b18829226756e3c875fa9a09a4c238c3d5ba64c362dd3ef3e17f00e8cafc9e6bb723c73101868d9ae839bb4feec81b27b5b2974ce290d1609350bf7d8cb2dbb3d18f0cce99815b50deda814aec7727fe1097e12357d729cd62e31552a05e8223d3236ec345a0366832f196874ed04abe7d5c44d195f5c5759037e6a538d391c1b542d04a4382b13e2b5fcb740a3483ae57e250e377840f9bf0a103ecddd5c55afc3e4f8f182d3f4ec7bf28909a23c26eda3a2b8bc5e9bdb628f977380341f3a4d1468298b638720b6c6e03fa5f6c0d4863514e7a8af3dc8b03e31626c9d499dcd9879eb6f44c03346fb72255f20ab9d52dc9aa7975b014f0e66ef1747d275368fba85762fe09c53d0b2a5a8964bf008825635af5ee7d804a93e75f62a8f035b6c7d13957fcb9c6f78ed0e077386d23ce4280ed346423a495e0c801633af207451e210b10b9813773295abc77f6b24d3a6ec6907f83e5d3f0123c680338b07a071c7713849692eb2949307926b41968dad3a4a8606efd3dae645576b27c82c21bd865eaa7a17734f9e9b1b4f67c32bf035f25cf091f4fa55a46c6f54de8bef6abff0d666a51762ededfe89cdf86f4a32316e9494ba4526a86c75c39e9fe789825857a145a8d978928268eeaad401227eb0ddc48f70966b947f51ece662b8704747f05a9a36788e50a5603959ee19d09db3c3f0499201d2c7a9e2b14c7eb8cbff0e82a3729645e5330d63f72f1e928c29b8e150e18fe2936427245573b73ec5b25e33a04c88b5b7b143b5d87d97fbdc131d907046a20be820986b6b28cb2f99cb0c495dab6ce2bdeff9d86ee692de3dc41605b40a9c52f0ffef9e454ec4f89cbad3b9137ee3321b8ebd19747793cd304d093bab8818718627b000cae796017645bf9bfbfbf40684737edb621ecbd302b53d3c7e7407fed35c813e7d227c40b273532af65a5c16f723fecbc8967b62dbfb9987e1e08f1b45e80abfb1409c6cc60000a344a88b8076af309bfbd08a154aea8ce1c25d1e10c33d1c1e4cdf2a0748f682415d3fe2179e7a133e94c133244dc6b032e68164f57fc68ae7528aca37866063e1dd0c06d38e546a0f76ad7291faf8b78645d063ffb35525c0c28ab640acb19bd2fe9fbd8da2517511d413faf9d7e9e1f3d057d474c428ab58a9851653f00bc33a82e6beda6dc467a0024351dbb477f4ce12f171d4c975ec7e9149026e450aaeadab7f84d5032934d2fcba8e8e21867da9b4e47ef02c8b3c0580b53115230ba7e0854cdc566c71468a8e2668ac576afa6064a7471d9e0a23c5ffbf55cfdd51b79b2f5cfeacc9d95c20f1114726257bc90c7b14e1d67b4c6ff5b924b6f907b224e946a1cc640e93bd0fe5473b2af05454695a0896f6a4d971b5bfca064d42f81ee258004258fd1a8b93316fb8a1f94d83569d6f5125dc54ee3e97d997ae1c365acb40ba545edb5dff0dee9f0bb48724ed51a8ec2dbce2748de5a98a5e85fc876c33bd2d6aa2478224ec98cbeb20fd34e7c463361adeb9ea006d6386a2f53098652d5748a832234d5c82ea94dc7043dc788e01a8905c39c39b5e808ad7bd788696f67b0187e3793454670b5ec5c05b3017640d0c289d9ace3a5bc90cd63f694be34bc0964581bb2e0f4bd2996b05de1d83d31c51db2ce03a9b16c980bc2952d6430de277f1aa209c19589d2bf8a45f98f145314a5cb9058263afa544d60018f12fa5db7635faed7eca02148e7f89022d3b8daedd48b8078e529e3d6c4f53b3191345b79ef0492862f06cc6f9a36b87f4902706d8760dc7042afe7f0b1d78c48a06dd6192429071fae27b5a9db8199c18f0b59c35ef29a104e236b86acbeae4bacfc2fe8e8a575bd7b465d3f71f37c33d621dcf7acc3f84a84dc9be77dd60cc2b3e67e4fbaa76f320f2bee6272fa2af8b5748e4bf59951f5cba8a6d6fd6dc7ab5a903c2d6a73b28c14dc0073564905a9df195df0132181fc651bbdf1a6e27ebb22bcd60eb24b6985442c38192542dd6b6f4682ef611843ae02dcd39ae11e10c8d53d59c8efd52b406ae29f30eaa0031e2cf53f42ceb6342c85571f10dc7c15c6a9276eec8a724595d54ea9c675a898a2f2ba9562963ac465b3d14272cb162e1475b05f7c2e77350dcdfb4a289d7e65bc580af4a51ed0bb92ba5f7100ec0a66a178f50727f8cb1db553f3e9f17d631da606caed958f6465c1d0274a7d965efc409efdf1c637eea4075f02b0ee3cd67fb1897a6296f8adbb88b53ab9e4536973795e618cac66a8cff07f5ccaca9fe83cba990039c5dd3307cfae49fbb3c29d45b30996e0883c909c2ab75ab72aaebf19ec3b040a4a52ce88c62ab00d70a5fb0f569d5ddef3572d4d6a2f7104bcfc2d89b2330db7252ed9628463fbae76113754e17b46728afa77481feef0ed4e496a3136c7a1ff728c411012ed12521bca984052247535ab68340b08c659ae2c6c4247f56f3248bebff8557640ff6233ab94ed1d9ea6097b67ee62a0a3c7d528e27cf3e1e1180ce58364fa616108910fde43d866d4d479f81048396252c6c9725c8c26eaeb03e2b7cca824aa005dbd9970828f77922d0fb4fe905f8b68c6872db3d699a8dac13ad84bc3dd40538cbcfc069be6e79b318e353506be4bda8a2c802a232a1750547c1a7e61a1ad0a29c135de66c79472b87151610a82e3d7ff3ba2ce46a3bd009f35c902fc1bc68da772dc860b6ab1462b4774455eece1b80cfcccd0ca1c9e4bb9751fd601c5dabc76bb3ce43be3993678f9f365073a63054aa4127ee424a422079d1b172c610a172249ec62ea6f1b91fbba0c420fc62fa010a7008361dcd4ea167d5bca3b3c4577673a7fe8e80c5f19ee41353792aa0c0afda58c3518d20dbfe5ac81e8da00b287e5d11ffe9b9d5c8b37d387d156baee3a7b88d7865553ef744b5ea17640d373910aaa0014e079a366f253a354a6325092c4de9bf37c1465d33155ce391b24dbbe83ed8521fe942c2a3bdea28e10057079fff79e5523665cfc01675f268aab7730636384788d4b19a2420dc7e1f72ce6cf62f0710dd9081f457d64795e1556038f69dfe25fff8976dc092fa8b9ba1cce2960595f32f9a555dddf6f120c9bc89bc3e473346504f14ae3c4624d18ac3f33f09599c2170d86127456ab03faf55587a54671cd03a4b57e92be822c46348c14c068c07d7912e00668b73dddb44c1fd96b3993b6df13c6888fe1d7fde037785716fc6550cc81738a122f21c79ada4c5c2c999690c93c7b8fcc78f56364db136aa2e671994f29756c20b73c399914085e819332b4bc243960a98f04605451005b008d82a76eef5c5058764fa8af569ab720fca84174d0fad1acad498abb13a25b8394e71b2f499c926b9e60a0aa8c9815ae3cf1177d19c5e12b02cac7737247dacf44c69e796f6f552212def4baac7ab7566b981275ad05422dd97cf0997761d03b4f07b7d38fbaca81ce2a86d1c669013e1d8ce1d37fc69f8bdf7bbf3ea17cad300a40c10b1dcda025f006deb8e8b99d91eea6ea117b58c4e0fe858686379aeabf0c06736bba33cc4b52af573056be4c947756eb61255c2a8bf240e402f2bfd0b5243299b91a8a23f0f288e7d0d7764399dd2f17e55c4d513daa06115afa941327add61e4aa48f9d9bf8738f4c1dd197d92e35d3a9ec392525aac0bd49c614d5e376b7b9a0b1a39ed3e2ca88201379c18b9050f94ae7afc7083aec43248cbb9009f86826565ff530a575b6ba81a5d19251889c8d3b356d5fe57c3afe52cb6872eac5715bd52b5ff9659ae1f01bdd9919776ce38f40ee758af2cf3bde0009485f9ccf4667afc7e8f830e5969e8e1f0fcf6e01bec99e9309965ca11a70ed844adf427f8421d33adfa358417d8b7491e56e82d0607a48cb7738771c957cd4146076ee0ab1d3b919bf3b46fbdb2e9fea2db25c19198ee628fea550f8d6b9a57131464651470bc97384535973eb5926be344714f7f2d773dc66fc8f5d12f4a1fa1a95003380bac6f8cd52bdd0bf0217ea03478e94c22023856e6a4988ccf81c036229e69d882aaa900a19466a1234093c7a3315190847beb94f8ef525c50e6c830f9e22a9e1c431649050c5bad7e77e38c457d7dd780d6521218af80b1cf2df51e01e35b2c01db3c74b8ff9d0d6943f897f48824198d076ab44579aabc62ded89e8f81c194c0a371007e9540aa4a0ec930cbcdf4dd6e3c28306dca5a25a01d207823c46820c35420014c11b68e8ebac730b1daa98b884db141044e2dd03b0ed4c214bd821ee5410597014dd7083f2fe3831c5932f3514537e0b4d0853680d02f2190a5582a75bfb75173053c0ced7553d4d24363accb52651056b802f0df48d8264f0c0cb9cb7b0967730049f291033a93e3bd4fe632414d5989e5b0771653198ad2922e2f3ab441b9c14fcf4f3a7b828a16bcfc0d714cce533ccda1c27bc3e48ebdef2aacc121e5113ad28a141560b69b9bff890970065b11bea62e6e4b1b21477fdde6eaf94393e27932ac2fe6ce871cf42a6ed6f8b0ae1ff5a79e0ca49ae80d1b6c246bbfadc47119011658899744662a22d4ea71892747759d475ae4e6f7a045dc3fdcd6866aed762babc6ccf182c5df3038700cd755cb2178ca1a5b29d1258e61ea909056b78b645632a0ef15bdc0ea84a9668852f53f9472a5bb6505cc3bdba2993e394959c1d63c61ba0367d39fe3fce035bcc3c752d15048fafe51ea71075b6f0dc9e5e313306247e1e39164c42b1eaf56660909a34bbdbafb90c82529bc951ca31afe853d4074db7557d7ec15b3fd92141848b8b428ac805b75a0bf4bd9371bf78b97ea102348a2c39c8f7b756b16b5c68d5dcc530473145bb5ef7e0b7c868b2b7ab7e40c0d1a40a8c53a17eb0ba3e42ecc883c362e6beceb57529f676c7c19210e38dca4adaa74b0e53729f21b9d0a60d4ff124d2293db5f498efb1525e63696412e5c43cfbc9b310873ad0823ee374dce3d50db028ea73dd7619d6c1e7a92469cbd17661fadddfc93ae92e286459b8feec83405611c5998f62d7e82800ffcbbd4f35251c0d63fcb76e707af99f38812188c754342a8dfda20ca7177b9565de1d6127ac5ff69099f6160ef50ed31b8b452f8b523c6954993adfbf337e5108ba88f045d2f8ad79853e5ddfae57d2cc9ee51e1b87273948fd61b417d7e1e25aea262cb4604c6bf57a52193a24198ac1ccba957ba0d63b97306ff9d49abf485f0852ec1f9a68f4d88ba0969ab053dc331cfb0e4f3dd8e898a926f4d90639a9dcc673b4a95633d3c55b750f737464d70aefd75f5cf23a0c4d60f5d2612d9b8581b360ac59ae2b989aae5ab2e2619aa3b1d4a7f7893461d1ddf25e41fd5cc2f62d2f55193ac2db9d0a433eaf42d597fe2d2a4ce6553acc2c74e7e64b9c64de0289f6fc4c879f42db66c7e37fd52f790bfc1ed8fa813167cc311acef240c5e436a7c90d1e1ff073243d89c4e35329c8b8516508879ff77108c8ae1b9e307dfece5641824b454f2a2376cbad476c1b865f8cb196f8605bb8d679788a35b385eab82bd1d375afb8363c633ebe2985cc9b7e8af3068f6d5c684cd2538999352410410328c4936c8fbffc97da00078c35d7c5d60e9f94421709c4145b35d1e05ac10ff4834d49c8e624ee07482d9f97682c8ddcaf6ce6c3660f410015893e33566db47efc3c0e6c2d85dc0ca0a9f94908bb83bd0a96b5a5f97a6c9266879d86667b433de197558f54cafbc2a21b0014241693f7dcbb9c78f797b52d9996fdb714190429435d0e40b641e9ccfbeb6c6dfd8a424f337fa2d52de5ec333658327132c557fe1edff84be887c23f9ffa93b49854deede86a1cbc0426deb46f019889eea08b3df053a5cb89c831eb2aa77360abdd8af5000bbc0f656235751b3cd5a1ddbf12874a87a98fc2e45f0b45002b2b88810c99a7b0edc8e503db2f316f417f5af2c9940ec7710c3003e1088bd82f47ec45a8b7c3c7addeb4d19c8ab4e5109f8cc7283dad9b73dee9e1741fb1a7b8946808b4749b8f1706a7ff65552c69da5e81625141c37961436b3ca9cc0c25f088245a5c33bdb449859b4ba55e014429faf3ed60bc8cf60f6b106e5f8ad68af5e224e86910794a94d89528b19ad0e83a9c445b5219b2478a76b0119f525ffb2dde0efe05a107b9d268f49dc3de7a3c3c88f2abfedb241e9ed7560e8e60c2088592ef0c3f56c923f2758601711e3015b9d703de8bb2ebaa900236be29540e4f1761eed2da9c9c1efaa5f7be51d1a6d9dcce136e675b335d8b3d5fdb6e546265b0293c74836c5643b65425ff8fe32d1aba644a26fa8890af8794aacd580508f2e01e0ec9a614fa68dab64b191fcd703780eef2e6626329a597a29f4f5918c3f9e18be2ed01de8e8518bcf61eb1e08588a3d42665aaebba7fd166c409ed06a410e29416680d811c56eefae9f20b4723783496812acc51fda2f5c8f6bfddeccc142d2ed6e062666c00122dcb47b2766c3f5188017934c3ee2da82e02783743f09b7a9891a7b47d2a43190613e5aa08216df71ef57ee895eda76777d3973783e42f37fe7ff1abd2f98d36ac873b1e8e15ee17f17c0f3eafd74db5f908594c9cf96e040b9deb0b546ffe12f0c329833cf630c799f174434cb3fa89c2d9cf4a5cbbf423defa7a1714b601928c41d3cc79cfe958b71dfb0cc64ab5d43a688de5513b6e28c234f2b9614e5e80bce9f557b10d0118793d954cd827d0df9f43bbb8342b40c053e3f16353c2f2f8369a2b091ba6d1fff79af45577cd0ea02547230f268b0e784944e7084aaf9969d51672b4ae4a6ae32ce5a7e3afd356e51318c601e2d18bc3d118cd23c9f832adc8572a250dcfbaff28068fa9c8950de7db7d540c53b7b84d9cac0800652e6b93f50779aaf665287a90b39776bcd49775a754e696510ecf6a71098227c4980afc8090441d983720c55a78f9f96078cab9993ecd7966cd5a2ca1878c43705261e2f42e6d43086ae76ab575c3a955001ad58b018439490b9597e22ff7aebd3c19f4ec187b3dd7b95c26e4b197742677cf5a1d6072a0fe12004161dddf20feba199e8f8bbb1bc50bce316902a197d3ef1e09c86b536c76f07c21a9b64c13c9aec737b52b508c2eb18c9ab28853f7ffc52baec57be37ffbf52be79d4c0c201fdd07737c624ee1d79d5cabdbce9eb1f350c33ed81fbed9829358d80cb9a854f52e7be8d6bb17343a2215e4068dd485a34afaa8790b9661c046874f30dde4bc8213ab3c9a192114f31132de778cfeaf4d9cffa574cc4827074535cf4319727500d721193df7ba80f5b46a6ccf085f044172386cdf30ae4d77b28b2fffdeba38f840699d1458bd089f8fb577434e3e960f38bbd4adffed4a64d5339db80019c0a16e7cfc031f4ef1f5872131e43aa0951916bd9b4bbd13817b56f13df2a04e9feecc95fe6f8357c4452ad9de393033a35765b7571f1d87694af76e6008b0c316501c0feb6434c827854bc11377f7eb230ee4fca44eb6098d63b6df70a8d78e7cea23d725cfbe98e9fc9cf662e310846e137c1149b1e92b089549071c94c87bbe2e32a83bc3ecc8a24f1f6c966d65665883a41313d58f65aa3ff97e9f64cdcc87fbeb7ed6f856b1838eb0fcc1027e1b00b97188f8910a5b2bffa2a309919b4406002758008aa11060dc881ea03232c8323e1fb34c2725558ca82ee7caf17fb5f0ec94d5bd57d0e1d36ba0ede3ba9bde5bc8bb639ca0e6b65d1d3793a765bd9a1322cd258eb64404aec9f2a497fc7dce8db8ed3c6fa5c1fd6dd145c655cb8adca26d2b9785c55e676c55ce2475e1001b8ca5a9b72757e119a8586f08deb2d99d281436d9d4d5742556790e1db0ef594a7e557b413d61e3e2a6409481b560534be53b5e12f24d5b3adaa72a41d30872bc5c4efee405721a67b9200659ba575756824d5b7483e2d179b335f061b182f31e4a62b1fb83cf88b8c0997b0414357a0cf49b6f144743dd535405d90e1901ef82056ce2342c0f15aa9cb25f7e2a7aa693a2c37cd21e4602f1e41cbdb774eae7d9df1676d5b552d6e90f50cddb53ac6fac76418385a9390dfbabba9c882033e190af233c6283b090787e42d5431cd2d2d80d873a232d327a005cffd4e493a1df31d057d05ae503b46629d1a11bb6677e1456d4ba425143c6e500f7752d100d43206f15d92708dde88f3e84daa5e129b9b9037c0c148473cc40297d19c3c11a793305a6755a966285909d0c27b9b021f7f13716b11269de89fc1fbed4a8c56c3a7fe351287d373e18293a3bdf46492387b254cd1118f1868dc7cc80069744f82161068753e0ac',
            own_message: '5664be2b474a48f65e094f1df448e0f11866da00f3d227c6',
            type: 1,
          },
        },
      };

      const shortMessageFee = chat.calculateFee(shortMessage);
      const longMessageFee = chat.calculateFee(longMessage);

      expect(longMessageFee).greaterThan(shortMessageFee);
    });

    it('should use transfer fees if it is a message with a transfer', () => {
      const transaction = {
        id: '11917958650570868382',
        height: 43320192,
        blockId: '15216271678937402799',
        type: 8,
        block_timestamp: 226081760,
        timestamp: 226081753,
        senderPublicKey:
          '1ed651ec1c686c23249dadb2cb656edd5f8e7d35076815d8a81c395c3eed1a85',
        senderId: 'U3716604363012166999',
        recipientId: 'U15348108860160945984',
        recipientPublicKey:
          '37916bde1d49df4041fdc5869cb47f2836df11be48a0a88aafa6152d86f217b2',
        amount: 100000000,
        fee: 50000000,
        signature:
          '7a974d575eed40b6dcc8266f08c83b594bf926e35f59f7dd4c15c084a09ca5f3ca8dda612103552ff438e66f71a4b14b9612c5c6a04b666bfee9e85c03abc903',
        signatures: [],
        confirmations: 3,
        asset: {
          chat: {
            message:
              '7a82b8c052ccb0a95aa100de7fa3853295d3b6bad2e1a7ce2696d7df2e82394fa14db51051e0a07132ec',
            own_message: '2634f6916736952d395afc8399699cb938232d1e6a9631e2',
            type: 1,
          },
        },
      };

      const fee = chat.calculateFee(transaction);

      expect(fee).to.equal(constants.fees.send);
    });
  });

  describe('verify', () => {
    it('should return error if recipientId is not set', (done) => {
      const trs = _.cloneDeep(validTransaction);
      delete trs.recipientId;
      chat.verify(trs, validSender, function (err) {
        expect(err).to.equal('Invalid recipient');
        done();
      });
    });

    it('should return error if asset chat is not set', (done) => {
      const trs = _.cloneDeep(validTransaction);
      delete trs.asset.chat;

      chat.verify(trs, validSender, function (err) {
        expect(err).to.equal('Invalid transaction asset');
        done();
      });
    });

    it('should return error if asset chat type is invalid', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.chat.type = 72;

      chat.verify(trs, validSender, function (err) {
        expect(err).to.equal('Invalid message type');
        done();
      });
    });

    it('should return error if message is empty', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.chat.message = ' '.repeat(256);

      chat.verify(trs, validSender, function (err) {
        expect(err).to.equal('Message must not be blank');
        done();
      });
    });

    it('should return error if message is too long', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.chat.message = 'f'.repeat(20481);

      chat.verify(trs, validSender, function (err) {
        expect(err).to.equal(
          'Message is too long. Maximum is 20480 characters'
        );
        done();
      });
    });

    it('should verify okay for valid transaction', (done) => {
      chat.verify(validTransaction, validSender, done);
    });
  });

  describe('process', () => {
    it('should be okay', (done) => {
      chat.process(validTransaction, validSender, done);
    });
  });

  describe('getBytes', () => {
    it('should throw an error with no param', () => {
      expect(chat.getBytes).to.throw();
    });

    it('should return same result when called multiple times', () => {
      const firstCalculation = chat.getBytes(validTransaction);
      const secondCalculation = chat.getBytes(validTransaction);
      expect(firstCalculation.equals(secondCalculation)).to.be.ok;
    });

    it('should return the valid buffer', () => {
      expect(chat.getBytes(validTransaction)).to.eql(
        Buffer.from(
          '9ae819297240f00bdc3627133c2e41efd27b022fcd0d011dfdda0941ba08399697f3e3bb5c46a43aff714ae1bac616b84617ce446d808523a14f278e5d88909837848e7aa69d9d4f9a95baae56df6ad4c274248d3d01a2cfccae51367dfab265a055d5ce991af654ee418839f94885876638863d172226b0369cd488c5727e6b1a42ba46fed014c1bf586dd2cab3afe7f10cb54864c099a680d5963778c9c4052df305497edc43082a7d60193650c331c6db9c9d9c0c8bbc004e53ac56586331453164b984c57a495810d709c9b984e4f367888d8a8ce1b26f528c1abdec08747e6802a9e744aa3ba570d7e48fce5fe0f49184d0ce38ea40f701000000',
          'hex'
        )
      );
    });
  });

  describe('apply', () => {
    const dummyBlock = {
      id: '9314232245035524467',
      height: 1,
    };

    function undoTransaction(trs, sender, done) {
      chat.undo.call(null, trs, dummyBlock, sender, done);
    }

    it('should return error if recipientId is not set', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.amount = 1000;
      delete trs.recipientId;
      chat.apply.call(null, trs, dummyBlock, validSender, function (err) {
        expect(err).to.equal('Missing address or public key');
        done();
      });
    });

    it('should be okay for a valid transaction', (done) => {
      accountsModule.getAccount(
        { address: validUnconfirmedTransaction.recipientId },
        function (err, accountBefore) {
          expect(err).to.not.exist;
          expect(accountBefore).to.exist;

          const amount = new bignum(
            validUnconfirmedTransaction.amount.toString()
          );
          const balanceBefore = new bignum(accountBefore.balance.toString());

          chat.apply.call(
            null,
            validUnconfirmedTransaction,
            dummyBlock,
            validSender,
            function (err) {
              expect(err).to.not.exist;

              accountsModule.getAccount(
                { address: validUnconfirmedTransaction.recipientId },
                function (err, accountAfter) {
                  expect(err).to.not.exist;
                  expect(accountAfter).to.exist;

                  const balanceAfter = new bignum(
                    accountAfter.balance.toString()
                  );
                  expect(balanceBefore.plus(amount).toString()).to.equal(
                    balanceAfter.toString()
                  );
                  undoTransaction(
                    validUnconfirmedTransaction,
                    validSender,
                    done
                  );
                }
              );
            }
          );
        }
      );
    });
  });

  describe('undo', () => {
    const dummyBlock = {
      id: '9314232245035524467',
      height: 1,
    };

    function applyTransaction(trs, sender, done) {
      chat.apply.call(null, trs, dummyBlock, sender, done);
    }

    it('should return error if recipientId is not set', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.amount = 1000;
      delete trs.recipientId;
      chat.undo.call(null, trs, dummyBlock, validSender, function (err) {
        expect(err).to.equal('Missing address or public key');
        done();
      });
    });

    it('should be okay for a valid transaction', (done) => {
      accountsModule.getAccount(
        { address: validUnconfirmedTransaction.recipientId },
        function (err, accountBefore) {
          expect(err).to.not.exist;

          const amount = new bignum(
            validUnconfirmedTransaction.amount.toString()
          );
          const balanceBefore = new bignum(accountBefore.balance.toString());

          chat.undo.call(
            null,
            validUnconfirmedTransaction,
            dummyBlock,
            validSender,
            function (err) {
              expect(err).to.not.exist;

              accountsModule.getAccount(
                { address: validUnconfirmedTransaction.recipientId },
                function (err, accountAfter) {
                  expect(err).to.not.exist;

                  const balanceAfter = new bignum(
                    accountAfter.balance.toString()
                  );
                  expect(balanceAfter.plus(amount).toString()).to.equal(
                    balanceBefore.toString()
                  );
                  applyTransaction(
                    validUnconfirmedTransaction,
                    validSender,
                    done
                  );
                }
              );
            }
          );
        }
      );
    });
  });

  describe('applyUnconfirmed', () => {
    it('should be okay with valid params', (done) => {
      chat.applyUnconfirmed.call(null, validTransaction, validSender, done);
    });
  });

  describe('undoUnconfirmed', () => {
    it('should be okay with valid params', (done) => {
      chat.applyUnconfirmed.call(null, validTransaction, validSender, done);
    });
  });

  describe('objectNormalize', () => {
    it('should remove null and undefined dapp from trs', () => {
      const trs = _.cloneDeep(validTransaction);

      trs.asset.chat.preview = null;
      trs.asset.chat.count = undefined;

      const normalized = chat.objectNormalize(trs);
      expect(normalized.asset.chat).to.not.have.key('preview');
      expect(normalized.asset.chat).to.not.have.key('count');
    });
  });

  describe('dbRead', () => {
    it('should throw an error with no param', () => {
      expect(chat.dbRead).to.throw();
    });

    it('should return null if c_message field is not present', () => {
      const rawTrs = _.cloneDeep(rawValidTransaction);
      delete rawTrs.c_message;
      const trs = chat.dbRead(rawTrs);
      expect(trs).to.be.a('null');
    });

    it('should return chat object with correct fields', () => {
      const rawTrs = _.cloneDeep(rawValidTransaction);
      const trs = chat.dbRead(rawTrs);
      const expectedKeys = ['message', 'own_message', 'type'];
      expect(trs.chat).to.be.an('object');
      expect(trs.chat).to.have.keys(expectedKeys);
    });
  });

  describe('dbSave', () => {
    it('should throw an error with no param', () => {
      expect(chat.dbSave).to.throw();
    });

    it('should return promise object for valid parameters', () => {
      const saveQuery = chat.dbSave(validTransaction);
      const keys = ['table', 'fields', 'values'];
      const valuesKeys = ['message', 'own_message', 'type', 'transactionId'];
      expect(saveQuery).to.be.an('object');
      expect(saveQuery).to.have.keys(keys);
      expect(saveQuery.values).to.have.keys(valuesKeys);
    });
  });

  describe('afterSave', () => {
    it('should be okay', (done) => {
      chat.afterSave(validTransaction, done);
    });
  });

  describe('ready', () => {
    it('should return true when sender does not have multisignatures', () => {
      expect(chat.ready(validTransaction, validSender)).to.be.true;
    });
  });
});
