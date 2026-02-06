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
