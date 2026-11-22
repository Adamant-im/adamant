# Syncing

To maintain decentralization, a blockchain node must connect and synchronize with other nodes (peers) in the network.

You can define the initial list of peers in the configuration file using the [`peers`](./configuration.md#peer-configuration) field and check synchronization status using the [`/api/loader/status/sync`](../api-endpoints/blockchain.md#get-synchronization-status) endpoint.

:::info
Make sure the peers are on the same network. You can verify this by checking the nethash using the [`/api/blocks/getNethash`](/api-endpoints/blockchain.md#get-blockchain-nethash) endpoint.
:::

Once connected, the node automatically discovers more peers by querying the peers of its current connections. Discovered peers are saved in the local database, which speeds up future deployments and restarts.

Starting in v0.11.0, outbound peer update probes and peer-table admission are bounded by `peers.options` (`updateConcurrency`, `probeSpacingMs`, `maxProbeTargets`, `unverifiedProbeLimit`, exponential unreachable backoff and eviction, and per-IP/per-subnet limits), and peer HTTP traffic uses scoped `429` backpressure with `X-Adamant-Rate-Limit: 1` negotiation so peers are throttled cleanly without being banned. See [Peer Configuration](./configuration.md#peer-configuration).

You can get the list of connected and discovered peers using the [`/api/peers`](/api-endpoints/blockchain.md#get-peers-list) endpoint.

## Socket connections

For faster transaction syncing between nodes, we recommend enabling [WebSocket Node connections](./configuration.md#websocket-node-configuration) in the configuration.

If you enable the WebSocket, a node will connect to another peer using both WebSocket and HTTP at the same time. It’s up to the broadcasting node to decide how to send transactions. By default, transactions are not sent twice to the same peer using both methods.

## Peer selection and rotation

To avoid centralization, the node randomly selects peers to broadcast transactions to. This is the same strategy used for HTTP broadcasting.

Every 30 minutes, the node replaces 20% of its current WebSocket connections with new ones. This rotation helps maintain a healthy and distributed peer network.

## Transaction broadcasting

When a node receives an unconfirmed transaction, it spreads it across the network by sending it to multiple randomly selected peers.

The method used for broadcasting depends on the type of connection:

- **WebSocket**: Transactions are sent instantly.
- **HTTP (REST)**: Transactions are sent after a short delay, defined by the [`broadcastInterval`](./configuration.md#broadcast-configuration) configuration property.

If a peer is connected via WebSocket, it may still receive the same transaction via HTTP. This design ensures redundancy.

As a result, a node may receive the same unconfirmed transaction multiple times, from different peers, and through both REST and WebSocket. This helps ensure that transactions reliably reach their destination even if some connections fail.

## Backward compatibility

In earlier versions, nodes had a separate WebSocket server intended for transaction syncing, but it wasn't fully implemented and didn't receive transactions over WebSocket.

After recent changes, new nodes now support full transaction syncing over WebSocket. Even if many nodes on the network still run older software, the newer nodes can receive transactions instantly. Older nodes will continue relying on HTTP broadcasting as before.
