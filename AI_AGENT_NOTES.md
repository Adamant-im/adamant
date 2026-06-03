# ADAMANT Node: AI Agent Working Notes (Pragmatic, Non-Binding)

These notes are pragmatic recommendations for faster and safer work in this repository. They are not strict policy.

Primary product priorities remain:

1. Feature delivery and bug fixes.
2. Node reliability, consensus safety, and fault tolerance.
3. Opportunistic refactoring only when low-risk and clearly justified.

## 1) What This Codebase Is In Practice

- Legacy Node.js architecture with callback-first flows (`setImmediate`, `async`, custom `Sequence` queues).
- Consensus-critical logic is spread across:
  - block pipeline (`modules/blocks/*`, `logic/block.js`)
  - transaction pipeline (`modules/transactions.js`, `logic/transaction.js`, `logic/transactionPool.js`)
  - rounds/delegates/slots (`modules/rounds.js`, `modules/delegates.js`, `logic/round.js`, `helpers/slots.js`)
- State is mirrored in `mem_*` tables and round snapshots; replay/rollback behavior matters.
- There is known technical debt (`TODO`/`FIXME`) in critical paths; treat it as context, not a license for broad rewrites.

## 2) Golden Rule for AI Changes

If a change can impact block acceptance, transaction validity, delegate order, round accounting, replay, or peer compatibility, optimize for deterministic safety over elegance.

Prefer small targeted fixes over architecture cleanup.

## 3) High-Risk Areas (Read Before Editing)

- `modules/blocks/chain.js`
  - apply/undo flows, unconfirmed rewind/apply, fatal `process.exit` branches.
- `modules/blocks/process.js`, `modules/blocks/verify.js`, `modules/blocks/utils.js`
  - sync/rebuild/common-block logic and validation paths.
- `logic/transaction.js`
  - bytes/signature/id semantics, timestamp checks, consensus-gated fields.
- `logic/round.js`, `modules/rounds.js`
  - fee/reward distribution and snapshot restore logic.
- `modules/delegates.js`
  - delegate list generation and activation-based ranking differences.
- `modules/transport.js`, `modules/peers.js`, `logic/peer.js`
  - handshake security, peer filtering, network compatibility checks.
- `logic/account.js` + `sql/*`
  - mem-table integrity and SQL coupling.

## 4) Consensus Activation Patterns You Must Preserve

Current major gates:

- `config.default.json` -> `consensusActivationHeights.fairSystem`
  - delegate ranking/approval behavior changes around this height.
- `config.default.json` -> `consensusActivationHeights.spaceship`
  - `timestampMs` behavior and normalization are consensus-gated.

Rule of thumb: if you change behavior around these gates, test both sides of the height boundary.

For `timestampMs` work, keep the protocol contract precise:

- `timestamp` is ADAMANT epoch seconds.
- `timestampMs` is ADAMANT epoch milliseconds, not Unix milliseconds.
- `timestamp` must be derived as `Math.floor(timestampMs / 1000)` when both values come from the same client clock sample.
- After `spaceship`, a present `timestampMs` must satisfy `0 <= timestampMs - timestamp * 1000 < maxTimestampMsDelta`.
- `maxTransactionFutureMs` belongs to public API admission in `publish()` only. Do not move wall-clock tolerance checks into replay, sync, or block verification.

## 5) Sequencing and Race Control (Critical)

The project intentionally serializes state mutations using:

- `sequence` (main ordered work)
- `dbSequence` (ordered DB-heavy operations)
- `balancesSequence` (ordered balance/account mutation flows)

Recommendations:

- Do not move account, balance, or block mutation code out of these queues casually.
- For new mutation paths, follow neighboring queue semantics.
- When debugging state bugs, check queue ordering and reentrancy first.
- Always stop local testnet/mainnet nodes with graceful shutdown (`Ctrl+C` in the foreground process, or a catchable termination signal). Do not use `kill -9` or forced process termination unless the process is already unrecoverably stuck.

Critical shutdown note:

- Forced kills can leave `mem_accounts`, `mem_round`, and related memory mirror tables inconsistent with `blocks`.
- If the next startup logs `Detected unapplied rounds in mem_round`, `Recreating memory tables`, and `Rebuilding blockchain, current block height: 1`, treat the local derived state as untrusted.
- Do not “fix” this by deleting or editing `mem_*` rows manually. The reliable options are restoring a trusted database snapshot or letting the node rebuild/replay from persisted blockchain data.

## 6) Legacy Patterns to Respect While Shipping

You will see:

- callback + `setImmediate` style everywhere
- string-based thrown errors in many logic modules
- mixed old/new coding styles
- transitional backward-compatibility filters in transactions and SQL
- comments marking deprecated fields (e.g., delegate `rate`)

Recommendations:

- Match local style inside touched files unless there is a strong reason not to.
- Avoid wide async/await rewrites in consensus-critical paths.
- Keep cleanup local to the feature or bugfix you are shipping.

## 7) SQL/Schema/Model Coupling Reality

Data shape is tightly coupled across:

- JS model readers/writers (`dbRead`, `dbSave`, `objectNormalize`)
- SQL tables/views/migrations (`sql/*`, `sql/migrations/*`)
- API response contracts and external schema repo.

Recommendations:

- Treat SQL and JS shape edits as one change-set.
- If you alter fields used in `trs_list`/`trs_list_full`/`full_trs_list`, verify all callers.
- For protocol/API-visible changes, align this repo + `adamant-schema` + `docs`.

## 8) Refactoring Strategy That Fits This Repo

Allowed and useful:

- tiny, local refactors that reduce bug risk in touched code
- dead-code cleanup when clearly isolated
- extracting small pure helpers without changing execution order

Avoid unless explicitly requested and fully tested:

- broad module rewrites
- changing callback flow shape in hot paths
- “cleanup-only” edits across many consensus files

Rule of thumb: if a refactor increases blast radius more than it reduces current bug risk, defer it.

## 9) Fast Path for Feature/Bugfix Work

Recommended execution order:

1. Locate exact path: endpoint/module -> logic -> SQL/schema side effects.
2. Write down invariants that must not change (ordering, signatures, IDs, balances).
3. Implement minimal change.
4. Add regression test near existing suite location.
5. Run targeted tests first, then broaden only as needed.
6. Document residual risks if full verification is expensive.

## 10) Working with Command-Line Tools

When a CLI tool accepts multi-line input, use a temporary file in `.ai-ignored/` instead of inline multi-line shell strings. This avoids quoting bugs and behaves consistently across shells.

Avoid:

```bash
gh pr create --body "Line 1
Line 2
Line 3"
```

Recommended:

```bash
cat > .ai-ignored/temp.2026-04-04.pr-description.md <<'EOF'
Line 1
Line 2
Line 3
EOF

gh pr create --body-file .ai-ignored/temp.2026-04-04.pr-description.md
rm .ai-ignored/temp.2026-04-04.pr-description.md
```

Benefits:

- avoids shell escaping issues with quotes, newlines, and special characters
- is easier to debug and review
- works predictably across `bash`, `zsh`, and `fish`
- keeps scratch files under `.ai-ignored/`, which is already git-ignored

Common use cases:

- PR descriptions: `gh pr create --body-file .ai-ignored/temp.YYYY-MM-DD.pr-description.md --label "label1,label2"`
- Commit messages: `git commit -F .ai-ignored/temp.YYYY-MM-DD.commit-message.md`
- Issue creation: `gh issue create --body-file .ai-ignored/temp.YYYY-MM-DD.issue-body.md --label "label1,label2"`
- Any other CLI that accepts file-based input for multi-line content

## 11) Testing Recommendations (Pragmatic)

Use a two-level strategy:

- `fast` by default for day-to-day feature and bugfix iteration
- `full` for high-risk or explicitly requested validation

Fast validation:

- Run focused tests around touched behavior:
  - `npm run test:single -- test/path/to/test.js`
- If multiple shared modules are touched, add:
  - `npm run test:unit:fast`
- Run lint on touched files:
  - `ESLINT_USE_FLAT_CONFIG=false npx eslint file1.js file2.js`

Full validation (mandatory for risky changes):

- Use when touching consensus/serialization/replay/network/security/SQL/activation logic.
- Ensure local services are available (PostgreSQL and Redis).
- Run testnet at least once before broader suites:
  - `npm run start:testnet`
- Run non-parallel unit coverage:
  - `npm run test:unit`
- Run API tests with testnet running in parallel:
  - `npm run test:api`
- Run repository-wide lint:
  - `npm run eslint`

Environment bootstrap checklist:

1. Confirm test config exists:
   - `test/config.json` (copy from `test/config.default.json` if missing)
2. Check PostgreSQL and Redis health:
   - `pg_isready -h localhost -p 5432`
   - `redis-cli -h 127.0.0.1 -p 6379 ping`
3. If services are installed but stopped (macOS/Homebrew):
   - `brew services start postgresql@14`
   - `brew services start redis`
4. If binaries are missing (macOS/Homebrew):
   - `brew install postgresql@14 redis`
5. Ensure local DB credentials expected by tests are available:
   - DB: `adamant_test`
   - User: `adamanttest`
   - Password: `password`
6. Run testnet at least once and confirm startup logs before broader tests:
   - `npm run start:testnet`
   - Look for: `ADAMANT started` and `Blockchain ready`
7. Stop testnet cleanly with `Ctrl+C` before running non-API unit suites. Do not use forced kill commands for a node process that is still writing blocks or round state.

Observed environment pitfalls:

- `npm run test:unit:fast` can fail early if local PostgreSQL is unavailable.
- `npm run eslint` can fail if `config.json` is missing (copy from `config.default.json` for local runs).
- ESLint tooling may fail because of legacy `.eslintrc.json` + ESLint v9 ecosystem drift; when this happens, lint touched files via `ESLINT_USE_FLAT_CONFIG=false npx eslint ...` and report the tooling issue explicitly.
- This repository does not use Prettier; ESLint is the active style gate.

Always report:

- exact commands executed
- pass/fail result of each command
- what was intentionally not run and why

## 12) Networking and Security Notes

- Keep nethash/version compatibility checks intact in peer transport/handshake.
- Do not weaken request validation or peer filtering.
- WebSocket peer flows (`api/ws/*`, `modules/clientWs.js`) are secondary transport surfaces; preserve auth/nonce and connection caps.
- Avoid logging sensitive data (passphrases, seeds, private keys).

## 13) Known Technical Debt Hotspots (Use With Care)

There are many inline `FIXME/TODO` notes in:

- `modules/blocks/*`
- `modules/loader.js`
- `modules/transactions.js`
- `modules/peers.js`
- `logic/transaction.js`

Recommendation:

- For each touched `FIXME`, decide explicitly whether to fix it now or leave it in place and reference it in PR or issue notes.

## 14) Suggested “AI Output Style” for This Repo

When proposing changes, communicate:

- what behavior changes
- what behavior is intentionally unchanged
- why consensus/replay/network safety is preserved
- what tests prove it
- what follow-up refactor is deferred

This helps maintainers review quickly in a legacy-heavy codebase.

## 15) Definition of a Good AI Change Here

A good change in this repository:

- fixes a real user/developer problem,
- keeps node behavior deterministic and replay-safe,
- does not expand risk surface unnecessarily,
- leaves the codebase slightly clearer than before,
- and postpones heavy refactoring unless it is required for correctness.
