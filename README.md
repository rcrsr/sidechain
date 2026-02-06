# Sidechain

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

Same operations as CLI, exposed as MCP tools. Each command maps to a tool (`sidechain_list`, `sidechain_get`, `sidechain_validate`, etc.).

```bash
sidechain-mcp
```

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
