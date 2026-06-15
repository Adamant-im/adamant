'use strict';

const google = require('eslint-config-google');
const globals = require('globals');
const jsdoc = require('eslint-plugin-jsdoc');

module.exports = [
  {
    ignores: [
      'node_modules/',
      'dapps/',
      'logs/*.log',
      'nodejs/',
      'npm-debug.log',
      'release/',
      'ssl/',
      'stacktrace*',
      'tmp/',
      'public/node_modules/',
      'public/bower_components/',
      'public/static/',
      'helpers/bignum.js'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: {
        ...globals.browser,
        ...globals.commonjs,
        ...globals.es2021,
        ...globals.mocha,
        ...globals.node,
        PR: 'readonly'
      }
    },
    plugins: {
      jsdoc
    },
    settings: {
      jsdoc: {
        // Preserve the established repository JSDoc vocabulary.
        tagNamePreference: {
          returns: 'return',
          function: 'method',
          class: 'constructor',
          fires: 'emits'
        }
      }
    },
    rules: {
      ...google.rules,
      'max-len': ['error', {
        code: 200,
        ignoreTrailingComments: true,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true
      }],
      'require-jsdoc': 'off',
      'no-var': 'off',
      'comma-dangle': ['error', 'never'],
      'brace-style': ['error', '1tbs', { allowSingleLine: true }],
      'block-spacing': ['error', 'always'],
      'new-cap': 'off',
      'prefer-rest-params': 'off',
      'no-unused-vars': 'off',
      'no-invalid-this': 'off',
      camelcase: 'off',
      'one-var': 'off',
      'no-throw-literal': 'off',
      'object-curly-spacing': ['error', 'always'],
      'prefer-const': 'off',
      'quote-props': 'off',
      'guard-for-in': 'off',
      'valid-jsdoc': 'off',
      'prefer-spread': 'off',
      'space-before-function-paren': ['error', {
        anonymous: 'always',
        named: 'always',
        asyncArrow: 'ignore'
      }],
      'space-infix-ops': ['error', { int32Hint: true }],
      'jsdoc/check-access': 1,
      'jsdoc/check-alignment': 1,
      // Historical comments use intentional columns and wrapped indentation.
      'jsdoc/check-line-alignment': 'off',
      'jsdoc/check-param-names': 1,
      'jsdoc/check-property-names': 1,
      'jsdoc/check-tag-names': 1,
      'jsdoc/check-types': 1,
      'jsdoc/check-values': 1,
      'jsdoc/empty-tags': 1,
      'jsdoc/multiline-blocks': 1,
      'jsdoc/no-multi-asterisks': 1,
      'jsdoc/require-param': 1,
      'jsdoc/require-param-name': 1,
      'jsdoc/require-param-type': 1,
      'jsdoc/require-property': 1,
      'jsdoc/require-property-name': 1,
      'jsdoc/require-property-type': 1,
      'jsdoc/require-returns-type': 1,
      'jsdoc/require-yields': 1,
      'jsdoc/require-yields-check': 1,
      // Spacing and tag order are descriptive choices, not correctness checks.
      'jsdoc/tag-lines': 'off',
      'jsdoc/sort-tags': 'off',
      // The codebase documents callback unions, internal namepaths, and custom
      // types that are valid for maintainers but outside the plugin parser.
      'jsdoc/valid-types': 'off'
    }
  }
];
