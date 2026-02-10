# ADAMANT Node: AI Agent Operating Manual

This document defines how AI agents must work in this repository.

## Mission

ADAMANT is a blockchain node for a privacy-focused messaging network. Agent output must optimize for:

1. Reliability first.
2. Security second.
3. Open-source maintainability and contributor clarity third.

If a tradeoff is needed, preserve consensus safety first.

## Language Policy

- Developers may communicate with AI in any language.
- All repository artifacts must be in English only.
- Write all code, comments, commit messages, docs, ADRs, and PR text in English.

## System Map (What You Are Editing)

- Startup and wiring: `app.js`
- Consensus and activation flags: `logic/consensus/*`
- Block pipeline: `modules/blocks/*`, `logic/block.js`
- Transaction pipeline: `modules/transactions.js`, `logic/transaction.js`, `logic/transactionPool.js`
- Delegates/forging/slot validation: `modules/delegates.js`, `modules/rounds.js`, `logic/round.js`, `helpers/slots.js`
- P2P transport and handshake: `modules/transport.js`, `modules/peers.js`, `logic/peers.js`, `logic/peer.js`
- State and balances (mem tables): `logic/account.js`, `modules/accounts.js`, `sql/*`
- Crypto primitives: `helpers/ed.js`, `helpers/accounts.js`
- Config and schema validation: `helpers/config.js`, `schema/*`, `helpers/z_schema.js`

## Current Activation Switches

At the time of writing, consensus behavior is gated at least by:

- `helpers/constants.js` -> `fairSystemActivateBlock` (delegate ranking and voting-weight behavior).
- `logic/consensus/activationHeights.js` -> `spaceship` (transaction `timestampMs` activation path).

If you change these or add new switches:

- Keep pre-activation and post-activation paths deterministic.
- Update tests for both sides of the activation boundary.
- Verify schema, DB fields/views, and transport compatibility together.

## Non-Negotiable Consensus Rules

Do not merge changes that violate any rule below.

- Deterministic behavior only on consensus-critical paths.
- No non-deterministic ordering in block, transaction, round, delegate, or balance logic.
- Do not use locale, system timezone, random seeds, object key order, or async race outcomes for consensus decisions.
- Preserve transaction and block byte serialization compatibility unless a protocol upgrade is explicitly planned.
- Preserve block and transaction ID/hash/signature semantics unless a coordinated upgrade is defined.
- Keep slot-time validation semantics stable (`helpers/slots.js`, delegate slot checks, block timestamp checks).
- Keep activation-gated behavior backward-compatible (`logic/consensus/activationHeights.js`).
- Never silently change reward, fees, delegate ranking, round accounting, or signature validation rules.

## Protocol Upgrade Rules

Any consensus or wire-format change must include all items:

- Explicit activation mechanism via height-gated logic.
- Backward compatibility strategy for pre-activation heights.
- Migration and replay verification plan.
- Test coverage for before-activation and after-activation behavior.
- Documentation update in this repository and external node spec references.

For constants with explicit SQL coupling, update both JS and SQL logic together.
Example: `helpers/constants.js` warns that reward and supply changes must match SQL reward functions.

## Security Rules

- Never weaken signature verification, multisignature checks, or sender/requester checks.
- Never bypass nethash/version compatibility checks in peer handshake and transport.
- Do not log secrets, passphrases, private keys, raw seed material, or security tokens.
- Keep input validation strict on public and peer APIs.
- Preserve anti-abuse controls: rate limiting, peer filtering, peer state handling, and schema validation.
- Do not introduce dynamic code execution, unsafe deserialization, or unvalidated shell execution paths.
- Minimize new dependencies, especially cryptography and networking dependencies.

## Data Integrity and Migrations

- Treat `mem_*` tables and round tables as consensus state mirrors.
- Maintain replay safety when changing account merge, round tick, or block apply/rollback flows.
- SQL migrations must be forward-only, idempotent where possible, and reversible by chain replay.
- If you alter views used by API or sync logic, verify all dependent queries and parsers.
- Keep schema, SQL, and JS model fields synchronized.

## Concurrency and Sequencing

This node relies on explicit sequencing to avoid state races.

- Respect `sequence`, `dbSequence`, and `balancesSequence` semantics.
- Avoid parallel state mutation in balances, block apply/undo, and transaction apply/undo paths.
- Do not move critical state updates outside existing sequence guards without proof and tests.

## Exceptions and Historical Compatibility

- Files like `helpers/exceptions.js` contain historical chain exceptions.
- Do not add or remove exceptions without a chain-history audit and explicit rationale.
- Any exception change requires dedicated tests and maintainer review.

## Required Testing Policy

For every behavioral change, run targeted tests first, then broaden if needed.

- Unit tests: `npm run test:unit`
- Fast unit tests: `npm run test:unit:fast`
- API tests (requires local testnet in parallel):
  - Start testnet: `npm run start:testnet`
  - Run API tests: `npm run test:api`
- Lint: `npm run eslint`

Minimum expectations:

- Consensus-related changes: relevant unit tests plus API/peer tests for affected flows.
- Transaction/block serialization or verification changes: add tests in `test/unit/logic/*` and peer API tests.
- SQL/migration changes: add or update SQL/unit coverage and replay-sensitive checks.

Never claim success without listing exactly what was executed and what was not executed.

## AI Change Workflow

Follow this order:

1. Read relevant modules end-to-end before editing.
2. Identify invariants that must stay unchanged.
3. Make the smallest safe change.
4. Add or update tests.
5. Run validation commands.
6. Report risks, assumptions, and remaining gaps.

## Pull Request Checklist for AI Agents

Before finalizing, confirm all:

- English-only repository output.
- No consensus-breaking nondeterminism introduced.
- No security checks weakened.
- Activation gating used for protocol behavior changes.
- Schema, logic, and SQL kept consistent.
- Tests added/updated and run.
- Clear operator/developer notes for config or migration impacts.

## When to Escalate to Maintainers

Stop and request human review before proceeding if:

- Change affects block/transaction bytes, IDs, signatures, slot timing, delegate order, rewards, fees, or round settlement.
- Change introduces/removes chain exceptions.
- Behavior differs between replay and live processing.
- You cannot prove deterministic equivalence.

## Definition of Done

A change is done only when reliability, security, and maintainability all pass together.
