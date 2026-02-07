# Test Fixtures

Shared test fixtures and helpers to reduce duplication across test files.

## Motivation

Before fixtures: 20% test code duplication
Target: <15% duplication
Primary duplicated patterns: `Sidechain.open()` setup, schema definitions, mock stores

## Usage

### Config Builders

Create test configurations without boilerplate:

```typescript
import {
  createTestConfig,
  createTestConfigWithMetadata,
} from '../fixtures/index.js';

// Minimal config
const config = createTestConfig(tempDir);

// With metadata schema
const config = createTestConfigWithMetadata(tempDir);

// With plan schema (sections + metadata)
const config = createTestConfigWithPlan(tempDir);
```

### Store Setup

Common pattern for integration tests:

```typescript
import { setupTestStore, cleanupTestStore } from '../fixtures/index.js';

let setup: TestStoreSetup;

beforeEach(async () => {
  setup = await setupTestStore();
  // setup.tempDir, setup.store, setup.groupsDir available
});

afterEach(async () => {
  await cleanupTestStore(setup);
});
```

Setup with pre-created group:

```typescript
import {
  setupTestStoreWithGroup,
  cleanupTestStore,
} from '../fixtures/index.js';

let setup: TestStoreSetup & { groupAddress: string };

beforeEach(async () => {
  setup = await setupTestStoreWithGroup();
  // setup.groupAddress contains created group address
});

afterEach(async () => {
  await cleanupTestStore(setup);
});
```

### Mock Store

For CLI and MCP routing tests that don't need real storage:

```typescript
import { createMockStore } from '../fixtures/index.js';

const store = createMockStore();
vi.mocked(store.get).mockResolvedValue({ metadata: {}, sections: [] });

await store.get('test/path');
expect(store.get).toHaveBeenCalledWith('test/path');
```

## Files

- `config.ts` - Schema and config builders
- `mock-store.ts` - Mock Store factory for routing tests
- `setup.ts` - Store setup/teardown helpers
- `index.ts` - Barrel export
- `fixtures.test.ts` - Meta-test verifying fixtures work

## Schema Builders

```typescript
import {
  createTestNodeSchema,
  createTestNodeSchemaWithMetadata,
  createTestPlanSchema,
  createTestGroupSchema,
} from '../fixtures/index.js';

// Minimal node schema
const schema = createTestNodeSchema();

// With metadata fields (status, priority, assignee, dueDate, tags)
const schema = createTestNodeSchemaWithMetadata();

// Plan schema with sections and dynamic phases
const schema = createTestPlanSchema();

// Custom group schema
const schema = createTestGroupSchema([
  { id: 'requirements', schema: 'test-node' },
  { id: 'plan', schema: 'test-plan' },
]);
```

## Next Steps

Task 4.6 will migrate existing test files to use these fixtures.
Expected duplication reduction: 20% → <15%
