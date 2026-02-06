# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
