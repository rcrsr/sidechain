# Sidechain

Structured persistent content layer for LLM applications.

## Problem

LLM applications that persist state across sessions reinvent the same primitives: files with metadata, status fields, section-based content, task tracking. Conduct built this as a tightly coupled pseudo-protocol. Every stateful LLM app — workflow engines, agent frameworks, knowledge managers — faces the same problem with ad-hoc solutions.

Without a content layer, agents fall back to direct file I/O. This creates two compounding problems. In multi-tenant environments, raw filesystem access expands the attack surface — agents read and write arbitrary paths with no access boundary between tenants. In single-tenant environments, workflow state (status files, task lists, metadata) accumulates in project directories alongside source code, requiring `.gitignore` maintenance and polluting repositories with ephemeral artifacts.

## Core Idea

A storage-agnostic content layer that gives LLMs structured read/write access to persistent, schema-validated content. Sidechain provides the **data model and operations**. Consumers own all **semantics** — state machines, transition rules, dependencies, workflow logic.

### What Sidechain Is

- A typed content store with schema validation
- A hierarchical addressing system for groups, slots, and sections
- An interface layer (library, CLI, MCP server) for LLM interaction
- Storage-agnostic — filesystem default, pluggable backends

### What Sidechain Is Not

- Not a workflow engine — consumers define state machines and transitions
- Not opinionated about state — metadata fields are application-defined
- Not a dependency manager — cross-node relationships are consumer logic

## Use Cases

### 1. Document-Driven Workflows (Conduct)

Conduct uses sidechain to store initiative documents (requirements, specifications, plans, feedback). Sidechain handles storage and schema validation. Conduct owns workflow logic, agent orchestration, and policy enforcement. See [SIDECHAIN-CONDUCT.md](SIDECHAIN-CONDUCT.md) for the full schema mapping.

```
Conduct skills → sidechain library → filesystem backend
```

### 2. Stateful Agents

A standalone LLM app maintains agent memory, context, and task state across sessions. The agent reads its prior state on session start, writes updates as it works, reads results from previous sessions. No workflow engine needed — just persistent typed content.

```
Agent app → sidechain library → SQLite backend
```

### 3. Third-Party Integrations

Any application embeds sidechain as a library to give LLMs structured content access. The application defines its own schemas and content types. Sidechain handles storage, validation, and the interface contract.

```
3rd party app → sidechain library → app-chosen backend
```

## Design Constraint: Filesystem First

The initial implementation must produce files that physically resemble what conduct uses today: markdown files with YAML frontmatter in plain directories. No database, no binary format, no exotic directory structures.

Sidechain is a better interface to files that already make sense on their own. A human opening the directory sees readable markdown. Git diffs are meaningful. The files work without sidechain installed — they're just files.

Some structural normalization is acceptable to simplify parsing (consistent heading levels, standardized frontmatter fields, predictable section markers). The goal is not zero-change compatibility with every existing file, but a physical format that conduct files can adopt with minimal adjustment.

### What This Rules Out (Initially)

- `.sidechain/` metadata directories as a hard requirement
- Schemas stored alongside content (schemas can live anywhere the consumer chooses)
- Content types that don't map to markdown (tables, task-lists, checklists all have natural markdown representations)
- Any physical artifact that makes the files less useful without sidechain

### What This Allows

- Normalizing heading levels (e.g., `## ` for all top-level sections)
- Requiring consistent frontmatter field naming
- Defining section delimiters that the parser can rely on
- Adding optional structural hints (e.g., a comment marker for content type)

## Concept Model

```
Store
├── schemas: { schema-id → Schema }
├── group-schemas: { schema-id → GroupSchema }
├── content-types: [registered type IDs]
└── mounts: { mount-id → filesystem path }
    └── Group (a directory, the atomic unit)
        └── Node (a slot, defined by group schema)
            ├── metadata: YAML frontmatter fields
            └── sections[]: ## headings with typed content
```

### Primitives

| Primitive | Role |
|-----------|------|
| **Store** | Root container. Holds registries and mount configuration. |
| **Mount** | Named mapping from a logical ID to a filesystem path. Contains groups. Shardable — multiple mounts can hold groups of the same type. |
| **Group** | A directory. The atomic unit of creation. Created explicitly via API. Has a group schema that declares its node slots. |
| **Node** | A slot within a group. Declared by the group schema. Logically present from group creation, initially empty. Has metadata and ordered sections governed by its node schema. |
| **Section** | Content block within a node, delimited by `## ` headings. Has an ID and typed content. |
| **Schema** | Two levels: **group schema** declares which node slots exist; **node schema** declares metadata fields and section structure per slot. Consumer-defined, sidechain-enforced. |
| **Content Type** | Defines the shape and operations for a section's content. Extensible registry. |

**Terminology convention:** "Slot" refers to the position declared by a group schema. "Node" refers to the data object returned when reading a slot. A slot exists from group creation; a node is the content that fills it. API methods that operate on stored content use "node" naming (e.g., `readNode`, `writeNode` in the backend contract). Group schema declarations use "slot" naming.

### Key Design Decisions

**Groups are the atomic unit.** Creating a group creates all its node slots as defined by the group schema. Nodes are not created individually — they exist because the group schema declares them. An empty slot is still addressable.

**Mounts contain groups, not nodes.** A mount points to a directory of groups. Each subdirectory is a group. This enables sharding — `client-a/initiatives` and `client-b/initiatives` can be separate mounts holding groups of the same type.

**Nodes are slots, not files.** A node's existence is declared by the group schema. When a group is created, each slot materializes with default metadata and empty sections. The slot is immediately addressable. Populating a slot means writing metadata and section content into it.

**State is metadata.** Sidechain validates the value is schema-legal (e.g., enum check). The consumer validates the transition is workflow-legal (e.g., draft → active is allowed, draft → closed is not).

## Configuration

A store is opened with explicit configuration. No convention-over-configuration magic. Example using conduct's initiative schemas:

```json
{
  "mounts": {
    "initiatives": { "path": "conduct/initiatives", "groupSchema": "initiative" },
    "archive": { "path": "conduct/archive", "groupSchema": "archived-initiative" },
    "notes": { "path": "conduct/notes", "groupSchema": "notebook" }
  },
  "groupSchemas": {
    "initiative": "./schemas/initiative.json",
    "archived-initiative": "./schemas/archived-initiative.json",
    "notebook": "./schemas/notebook.json"
  },
  "nodeSchemas": {
    "requirements": "./schemas/requirements.json",
    "specification": "./schemas/specification.json",
    "implementation-plan": "./schemas/plan.json",
    "feedback": "./schemas/feedback.json",
    "archive-manifest": "./schemas/manifest.json"
  },
  "nodeExtension": ".md"
}
```

| Field | Purpose |
|-------|---------|
| `mounts` | Map logical IDs to filesystem paths. Each mount binds a group schema. |
| `groupSchemas` | Define what node slots exist within a group type. |
| `nodeSchemas` | Define metadata fields and section structure per node type. |
| `nodeExtension` | File extension for node files (default: `".md"`) |

### Group Schema

A group schema declares the node slots that exist within a group.

```json
{
  "schema-id": "initiative",
  "description": "A conduct initiative. Contains requirements, specification, plan, and feedback.",
  "slots": [
    { "id": "requirements",   "schema": "requirements",        "description": "User needs and acceptance criteria for the change." },
    { "id": "specification",  "schema": "specification",       "description": "Technical design: architecture, data model, interfaces." },
    { "id": "plan",           "schema": "implementation-plan", "description": "Phased task list with coverage tracking." },
    { "id": "feedback",       "schema": "feedback",            "description": "Post-implementation retrospective and backlog." }
  ]
}
```

When `createGroup('user-auth')` is called, sidechain creates the directory and materializes each slot as a file with default metadata and empty required sections.

See [SIDECHAIN-CONDUCT.md](SIDECHAIN-CONDUCT.md) for conduct's full mount layout, group schemas, and slot-to-schema mappings.

## Addressing

Every piece of content has a stable path. No filesystem paths leak through the API.

```
<group>                                     → list node slots (no argument = list all groups)
<group>/<slot>                              → full node (metadata + all sections)
<group>/<slot>/@meta                        → metadata only
<group>/<slot>/@meta/<field>                → single metadata field
<group>/<slot>/<section>                    → section content
<group>/<slot>/<section>/<item>             → item within a list/table section
```

These paths are the logical addressing scheme. API methods accept path components as separate parameters for item-level operations (e.g., `task.get(path, section, item)` rather than a single `group/slot/section/item` string). The no-argument form of `list()` returns all groups the client has addresses for.

Real examples from conduct (LLM perspective):

```
list()                                       → ["capture-arrow-syntax", "claude-code-extension"]
capture-arrow-syntax                         → slots: ["requirements", "specification", "plan", "feedback"]
capture-arrow-syntax/requirements             → full node
capture-arrow-syntax/requirements/@meta       → { type, status, last-modified, blocks }
capture-arrow-syntax/requirements/@meta/status → "locked"
capture-arrow-syntax/requirements/overview    → text section content
capture-arrow-syntax/plan/phase-1             → section with task-list content
```

The `@meta` prefix distinguishes metadata access from section access. Slot IDs match the group schema slot declarations — `requirements` not `requirements.md`.

Every slot is addressable from the moment the group is created, even before content is written.

### Mount Transparency

LLMs do not address mounts. The host application configures mounts, and sidechain resolves group names to the correct mount. When a single mount exists (the common case), paths are just `<group>/<slot>`. When multiple mounts exist, the host configures a default or sidechain resolves unambiguously.

```
LLM sees:       capture-arrow-syntax/requirements
Sidechain maps:  mount "initiatives" → conduct/initiatives/capture-arrow-syntax/requirements.md
```

The LLM never knows the mount name, the filesystem path, or the file extension. It works with groups and slots.

## Data Representation

All interfaces (library, CLI, MCP) use a single canonical JSON representation. Backend serialization is an implementation detail.

### Node

The core data unit. Grounded in real conduct files.

```json
{
  "path": "capture-arrow-syntax/requirements",
  "metadata": {
    "type": "requirements",
    "last-modified": "2026-02-05",
    "status": "locked",
    "blocks": [
      "capture-arrow-syntax/specification"
    ]
  },
  "sections": [
    {
      "id": "overview",
      "type": "text",
      "content": "Replace the `:>` capture arrow token with `=>`..."
    },
    {
      "id": "context",
      "type": "text",
      "content": "The current `:>` capture arrow token lacks ligature support..."
    },
    {
      "id": "interface",
      "type": "text",
      "content": "### Lexer Token Contract\n\nThe lexer MUST emit tokens..."
    },
    {
      "id": "functional-requirements",
      "type": "collection",
      "content": {
        "items": [
          {
            "id": "FR-ARROW-1",
            "title": "Parse => Token",
            "body": "The lexer recognizes..."
          }
        ]
      }
    },
    {
      "id": "test-cases",
      "type": "text",
      "content": "### Valid Input Cases\n\n| Input | Expected |..."
    },
    {
      "id": "non-functional-requirements",
      "type": "collection",
      "content": {
        "items": [
          {
            "id": "NFR-ARROW-1",
            "title": "Documentation",
            "body": "..."
          }
        ]
      }
    }
  ]
}
```

### Plan Node (task-list sections)

Phases are dynamic sections — the schema declares a pattern, not fixed IDs. Each phase is a `task-list` section. Task items carry a `body` (task description, authored at plan creation) and `notes` (implementation observations, added during execution).

```json
{
  "path": "rill-check/plan",
  "metadata": {
    "type": "implementation-plan",
    "last-modified": "2026-01-25",
    "status": "closed",
    "blocked-by": ["rill-check/specification"],
    "specification": "Automated convention validator for rill code",
    "prerequisites": "None (new feature)",
    "coverage": "46/46 requirements (100%)",
    "implementation-started-at": "9c6f22a"
  },
  "sections": [
    {
      "id": "phase-1",
      "type": "task-list",
      "content": {
        "title": "Foundation and Core Types",
        "items": [
          {
            "id": "1.1",
            "title": "Create type definitions and error codes",
            "status": "done",
            "tags": ["node-engineer"],
            "refs": ["IC-5", "IC-12"],
            "body": "Spec Sections: Data Model, Error Code Extension\n\nInterface from spec:\n- `Diagnostic`: location, severity, code, message, context, fix\n- `Fix`: description, applicable, range, replacement\n\nFiles:\n- Create src/check/types.ts\n- Modify src/types.ts to add CHECK_* error codes",
            "notes": "1 review cycle. Clean implementation, no notes."
          },
          {
            "id": "1.2",
            "title": "Create ValidationRule interface and rule registry",
            "status": "done",
            "tags": ["node-engineer"],
            "refs": ["IR-6", "IC-7"],
            "body": "Spec Sections: ValidationRule Interface, Rule Implementation Summary\n\nInterface from spec:\n- `ValidationRule.code`: unique string\n- `ValidationRule.validate(node, context)`: returns Diagnostic[]",
            "notes": "2 review cycles. Added src/check/index.ts barrel export per review feedback."
          }
        ]
      }
    },
    {
      "id": "phase-2",
      "type": "task-list",
      "content": {
        "title": "CLI Entry Point and Diagnostics",
        "items": [
          {
            "id": "2.1",
            "title": "Create parseCheckArgs function",
            "status": "done",
            "tags": ["node-engineer"],
            "refs": ["IR-2", "EC-1", "EC-2", "IC-1"],
            "body": "Spec Sections: parseCheckArgs Interface, API Contract\n\nInterface from spec:\n- `parseCheckArgs(argv)`: returns ParsedCheckArgs union\n- Recognizes `--fix`, `--verbose`, `--format text|json`",
            "notes": "2 review cycles. Created comprehensive test suite with 21 tests."
          }
        ]
      }
    },
    {
      "id": "remediation-notes",
      "type": "task-list",
      "content": {
        "title": "Remediation Notes",
        "items": [
          {
            "id": "RI-1",
            "title": "CLI edge case - whitespace-only files exit 1 (expected 0)",
            "status": "pending",
            "tags": [],
            "refs": [],
            "body": "Root cause: Empty AST may trigger unexpected validation\nLocation: tests/cli/check.test.ts:729-734",
            "notes": null
          }
        ]
      }
    },
    {
      "id": "coverage-report",
      "type": "table",
      "content": {
        "columns": [
          { "id": "requirement", "type": "string" },
          { "id": "tasks", "type": "string" },
          { "id": "status", "type": "string" }
        ],
        "rows": [
          { "id": "r-1", "requirement": "IR-1", "tasks": "2.3", "status": "Covered" },
          { "id": "r-2", "requirement": "EC-1", "tasks": "2.1, 2.6", "status": "Covered (impl + test)" }
        ]
      }
    },
    {
      "id": "assumptions",
      "type": "text",
      "content": "- The 20 validation rules from 16_conventions.md are the complete set for AC-B6\n- Performance thresholds measured on standard development hardware"
    }
  ]
}
```

### Section Content by Type

**text** — Markdown prose. Subsections (`### `) are part of the content.

```json
{
  "id": "overview",
  "type": "text",
  "content": "Replace the `:>` capture arrow token with `=>`..."
}
```

**task-list** — Items with status, tags, references, body (task description), and notes (implementation observations).

```json
{
  "id": "phase-1",
  "type": "task-list",
  "content": {
    "title": "Foundation and Core Types",
    "items": [
      {
        "id": "1.1",
        "title": "Create type definitions and error codes",
        "status": "done",
        "tags": ["node-engineer"],
        "refs": ["IC-5", "IC-12"],
        "body": "Spec Sections: Data Model, Error Code Extension\n\nInterface from spec:\n- `Diagnostic`: location, severity, code, message\n\nFiles:\n- Create src/check/types.ts",
        "notes": "1 review cycle. Clean implementation."
      }
    ]
  }
}
```

**collection** — Items with ID, title, and markdown body. Each item maps to a `### ` sub-heading on disk (`### FR-ARROW-1: Parse => Token` followed by body prose).

```json
{
  "id": "functional-requirements",
  "type": "collection",
  "content": {
    "items": [
      {
        "id": "FR-ARROW-1",
        "title": "Parse => Token",
        "body": "The lexer recognizes the `=>` two-character sequence...\n\n**Acceptance Criteria:**\n\n- [ ] Lexer tokenizes =>"
      }
    ]
  }
}
```

**checklist** — Boolean items with labels.

```json
{
  "id": "acceptance-criteria",
  "type": "checklist",
  "content": {
    "items": [
      { "id": "ac-1", "label": "Login returns session token", "checked": false },
      { "id": "ac-2", "label": "Invalid password returns 401", "checked": true }
    ]
  }
}
```

**table** — Rows with typed columns.

```json
{
  "id": "api-endpoints",
  "type": "table",
  "content": {
    "columns": [
      { "id": "method", "type": "string" },
      { "id": "path", "type": "string" },
      { "id": "auth", "type": "boolean" }
    ],
    "rows": [
      { "id": "r-1", "method": "POST", "path": "/login", "auth": false },
      { "id": "r-2", "method": "GET", "path": "/profile", "auth": true }
    ]
  }
}
```

**key-value** — Typed pairs.

```json
{
  "id": "config",
  "type": "key-value",
  "content": {
    "pairs": [
      { "key": "max-retries", "value": 3, "type": "number" },
      { "key": "timeout-ms", "value": 5000, "type": "number" }
    ]
  }
}
```

**reference-list** — Typed links to other nodes.

```json
{
  "id": "dependencies",
  "type": "reference-list",
  "content": {
    "refs": [
      { "id": "ref-1", "target": "feature-x/requirements", "label": "Source requirement", "relation": "implements" }
    ]
  }
}
```

### Operation Return Values

All mutations return the affected object in its new state, including fresh tokens for chaining subsequent writes without re-reading. The library throws exceptions on failure (see Error Handling). CLI and MCP mediate: they catch exceptions and return `{ ok: false }` result objects so callers avoid try/catch.

**Library (success):**

```json
{
  "ok": true,
  "path": "capture-arrow-syntax/requirements/@meta/status",
  "value": "spec-ready",
  "previous": "draft",
  "token": "sc_t_node_8f2a..."
}
```

```json
{
  "ok": true,
  "path": "capture-arrow-syntax/plan/phase-1/1.2",
  "item": {
    "id": "1.2",
    "title": "Update TWO_CHAR_OPERATORS",
    "status": "done",
    "tags": ["NOD"],
    "refs": ["IR-1", "EC-1", "IC-2"],
    "notes": "Changed key from :> to =>."
  },
  "previous": { "status": "pending" },
  "token": "sc_t_sec_c4e1...",
  "nodeToken": "sc_t_node_9d3b..."
}
```

**CLI / MCP (failure — mediated from exception):**

```json
{
  "ok": false,
  "error": "VALIDATION_ERROR",
  "path": "capture-arrow-syntax/requirements/@meta/status",
  "message": "Value 'invalid' not in enum [draft, spec-ready, locked]",
  "schema": "requirements"
}
```

## Operation Reference

Three interfaces (library, CLI, MCP server) expose the same operations. `registerSchema` is library-only (configuration-time). All other operations are available across all three interfaces. Split into user operations (content interaction) and control plane operations (store and schema management).

### User Operations (26)

LLMs and consumers call these to read, write, and navigate content. Overloaded signatures (e.g., `list()` / `list(group)`) count as one operation.

**Navigation** (4)

| Operation | Purpose |
|-----------|---------|
| `list()` | List all groups the client has addresses for. Returns group IDs with schema type. |
| `list(group)` | List node slots in a group. Returns slot IDs with metadata summaries. |
| `exists(path)` | Check if a group, node slot, or section exists. |
| `get(path)` | Read full node: metadata + all sections. |

**Group Lifecycle** (4)

| Operation | Purpose |
|-----------|---------|
| `createGroup(id)` | Create a group. Materializes all node slots from the group schema with defaults. |
| `deleteGroup(id)` | Delete a group and all its node slots. |
| `describeGroup(schemaOrGroup)` | Annotated template for a group type (slots + their node schemas), or template + current slot states for an existing group. |
| `validateGroup(group)` | Validate all node slots in a group. Returns per-slot pass/fail. |

**Metadata** (4)

| Operation | Purpose |
|-----------|---------|
| `meta(path)` | Read all metadata fields. |
| `meta(path, field)` | Read a single metadata field. |
| `setMeta(path, field, value)` | Set a single metadata field. |
| `setMeta(path, { field: value })` | Set multiple metadata fields atomically. |

**Sections** (7)

| Operation | Purpose |
|-----------|---------|
| `sections(path)` | List section IDs and types (no content). |
| `section(path, section)` | Read section content. |
| `writeSection(path, section, content)` | Replace section content (text sections). |
| `appendSection(path, section, content)` | Append to a text section. |
| `addSection(path, { id, type, after? })` | Insert a new section (required for dynamic sections). |
| `removeSection(path, section)` | Remove a section. |
| `populate(path, { metadata?, sections? })` | Bulk write — metadata and/or multiple sections in one call. |

**Items** (4) — polymorphic, dispatches by section content type

| Operation | Purpose |
|-----------|---------|
| `item.get(path, section, item)` | Read a single item by ID. |
| `item.add(path, section, data)` | Add an item. Data shape validated against section type. |
| `item.update(path, section, item, fields)` | Update item fields. Valid fields depend on section type. |
| `item.remove(path, section, item)` | Remove an item by ID. |

**Describe & Validate** (2)

| Operation | Purpose |
|-----------|---------|
| `describe(schemaOrPath)` | Annotated template for a **node** schema, or template + current state for a single slot. LLM entry point before writing a slot. |
| `validate(path)` | Check a single **node slot** against its node schema. Returns granular pass/fail per check. |

`describe`/`validate` operate on individual slots. `describeGroup`/`validateGroup` (under Group Lifecycle) operate on the group and all its slots. `populate` enables single-call node creation — an LLM calls `describe`, builds the complete node, and hands it back via `populate`.

### Polymorphic Item Dispatch

`item.*` operations accept the same signature regardless of section type. Sidechain resolves the section's content type and validates accordingly. The LLM does not need to know which item API to call — it calls `item.add` and sidechain does the right thing.

| Section Type | `item.add` data | `item.update` fields | Item ID field |
|---|---|---|---|
| `task-list` | `{ id, title, status?, tags?, refs?, body? }` | `status, body, notes, tags, refs` | `id` |
| `collection` | `{ id, title, body }` | `title, body` | `id` |
| `checklist` | `{ id, label }` | `label, checked` | `id` |
| `table` | `{ id, ...column_values }` | column values | `id` |
| `key-value` | `{ key, value, type? }` | `value` | `key` |
| `reference-list` | `{ target, relation, label? }` | `label, relation` | auto-generated |

`text` sections have no items — use `writeSection` / `appendSection` directly.

Checklist example: `item.update(path, section, 'ac-1', { checked: true })` replaces a dedicated `checklist.check` operation. The polymorphic API reduces 21 type-specific operations to 4.

### Control Plane Operations (6)

Store configuration and schema management. Typically called at setup, not during content work.

| Operation | Purpose |
|-----------|---------|
| `mounts()` | List configured mounts and their filesystem paths. |
| `listSchemas()` | List registered schema IDs. |
| `getSchema(schema)` | Read full schema definition. |
| `registerSchema(schema)` | Register a new schema (library/config only). |
| `info()` | Store summary: mounts, schemas, content type registry. |
| `listContentTypes()` | List registered content types and their operations. |

## Library API

The primary interface. CLI and MCP server wrap this.

### Opening a Store

```typescript
import { Sidechain } from 'sidechain';

const store = await Sidechain.open({
  mounts: {
    initiatives: { path: 'conduct/initiatives', groupSchema: 'initiative' },
    archive:     { path: 'conduct/archive', groupSchema: 'archived-initiative' },
    notes:       { path: 'conduct/notes', groupSchema: 'notebook' },
  },
  groupSchemas: {
    'initiative':          initiativeGroupSchema,
    'archived-initiative': archivedGroupSchema,
    'notebook':            notebookGroupSchema,
  },
  nodeSchemas: {
    'requirements':        requirementsSchema,
    'specification':       specificationSchema,
    'implementation-plan': planSchema,
    'feedback':            feedbackSchema,
  },
});
```

### Navigation

```typescript
// List all groups the client has addresses for
await store.list();
// → [{ id: 'capture-arrow-syntax', schema: 'initiative' },
//    { id: 'claude-code-extension', schema: 'initiative' }]

// List node slots in a group (returns metadata summary per slot)
await store.list('capture-arrow-syntax');
// → [{ id: 'requirements', schema: 'requirements', status: 'locked', empty: false },
//    { id: 'specification', schema: 'specification', status: 'locked', empty: false },
//    { id: 'plan', schema: 'implementation-plan', status: 'closed', empty: false },
//    { id: 'feedback', schema: 'feedback', status: 'active', empty: false }]

await store.list('claude-code-extension');
// → [{ id: 'requirements', schema: 'requirements', status: 'locked', empty: false },
//    { id: 'specification', schema: 'specification', status: 'draft', empty: false },
//    { id: 'plan', schema: 'implementation-plan', status: 'draft', empty: true },    ← slot exists, not yet populated
//    { id: 'feedback', schema: 'feedback', status: 'draft', empty: true }]

// List mounts
await store.mounts();
// → [{ id: 'initiatives', path: 'conduct/initiatives', groupSchema: 'initiative' },
//    { id: 'archive', path: 'conduct/archive', groupSchema: 'archived-initiative' }, ...]
```

`list(group)` returns metadata summaries for every slot. The `empty` flag indicates whether the slot has content beyond defaults. Enables cheap enumeration without parsing full files.

### Group Lifecycle

```typescript
// Create a group — materializes all node slots with default metadata
await store.createGroup('user-auth');
// Creates: conduct/initiatives/user-auth/
//   requirements.md  — frontmatter with defaults, empty required sections
//   specification.md  — frontmatter with defaults, empty required sections
//   plan.md           — frontmatter with defaults, empty required sections
//   feedback.md       — frontmatter with defaults, empty required sections
// → { ok: true, group: 'user-auth', slots: ['requirements','specification','plan','feedback'] }

// Delete a group and all its slots
await store.deleteGroup('old-feature');
// → { ok: true }

// Describe a group schema — what slots exist, what each needs
await store.describeGroup('initiative');
// → {
//   schema: 'initiative',
//   description: 'A conduct initiative. Contains requirements, specification, plan, and feedback.',
//   slots: [
//     { id: 'requirements', schema: 'requirements', description: 'User needs and acceptance criteria.' },
//     { id: 'specification', schema: 'specification', description: 'Technical design: architecture, data model, interfaces.' },
//     { id: 'plan', schema: 'implementation-plan', description: 'Phased task list with coverage tracking.' },
//     { id: 'feedback', schema: 'feedback', description: 'Post-implementation retrospective and backlog.' },
//   ],
// }

// Describe an existing group — schema + current state of each slot
await store.describeGroup('user-auth');
// → { ...schemaInfo,
//   current: {
//     slots: [
//       { id: 'requirements', status: 'draft', empty: true, sections: [{ id: 'overview', present: false }, ...] },
//       { id: 'specification', status: 'draft', empty: true, sections: [...] },
//       { id: 'plan', status: 'draft', empty: true, sections: [...] },
//       { id: 'feedback', status: 'draft', empty: true, sections: [...] },
//     ],
//   },
// }

// Validate all slots in a group
await store.validateGroup('user-auth');
// → {
//   valid: false,
//   group: 'user-auth',
//   slots: {
//     requirements: { valid: false, errors: [{ check: 'required-section', section: 'overview', passed: false }] },
//     specification: { valid: false, errors: [...] },
//     plan: { valid: false, errors: [...] },
//     feedback: { valid: false, errors: [...] },
//   },
// }

// Check existence
await store.exists('user-auth');                    // → true (group)
await store.exists('user-auth/requirements');        // → true (slot)
await store.exists('nonexistent');                   // → false
```

### Node (Slot) Operations

Nodes are slots within a group. They exist from group creation. Operations read and populate them.

```typescript
// Read full node (slot)
const node = await store.get('capture-arrow-syntax/requirements');
// → { path, metadata, sections, empty: false }

// Read an empty slot — exists but has no content
const empty = await store.get('claude-code-extension/plan');
// → { path: 'claude-code-extension/plan',
//   metadata: { type: 'implementation-plan', status: 'draft', 'last-modified': '2026-02-05' },
//   sections: [],    ← schema-defined sections not yet written
//   empty: true }
```

### Metadata

```typescript
// Read all metadata
await store.meta('capture-arrow-syntax/requirements');
// → { type: 'requirements', status: 'locked', 'last-modified': '2026-02-05', blocks: [...] }

// Read single field
await store.meta('capture-arrow-syntax/requirements', 'status');
// → 'locked'

// Set single field
await store.setMeta('capture-arrow-syntax/requirements', 'status', 'spec-ready');
// → { ok: true, path: '.../@meta/status', value: 'spec-ready', previous: 'draft' }

// Set multiple fields atomically
await store.setMeta('capture-arrow-syntax/requirements', {
  status: 'spec-ready',
  'last-modified': '2026-02-05',
});
// → { ok: true, path: '.../@meta', fields: { status: 'spec-ready', ... } }
```

### Sections

```typescript
// List sections (IDs and types, no content)
await store.sections('capture-arrow-syntax/requirements');
// → [{ id: 'overview', type: 'text' },
//    { id: 'context', type: 'text' },
//    { id: 'interface', type: 'text' },
//    { id: 'functional-requirements', type: 'collection' }, ...]

// Read section content
await store.section('capture-arrow-syntax/requirements', 'overview');
// → { id: 'overview', type: 'text', content: 'Replace the `:>` capture arrow...' }

// Write section content (full replace)
await store.writeSection('capture-arrow-syntax/requirements', 'overview', 'New content here.');
// → { ok: true, ... }

// Append to text section
await store.appendSection('capture-arrow-syntax/requirements', 'notes', '\nAdditional note.');
// → { ok: true, ... }

// Add new section
await store.addSection('capture-arrow-syntax/requirements', {
  id: 'implementation-notes',
  type: 'text',
  after: 'functional-requirements',  // insertion point (optional, default: end)
});
// → { ok: true, ... }

// Remove section
await store.removeSection('capture-arrow-syntax/requirements', 'notes');
// → { ok: true, ... }
```

### Item Operations

Polymorphic — same API regardless of section type. Sidechain dispatches by content type.

```typescript
// --- task-list section ---
await store.item.add('feature/plan', 'phase-1', {
  id: '1.5',
  title: 'Add integration tests',
  status: 'pending',
  tags: ['NOD'],
  refs: ['AC-3'],
  body: 'Spec Sections: Acceptance Criteria\n\nFiles:\n- Create tests/integration/',
});

await store.item.update('feature/plan', 'phase-1', '1.2', {
  status: 'done',
  notes: 'Completed with 3 test files.',
});

await store.item.get('feature/plan', 'phase-1', '1.2');
// → { id: '1.2', title: '...', status: 'done', body: '...', notes: '...', ... }

await store.item.remove('feature/plan', 'phase-1', '1.5');

// --- collection section ---
await store.item.add('feature/requirements', 'functional-requirements', {
  id: 'FR-AUTH-002',
  title: 'Session Expiry',
  body: 'Sessions expire after 24 hours of inactivity.\n\n**Acceptance Criteria:**\n\n- [ ] Expired sessions return 401',
});

await store.item.update('feature/requirements', 'functional-requirements', 'FR-AUTH-002', {
  body: 'Sessions expire after 12 hours of inactivity.',
});

// --- checklist section ---
await store.item.update('feature/spec', 'acceptance-criteria', 'ac-1', { checked: true });
// equivalent to the old checklist.check — just a field update

await store.item.add('feature/spec', 'acceptance-criteria', {
  id: 'ac-4',
  label: 'Rate limiting enforced',
});

// --- table section ---
await store.item.add('feature/spec', 'api-endpoints', {
  id: 'r-3', method: 'DELETE', path: '/session', auth: true,
});

// --- reference-list section ---
await store.item.add('feature/spec', 'dependencies', {
  target: 'feature/requirements',
  label: 'Source requirement',
  relation: 'implements',
});
```

### Populate (Bulk Write)

Write an entire node — metadata and sections — in one call. An LLM calls `describe` to learn the schema, builds the full content, and hands it back via `populate`.

```typescript
await store.populate('user-auth/requirements', {
  metadata: {
    'last-modified': '2026-02-05',
    blocks: ['user-auth/specification'],
  },
  sections: [
    { id: 'overview', content: 'User authentication via email and password.' },
    {
      id: 'functional-requirements',
      content: {
        items: [
          { id: 'FR-AUTH-001', title: 'Email/Password Login', body: 'The system authenticates...' },
          { id: 'FR-AUTH-002', title: 'Session Expiry', body: 'Sessions expire after 24 hours...' },
        ],
      },
    },
    { id: 'out-of-scope', content: '- OAuth/SSO integration (phase 2)' },
  ],
});
// → { ok: true, path: 'user-auth/requirements', sections: 3, metadata: 2 }
```

`populate` merges — specified fields overwrite, unspecified fields and sections are untouched. Validates the complete result against the schema before committing.

### Describe and Validate

```typescript
// Describe a schema — returns annotated template for LLMs
await store.describe('requirements');
// → {
//   schema: 'requirements',
//   description: 'Captures user needs and acceptance criteria for a feature or change.',
//   metadata: {
//     type:          { type: 'string',   required: true,  description: 'Document type identifier...' },
//     'last-modified': { type: 'date',   required: true,  description: 'ISO 8601 date of last content change.' },
//     status:        { type: 'enum',     required: true,  values: ['draft','spec-ready','locked'], default: 'draft',
//                      description: "'draft' = in progress, 'spec-ready' = passed review, 'locked' = specification created." },
//     blocks:        { type: 'string[]', required: false, description: 'Sidechain paths to nodes that cannot proceed...' },
//     'blocked-by':  { type: 'string[]', required: false, description: 'Sidechain paths to nodes that must reach a target status...' },
//   },
//   sections: [
//     { id: 'overview', type: 'text', required: true, description: '1-3 sentence summary of what is being required and why.' },
//     { id: 'functional-requirements', type: 'collection', required: true, description: 'FR-* entries...' },
//     { id: 'context', type: 'text', required: false, description: 'Background information: current system state...' },
//     { id: 'interface', type: 'text', required: false, description: 'External-facing contracts: function signatures...' },
//     // ...
//   ],
// }

// Describe a specific node — schema + current state
await store.describe('capture-arrow-syntax/requirements');
// → same as above, plus:
//   { ...schemaInfo,
//     current: {
//       metadata: { type: 'requirements', status: 'locked', ... },
//       sections: [
//         { id: 'overview', type: 'text', present: true },
//         { id: 'functional-requirements', type: 'collection', present: true },
//         { id: 'context', type: 'text', present: true },
//         { id: 'interface', type: 'text', present: true },
//         { id: 'validation-criteria', type: 'text', present: false },  // optional, not yet written
//       ],
//     },
//   }

// Validate a node against its schema
await store.validate('capture-arrow-syntax/requirements');
// → {
//   valid: true,
//   schema: 'requirements',
//   path: 'capture-arrow-syntax/requirements',
//   checks: [
//     { check: 'required-meta', field: 'type', passed: true },
//     { check: 'required-meta', field: 'status', passed: true },
//     { check: 'meta-type', field: 'status', passed: true, expected: 'enum', actual: 'locked' },
//     { check: 'required-section', section: 'overview', passed: true },
//     { check: 'required-section', section: 'functional-requirements', passed: true },
//   ],
// }

// Validation failure example
await store.validate('new-feature/requirements');
// → {
//   valid: false,
//   schema: 'requirements',
//   path: 'new-feature/requirements',
//   errors: [
//     { check: 'required-section', section: 'functional-requirements', passed: false,
//       message: 'Required section "functional-requirements" is missing.' },
//     { check: 'meta-type', field: 'status', passed: false,
//       message: "Value 'pending' not in enum [draft, spec-ready, locked]." },
//   ],
//   checks: [ ... ],  // all checks including passed ones
// }

// Validate a schemaless node — only structural checks (frontmatter parseable, sections well-formed)
await store.validate('monorepo-migration/notes');
// → { valid: true, schema: null, checks: [...structural checks...] }

// Describe a plan schema — shows dynamic section declarations
await store.describe('implementation-plan');
// → {
//   schema: 'implementation-plan',
//   description: 'Phased task list with coverage tracking.',
//   metadata: { ... },
//   sections: [
//     { id: 'remediation-notes', type: 'task-list', required: false, description: 'Issues found during verification.' },
//     { id: 'coverage-report', type: 'table', required: false, description: 'Requirement-to-task traceability matrix.' },
//     { id: 'assumptions', type: 'text', required: false, description: 'Implementation assumptions.' },
//   ],
//   dynamic: [
//     { pattern: 'phase-{n}', type: 'task-list', min: 1, description: 'Implementation phase. Created via addSection.' },
//   ],
// }

// Describe an existing plan — schema + current state including dynamic sections
await store.describe('rill-check/plan');
// → { ...schemaInfo,
//   current: {
//     metadata: { type: 'implementation-plan', status: 'closed', coverage: '46/46 requirements (100%)', ... },
//     sections: [
//       { id: 'phase-1', type: 'task-list', present: true, dynamic: 'phase-{n}' },
//       { id: 'phase-2', type: 'task-list', present: true, dynamic: 'phase-{n}' },
//       { id: 'phase-3', type: 'task-list', present: true, dynamic: 'phase-{n}' },
//       { id: 'phase-4', type: 'task-list', present: true, dynamic: 'phase-{n}' },
//       { id: 'remediation-notes', type: 'task-list', present: true },
//       { id: 'coverage-report', type: 'table', present: true },
//       { id: 'assumptions', type: 'text', present: true },
//       { id: 'missing-requirements', type: 'text', present: false },
//     ],
//   },
// }

// Validate a plan — includes dynamic section min count check
await store.validate('rill-check/plan');
// → {
//   valid: true,
//   schema: 'implementation-plan',
//   checks: [
//     { check: 'required-meta', field: 'type', passed: true },
//     { check: 'dynamic-min', pattern: 'phase-{n}', min: 1, actual: 4, passed: true },
//     { check: 'dynamic-type', section: 'phase-1', expected: 'task-list', passed: true },
//     { check: 'dynamic-type', section: 'phase-2', expected: 'task-list', passed: true },
//     // ...
//   ],
// }
```

`describe` is the LLM's entry point. Before creating a node, the LLM calls `describe('requirements')` to learn what metadata and sections to include. Before editing a node, it calls `describe('feature/requirements')` to see the schema alongside current state — which sections exist and which are still missing.

### Error Handling

The library throws typed exceptions. CLI and MCP catch these and return `{ ok: false, error, path, message }` result objects (see Operation Return Values).

```typescript
try {
  await store.setMeta('feature/requirements', 'status', 'invalid');
} catch (e) {
  // e.code === 'VALIDATION_ERROR'
  // e.path === 'feature/requirements/@meta/status'
  // e.message === "Value 'invalid' not in enum [draft, spec-ready, locked]"
  // e.schema === 'requirements'
}

try {
  await store.get('nonexistent/requirements');
} catch (e) {
  // e.code === 'NOT_FOUND'
  // e.path === 'nonexistent/requirements'
}

try {
  await store.section('feature/requirements', 'nonexistent');
} catch (e) {
  // e.code === 'SECTION_NOT_FOUND'
  // e.path === 'feature/requirements/nonexistent'
}
```

## CLI

Wraps the library. All commands output JSON to stdout.

```
# Navigation
sidechain list [group]                                  # no arg = list groups, with arg = list slots
sidechain get <path>
sidechain exists <path>

# Group lifecycle
sidechain create-group <id>
sidechain delete-group <id>
sidechain describe-group <schema-or-group>
sidechain validate-group <group>

# Metadata
sidechain meta <path> [field]
sidechain set-meta <path> <field> <value>
sidechain set-meta <path> --fields '{"field": "value", ...}'   # batch

# Sections
sidechain sections <path>
sidechain section <path> <section-id>
sidechain write-section <path> <section-id> --content <text>
sidechain write-section <path> <section-id> --file <file>    # read content from file
sidechain append-section <path> <section-id> --content <text>
sidechain add-section <path> --id <id> --type <type> [--after <id>]
sidechain remove-section <path> <section-id>

# Items (polymorphic — dispatches by section type)
sidechain item get <path> <section> <item-id>
sidechain item add <path> <section> --data '{...}'
sidechain item update <path> <section> <item-id> --data '{...}'
sidechain item remove <path> <section> <item-id>

# Bulk write
sidechain populate <path> --data '{...}'                # metadata + sections
sidechain populate <path> --file <file>                 # read JSON from file

# Describe and validate
sidechain describe <schema-id>                      # annotated template for a type
sidechain describe <path>                           # template + current state for a node
sidechain validate <path>                           # check node against its schema

# Schema
sidechain list-schemas
sidechain get-schema <schema-id>

# Store info
sidechain mounts
sidechain info
sidechain list-content-types
```

Configuration loaded from `sidechain.json` in cwd, or `--config <path>`.

## MCP Server

Same operations as CLI, exposed as MCP tools. Each command maps to a tool. Failures return `{ ok: false, error, message }` result objects (mediated from library exceptions).

```
sidechain_list        { group? }
sidechain_get         { path }
sidechain_exists      { path }
sidechain_create_group    { id }
sidechain_delete_group    { id }
sidechain_describe_group  { schema } | { group }
sidechain_validate_group  { group }
sidechain_meta        { path, field? }
sidechain_set_meta    { path, field, value } | { path, fields }
sidechain_sections    { path }
sidechain_section     { path, section }
sidechain_write_section   { path, section, content }
sidechain_append_section  { path, section, content }
sidechain_add_section     { path, id, type, after? }
sidechain_remove_section  { path, section }
sidechain_item_get    { path, section, item }
sidechain_item_add    { path, section, data }
sidechain_item_update { path, section, item, data }
sidechain_item_remove { path, section, item }
sidechain_populate    { path, metadata?, sections? }
sidechain_describe      { schema } | { path }
sidechain_validate      { path }
sidechain_list_schemas  {}
sidechain_get_schema    { schema }
sidechain_mounts        {}
sidechain_info          {}
sidechain_list_content_types {}
```

All tools return the same JSON structure as the CLI. Success returns match the library; failures are mediated to `{ ok: false }` result objects.

## Schema System

Schemas define what a node looks like. Consumer-authored, sidechain-enforced. Schema resolution uses the metadata field declared in `schemaField` config (default: `"type"`).

Every schema element carries a natural language `description` field. These descriptions are the primary interface between sidechain and LLMs — they explain what each field and section is for, what content belongs there, and how it should be structured. LLMs call `describe` to get a full annotated template before creating or editing a node.

```json
{
  "schema-id": "article",
  "description": "A content article with metadata and structured sections.",
  "metadata": {
    "fields": {
      "type":          { "type": "string",   "required": true,  "description": "Document type identifier. Must match a registered schema ID." },
      "last-modified": { "type": "date",     "required": true,  "description": "ISO 8601 date of last content change." },
      "status":        { "type": "enum",     "values": ["draft", "published", "archived"], "required": true, "default": "draft",
                         "description": "Lifecycle state." },
      "author":        { "type": "string",   "required": false, "description": "Author name." },
      "tags":          { "type": "string[]", "required": false, "description": "Content tags for categorization." }
    }
  },
  "sections": {
    "required": [
      { "id": "summary", "type": "text", "description": "1-2 sentence article summary." },
      { "id": "body", "type": "text", "description": "Main article content in markdown." }
    ],
    "optional": [
      { "id": "comments", "type": "collection", "description": "Reader comments. Each item: id, title (commenter), body (comment text)." },
      { "id": "related", "type": "reference-list", "description": "Links to related articles." }
    ]
  }
}
```

For conduct's full node schemas (requirements, specification, implementation-plan, feedback), see [SIDECHAIN-CONDUCT.md](SIDECHAIN-CONDUCT.md).

### Dynamic Sections

Schemas can declare sections with variable count using the `dynamic` key. This handles nodes where the number of sections is unknown at schema time — plan phases, versioned changelogs, or any repeating section pattern.

```json
{
  "schema-id": "changelog",
  "description": "Release changelog with version entries.",
  "metadata": {
    "fields": {
      "type":          { "type": "string", "required": true,  "description": "Document type identifier." },
      "last-modified": { "type": "date",   "required": true,  "description": "ISO 8601 date of last content change." }
    }
  },
  "sections": {
    "required": [],
    "optional": [
      { "id": "unreleased", "type": "text", "description": "Changes not yet released." }
    ],
    "dynamic": [
      {
        "id-pattern": "version-{n}",
        "type": "text",
        "min": 0,
        "description": "Release entry. Created via addSection when a version ships."
      }
    ]
  }
}
```

Conduct's implementation-plan schema uses dynamic sections for phases (`phase-{n}` pattern with `task-list` type, `min: 1`). See [SIDECHAIN-CONDUCT.md](SIDECHAIN-CONDUCT.md) for the full schema.

**`dynamic` declaration fields:**

| Field | Purpose |
|-------|---------|
| `id-pattern` | Pattern with typed placeholders for matching section IDs. |
| `type` | Required content type for matching sections. |
| `min` | Minimum count. `validate()` checks at least this many matching sections exist. Default: 0. |
| `description` | Natural language description surfaced by `describe()`. |

**Pattern grammar:**

Patterns use typed placeholders that constrain `addSection` IDs:

| Placeholder | Matches | Regex | Example |
|---|---|---|---|
| `{n}` | One or more digits | `[0-9]+` | `phase-1`, `phase-12` |
| `{name}` | Word characters | `[a-z0-9][a-z0-9-]*` | `domain-auth`, `domain-billing` |

`addSection` rejects IDs that don't match any static (required/optional) or dynamic pattern. Creating `phase-banana` against `phase-{n}` fails with `VALIDATION_ERROR`. This is a constraint, not just matching — patterns govern what IDs are legal.

**Schema enforcement for dynamic sections:**
- `addSection()` validates the ID against declared patterns and rejects non-matching IDs
- `addSection()` with a matching ID inherits the declared type if not explicitly provided
- `validate()` checks that at least `min` sections matching the pattern exist
- `validate()` checks that matching sections have the declared content type
- `describe()` includes dynamic declarations so LLMs know they can create matching sections

### Metadata Field Types

| Type | JSON Value | Validation |
|------|-----------|------------|
| `string` | `"text"` | Non-empty if required |
| `number` | `42` | Numeric value |
| `boolean` | `true` | Boolean value |
| `enum` | `"must"` | Value in declared `values` list |
| `string[]` | `["a","b"]` | Array of strings |
| `date` | `"2026-02-05"` | ISO 8601 date |
| `ref` | `"x/spec"` | Valid sidechain path |

### Schema Enforcement Rules

Sidechain enforces on every write:

1. Required metadata fields present and non-null
2. Field values match declared type
3. Enum values within declared set
4. Required sections exist on node
5. Dynamic sections meet minimum count
6. Section types match declaration (required, optional, and dynamic)
7. Content shape matches content type schema

Sidechain does **not** enforce: transition rules between values, cross-node constraints, business logic of any kind.

### Schema Versioning

Schemas carry an optional `version` field. Sidechain uses it for drift detection, not automated migration.

```json
{
  "schema-id": "requirements",
  "version": "2",
  "description": "...",
  "metadata": { "fields": { ... } },
  "sections": { ... }
}
```

**How it works:**

1. When `createGroup` materializes a slot, sidechain stamps the node's metadata with `schema-version` matching the registered schema's `version`.
2. `validate()` reports a `schema-drift` warning when a node's `schema-version` doesn't match the current schema version — the node was created against an older schema.
3. Sidechain does not automate migration. Consumers detect drift via `validate()` and handle evolution themselves.

This gives consumers a signal to act on without baking migration logic into sidechain. A consumer with 50 groups on schema v1 can register v2, detect all v1 nodes via the drift warning, and migrate at their own pace.

### Schema Generation (LLM-Driven)

Sidechain does not infer section types from content. Building pattern-matching heuristics into the parser (detecting `- [ ]` as checklist, pipe tables as table type) creates a fragile, hard-to-debug layer that breaks on ambiguous content. Instead, the LLM generates schemas.

**The flow for importing unschemaed content:**

```
1. User drops markdown files into a mount directory
2. Sidechain reads them as schemaless nodes (text sections, structural checks only)
3. LLM calls get() on the node — sees raw section content
4. LLM understands the content semantics (this section is a checklist, that one is a table)
5. LLM calls registerSchema() with the correct type mappings
6. Sidechain validates the existing content against the new schema
```

The LLM is better at this than any heuristic parser. It handles edge cases (a bulleted list that looks like a checklist but isn't), understands context (this table tracks API endpoints vs. this table is a comparison matrix), and produces schemas with meaningful descriptions.

**`describe` on a schemaless node** returns structural information without type assignments:

```json
{
  "path": "imported-doc/notes",
  "schema": null,
  "metadata": { "raw": { "title": "Migration Notes", "date": "2026-01-15" } },
  "sections": [
    { "id": "overview", "type": "text", "inferred": false },
    { "id": "tasks", "type": "text", "inferred": false },
    { "id": "references", "type": "text", "inferred": false }
  ]
}
```

Every section reads as `text` until a schema assigns specific types. The LLM reads the content, decides `tasks` is a `task-list` and `references` is a `reference-list`, and generates a schema. Once registered, sidechain enforces the types on all future writes.

This keeps sidechain's parser deterministic — it splits on `## ` headings and parses frontmatter. All semantic understanding lives in the LLM layer where it belongs.

## Content Type System

Sections have types. Types define structure. All item types share the same polymorphic API (`item.get/add/update/remove`); sidechain dispatches by type.

| Type | Structure | Section ops | Item ops |
|------|-----------|-------------|----------|
| `text` | Markdown prose | write, append | — (no items) |
| `task-list` | Items with status, tags, refs, body, notes | read | get, add, update, remove |
| `collection` | Items with ID, title, and markdown body | read | get, add, update, remove |
| `checklist` | Boolean items with labels | read | get, add, update, remove |
| `table` | Rows with typed columns | read | get, add, update, remove |
| `key-value` | Typed pairs | read | get, add, update, remove |
| `reference-list` | Typed links to other nodes | read | get, add, update, remove |

### Extensibility

Consumers register custom content types with:
1. A **type schema** — the JSON shape of `content`
2. A **serializer** — per-backend persistence logic (markdown ↔ JSON)
3. **Operations** — named mutations with input/output contracts

## Storage Backends

Default: filesystem with markdown + YAML frontmatter. Backend is invisible to the consumer.

| Backend | Characteristics |
|---------|-----------------|
| Filesystem | Git-friendly, human-readable, zero dependencies |
| SQLite | Single-file, queryable, good for standalone agents |
| Remote API | Multi-user, hosted, webhook-capable |
| In-memory | Testing, ephemeral sessions |

### Backend Contract

Every backend implements:

```typescript
interface Backend {
  // Group operations — resolvedPath is the physical location (from address resolution)
  createGroup(resolvedPath: string, slots: SlotDef[]): Promise<void>;
  deleteGroup(resolvedPath: string): Promise<void>;
  listGroups(mountPath: string): Promise<GroupEntry[]>;

  // Node operations — within a resolved group path
  readNode(resolvedPath: string, slot: string): Promise<RawNode>;
  writeNode(resolvedPath: string, slot: string, data: RawNode): Promise<void>;
  exists(resolvedPath: string, slot?: string): Promise<boolean>;
}
```

The store resolves addresses to physical paths before calling the backend. Schema validation and content type operations run in the core layer above the backend. Backends handle raw persistence only.

### Filesystem Backend

The default backend. Files look like what a human would write by hand.

**Parsing rules** (normalizations we require):

| Element | Convention | Rationale |
|---------|-----------|-----------|
| Metadata | YAML frontmatter (`---` delimited) | Already standard in conduct |
| Sections | `## ` (h2) headings | Consistent delimiter for parser |
| Subsections | `### ` within a section | Part of section content, not split further |
| Checklists | `- [ ]` / `- [x]` markdown | Native GitHub-flavored markdown |
| Task lists | `[x] **1.1** \`[TAG]\` Title` + indented body + `> Notes:` | Conduct's existing format, normalized |
| Tables | Markdown pipe tables | Standard, git-diffable |

**What the filesystem backend does:**
- Parses frontmatter → metadata object
- Splits on `## ` headings → section list
- Detects content type per section from schema (or infers from content patterns)
- Serializes JSON mutations back to markdown

**What it does not do:**
- Create hidden metadata files
- Require any sidechain-specific directory structure
- Produce files that look wrong without sidechain

## Relationship to Rill

[Rill](https://github.com/rcrsr/rill) is a pipe-based scripting language for composing CLI operations. Sidechain provides atomic CRUD operations. Rill provides the composition, filtering, and transformation layer on top.

### Division of Responsibility

| Concern | Sidechain | Rill |
|---------|-----------|------|
| Read a node | `get` returns JSON | Receives structured data |
| Filter nodes | Returns full list | `where`, `select`, `each` filter/transform |
| Cross-node queries | Not built in | Pipes `list` through filters |
| Batch operations | Single-item mutations | `each` loops over mutations |
| Aggregation | Not built in | `count`, `group-by`, `reduce` |
| Conditional logic | Not built in | `if`, `match`, pipe branching |

### Examples

Query all draft requirements across groups:

```
sidechain list
  | each { sidechain list $it }
  | flatten
  | where { $it.schema == "requirements" && $it.status == "draft" }
  | select name, status
```

Bulk-transition plan-ready specs to locked:

```
sidechain list
  | each { sidechain list $it }
  | flatten
  | where { $it.schema == "specification" && $it.status == "plan-ready" }
  | each { sidechain set-meta $it.group/$it.id status locked }
```

Summarize task completion across plan phases:

```
sidechain list
  | each { sidechain get $it/plan }
  | where { !$it.empty }
  | each { $it.sections | where { $it.type == "task-list" } }
  | flatten
  | each { $it.content.items }
  | flatten
  | group-by status
  | each { [$it.key, ($it.value | count)] }
```

### Why This Matters

Sidechain stays simple: store, validate, serve. No query language, no aggregation engine, no batch API. Rill handles all composition. This keeps sidechain's surface area small while giving consumers full expressiveness through the scripting layer.

Consumers without rill still get full functionality through individual CLI/library/MCP calls. Rill is the power-user layer, not a dependency.

## Consumer Integration

Conduct is sidechain's first consumer. Conduct keeps workflow definitions, agent orchestration, policy enforcement, skill logic, and state machine rules. Sidechain handles storage, schema validation, content operations, and addressing. See [SIDECHAIN-CONDUCT.md](SIDECHAIN-CONDUCT.md) for the complete mapping: document schemas, operation replacements, and workflow enforcement notes.

### Integration Gaps (from Conduct Dry Run)

1. **Section ID convention** — Heading `## Functional Requirements` maps to ID `functional-requirements`. The slug algorithm (lowercase, spaces to hyphens, strip special chars) must be deterministic and documented.

2. **Empty slot representation on disk** — When `createGroup` materializes an empty slot, what does the file contain? Proposed: frontmatter with defaults + empty `## ` headings for required sections.

3. **Forward references** — `blocks: ['user-auth/specification']` references a slot that exists but is empty. Sidechain must not validate path existence for `string[]` fields. Only `ref` type fields could optionally check existence.

4. **Idempotent group creation** — `createGroup` on an existing group is a no-op (returns the existing group), not an error. Enables safe "ensure group exists" patterns.

5. **Internal content structure** — `collection` validates item structure (id, title, body). Content conventions within item bodies (naming patterns, acceptance criteria format) remain in the consumer's review layer.

6. **Section write order** — Agents can write sections in any order. Schema declares order for serialization only, not for write enforcement.

## Group Addressing

Groups are accessed by cryptographically secure addresses, not enumerable names. Possession of an address grants access to that group. This is capability-based security — the address IS the authorization.

### Two Layers

| Layer | Purpose | Scope |
|-------|---------|-------|
| **Authentication** | Proves identity to sidechain. Grants global permissions (create group, list own groups). | Per-app or per-user. |
| **Group address** | Grants access to a specific group and its slots. | Per-group. Capability token. |

Authentication controls *who can talk to sidechain*. Group addresses control *what content they can reach*. An authenticated session with no group addresses can create new groups but cannot see existing ones.

### Architecture: Client ↔ Store

Two distinct layers. The client faces the LLM. The store faces the backend.

```
LLM                    Client                          Store
 │                      │                               │
 ├─ describe('user-auth/requirements')                  │
 │                      ├─ resolve 'user-auth'          │
 │                      │  → sc_g_7f3a9c2e...b41d      │
 │                      ├─ get(address, 'requirements') │
 │                      │                               ├─ validate address
 │                      │                               ├─ read node
 │                      │                               ├─ return data
 │                      ├─ return data to LLM           │
 │                      │                               │
```

| Layer | Responsibility | Speaks |
|-------|---------------|--------|
| **Client** | Name resolution, address storage, session config. Presents friendly-name API. | Friendly names in, addresses out. |
| **Store** | Content operations, schema validation, backend dispatch. Never sees friendly names. | Addresses only. |

The client maintains a local mapping of friendly names to addresses:

```json
{
  "groups": {
    "user-auth": { "address": "sc_g_7f3a9c2e...b41d", "created": "2026-02-05" },
    "capture-arrow-syntax": { "address": "sc_g_e8d1f04a...9c2e", "created": "2026-02-05" }
  }
}
```

### How It Works

```
1. Client authenticates with store → session with global permissions
2. LLM calls createGroup('user-auth')
3. Client sends createGroup to store → store returns address sc_g_7f3a9c2e...b41d
4. Client saves 'user-auth' → sc_g_7f3a9c2e...b41d in local mapping
5. LLM calls describe('user-auth/requirements')
6. Client resolves 'user-auth' → address, calls store.describe(address, 'requirements')
7. Store validates address, returns schema + content
8. Client returns result to LLM
```

For conduct: the mapping file lives in `.claude/` or the project config. The LLM says `user-auth/requirements`, the client resolves to address, the store serves the content. The LLM never sees addresses.

### Properties

- **No enumeration.** `list()` returns groups the client has addresses for, not all groups on the server. The server never exposes a global group list.
- **Shareable.** A group address can be given to another client/session to grant access. The address is the capability.
- **Revocable.** The server can invalidate an address. The client's friendly name mapping becomes stale.
- **Backend-agnostic.** Filesystem backend maps addresses to directories. SQLite maps to row IDs. Remote API maps to server-side tokens.

### Filesystem Backend

For local use (conduct), the address maps directly to a directory path. The mapping file is the source of truth. No server needed — the filesystem backend resolves addresses to paths locally.

```
Address: sc_g_7f3a9c2e...b41d → conduct/initiatives/user-auth/
Address: sc_g_e8d1f04a...9c2e → conduct/initiatives/capture-arrow-syntax/
```

The address adds a layer of indirection. The directory can be renamed or moved — update the mapping, addresses stay stable.

## Concurrency: Read Tokens

Optimistic concurrency control via read tokens. Every read returns an opaque token. Writes optionally carry the token as proof-of-read. If the underlying state changed since the token was issued, the write fails instead of silently clobbering.

### Why This Fits

LLMs have long context windows and slow generation. The window between read and write spans minutes, not milliseconds. Without tokens, `populate` can silently overwrite changes made by another agent between the read and the write. With tokens, every write is a known-state transition — the caller provably saw the current state before modifying it.

This also resolves merge ambiguity for `populate`. The token proves the caller has seen the current state, so `populate` can be a full replace of specified fields without guessing at merge-vs-replace semantics.

### How It Works

Every read operation (`get`, `section`, `meta`, `item.get`) returns a `token` field alongside the content. Write operations accept an optional `token` parameter. If provided and stale, the write fails with `STALE_TOKEN`.

```json
{
  "ok": false,
  "error": "STALE_TOKEN",
  "path": "user-auth/requirements",
  "message": "Node changed since token was issued.",
  "current": { "metadata": { "status": "locked" }, "token": "new-token-here" }
}
```

The rejection includes current state so the caller can retry without a separate read call.

### Token Scope

Sidechain supports **both node-level and section-level tokens** from day one, implemented as **salted hashes**.

**Why salted hashes:** A plain content hash is predictable — an attacker or buggy client that knows the content can forge a valid token without having read through sidechain. A per-store random salt (generated at store creation, stored in config) makes tokens unpredictable. Only sidechain can produce a valid token because only sidechain knows the salt.

**Two granularities:**

| Scope | Covers | Use case |
|-------|--------|----------|
| **Node token** | All metadata + all sections | Full-node writes via `populate`, `setMeta` |
| **Section token** | Single section content | Section-scoped writes via `writeSection`, `item.update` |

Each section produces its own salted hash. The node token is the salted hash of concatenated section hashes plus metadata hash. Both token types appear in read responses:

```json
{
  "path": "user-auth/plan",
  "token": "sc_t_node_a3f8...",
  "metadata": { "status": "in-progress" },
  "sections": [
    { "id": "phase-1", "type": "task-list", "token": "sc_t_sec_7b2c...", "content": { ... } },
    { "id": "phase-2", "type": "task-list", "token": "sc_t_sec_e1d4...", "content": { ... } }
  ]
}
```

A section-scoped write carries the section token. Sidechain validates just that section's hash and recomputes the node token. A node-scoped write carries the node token and validates the whole node. The caller picks the granularity that matches their operation — one agent updates `phase-1` tasks with a section token while another updates `phase-2` without contention.

### Backend Implementation

Backends produce content hashes. The core layer salts them. Backends never see or manage tokens directly.

| Backend | Hash Source |
|---------|------------|
| Filesystem | Content hash of serialized node |
| SQLite | Content hash of row data |
| Remote API | Content hash (server-side salt) |
| In-memory | Content hash of in-memory representation |

### Enforcement Modes

The consumer configures enforcement at store level:

| Mode | Token absent | Token present, stale |
|------|-------------|---------------------|
| **strict** | Write rejected | Write rejected |
| **permissive** (default) | Write allowed | Write rejected |

Permissive mode lets single-agent workflows skip tokens entirely. Strict mode enforces proof-of-read for every write — appropriate for multi-tenant or multi-agent environments.

### Design Decisions

**Every read returns a token.** No separate "read-for-write" or "checkout" concept. The token is always present; use it or ignore it. This keeps the API stateless — no lock acquisition, no timeouts, no blocking.

**Every write returns a new token.** Mutations return the affected object in its new state, including fresh node and section tokens. The caller can chain writes without re-reading:

```
read phase-1       → token A
update phase-1/1.2 → token B (new token in response)
update phase-1/1.3 → token C (uses token B, no re-read needed)
```

**Tokens are not locks.** Multiple agents can hold tokens for the same node simultaneously. The first to write wins; others get `STALE_TOKEN` and must re-read. No deadlocks, no starvation.

**`STALE_TOKEN` response includes current state and fresh tokens.** The LLM retries from the error response, not from a separate read call. This avoids a round trip in the common retry path.

## Open Questions

- [x] Schema evolution — consumer-managed with `schema-version` drift detection. See §Schema Versioning.
- [x] Locking granularity — optimistic concurrency with per-node read tokens. No locks. See §Concurrency: Read Tokens.
- [ ] Event model — should sidechain emit events on writes (for consumer hooks)?
- [ ] Large content — streaming reads for nodes with big text sections?
- [ ] ID generation — consumer-provided only, or auto-generation option?
- [ ] Package scope — standalone npm package? Monorepo with core + backends + CLI + MCP?
- [ ] Rill integration depth — sidechain as rill-native commands, or just CLI piping?
- [x] Task-list markdown format — formalized: `[x] **ID** \`[TAG]\` Title` + indented body + `> Notes:`. Items carry `id`, `title`, `status`, `tags`, `refs`, `body`, `notes`.
- [x] Section type inference — LLM-driven, not parser heuristics. Schemaless nodes read as `text`; LLM generates schema. See §Schema Generation.
- [ ] Group addressing — see §Group Addressing above. Wire format and crypto details TBD.

## Next Steps

### POC Scope

1. Define the core library types (Store, Client, Group, Node, Section, Schema) in TypeScript
2. Implement filesystem backend with markdown parsing/serialization
3. Build `text` and `task-list` content types
4. Read tokens (salted hashes, node + section scope)
5. Schema validation (required fields, enum checks, section presence, dynamic min counts)
6. Wrap library in CLI with JSON output
7. Wrap library in MCP server (same operations as CLI, tool-per-command)
8. Group addressing (client-side name→address mapping, capability-based access)
9. Migrate one conduct initiative as proof of concept

### Post-POC

- SQLite, remote API, and in-memory backends
- Custom content type registration
- Schema versioning and drift detection
- Rill integration (sidechain commands as rill-native ops)
- Remaining content types (collection, checklist, table, key-value, reference-list)
