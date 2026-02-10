# ADAMANT Node: AI Agent Operating Manual

This document defines how AI agents must work in this repository.

For practical, non-binding implementation notes, see `AI_AGENT_NOTES.md`.

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

## Project Positioning and Values

ADAMANT is not optimized for TPS marketing races. It prioritizes decentralization, privacy, and long-term protocol stability.

- Keep node operation cheap, lightweight, and accessible for independent operators.
- Prefer reliability and deterministic behavior over throughput-focused shortcuts.
- Treat the network as community-owned infrastructure without centralized control.
- Design for communication trust-layer use cases (messengers, social products, communication forks) rather than speculative "Web3 app" trends.

Reference reading:

- https://news.adamant.im/dissolving-adamant-foundation-transitioning-to-a-true-decentralized-community-70a39747e70b
- https://news.adamant.im/adamant-is-a-decentralized-trust-layer-for-communication-not-a-web3-whatsapp-ef43de435f26
- https://news.adamant.im/the-tps-illusion-why-high-speed-blockchains-lie-about-decentralization-17baee0826f3
- https://news.adamant.im/bitcoin-promised-us-freedom-d0a7c460d9ca
- https://news.adamant.im/building-a-utility-token-for-your-software-product-why-how-and-what-blockchain-platform-to-790473709274

## Documentation and Spec Sources of Truth

Use these sources when implementing or reviewing changes:

- Node repository overview: `README.md` and `.github/CONTRIBUTING.md` in this repo.
- Node documentation site: https://docs.adamant.im
- Node documentation source: https://github.com/Adamant-im/docs (branch `dev`)
- API schema site: https://schema.adamant.im
- API schema source: https://github.com/Adamant-im/adamant-schema (branch `dev`)
- AIP index and rendered pages: https://aips.adamant.im
- AIP source and process: https://github.com/Adamant-im/AIPs (`AIPS/aip-1.md`)
- Org-wide issue/label governance: https://github.com/Adamant-im/.github
- Recommended issue title prefixes: https://github.com/orgs/Adamant-im/discussions/5
- Recommended labels for issues/discussions: https://github.com/orgs/Adamant-im/discussions/1
- Current node issues: https://github.com/Adamant-im/adamant/issues

If sources disagree:

1. Treat current node code and passing tests as implementation truth for current behavior.
2. Treat `adamant-schema` and `docs` as required companion artifacts that must be aligned.
3. Do not silently ignore mismatch; raise it and propose a synchronized fix.

## Issue, Label, and PR Conventions

### Issue creation workflow

When creating an issue in this repository:

1. Check existing open issues first: https://github.com/Adamant-im/adamant/issues
2. Use org templates from `Adamant-im/.github/.github/ISSUE_TEMPLATE/*`.
3. Start title with one concise prefix.
4. Apply labels from org label catalog (`Adamant-im/.github/labels.json`).
5. Add the issue to project `Blockchain Node` when applicable.
6. Link related PRs and issues explicitly.

### Recommended title prefixes

Use one or two prefixes maximum:

- `[Bug]` bug, crash, wrong behavior
- `[Feat]` new functionality
- `[Enhancement]` improvement of existing functionality
- `[Refactor]` internal refactoring without behavior change
- `[Docs]` documentation updates
- `[Test]` testing work
- `[Chore]` maintenance and routine technical tasks
- `[Task]` general task (including operations/release/admin work)
- `[Composite]` multi-part task with sub-tasks
- `[UX/UI]` user experience or interface work
- `[Proposal]`, `[Idea]`, `[Discussion]` mostly for forum-level ideation

### Label policy

- `labels.json` in `Adamant-im/.github` is the source of truth for names/colors/descriptions.
- Use a minimal but informative set:
  - one type/status label (for example: `bug`, `enhancement`, `Task`, `Composite task`)
  - one or more domain labels (for example: `Nodes`, `Blockchain`, `APIs`, `Security`, `Protocol & AIPs`)
  - optional priority labels (for example: `High priority`)
- Keep repository-specific label casing as configured in target repo.

### PR linking policy

- Link issue in PR body using closing keywords where applicable (`Closes #<issue>`).
- In the issue body, link back to the PR URL.
- Keep PR and issue titles consistent with prefix taxonomy for release automation and searchability.

## Documentation Drift Policy

AI agents are allowed and expected to propose documentation updates when mismatches are found.

When behavior/spec/docs drift is detected:

1. Document the mismatch with exact file/endpoint references.
2. Propose synchronized updates across:
   - node code in this repo
   - API schema in `Adamant-im/adamant-schema`
   - docs in `Adamant-im/docs`
   - AIP text when change is protocol-level
3. If cross-repo changes cannot be done immediately, create linked issues with clear scope and dependency order.

## AIP Usage Rules for Protocol Changes

For protocol, consensus, serialization, or interoperability changes:

- Review `AIPS/aip-1.md` first.
- Ensure rationale, backward compatibility, and test strategy are explicit.
- Require an AIP (or update to an existing AIP) before finalizing consensus-impacting behavior.
- Track implementation status from draft to accepted/final states through the AIP process.

## Current Issue Landscape (Snapshot: 2026-02-10)

Open issues in `Adamant-im/adamant` are currently concentrated in:

- Node/blockchain reliability bugs (`bug`, `Nodes`, `Blockchain`, `NodeJS`)
- Logging and observability improvements
- Infrastructure/documentation/protocol coordination tasks

Before opening a new issue, verify that your problem is not already covered by this active set.

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

For every behavioral change, use a two-level validation strategy and report exactly what was run.

### Fast validation (default for most changes)

Use this for typical feature and bugfix work when changes are local and non-consensus-critical:

- Run targeted tests first:
  - `npm run test:single -- test/path/to/test.js`
- Run broader quick unit coverage when touching shared logic:
  - `npm run test:unit:fast`
- Run lint for touched files:
  - `ESLINT_USE_FLAT_CONFIG=false npx eslint file1.js file2.js`

### Full validation (required for critical or requested changes)

Use full validation when change risk is high or maintainers explicitly ask for it:

- Any consensus, serialization, replay, peer/network, security, SQL/migration, or activation-height change.
- Release preparation or explicit maintainer request.

Commands and prerequisites:

- Ensure local test services are available (PostgreSQL and Redis) and test config is prepared.
- Quick environment health check before tests:
  - `pg_isready -h localhost -p 5432`
  - `redis-cli -h 127.0.0.1 -p 6379 ping`
- If services are installed but not running (macOS/Homebrew):
  - `brew services start postgresql@14`
  - `brew services start redis`
- If services are missing (macOS/Homebrew):
  - `brew install postgresql@14 redis`
- Test DB/bootstrap defaults used by this repository (`test/config.json`):
  - PostgreSQL database: `adamant_test`
  - PostgreSQL user: `adamanttest`
  - PostgreSQL password: `password`
  - Redis URL: `redis://127.0.0.1:6379/1`
- API tests require local testnet in parallel:
  - Start testnet: `npm run start:testnet`
  - Run API tests: `npm run test:api`
- Unit tests (not in parallel):
  - `npm run test:unit`
- Lint (full repository):
  - `npm run eslint`

Practical note: this repository currently has no Prettier workflow. Style/format checks are driven by ESLint only.

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
