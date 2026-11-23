'use strict';

var DApp = require('../logic/dapp.js');
var dappCategories = require('../helpers/dappCategories.js');
var fs = require('fs');
var InTransfer = require('../logic/inTransfer.js');
var OrderBy = require('../helpers/orderBy.js');
var OutTransfer = require('../logic/outTransfer.js');
var path = require('path');
var sql = require('../sql/dapps.js');
var transactionTypes = require('../helpers/transactionTypes.js');

var library, self, __private = {}, shared = {};

__private.assetTypes = {};
__private.loaded = false;

/**
 * Initializes the DApp transaction types and removes stale public runtime links.
 * @param {Function} cb - Callback function.
 * @param {scope} scope - App instance.
 * @constructor
 */
function DApps (cb, scope) {
  library = {
    logger: scope.logger,
    db: scope.db,
    network: scope.network,
    logic: {
      transaction: scope.logic.transaction
    }
  };
  self = this;

  __private.assetTypes[transactionTypes.DAPP] = library.logic.transaction.attachAssetType(
      transactionTypes.DAPP,
      new DApp(
          scope.db,
          scope.logger,
          scope.schema,
          scope.network
      )
  );

  __private.assetTypes[transactionTypes.IN_TRANSFER] = library.logic.transaction.attachAssetType(
      transactionTypes.IN_TRANSFER,
      new InTransfer(
          scope.db,
          scope.schema
      )
  );

  __private.assetTypes[transactionTypes.OUT_TRANSFER] = library.logic.transaction.attachAssetType(
      transactionTypes.OUT_TRANSFER,
      new OutTransfer(
          scope.db,
          scope.schema,
          scope.logger
      )
  );

  var publicPath = path.isAbsolute(scope.public) ?
    scope.public :
    path.join(__dirname, '..', 'public');

  var retiredPublicPath = path.join(publicPath, 'dapps');

  fs.rm(retiredPublicPath, {
    recursive: true,
    force: true
  }, function (err) {
    if (err) {
      library.logger.warn(
          'dapps',
          'Failed to remove retired public DApp content; remove it manually',
          {
            path: retiredPublicPath,
            error: err.code || err.message
          }
      );
    }

    return setImmediate(cb, null, self);
  });
}

/**
 * Gets one registered DApp from the database.
 * @param {string} id - DApp transaction id.
 * @param {Function} cb - Callback function.
 */
__private.get = function (id, cb) {
  library.db.query(sql.get, { id: id }).then(function (rows) {
    if (rows.length === 0) {
      return setImmediate(cb, 'Application not found');
    }

    return setImmediate(cb, null, rows[0]);
  }).catch(function (err) {
    library.logger.error('api-dapps', err.stack);
    return setImmediate(cb, 'DApp#get error');
  });
};

/**
 * Lists registered DApps from the database.
 * @param {object} filter - Public list filters.
 * @param {Function} cb - Callback function.
 */
__private.list = function (filter, cb) {
  var params = {};
  var where = [];

  if (filter.type >= 0) {
    where.push('"type" = ${type}');
    params.type = filter.type;
  }

  if (filter.name) {
    where.push('"name" = ${name}');
    params.name = filter.name;
  }

  if (filter.category) {
    var category = dappCategories[filter.category];

    if (category !== null && category !== undefined) {
      where.push('"category" = ${category}');
      params.category = category;
    } else {
      return setImmediate(cb, 'Invalid application category');
    }
  }

  if (filter.link) {
    where.push('"link" = ${link}');
    params.link = filter.link;
  }

  params.limit = filter.limit ? Math.abs(filter.limit) : 100;
  params.offset = filter.offset ? Math.abs(filter.offset) : 0;

  if (params.limit > 100) {
    return setImmediate(cb, 'Invalid limit. Maximum is 100');
  }

  var orderBy = OrderBy(
      filter.orderBy,
      {
        sortFields: sql.sortFields
      }
  );

  if (orderBy.error) {
    return setImmediate(cb, orderBy.error);
  }

  library.db.query(sql.list({
    where: where,
    sortField: orderBy.sortField,
    sortMethod: orderBy.sortMethod
  }), params).then(function (rows) {
    return setImmediate(cb, null, rows);
  }).catch(function (err) {
    library.logger.error('api-dapps', err.stack);
    return setImmediate(cb, err);
  });
};

/**
 * Keeps the transaction callback contract without a DApp sandbox runtime.
 * @param {string} dappid - DApp transaction id.
 * @param {object} body - Runtime message body.
 * @param {Function} cb - Callback function.
 */
DApps.prototype.message = function (dappid, body, cb) {
  return setImmediate(cb, 'Application sandbox not found');
};

/**
 * Binds consensus modules to DApp transaction types.
 * @param {modules} scope - Loaded modules.
 */
DApps.prototype.onBind = function (scope) {
  __private.assetTypes[transactionTypes.IN_TRANSFER].bind(
      scope.accounts,
      scope.rounds,
      shared
  );

  __private.assetTypes[transactionTypes.OUT_TRANSFER].bind(
      scope.accounts,
      scope.rounds,
      self
  );

  __private.loaded = true;
};

/**
 * Checks whether the module has completed binding.
 * @return {boolean} True after onBind.
 */
DApps.prototype.isLoaded = function () {
  return __private.loaded;
};

/**
 * Read-only HTTP API methods.
 */
DApps.prototype.internal = {
  get: function (query, cb) {
    __private.get(query.id, function (err, dapp) {
      if (err) {
        return setImmediate(cb, null, { success: false, error: err });
      }

      return setImmediate(cb, null, { success: true, dapp: dapp });
    });
  },

  list: function (query, cb) {
    __private.list(query, function (err, dapps) {
      if (err) {
        return setImmediate(cb, 'Application not found');
      }

      return setImmediate(cb, null, { success: true, dapps: dapps });
    });
  },

  search: function (query, cb) {
    if (Object.prototype.hasOwnProperty.call(query, 'installed')) {
      return setImmediate(
          cb,
          null,
          {
            success: false,
            error: 'The installed filter is no longer supported'
          }
      );
    }

    var params = {
      q: '%' + query.q + '%',
      limit: 50
    };

    if (query.category === 0 || query.category > 0) {
      params.category = query.category;
    }

    library.db.query(sql.search(params), params).then(function (rows) {
      return setImmediate(cb, null, { success: true, dapps: rows });
    }).catch(function (err) {
      library.logger.error('api-dapps', err.stack);
      return setImmediate(cb, 'Database search failed');
    });
  },

  categories: function (req, cb) {
    return setImmediate(cb, null, { success: true, categories: dappCategories });
  }
};

/**
 * Resolves the genesis author needed by DApp in-transfer apply and undo.
 * @param {object} req - Request containing dappid.
 * @param {Function} cb - Callback function.
 */
shared.getGenesis = function (req, cb) {
  library.db.query(sql.getGenesis, { id: req.dappid }).then(function (rows) {
    if (rows.length === 0) {
      return setImmediate(cb, 'Application genesis block not found');
    }

    var row = rows[0];

    return setImmediate(cb, null, {
      pointId: row.id,
      pointHeight: row.height,
      authorId: row.authorId,
      dappid: req.dappid
    });
  }).catch(function (err) {
    library.logger.error('api-dapps', err.stack);
    return setImmediate(cb, 'DApp#getGenesis error');
  });
};

module.exports = DApps;
