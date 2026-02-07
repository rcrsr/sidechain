# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Session wrapper for Store with automatic token caching and write validation
- Session caches tokens per (path, sectionId) on reads, injects on writes
- Explicit token parameter takes precedence over cached token
- Multiple Sessions on same Store operate independently

### Changed

- Extract duplicated patterns from `store.ts` (2,497 to 1,498 lines, -40%) and `mcp/index.ts` (1,054 to 293 lines, -72%)
- Create constants module with 6 shared constants and error formatter handling 11 error types
- Extract 3 store helpers: path resolution, section type resolution, token validation
- Integrate helpers into 16 StoreImpl methods and 2 error formatter chains
- Extract 435-line item operations module with 23 tests
- Replace 378-line MCP switch statement with TOOL_HANDLERS lookup table
- Extract 22 MCP tool definitions into TOOL_DEFINITIONS constant
- Create CLI argument validation helpers (requireArg, parseJsonFlag), eliminating 15 duplicate blocks
- Replace 3 barrel wildcard exports with 19 explicit named exports
- Create 6 shared test fixture files (476 lines), reducing test duplication from 20% to 6.9%

### Fixed

- Fix 4 skipped tests via group-to-mount cache and cross-platform permission detection
- Fix validateWriteToken to reject unrecognized token prefixes with StaleTokenError fallback

### Tests

- Add 182 tests (596 to 779 total, +31%), zero skipped tests
- Add 65 CLI tests across 27 commands

## [0.1.0] - 2026-02-05

### Added

- Core storage layer with groups, slots, and sections data model
- Filesystem backend with markdown serialization (YAML frontmatter + h2 sections)
- Declarative node/group schemas with field validation (types, enums, required fields)
- Dynamic sections with parameterized ID patterns (`phase-{n}`, `domain-{name}`)
- Salted content-hash concurrency tokens at node and section scope
- Library API via `Sidechain.open(config)`
- CLI with 27 commands (JSON output to stdout)
- MCP server with 22 tools over JSON-RPC 2.0 stdio
- 2 content types: text and task-list
- Client-side name resolution (`<group>/<slot>/<section>/<item>` addressing)
- 9 typed error classes with LLM-friendly messages
- 596 tests covering 103 requirements (100%)
