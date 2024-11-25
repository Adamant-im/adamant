'use strict';

const async = require('async');

const { expect } = require('chai');
const _ = require('lodash');

const TransactionLogic = require('../../../logic/transaction.js');
const Rounds = require('../../../modules/rounds.js');
const AccountLogic = require('../../../logic/account.js');
const State = require('../../../logic/state.js');

const { modulesLoader } = require('../../common/initModule.js');
const transactionTypes = require('../../../helpers/transactionTypes.js');

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
  value: '0x84609a38fedbcd02b657233340e6a8cb09db61a8',
  key: 'eth:address',
  state_type: 0,
};

const validTransaction = {
  type: 9,
  timestamp: 226647468,
  amount: 0,
  senderPublicKey:
    'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
  senderId: 'U810656636599221322',
  asset: {},
  recipientId: null,
  signature:
    'e3d569ec587dd0a47ff3c7fffa85506f98f5dd3ce56deb1e1108db3ac6c3c77c404f399cb8d1d712cbceb82e83fe8c9c818e76e3e2734d1f821b78496af91904',
  height: 6361977,
  blockId: '14557933175886918347',
  block_timestamp: 39015790,
  timestamp: 39015780,
  requesterPublicKey: null,
  recipientPublicKey: null,
  fee: 100000,
  signSignature: null,
  signatures: [],
  confirmations: null,
  asset: {},
};

const rawValidTransaction = {
  st_stored_value: '0x84609a38fedbcd02b657233340e6a8cb09db61a8',
  st_stored_key: 'eth:address',
  st_type: 0,
};

describe('State', () => {
  /**
   * @type {State}
   */
  let state;
  let transaction;

  const dummyBlock = {
    id: '9314232245035524467',
    height: 1,
  };

  before((done) => {
    async.auto(
      {
        rounds(cb) {
          modulesLoader.initModule(Rounds, modulesLoader.scope, cb);
        },
        accountLogic(cb) {
          modulesLoader.initLogicWithDb(AccountLogic, cb, {});
        },
        transactionLogic: [
          'rounds',
          'accountLogic',
          (result, cb) => {
            modulesLoader.initLogicWithDb(
              TransactionLogic,
              (err, __transaction) => {
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
        stateLogic: [
          'accountLogic',
          'transactionLogic',
          (result, cb) => {
            modulesLoader.initLogicWithDb(State, cb, {
              account: result.accountLogic,
            });
          },
        ],
      },
      (err, result) => {
        expect(err).to.not.exist;
        state = result.stateLogic;

        transaction = result.transactionLogic;
        transaction.attachAssetType(transactionTypes.STATE, state);

        done();
      }
    );
  });

  describe('bind', () => {
    it('should be okay', () => {
      expect(() => state.bind()).to.not.throw();
    });

    after(() => {
      state.bind();
    });
  });

  describe('create', () => {
    it('should throw with empty parameters', () => {
      expect(() => {
        state.create();
      }).to.throw();
    });

    it('should attach asset to a transaction with valid parameters', () => {
      const trs = state.create(validTransactionData, validTransaction);
      const keys = ['amount', 'recipientId', 'asset'];
      const assetKeys = ['value', 'key', 'type'];
      expect(trs).to.be.an('object');
      expect(trs).to.include.keys(keys);
      expect(trs.asset.state).to.have.keys(assetKeys);
    });
  });

  describe('calculateFee', () => {
    it('should set higher fees for very long values', () => {
      const longValueTransaction = {
        id: '13031380580772800310',
        type: 9,
        timestamp: 226647183,
        amount: 0,
        senderPublicKey:
          'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
        senderId: 'U810656636599221322',
        asset: {
          state: {
            key: 'eth:address',
            value:
              '3b993b1d6d0fc6d97cff9ac72abc65faa46f554acf799095b32a0cd3b7dca693634b89b9e4e3d600ef72ede2ca69ca7024631d55e74af938035b0c6a6db22e0be1dba549b8afe1e67db3440263c5ffba55115caf1d6a8e51bb80b61cee2fe4a31d8a9b22ce5030967aabd74c985e3c8eaae15db3700daad84eb8271d48cf62e04f33b65df6ad2f098631627c5ea5f43611e631fa1aef832b560d533a12b2ea26a59b020430f7b281f6a149a6d37fc6c838b0dd5ebcf60b95c770c6a89ac78a3a21528f2131360560d1edf43bb93b106978de5b691fdc2699dd40d129a2e124c101cafef2c05eef99422b55a158001cab4528117ffa16b740acf3169c73256bf8b55a6d1003f1e9a3368ded8bef1426385164e6af86d3d7fe73e0e63e62bda514eadfb4993ff406be26a69fd90102cd76e0d419a800144f7a88ff880eb09e56fc28cfa1234d19a1f7902cbdf82609ce5ddbdf2798a6f64b4af7cb8164f83992af2f599a9e63ec848a3027bfbe14b9c9ef37863a1b835b800679a358f6a6058051efc734bfe6470b103e72df1aa250be3cfa197236255f7f40379a4791d4b581fb5bb58fbbbcddf2634e652c2c72745e7d43bde3302214e1688a79b94bb068b9be9a12db27a4c529e66c86e1e574fd06a0484c8d798ac5d53617fb1a522a6d94602ed5a27e7eaf3070360ea20d84ac0089085f99672254a70a234dab9bffb10d6897080ed123dbf473f006d53d5e122fb47398a0a6fb322a1c63f271a01e0f7407901603e8a29d9ab91d3ac460065a80b4fda5ae4b335b819286d7dfadce9b2b3b7817874ddda62bf515445e02e57ee9dc7efa09f6df2b1c838beed73ddd6fd24cd5fd8e7a5e0d6be735ae57b8eba056981647b9c4213842903e3e3368d4b62ebe702886e5185c45d3440559939e90babad2d487a734602aed154083219c90e3ddf2abc7d7b3eb314b386ef593d2f7a8b87e23f836556b36350c4ef3e400e9433e1f6cf4af6ad8ae0823b525fdf999c6fb0875f4aec0f56cf37ccb83d229e39994df22ac7a27bf85d96a9684358f61c0278321c84c4cc6df3b58c20d4d858e323be57f02b32c847ad085985031b5c3872f8858655689881f7fc1984993d931c3e76139e50d6ae39129c957ec1f1c40730c0243d17753449051b18829226756e3c875fa9a09a4c238c3d5ba64c362dd3ef3e17f00e8cafc9e6bb723c73101868d9ae839bb4feec81b27b5b2974ce290d1609350bf7d8cb2dbb3d18f0cce99815b50deda814aec7727fe1097e12357d729cd62e31552a05e8223d3236ec345a0366832f196874ed04abe7d5c44d195f5c5759037e6a538d391c1b542d04a4382b13e2b5fcb740a3483ae57e250e377840f9bf0a103ecddd5c55afc3e4f8f182d3f4ec7bf28909a23c26eda3a2b8bc5e9bdb628f977380341f3a4d1468298b638720b6c6e03fa5f6c0d4863514e7a8af3dc8b03e31626c9d499dcd9879eb6f44c03346fb72255f20ab9d52dc9aa7975b014f0e66ef1747d275368fba85762fe09c53d0b2a5a8964bf008825635af5ee7d804a93e75f62a8f035b6c7d13957fcb9c6f78ed0e077386d23ce4280ed346423a495e0c801633af207451e210b10b9813773295abc77f6b24d3a6ec6907f83e5d3f0123c680338b07a071c7713849692eb2949307926b41968dad3a4a8606efd3dae645576b27c82c21bd865eaa7a17734f9e9b1b4f67c32bf035f25cf091f4fa55a46c6f54de8bef6abff0d666a51762ededfe89cdf86f4a32316e9494ba4526a86c75c39e9fe789825857a145a8d978928268eeaad401227eb0ddc48f70966b947f51ece662b8704747f05a9a36788e50a5603959ee19d09db3c3f0499201d2c7a9e2b14c7eb8cbff0e82a3729645e5330d63f72f1e928c29b8e150e18fe2936427245573b73ec5b25e33a04c88b5b7b143b5d87d97fbdc131d907046a20be820986b6b28cb2f99cb0c495dab6ce2bdeff9d86ee692de3dc41605b40a9c52f0ffef9e454ec4f89cbad3b9137ee3321b8ebd19747793cd304d093bab8818718627b000cae796017645bf9bfbfbf40684737edb621ecbd302b53d3c7e7407fed35c813e7d227c40b273532af65a5c16f723fecbc8967b62dbfb9987e1e08f1b45e80abfb1409c6cc60000a344a88b8076af309bfbd08a154aea8ce1c25d1e10c33d1c1e4cdf2a0748f682415d3fe2179e7a133e94c133244dc6b032e68164f57fc68ae7528aca37866063e1dd0c06d38e546a0f76ad7291faf8b78645d063ffb35525c0c28ab640acb19bd2fe9fbd8da2517511d413faf9d7e9e1f3d057d474c428ab58a9851653f00bc33a82e6beda6dc467a0024351dbb477f4ce12f171d4c975ec7e9149026e450aaeadab7f84d5032934d2fcba8e8e21867da9b4e47ef02c8b3c0580b53115230ba7e0854cdc566c71468a8e2668ac576afa6064a7471d9e0a23c5ffbf55cfdd51b79b2f5cfeacc9d95c20f1114726257bc90c7b14e1d67b4c6ff5b924b6f907b224e946a1cc640e93bd0fe5473b2af05454695a0896f6a4d971b5bfca064d42f81ee258004258fd1a8b93316fb8a1f94d83569d6f5125dc54ee3e97d997ae1c365acb40ba545edb5dff0dee9f0bb48724ed51a8ec2dbce2748de5a98a5e85fc876c33bd2d6aa2478224ec98cbeb20fd34e7c463361adeb9ea006d6386a2f53098652d5748a832234d5c82ea94dc7043dc788e01a8905c39c39b5e808ad7bd788696f67b0187e3793454670b5ec5c05b3017640d0c289d9ace3a5bc90cd63f694be34bc0964581bb2e0f4bd2996b05de1d83d31c51db2ce03a9b16c980bc2952d6430de277f1aa209c19589d2bf8a45f98f145314a5cb9058263afa544d60018f12fa5db7635faed7eca02148e7f89022d3b8daedd48b8078e529e3d6c4f53b3191345b79ef0492862f06cc6f9a36b87f4902706d8760dc7042afe7f0b1d78c48a06dd6192429071fae27b5a9db8199c18f0b59c35ef29a104e236b86acbeae4bacfc2fe8e8a575bd7b465d3f71f37c33d621dcf7acc3f84a84dc9be77dd60cc2b3e67e4fbaa76f320f2bee6272fa2af8b5748e4bf59951f5cba8a6d6fd6dc7ab5a903c2d6a73b28c14dc0073564905a9df195df0132181fc651bbdf1a6e27ebb22bcd60eb24b6985442c38192542dd6b6f4682ef611843ae02dcd39ae11e10c8d53d59c8efd52b406ae29f30eaa0031e2cf53f42ceb6342c85571f10dc7c15c6a9276eec8a724595d54ea9c675a898a2f2ba9562963ac465b3d14272cb162e1475b05f7c2e77350dcdfb4a289d7e65bc580af4a51ed0bb92ba5f7100ec0a66a178f50727f8cb1db553f3e9f17d631da606caed958f6465c1d0274a7d965efc409efdf1c637eea4075f02b0ee3cd67fb1897a6296f8adbb88b53ab9e4536973795e618cac66a8cff07f5ccaca9fe83cba990039c5dd3307cfae49fbb3c29d45b30996e0883c909c2ab75ab72aaebf19ec3b040a4a52ce88c62ab00d70a5fb0f569d5ddef3572d4d6a2f7104bcfc2d89b2330db7252ed9628463fbae76113754e17b46728afa77481feef0ed4e496a3136c7a1ff728c411012ed12521bca984052247535ab68340b08c659ae2c6c4247f56f3248bebff8557640ff6233ab94ed1d9ea6097b67ee62a0a3c7d528e27cf3e1e1180ce58364fa616108910fde43d866d4d479f81048396252c6c9725c8c26eaeb03e2b7cca824aa005dbd9970828f77922d0fb4fe905f8b68c6872db3d699a8dac13ad84bc3dd40538cbcfc069be6e79b318e353506be4bda8a2c802a232a1750547c1a7e61a1ad0a29c135de66c79472b87151610a82e3d7ff3ba2ce46a3bd009f35c902fc1bc68da772dc860b6ab1462b4774455eece1b80cfcccd0ca1c9e4bb9751fd601c5dabc76bb3ce43be3993678f9f365073a63054aa4127ee424a422079d1b172c610a172249ec62ea6f1b91fbba0c420fc62fa010a7008361dcd4ea167d5bca3b3c4577673a7fe8e80c5f19ee41353792aa0c0afda58c3518d20dbfe5ac81e8da00b287e5d11ffe9b9d5c8b37d387d156baee3a7b88d7865553ef744b5ea17640d373910aaa0014e079a366f253a354a6325092c4de9bf37c1465d33155ce391b24dbbe83ed8521fe942c2a3bdea28e10057079fff79e5523665cfc01675f268aab7730636384788d4b19a2420dc7e1f72ce6cf62f0710dd9081f457d64795e1556038f69dfe25fff8976dc092fa8b9ba1cce2960595f32f9a555dddf6f120c9bc89bc3e473346504f14ae3c4624d18ac3f33f09599c2170d86127456ab03faf55587a54671cd03a4b57e92be822c46348c14c068c07d7912e00668b73dddb44c1fd96b3993b6df13c6888fe1d7fde037785716fc6550cc81738a122f21c79ada4c5c2c999690c93c7b8fcc78f56364db136aa2e671994f29756c20b73c399914085e819332b4bc243960a98f04605451005b008d82a76eef5c5058764fa8af569ab720fca84174d0fad1acad498abb13a25b8394e71b2f499c926b9e60a0aa8c9815ae3cf1177d19c5e12b02cac7737247dacf44c69e796f6f552212def4baac7ab7566b981275ad05422dd97cf0997761d03b4f07b7d38fbaca81ce2a86d1c669013e1d8ce1d37fc69f8bdf7bbf3ea17cad300a40c10b1dcda025f006deb8e8b99d91eea6ea117b58c4e0fe858686379aeabf0c06736bba33cc4b52af573056be4c947756eb61255c2a8bf240e402f2bfd0b5243299b91a8a23f0f288e7d0d7764399dd2f17e55c4d513daa06115afa941327add61e4aa48f9d9bf8738f4c1dd197d92e35d3a9ec392525aac0bd49c614d5e376b7b9a0b1a39ed3e2ca88201379c18b9050f94ae7afc7083aec43248cbb9009f86826565ff530a575b6ba81a5d19251889c8d3b356d5fe57c3afe52cb6872eac5715bd52b5ff9659ae1f01bdd9919776ce38f40ee758af2cf3bde0009485f9ccf4667afc7e8f830e5969e8e1f0fcf6e01bec99e9309965ca11a70ed844adf427f8421d33adfa358417d8b7491e56e82d0607a48cb7738771c957cd4146076ee0ab1d3b919bf3b46fbdb2e9fea2db25c19198ee628fea550f8d6b9a57131464651470bc97384535973eb5926be344714f7f2d773dc66fc8f5d12f4a1fa1a95003380bac6f8cd52bdd0bf0217ea03478e94c22023856e6a4988ccf81c036229e69d882aaa900a19466a1234093c7a3315190847beb94f8ef525c50e6c830f9e22a9e1c431649050c5bad7e77e38c457d7dd780d6521218af80b1cf2df51e01e35b2c01db3c74b8ff9d0d6943f897f48824198d076ab44579aabc62ded89e8f81c194c0a371007e9540aa4a0ec930cbcdf4dd6e3c28306dca5a25a01d207823c46820c35420014c11b68e8ebac730b1daa98b884db141044e2dd03b0ed4c214bd821ee5410597014dd7083f2fe3831c5932f3514537e0b4d0853680d02f2190a5582a75bfb75173053c0ced7553d4d24363accb52651056b802f0df48d8264f0c0cb9cb7b0967730049f291033a93e3bd4fe632414d5989e5b0771653198ad2922e2f3ab441b9c14fcf4f3a7b828a16bcfc0d714cce533ccda1c27bc3e48ebdef2aacc121e5113ad28a141560b69b9bff890970065b11bea62e6e4b1b21477fdde6eaf94393e27932ac2fe6ce871cf42a6ed6f8b0ae1ff5a79e0ca49ae80d1b6c246bbfadc47119011658899744662a22d4ea71892747759d475ae4e6f7a045dc3fdcd6866aed762babc6ccf182c5df3038700cd755cb2178ca1a5b29d1258e61ea909056b78b645632a0ef15bdc0ea84a9668852f53f9472a5bb6505cc3bdba2993e394959c1d63c61ba0367d39fe3fce035bcc3c752d15048fafe51ea71075b6f0dc9e5e313306247e1e39164c42b1eaf56660909a34bbdbafb90c82529bc951ca31afe853d4074db7557d7ec15b3fd92141848b8b428ac805b75a0bf4bd9371bf78b97ea102348a2c39c8f7b756b16b5c68d5dcc530473145bb5ef7e0b7c868b2b7ab7e40c0d1a40a8c53a17eb0ba3e42ecc883c362e6beceb57529f676c7c19210e38dca4adaa74b0e53729f21b9d0a60d4ff124d2293db5f498efb1525e63696412e5c43cfbc9b310873ad0823ee374dce3d50db028ea73dd7619d6c1e7a92469cbd17661fadddfc93ae92e286459b8feec83405611c5998f62d7e82800ffcbbd4f35251c0d63fcb76e707af99f38812188c754342a8dfda20ca7177b9565de1d6127ac5ff69099f6160ef50ed31b8b452f8b523c6954993adfbf337e5108ba88f045d2f8ad79853e5ddfae57d2cc9ee51e1b87273948fd61b417d7e1e25aea262cb4604c6bf57a52193a24198ac1ccba957ba0d63b97306ff9d49abf485f0852ec1f9a68f4d88ba0969ab053dc331cfb0e4f3dd8e898a926f4d90639a9dcc673b4a95633d3c55b750f737464d70aefd75f5cf23a0c4d60f5d2612d9b8581b360ac59ae2b989aae5ab2e2619aa3b1d4a7f7893461d1ddf25e41fd5cc2f62d2f55193ac2db9d0a433eaf42d597fe2d2a4ce6553acc2c74e7e64b9c64de0289f6fc4c879f42db66c7e37fd52f790bfc1ed8fa813167cc311acef240c5e436a7c90d1e1ff073243d89c4e35329c8b8516508879ff77108c8ae1b9e307dfece5641824b454f2a2376cbad476c1b865f8cb196f8605bb8d679788a35b385eab82bd1d375afb8363c633ebe2985cc9b7e8af3068f6d5c684cd2538999352410410328c4936c8fbffc97da00078c35d7c5d60e9f94421709c4145b35d1e05ac10ff4834d49c8e624ee07482d9f97682c8ddcaf6ce6c3660f410015893e33566db47efc3c0e6c2d85dc0ca0a9f94908bb83bd0a96b5a5f97a6c9266879d86667b433de197558f54cafbc2a21b0014241693f7dcbb9c78f797b52d9996fdb714190429435d0e40b641e9ccfbeb6c6dfd8a424f337fa2d52de5ec333658327132c557fe1edff84be887c23f9ffa93b49854deede86a1cbc0426deb46f019889eea08b3df053a5cb89c831eb2aa77360abdd8af5000bbc0f656235751b3cd5a1ddbf12874a87a98fc2e45f0b',
            type: 0,
          },
        },
        recipientId: null,
        signature:
          '7d008594b1c9dacc2d856ae544b7f5c0a25e86daf7d6c5cea38e547b294c26fae9b9b7f2ecf57b676be81ed169e9b0a427ce00df770f9890f2a74da6e57dc706',
      };

      const shortValueTransaction = {
        id: '10889400336719857616',
        type: 9,
        timestamp: 226647242,
        amount: 0,
        senderPublicKey:
          'f4011a1360ac2769e066c789acaaeffa9d707690d4d3f6085a7d52756fbc30d0',
        senderId: 'U810656636599221322',
        asset: {
          state: { key: 'eth:address', value: 'f4011a1360ac2769e06', type: 0 },
        },
        recipientId: null,
        signature:
          'fae36a90c8de7e2fd9eee9b5c4a721c4253055f3e85874ac9e166484f8c50aca33f4a2d46c72f0293d0eea2ef44dbb4cdf723fcec6fd4bc4b421f08de00ac805',
      };

      const shortValueFee = state.calculateFee(shortValueTransaction);
      const longValueFee = state.calculateFee(longValueTransaction);

      expect(shortValueFee).greaterThan(0);
      expect(longValueFee).greaterThan(shortValueFee);
    });
  });

  describe('verify', () => {
    it('should return error if asset is not set', (done) => {
      const trs = _.cloneDeep(validTransaction);
      delete trs.asset.state;
      state.verify(trs, validSender, function (err) {
        expect(err).to.equal('Invalid transaction asset');
        done();
      });
    });

    it('should return error if asset type is out of range', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.state.type = -1;
      state.verify(trs, validSender, function (err) {
        expect(err).to.equal('Invalid state type');
        done();
      });
    });

    it('should return error if asset value is empty', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.state.value = ' ';
      state.verify(trs, validSender, function (err) {
        expect(err).to.equal('Value must not be blank');
        done();
      });
    });

    it('should return error if asset value is too long', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.asset.state.value = 'a'.repeat(20482);
      state.verify(trs, validSender, function (err) {
        expect(err).to.equal('Value is too long. Maximum is 20480 characters');
        done();
      });
    });

    it('should be okay for a valid transaction', (done) => {
      const trs = _.cloneDeep(validTransaction);
      state.verify(trs, validSender, function (err) {
        expect(err).to.be.null;
        done();
      });
    });
  });

  describe('process', () => {
    it('should be okay', (done) => {
      state.process(validTransaction, validSender, done);
    });
  });

  describe('getBytes', () => {
    it('should throw an error with no param', () => {
      expect(state.getBytes).to.throw();
    });

    it('should return same result when called multiple times', () => {
      const firstCalculation = state.getBytes(validTransaction);
      const secondCalculation = state.getBytes(validTransaction);
      expect(firstCalculation.equals(secondCalculation)).to.be.ok;
    });

    it('should return the valid buffer', () => {
      expect(state.getBytes(validTransaction)).to.eql(
        Buffer.from(
          '3078383436303961333866656462636430326236353732333333343065366138636230396462363161386574683a6164647265737300000000',
          'hex'
        )
      );
    });
  });

  describe('apply', () => {
    it('should be okay', (done) => {
      state.apply(validTransaction, dummyBlock, validSender, done);
    });
  });

  describe('undo', () => {
    it('should be okay', (done) => {
      state.undo(validTransaction, dummyBlock, validSender, done);
    });
  });

  describe('applyUnconfirmed', () => {
    it('should be okay', (done) => {
      state.applyUnconfirmed(validTransaction, validSender, done);
    });
  });

  describe('undoUnconfirmed', () => {
    it('should be okay', (done) => {
      state.undoUnconfirmed(validTransaction, validSender, done);
    });
  });

  describe('objectNormalize', () => {
    it('should throw an error with no param', () => {
      expect(state.objectNormalize).to.throw();
    });

    it('should delete properties with null or undefined values from the asset', () => {
      const trs = _.cloneDeep(validTransaction);

      trs.asset.state.blockId = null;
      trs.asset.state.timestamp = undefined;

      const normalized = state.objectNormalize(trs);
      expect(normalized.asset.state).to.not.have.key('blockId');
      expect(normalized.asset.state).to.not.have.key('timestamp');
    });
  });

  describe('dbRead', () => {
    it('should throw an error with no param', () => {
      expect(state.dbRead).to.throw();
    });

    it('should return null if st_stored_value field is not present', () => {
      const rawTrs = _.cloneDeep(rawValidTransaction);
      delete rawTrs.st_stored_value;
      const trs = state.dbRead(rawTrs);
      expect(trs).to.be.a('null');
    });

    it('should return chat object with correct fields', () => {
      const rawTrs = _.cloneDeep(rawValidTransaction);
      const trs = state.dbRead(rawTrs);
      const expectedKeys = ['value', 'key', 'type'];
      expect(trs.state).to.be.an('object');
      expect(trs.state).to.have.keys(expectedKeys);
    });
  });

  describe('dbSave', () => {
    it('should throw an error with no param', () => {
      expect(state.dbSave).to.throw();
    });

    it('should return promise object for valid parameters', () => {
      const saveQuery = state.dbSave(validTransaction);
      const keys = ['table', 'fields', 'values'];
      const valuesKeys = [
        'stored_key',
        'stored_value',
        'type',
        'transactionId',
      ];
      expect(saveQuery).to.be.an('object');
      expect(saveQuery).to.have.keys(keys);
      expect(saveQuery.values).to.have.keys(valuesKeys);
    });
  });

  describe('afterSave', () => {
    it('should be okay', (done) => {
      state.afterSave(validTransaction, done);
    });
  });

  describe('ready', () => {
    it('should return true when sender does not have multisignatures', () => {
      expect(state.ready(validTransaction, validSender)).to.be.true;
    });
  });
});
