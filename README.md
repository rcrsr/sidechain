# Sidechain

> **Experimental** — API and storage format may change between releases.

Structured persistent content layer for LLM applications.

Sidechain gives LLMs typed read/write access to persistent, schema-validated content through a storage-agnostic API. Developers define schemas. Sidechain enforces them. LLMs interact with structured content using logical addresses — no filesystem paths, no custom storage code.

## Problem

LLM applications that persist state across sessions reinvent the same primitives: files with metadata, status fields, section-based content, task tracking. Without a content layer, agents fall back to direct file I/O with no access boundaries, no validation, and no consistency.

## What Sidechain Provides

- **Typed content store** with schema validation on every write
- **Hierarchical addressing** for groups, slots, and sections (`group/slot/section/item`)
- **7 built-in content types**: text, task-list, collection, checklist, table, key-value, reference-list
- **3 interfaces**: TypeScript library, CLI (JSON output), MCP server
- **Storage-agnostic**: filesystem default with markdown + YAML frontmatter, pluggable backends
- **Capability-based access**: cryptographic group addresses, no global enumeration
- **Optimistic concurrency**: salted-hash read tokens at node and section scope

## Quick Start

```typescript
import { Sidechain } from '@rcrsr/sidechain';

const store = await Sidechain.open({
  mounts: {
    projects: { path: './data/projects', groupSchema: 'project' },
  },
  groupSchemas: {
    project: projectGroupSchema,
  },
  nodeSchemas: {
    requirements: requirementsSchema,
    specification: specificationSchema,
  },
});

// Create a group — materializes all slots with defaults
await store.createGroup('user-auth');

// Describe a schema — LLM learns what to write
await store.describe('requirements');

// Populate a slot in one call
await store.populate('user-auth/requirements', {
  metadata: { status: 'draft' },
  sections: [
    { id: 'overview', content: 'Email/password authentication system.' },
  ],
});

// Read content back
const node = await store.get('user-auth/requirements');
```

## CLI

All commands output JSON to stdout.

```bash
sidechain list                                    # List all groups
sidechain get user-auth/requirements              # Read full node
sidechain set-meta user-auth/requirements status spec-ready
sidechain item update user-auth/plan phase-1 1.2 --data '{"status":"done"}'
sidechain validate user-auth/requirements         # Check against schema
```

Configuration loads from `sidechain.json` in the working directory or `--config <path>`.

## MCP Server

Same operations as CLI, exposed as MCP tools over JSON-RPC 2.0 stdio. Each command maps to a tool (`sidechain_list`, `sidechain_get`, `sidechain_validate`, etc.).

### Standalone

```bash
sidechain-mcp
```

The server reads `sidechain.json` from the working directory (or `MCP_CONFIG` env var).

### Claude Code

Add sidechain as a project-scoped MCP server:

```bash
claude mcp add --transport stdio --scope project sidechain -- node ./dist/mcp/index.js
```

This writes to `.mcp.json` in the project root:

```json
{
  "mcpServers": {
    "sidechain": {
      "type": "stdio",
      "command": "node",
      "args": ["./dist/mcp/index.js"]
    }
  }
}
```

Verify the connection:

```bash
claude mcp list
```

Once connected, Claude Code exposes sidechain tools (`sidechain_list`, `sidechain_get`, `sidechain_set_meta`, etc.) alongside its built-in tools. Use `/mcp` inside a Claude Code session to check server status.

### Available Tools

| Tool                       | Description                                      |
| -------------------------- | ------------------------------------------------ |
| `sidechain_list`           | List all groups                                  |
| `sidechain_get`            | Read full node                                   |
| `sidechain_meta`           | Read metadata or single field                    |
| `sidechain_set_meta`       | Write metadata field(s)                          |
| `sidechain_section`        | Read single section                              |
| `sidechain_write_section`  | Write section content                            |
| `sidechain_append_section` | Append to section content                        |
| `sidechain_populate`       | Write full node (metadata + sections)            |
| `sidechain_describe`       | Describe a schema                                |
| `sidechain_validate`       | Validate node against schema                     |
| `sidechain_item_*`         | Item operations (get, add, update, move, delete) |

## Data Model

```
Store
├── schemas: { schema-id → Schema }
├── group-schemas: { schema-id → GroupSchema }
└── mounts: { mount-id → filesystem path }
    └── Group (directory, atomic unit)
        └── Node (slot, defined by group schema)
            ├── metadata: YAML frontmatter fields
            └── sections[]: ## headings with typed content
```

Groups are the atomic unit. Creating a group materializes all node slots from the group schema. Nodes exist from group creation. Slots are immediately addressable, even before content is written.

## Filesystem Format

Files look like what a developer would write by hand:

```markdown
---
type: requirements
status: draft
last-modified: 2026-02-05
---

## Overview

Email/password authentication system.

## Functional Requirements

### FR-AUTH-1: Login

The system authenticates users via email and password.
```

No hidden metadata directories. Git diffs are meaningful. Files work without sidechain installed.

## Requirements

- Node.js >= 18.0.0

## License

[MIT](LICENSE)
