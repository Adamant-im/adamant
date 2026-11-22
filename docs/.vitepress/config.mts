import { defineConfig } from 'vitepress';
import urlLang from './langs/url.json';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'ADAMANT Docs',
  description: 'ADAMANT Documentation',
  /* prettier-ignore */
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/icons/favicon.svg' }],
  ],
  markdown: {
    shikiSetup(shiki) {
      shiki.loadLanguage(urlLang);
    },
  },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: {
      light: '/logo-light-theme.svg',
      dark: '/logo-dark-theme.svg',
    },
    outline: 'deep',
    editLink: {
      pattern: 'https://github.com/Adamant-im/adamant/edit/dev/docs/:path',
    },
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Core Concepts', link: '/core-concepts' },
        ],
      },
      {
        text: 'Running Own Node',
        items: [
          { text: 'Installation', link: '/own-node/installation' },
          { text: 'Configuration', link: '/own-node/configuration' },
          { text: 'Security Recommendations', link: '/own-node/security' },
          { text: 'Monitoring', link: '/own-node/monitoring' },
          { text: 'Upgrading', link: '/own-node/upgrading' },
          { text: 'Testnet', link: '/own-node/testnet' },
          { text: 'Localnet', link: '/own-node/localnet' },
          { text: 'Testing & Live Scenarios', link: '/own-node/testing' },
          { text: 'Consensus', link: '/own-node/consensus' },
          { text: 'Syncing', link: '/own-node/syncing' },
        ],
      },
      {
        text: 'Essentials',
        items: [
          {
            text: 'Generating Account',
            link: '/essentials/generating-account',
          },
          {
            text: 'Signing Transactions',
            link: '/essentials/signing-transactions',
          },
          {
            text: 'Encrypting & Decrypting Messages',
            link: '/essentials/encrypting-messages',
          },
          {
            text: 'Storing Data in KVS',
            link: '/essentials/storing-data-in-kvs',
          },
          {
            text: 'Working with Contact List',
            link: '/essentials/working-with-contact-list',
          },
        ],
      },
      {
        text: 'API Specifications',
        items: [
          {
            text: 'Making Requests',
            link: '/api/making-requests',
          },
          {
            text: 'Transactions Query Language',
            link: '/api/transactions-query-language',
          },
          { text: 'WebSocket', link: '/api/websocket' },
        ],
      },
      {
        text: 'API Types',
        items: [
          { text: 'Transaction Types', link: '/api-types/transaction-types' },
          { text: 'Message Types', link: '/api-types/message-types' },
        ],
      },
      {
        text: 'API Endpoints',
        items: [
          { text: 'Accounts', link: '/api-endpoints/accounts' },
          { text: 'Transactions', link: '/api-endpoints/transactions' },
          { text: 'Chats and Chatrooms', link: '/api-endpoints/chatrooms' },
          { text: 'Blocks', link: '/api-endpoints/blocks' },
          { text: 'Delegates', link: '/api-endpoints/delegates' },
          {
            text: 'States: Key-Value Storage',
            link: '/api-endpoints/kvs',
          },
          { text: 'Node & Blockchain', link: '/api-endpoints/blockchain' },
        ],
      },
      {
        text: 'Examples',
        items: [
          { text: 'Swift (iOS)', link: '/examples/swift' },
          { text: 'Java', link: '/examples/java' },
        ],
      },
      {
        text: 'SDK',
        items: [
          {
            text: 'JavaScript API Client',
            link: 'https://github.com/Adamant-im/adamant-api-jsclient',
          },
          {
            text: 'Console Tool',
            link: 'https://github.com/Adamant-im/adamant-console',
          },
          {
            text: 'API Schema',
            link: 'https://docs.adamant.im/schema/',
          },
          {
            text: 'API Schema Source',
            link: 'https://github.com/Adamant-im/adamant/tree/dev/openapi',
          },
        ],
      },
    ],
    nav: [
      {
        text: 'API Schema',
        link: 'https://docs.adamant.im/schema/',
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Adamant-im/adamant' },
    ],
  },
});
