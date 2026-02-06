# Backlog

## BL-1: Add `yaml` as direct dependency

`yaml` (v2.8.2) is imported in `src/backends/filesystem.ts` but not declared in `package.json`. It resolves only because `vitest → vite → yaml` hoists it to root `node_modules`. This breaks if vitest drops the dependency or npm deduplication changes.

**Action:** `npm install yaml`

## BL-2: Extract path resolution helper in `src/core/store.ts`

Every store method (15 occurrences) repeats a 10-15 line preamble: split path, validate group address, resolve to filesystem path, check node existence. A single `private resolveNode(path)` returning `{ group, slot, resolvedPath, rawNode }` eliminates ~200 lines.

## BL-3: Extract section type resolution in `src/core/store.ts`

`get`, `sections`, `section`, and `item.add` each walk required → optional → dynamic schema declarations to resolve a section's content type. One `resolveSectionType(nodeSchema, sectionId): string` helper eliminates the duplication.

## BL-4: Extract token validation in `src/core/store.ts`

`writeSection`, `appendSection`, `item.update`, and `setMeta` each contain a ~30-line block checking section-scoped vs node-scoped tokens and constructing `StaleTokenError`. One `validateToken(rawNode, opts, path, sectionId?)` helper consolidates 4 copies.

## BL-5: Extract item operations to `src/core/items.ts`

The `item` property on `StoreImpl` (lines 1501-2046, 545 lines) holds 4 arrow functions (`get`, `add`, `update`, `remove`) sharing minimal state with the rest of the class. Extractable with a context interface exposing `backend`, `registry`, and `tokenSalt`.

## BL-6: Extract MCP tool definitions to `src/mcp/tools.ts`

`handleToolsList` contains a 285-line static `tools` array (22 tool schemas). This is data, not logic. Move to a constant export.

## BL-7: Extract MCP tool routing to `src/mcp/router.ts`

`routeToolCall` is a 378-line switch statement dispatching 22 tool names to store calls. Each case repeats `typeof args['x'] !== 'string'` checks. Extractable as-is or refactored to table-driven dispatch.

## BL-8: Extract MCP error formatting to `src/mcp/errors.ts`

The 110-line `if/else` chain mapping 9 error types to `{ ok: false, ... }` result objects is reusable. One `formatError(error): ErrorResult` function replaces it.

## BL-9: Unskip 4 blocked tests (VAL-1)

4 tests remain `.skip`ped despite the root cause fix being in place:

- `tests/core/store.test.ts:342` (AC-6 deleteGroup)
- `tests/core/store.test.ts:351` (AC-31 locked nodes)
- `tests/core/store.test.ts:384` (AC-8 list slot summaries)
- `tests/integration/full-system.test.ts:711` (AC-31 integration)

**Action:** Remove `.skip` from 4 tests, run `npm run test` to confirm all pass.

## BL-10: Fix EC comment labels in error classes (REV-1)

6 error class comments in `src/core/errors.ts` reference wrong spec EC numbers:

- ValidationError: EC-1 → EC-9
- NotFoundError: EC-2 → EC-10
- SectionNotFoundError: EC-4 → EC-11
- StaleTokenError: EC-5 → EC-12
- PatternMismatchError: EC-8 → EC-13
- MappingError: EC-9 → EC-4/EC-5

Comments only, no runtime impact.

## BL-11: Replace platform-dependent test skip with mock (DEBT-1)

`tests/core/client.test.ts:172` skips the EC-4 file permission test because it fails on WSL/tmpfs. Replace with a mock filesystem test to verify the error path without platform dependency.

## BL-12: Create `/docs` documentation

Add user-facing documentation covering:

- Getting started guide (install, configure, first group/node)
- Schema authoring (group schemas, node schemas, dynamic sections, field types)
- Content types reference (text, task-list, and future types)
- CLI command reference (all 27 commands with examples)
- MCP server setup and tool reference
- Library API reference (Store, Client, operations, error handling)
- Backend configuration (filesystem format, future backends)
- Concurrency model (read tokens, enforcement modes)

## BL-13: Add CLI unit tests

`src/cli/index.ts` (621 lines, 66 branch points) has zero dedicated tests. No `tests/cli/` directory exists. CLI behavior is covered indirectly through MCP integration tests but argument parsing, config loading, flag validation, and command routing lack direct unit coverage.

**Action:** Create `tests/cli/index.test.ts` covering `parseArgs`, `loadConfig`, `routeCommand`, and error paths for each of the 20+ subcommands.

## BL-14: Extract CLI argument validation helpers in `src/cli/index.ts`

jscpd found 5 clones (37 duplicated lines) in the CLI:

- `write-section` (lines 232-244) and `append-section` (lines 254-266) repeat identical `nodePath`/`sectionId`/`content` validation
- `remove-section` (line 296-301) and `section` (lines 221-226) repeat `nodePath`/`sectionId` validation
- 2 JSON parsing try/catch blocks (lines 387, 406) repeat identical `JSON.parse` + error formatting
- `item remove` (lines 422-426) and `item get` (lines 370-374) repeat `itemId` validation

**Action:** Extract `requireArgs(args, names): string[]` and `parseJsonFlag(value, flagName): object` helpers. Eliminates 5 clones.

## BL-15: Narrow `catch (error)` type assertions

17 `catch (error)` blocks exist across `src/`. One uses `error as NodeJS.ErrnoException` type assertion (`src/backends/filesystem.ts:112`) without `instanceof` narrowing. The remaining 16 blocks are safe (they use `instanceof` guards or re-throw).

**Action:** Replace the assertion at `filesystem.ts:112` with `error instanceof Error && 'code' in error` narrowing.

## BL-16: Reduce test duplication (21.4%)

jscpd reports 21.4% line duplication (2,039 lines, 244 clones) across 16 test files at `--min-tokens 30`. Primary sources:

- `tests/backends/filesystem.test.ts`: 5 clones in store setup/teardown patterns
- `tests/integration/store-client.test.ts`: repeated config + store initialization
- `tests/core/sections.test.ts`, `tests/core/items.test.ts`: repeated schema registration boilerplate

**Action:** Extract shared test fixtures (`createTestStore`, `createTestSchema`, `withTempDir`) to `tests/helpers/` and import across test files.

## BL-17: Audit public API surface exports

`ts-unused-exports` reports 50 unused type exports in `src/types/index.ts` and 45 unused symbol exports in `src/core/index.ts`. These barrel files re-export everything, but some types may be internal-only.

**Action:** Review each export against intended public API. Mark internal-only types with `@internal` JSDoc or remove from barrel exports.

## BL-18: Extract magic strings to constants

Token prefixes (`sc_t_sec_`, `sc_t_node_`), MCP protocol version (`2024-11-05`), and config file name (`sidechain.json`) appear as string literals in multiple locations.

**Action:** Create `src/core/constants.ts` with named exports for repeated string literals.
