# Introduction

ADAMANT is a **decentralized** messenger powered by a Delegated Proof of Stake (DPoS) blockchain. Anyone can run a node and interact with the network via REST and WebSocket APIs.

You don't have to run your own node to use ADAMANT Messenger or run apps and integrations. It's safe to use public nodes — all messages and transactions are **encrypted and signed locally** before being sent.

## Join the Decentralization

### Run your own node

While you can connect to any ADAMANT node with an enabled API, it is recommended to [run your own node](https://news.adamant.im/how-to-run-your-adamant-node-on-ubuntu-990e391e8fcc) for the following reasons:

- **Support decentralization** – More nodes means a stronger network
- **Robust performance** – Requests are processed faster through your own node
- **High reliability** – You maintain full control over the API's availability

To get started, check out the [Installation](/own-node/installation.md), [Configuration](/own-node/configuration.md), [Security Recommendations](/own-node/security.md), and [Monitoring](/own-node/monitoring.md) guides — they cover everything you need to install, harden, sync, and operate a node. Upgrading from an earlier release? See [Upgrading to v0.11.0](/own-node/upgrading.md).

You can also run a [Testnet node](/own-node/testnet.md) to experiment in a safe environment, or a [Localnet](/own-node/localnet.md) to run multiple nodes on one machine for isolated testing.

::: tip
If you're building a service with a near-100% uptime requirement, implement a health check in your application — similar to [adamant-api-jsclient](https://github.com/Adamant-im/adamant-api-jsclient/blob/07016c89b57863ac379ebfcbf6cf464a0639d3b1/src/api/index.ts#L183) or [the ADAMANT PWA](https://github.com/Adamant-im/adamant-im/blob/f5c7b7ce95fb5df3785a3458abc4e0b132c18791/src/lib/nodes/abstract.client.ts). While connecting to public nodes is possible, running three or more separate ADAMANT nodes is significantly more reliable.
:::

### Become a delegate

ADAMANT uses a **Delegated Proof of Stake (DPoS)** consensus. By running a node and meeting the criteria, you can [register as a delegate](https://news.adamant.im/how-to-become-an-adamant-delegate-745f01d032f), forge blocks, and earn rewards while contributing to network security.

## Public Nodes

To use ADAMANT, you can connect to any public node, such as:

```csv
https://lake.adamant.im
https://endless.adamant.im
https://ahead.adamant.im
https://sunshine.adamant.im
https://tauri.adm.im
```

However, **we still recommend running your own node** for reliability and performance, and to help support decentralized messaging.

## Interacting with the Nodes

If you're building a tool or app on the ADAMANT blockchain, you can use the REST API to interact with the network.

For real-time applications — such as messengers or bots — the WebSocket API provides instant updates and optimal performance.

### Choosing a node

You can connect to **any public node** in the ADAMANT network.

To ensure you're on the correct network, check the node's `nethash`. For the **mainnet**, the `nethash` is:

```
bd330166898377fb28743ceef5e43a5d9d0a3efd9b3451fb7bc53530bb0a6d64
```

You can check a node's `nethash` in its config or using the [`/api/blocks/getNethash`](/api-endpoints/blockchain.md#get-blockchain-nethash) endpoint. For example:

```url
https://endless.adamant.im/api/blocks/getNethash
```

### Community Libraries & Tools

This list includes some libraries and frameworks to interact with ADAMANT nodes **developed by the ADAMANT community**.

- **adamant-api-jsclient**. JavaScript framework to interact with the ADAMANT REST and WebSocket API with reliability in mind.

  https://github.com/adamant-im/adamant-api-jsclient

- **adamant-console**. Command-line interface and JSON RPC server for making requests to the ADAMANT network.

  https://github.com/adamant-im/adamant-console
