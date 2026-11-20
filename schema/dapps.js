'use strict';

module.exports = {
  get: {
    id: 'dapps.get',
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'id',
        minLength: 1,
        maxLength: 20
      }
    },
    required: ['id']
  },
  list: {
    id: 'dapps.list',
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'id',
        minLength: 1,
        maxLength: 20
      },
      category: {
        type: 'string',
        minLength: 1
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 32
      },
      type: {
        type: 'integer',
        minimum: 0
      },
      link: {
        type: 'string',
        minLength: 1,
        maxLength: 2000
      },
      icon: {
        type: 'string',
        minLength: 1,
        maxLength: 2000
      },
      orderBy: {
        type: 'string',
        minLength: 1
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100
      },
      offset: {
        type: 'integer',
        minimum: 0
      }
    }
  },
  search: {
    id: 'dapps.search',
    type: 'object',
    properties: {
      q: {
        type: 'string',
        minLength: 1
      },
      category: {
        type: 'integer',
        minimum: 0,
        maximum: 8
      }
    },
    required: ['q']
  }
};
