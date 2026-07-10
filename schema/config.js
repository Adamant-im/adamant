'use strict';

module.exports = {
  config: {
    id: 'appCon',
    type: 'object',
    properties: {
      port: {
        type: 'integer',
        minimum: 1,
        maximum: 65535
      },
      address: {
        type: 'string',
        format: 'ip'
      },
      generalLog: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean'
          },
          fileName: {
            type: 'string'
          },
          level: {
            type: 'string'
          },
          rotate: {
            type: 'object',
            properties: {
              enabled: {
                type: 'boolean'
              },
              maxSize: {
                type: 'string'
              },
              retain: {
                type: 'integer',
                minimum: 1
              },
              rotateInterval: {
                type: 'string'
              },
              rotateOnRestart: {
                type: 'boolean'
              }
            },
            required: ['enabled', 'maxSize', 'retain', 'rotateInterval', 'rotateOnRestart']
          }
        },
        required: ['enabled', 'fileName', 'level', 'rotate']
      },
      debugLog: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean'
          },
          fileName: {
            type: 'string'
          },
          level: {
            type: 'string'
          },
          rotate: {
            type: 'object',
            properties: {
              enabled: {
                type: 'boolean'
              },
              maxSize: {
                type: 'string'
              },
              retain: {
                type: 'integer',
                minimum: 1
              },
              rotateInterval: {
                type: 'string'
              },
              rotateOnRestart: {
                type: 'boolean'
              }
            },
            required: ['enabled', 'maxSize', 'retain', 'rotateInterval', 'rotateOnRestart']
          }
        },
        required: ['enabled', 'fileName', 'level', 'rotate']
      },
      consoleLog: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean'
          },
          level: {
            type: 'string'
          }
        },
        required: ['enabled', 'level']
      },
      fileLogLevel: {
        type: 'string'
      },
      logFileName: {
        type: 'string'
      },
      consoleLogLevel: {
        type: 'string'
      },
      trustProxy: {
        type: 'boolean'
      },
      cacheEnabled: {
        type: 'boolean'
      },
      cors: {
        type: 'object',
        properties: {
          origin: {
            type: ['boolean', 'string', 'array']
          },
          methods: {
            type: ['string', 'array']
          }
        }
      },
      db: {
        type: 'object',
        properties: {
          host: {
            type: 'string'
          },
          port: {
            type: 'integer',
            minimum: 1,
            maximum: 65535
          },
          database: {
            type: 'string'
          },
          user: {
            type: 'string'
          },
          password: {
            type: 'string'
          },
          poolSize: {
            type: 'integer'
          },
          poolIdleTimeout: {
            type: 'integer'
          },
          reapIntervalMillis: {
            type: 'integer'
          },
          logEvents: {
            type: 'array'
          }
        },
        required: ['host', 'port', 'database', 'user', 'password', 'poolSize', 'poolIdleTimeout', 'reapIntervalMillis', 'logEvents']
      },
      redis: {
        type: 'object',
        properties: {
          url: {
            type: 'string'
          },
          password: {
            type: ['string', 'null']
          }
        },
        required: ['url', 'password']
      },
      api: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean'
          },
          access: {
            type: 'object',
            properties: {
              public: {
                type: 'boolean'
              },
              whiteList: {
                type: 'array'
              }
            },
            required: ['public', 'whiteList']
          },
          options: {
            type: 'object',
            properties: {
              limits: {
                type: 'object',
                properties: {
                  max: {
                    type: 'integer'
                  },
                  delayMs: {
                    type: 'integer'
                  },
                  delayAfter: {
                    type: 'integer'
                  },
                  windowMs: {
                    type: 'integer'
                  }
                },
                required: ['max', 'delayMs', 'delayAfter', 'windowMs']
              }
            },
            required: ['limits']
          }
        },
        required: ['enabled', 'access', 'options']
      },
      peers: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean'
          },
          list: {
            type: 'array'
          },
          access: {
            type: 'object',
            properties: {
              blackList: {
                type: 'array'
              }
            },
            required: ['blackList']
          },
          options: {
            properties: {
              limits: {
                type: 'object',
                properties: {
                  max: {
                    type: 'integer'
                  },
                  delayMs: {
                    type: 'integer'
                  },
                  delayAfter: {
                    type: 'integer'
                  },
                  windowMs: {
                    type: 'integer'
                  }
                },
                required: ['max', 'delayMs', 'delayAfter', 'windowMs']
              },
              timeout: {
                type: 'integer'
              },
              allowPrivatePeers: {
                type: 'boolean'
              }
            },
            required: ['limits', 'timeout']
          }
        },
        required: ['enabled', 'list', 'access', 'options']
      },
      broadcasts: {
        type: 'object',
        properties: {
          broadcastInterval: {
            type: 'integer',
            minimum: 1000,
            maximum: 60000
          },
          broadcastLimit: {
            type: 'integer',
            minimum: 1,
            maximum: 100
          },
          parallelLimit: {
            type: 'integer',
            minimum: 1,
            maximum: 100
          },
          releaseLimit: {
            type: 'integer',
            minimum: 1,
            maximum: 25
          },
          relayLimit: {
            type: 'integer',
            minimum: 1,
            maximum: 100
          }
        },
        required: ['broadcastInterval', 'broadcastLimit', 'parallelLimit', 'releaseLimit', 'relayLimit']
      },
      transactions: {
        type: 'object',
        properties: {
          maxTxsPerQueue: {
            type: 'integer',
            minimum: 100,
            maximum: 5000
          }
        },
        required: ['maxTxsPerQueue']
      },
      consensusActivationHeights: {
        type: 'object',
        properties: {
          fairSystem: {
            type: 'integer',
            minimum: 1
          },
          spaceship: {
            type: 'integer',
            minimum: 1
          }
        },
        required: ['fairSystem', 'spaceship']
      },
      forging: {
        type: 'object',
        properties: {
          force: {
            type: 'boolean'
          },
          secret: {
            type: 'array'
          },
          access: {
            type: 'object',
            properties: {
              whiteList: {
                type: 'array'
              }
            },
            required: ['whiteList']
          }
        },
        required: ['force', 'secret', 'access']
      },
      loading: {
        type: 'object',
        properties: {
          loadPerIteration: {
            type: 'integer',
            minimum: 1,
            maximum: 5000
          },
          snapshot: {
            type: 'integer',
            minimum: 1
          },
          memCheckpoints: {
            type: 'object',
            properties: {
              enabled: {
                type: 'boolean'
              }
            }
          }
        },
        required: ['loadPerIteration']
      },
      ssl: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean'
          },
          options: {
            type: 'object',
            properties: {
              port: {
                type: 'integer'
              },
              address: {
                type: 'string',
                format: 'ip'
              },
              key: {
                type: 'string'
              },
              cert: {
                type: 'string'
              }
            },
            required: ['port', 'address', 'key', 'cert']
          }
        },
        required: ['enabled', 'options']
      },
      dapp: {
        type: 'object',
        properties: {
          masterrequired: {
            type: 'boolean'
          },
          masterpassword: {
            type: 'string'
          },
          autoexec: {
            type: 'array'
          }
        },
        required: ['masterrequired', 'masterpassword', 'autoexec']
      },
      wsClient: {
        type: 'object',
        properties: {
          portWS: {
            type: 'integer',
            minimum: 1,
            maximum: 65535
          },
          enabled: {
            type: 'boolean'
          }
        },
        required: ['portWS', 'enabled']
      },
      wsNode: {
        type: 'object',
        properties: {
          maxBroadcastConnections: {
            type: 'integer',
            minimum: 0
          },
          maxReceiveConnections: {
            type: 'integer',
            minimum: 0
          },
          enabled: {
            type: 'boolean'
          }
        },
        required: ['maxBroadcastConnections', 'maxReceiveConnections', 'enabled']
      },
      nethash: {
        type: 'string',
        format: 'hex'
      }
    },
    required: ['port', 'address', 'generalLog', 'debugLog', 'consoleLog', 'trustProxy', 'cacheEnabled', 'db', 'redis', 'api', 'peers', 'broadcasts', 'transactions', 'forging', 'loading', 'ssl', 'dapp', 'wsClient', 'wsNode', 'nethash']
  }
};
