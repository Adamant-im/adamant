# Making Requests

All requests to the ADAMANT API must be made over HTTPS in the following format:

```url
https://{NODE_BASE_URL}/api/{METHOD_PATH}
```

Example:

```url
https://endless.adamant.im/api/node/status
```

## Passing Parameters

You can pass parameters in one of the following formats:

- As **URL query strings** (for `GET` requests)

  - E.g., you can find an account by passing `address` parameter:

    ```url
    https://endless.adamant.im/api/accounts?address=U2185870976635709603
    ```

- In the **request body** as `application/json` or `application/x-www-form-urlencoded` (for `POST` requests)

  - Example for creation a new account using cURL:

    ```sh
    curl 'https://clown.adamant.im/api/accounts/new' -X POST \
      -d 'publicKey=bee368cc0ce2974adcbcc97e649ac18a031492a579034abed5f77d667001d450'
    ```

## Transaction Query Language

Since this is a blockchain API, there are many endpoints for working with transactions. They share common parameters for sorting, filtering, and pagination.

To avoid duplication, we’ve created [a dedicated guide](./transactions-query-language.md) explaining how to use and combine these parameters.

## Response format

All responses return a JSON object with the following structure:

- `success` (Boolean) — Indicates whether the request was successful
- `nodeTimestamp` — The node's [ADAMANT timestamp](/#timestamps) after processing the request. It may not match the timestamp you passed in the parameters.
- `error` (String, optional) — A human-readable error message, present only if `success` is `false`

Examples:

- Successful request:

  ```json
  {
    "success": true,
    "nodeTimestamp": 63228852,
    "transactionId": "6146865104403680934"
  }
  ```

- Failed request:

  ```json
  {
    "success": false,
    "nodeTimestamp": 239258018,
    "error": "Object didn't pass validation for format address: U"
  }
```

The `/api/node/status` endpoint also returns `nodeTimestampMs` and `unixTimestampMs` as node clock metadata. They do not affect consensus.

## Rate limits

Starting in v0.11.0, public nodes enforce per-IP HTTP anti-abuse limits (grouping IPv6 clients by a `/56` prefix). Public REST requests are counted against both an aggregate surface budget (`all`) and separate route-class budgets for cheap `GET` status reads (`status`), other reads (`read`), and `POST`/`PUT` publish submissions (`publish`). `OPTIONS` CORS preflight requests are not counted.

When a hard cap is exceeded, the node responds with HTTP `429 Too Many Requests`, `Retry-After`, standard `RateLimit-*` headers (`RateLimit-Policy`, `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`), `RateLimit-Scope` (`status`, `read`, `publish`, or `all`), and optional legacy `X-RateLimit-*` headers when enabled. Node CORS middleware runs before the limiter and exposes these headers to browser clients.

The default JSON body omits `nodeTimestamp`:

```json
{
  "success": false,
  "error": "Too many requests, please try again later."
}
```

Treat HTTP `429` as bounded temporary backpressure rather than a permanent request validation error — honor `Retry-After` (or `RateLimit-Reset`) and retry with jittered backoff instead of tight-looping. Production defaults and legacy `max: 0` migration details are documented on the [Configuration](/own-node/configuration.md#api-configuration) page.

## OpenAPI Schema

Use the interactive [Swagger UI](https://docs.adamant.im/schema/) to explore and test API requests, or download the bundled [OpenAPI schema (`schema.json`)](https://docs.adamant.im/schema/schema.json) directly for client code generation, typings, or Postman import.

The OpenAPI 3.2 source files live in [`openapi/`](https://github.com/Adamant-im/adamant/tree/dev/openapi) in the `Adamant-im/adamant` repository.
