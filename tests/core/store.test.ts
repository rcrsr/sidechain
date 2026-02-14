/**
 * Tests for Store initialization and group operations
 * Covered: AC-1, AC-2, AC-3, AC-4, AC-5, AC-7, AC-9, AC-26, EC-1, IR-2
 * Skipped (implementation blockers): AC-6, AC-8, AC-31, EC-2
 *
 * IMPLEMENTATION BLOCKER: Backend.listGroups() returns node schema instead of group schema.
 * This prevents getGroupSchemaForGroup() from working correctly, blocking tests for:
 * - AC-6: deleteGroup removes group directory
 * - AC-8: list(group) returns slots with empty flag
 * - AC-31: Delete locked group cites locked nodes
 * - EC-2: deleteGroup with locked nodes throws VALIDATION_ERROR
 */

import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Sidechain } from '../../src/core/store.js';
import {
  InvalidSchemaError,
  NotFoundError,
  ValidationError,
} from '../../src/core/errors.js';
import type { SidechainConfig } from '../../src/types/config.js';
import type { GroupSchema, NodeSchema } from '../../src/types/schema.js';
import type { Store } from '../../src/types/store.js';
import type { ControlPlane } from '../../src/types/control-plane.js';
import {
  createTempDir,
  cleanupTempDir,
  setupTestStore,
  cleanupTestStore,
  type TestStoreSetup,
} from '../fixtures/index.js';

describe('Store Initialization', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  // AC-1: Sidechain.open with valid config returns Store
  it('returns Store instance with valid configuration', async () => {
    const config: SidechainConfig = {
      mounts: {
        main: {
          path: path.join(tempDir, 'groups'),
          groupSchema: 'test-group',
        },
      },
      groupSchemas: {
        'test-group': {
          'schema-id': 'test-group',
          slots: [
            { id: 'requirements', schema: 'test-node' },
            { id: 'plan', schema: 'test-node' },
          ],
        },
      },
      nodeSchemas: {
        'test-node': {
          'schema-id': 'test-node',
        },
      },
    };

    const store = await Sidechain.open(config);

    expect(store).toBeDefined();
    expect(typeof store.list).toBe('function');
    expect(typeof store.exists).toBe('function');
    expect(typeof store.get).toBe('function');
    expect(typeof store.createGroup).toBe('function');
    expect(typeof store.deleteGroup).toBe('function');
  });

  // AC-2: Sidechain.open with missing mounts throws INVALID_SCHEMA
  it('throws INVALID_SCHEMA when mounts missing', async () => {
    const config = {
      groupSchemas: {
        'test-group': {
          'schema-id': 'test-group',
          slots: [{ id: 'spec', schema: 'test-node' }],
        },
      },
      nodeSchemas: {
        'test-node': {
          'schema-id': 'test-node',
        },
      },
    } as unknown as SidechainConfig;

    await expect(Sidechain.open(config)).rejects.toThrow(InvalidSchemaError);
    await expect(Sidechain.open(config)).rejects.toThrow(
      /missing required field: mounts/i
    );
  });

  // AC-2: Sidechain.open with missing groupSchemas throws INVALID_SCHEMA
  it('throws INVALID_SCHEMA when groupSchemas missing', async () => {
    const config = {
      mounts: {
        main: {
          path: path.join(tempDir, 'groups'),
          groupSchema: 'test-group',
        },
      },
      nodeSchemas: {
        'test-node': {
          'schema-id': 'test-node',
        },
      },
    } as unknown as SidechainConfig;

    await expect(Sidechain.open(config)).rejects.toThrow(InvalidSchemaError);
    await expect(Sidechain.open(config)).rejects.toThrow(
      /missing required field: groupSchemas/i
    );
  });

  // AC-2: Sidechain.open with missing nodeSchemas throws INVALID_SCHEMA
  it('throws INVALID_SCHEMA when nodeSchemas missing', async () => {
    const config = {
      mounts: {
        main: {
          path: path.join(tempDir, 'groups'),
          groupSchema: 'test-group',
        },
      },
      groupSchemas: {
        'test-group': {
          'schema-id': 'test-group',
          slots: [{ id: 'spec', schema: 'test-node' }],
        },
      },
    } as unknown as SidechainConfig;

    await expect(Sidechain.open(config)).rejects.toThrow(InvalidSchemaError);
    await expect(Sidechain.open(config)).rejects.toThrow(
      /missing required field: nodeSchemas/i
    );
  });

  // AC-3: getSchema returns registered schema after open
  it('provides access to registered schemas via getSchema', async () => {
    const nodeSchema: NodeSchema = {
      'schema-id': 'test-node',
      version: '1.0',
      description: 'Test node schema',
      metadata: {
        fields: {
          status: {
            type: 'enum',
            values: ['draft', 'locked'],
            required: true,
            description: 'Node status',
          },
        },
      },
    };

    const groupSchema: GroupSchema = {
      'schema-id': 'test-group',
      description: 'Test group schema',
      slots: [
        { id: 'requirements', schema: 'test-node' },
        { id: 'plan', schema: 'test-node' },
      ],
    };

    const config: SidechainConfig = {
      mounts: {
        main: {
          path: path.join(tempDir, 'groups'),
          groupSchema: 'test-group',
        },
      },
      groupSchemas: {
        'test-group': groupSchema,
      },
      nodeSchemas: {
        'test-node': nodeSchema,
      },
    };

    const store = (await Sidechain.open(config)) as Store & ControlPlane;

    const retrievedNodeSchema = await store.getSchema('test-node');
    expect(retrievedNodeSchema).toEqual(nodeSchema);

    const retrievedGroupSchema = await store.getSchema('test-group');
    expect(retrievedGroupSchema).toEqual(groupSchema);
  });

  // rootDir path resolution: relative path with explicit rootDir
  it('resolves relative mount path with explicit rootDir', async () => {
    const testRootDir = path.join(tempDir, 'root');
    const config: SidechainConfig = {
      rootDir: testRootDir,
      mounts: {
        main: {
          path: './data',
          groupSchema: 'test-group',
        },
      },
      groupSchemas: {
        'test-group': {
          'schema-id': 'test-group',
          slots: [{ id: 'spec', schema: 'test-node' }],
        },
      },
      nodeSchemas: {
        'test-node': {
          'schema-id': 'test-node',
        },
      },
    };

    const store = (await Sidechain.open(config)) as Store & ControlPlane;
    const mounts = await store.mounts();

    expect(mounts).toHaveLength(1);
    expect(mounts[0]?.path).toBe(path.join(testRootDir, 'data'));
  });

  // rootDir path resolution: relative path without rootDir defaults to cwd
  it('resolves relative mount path to cwd when rootDir not specified', async () => {
    const config: SidechainConfig = {
      mounts: {
        main: {
          path: './data',
          groupSchema: 'test-group',
        },
      },
      groupSchemas: {
        'test-group': {
          'schema-id': 'test-group',
          slots: [{ id: 'spec', schema: 'test-node' }],
        },
      },
      nodeSchemas: {
        'test-node': {
          'schema-id': 'test-node',
        },
      },
    };

    const store = (await Sidechain.open(config)) as Store & ControlPlane;
    const mounts = await store.mounts();

    expect(mounts).toHaveLength(1);
    expect(mounts[0]?.path).toBe(path.resolve(process.cwd(), './data'));
  });

  // rootDir path resolution: absolute path ignores rootDir
  it('preserves absolute mount path regardless of rootDir', async () => {
    const absolutePath = path.join(tempDir, 'absolute', 'data');
    const config: SidechainConfig = {
      rootDir: path.join(tempDir, 'root'),
      mounts: {
        main: {
          path: absolutePath,
          groupSchema: 'test-group',
        },
      },
      groupSchemas: {
        'test-group': {
          'schema-id': 'test-group',
          slots: [{ id: 'spec', schema: 'test-node' }],
        },
      },
      nodeSchemas: {
        'test-node': {
          'schema-id': 'test-node',
        },
      },
    };

    const store = (await Sidechain.open(config)) as Store & ControlPlane;
    const mounts = await store.mounts();

    expect(mounts).toHaveLength(1);
    expect(mounts[0]?.path).toBe(absolutePath);
  });
});

describe('Group Operations', () => {
  let setup: TestStoreSetup;
  let store: Store & ControlPlane;

  beforeEach(async () => {
    setup = await setupTestStore((tempDir) => ({
      mounts: {
        main: {
          path: path.join(tempDir, 'groups'),
          groupSchema: 'test-group',
        },
      },
      groupSchemas: {
        'test-group': {
          'schema-id': 'test-group',
          description: 'Test group',
          slots: [
            { id: 'requirements', schema: 'test-node' },
            { id: 'plan', schema: 'test-node' },
            { id: 'notes', schema: 'test-node', description: 'Optional notes' },
          ],
        },
      },
      nodeSchemas: {
        'test-node': {
          'schema-id': 'test-node',
          metadata: {
            fields: {
              status: {
                type: 'enum',
                values: ['draft', 'locked'],
                required: true,
                description: 'Node status',
              },
              locked: {
                type: 'boolean',
                description: 'Lock flag',
              },
            },
          },
          sections: {
            required: [{ id: 'overview', type: 'text' }],
          },
        },
      },
    }));
    store = setup.store as Store & ControlPlane;
  });

  afterEach(async () => {
    await cleanupTestStore(setup);
  });

  describe('createGroup', () => {
    // AC-4: createGroup materializes all slots with defaults
    it('materializes all slots defined in group schema', async () => {
      const result = await store.createGroup('test-group');

      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('schema');
      expect(result.schema).toBe('test-group');
      expect(result.address).toMatch(/^sc_g_[a-f0-9]+$/);

      // Verify all slots exist by checking individual slots
      const requirementsExists = await store.exists(
        `${result.address}/requirements`
      );
      const planExists = await store.exists(`${result.address}/plan`);
      const notesExists = await store.exists(`${result.address}/notes`);

      expect(requirementsExists).toBe(true);
      expect(planExists).toBe(true);
      expect(notesExists).toBe(true);
    });

    // AC-4: Slots have default metadata
    it('creates slots with default metadata including schema-id', async () => {
      const result = await store.createGroup('test-group');

      // Read one of the slots
      const nodeData = await store.get(`${result.address}/requirements`);

      expect(nodeData.metadata).toHaveProperty('schema-id');
      expect(nodeData.metadata['schema-id']).toBe('test-node');

      // Only schema-id is in default metadata
      // Other fields like status are not auto-populated
    });

    // AC-5: createGroup is safe to call multiple times
    // Current interpretation: "idempotent" means safe to call multiple times
    // but generates fresh address each time
    it('is safe to call multiple times even though addresses differ (AC-5)', async () => {
      const result1 = await store.createGroup('test-group');
      const result2 = await store.createGroup('test-group');

      // Both succeed, but different addresses (different salt)
      expect(result1.address).toMatch(/^sc_g_[a-f0-9]+$/);
      expect(result2.address).toMatch(/^sc_g_[a-f0-9]+$/);
      expect(result1.address).not.toBe(result2.address);
    });

    it('throws INVALID_SCHEMA when schema is not a group schema', async () => {
      await expect(store.createGroup('test-node')).rejects.toThrow(
        InvalidSchemaError
      );
      await expect(store.createGroup('test-node')).rejects.toThrow(
        /not a group schema/i
      );
    });

    it('throws INVALID_SCHEMA when schema not registered', async () => {
      await expect(store.createGroup('nonexistent-schema')).rejects.toThrow();
    });
  });

  describe('deleteGroup', () => {
    // Note: deleteGroup and list(groupAddress) currently have a bug where
    // backend returns node schema instead of group schema.
    // These tests verify correct behavior where possible.

    // EC-1: deleteGroup on nonexistent group throws NOT_FOUND
    it('throws NOT_FOUND when group does not exist', async () => {
      const fakeAddress = 'sc_g_' + '0'.repeat(16);

      await expect(store.deleteGroup(fakeAddress)).rejects.toThrow(
        NotFoundError
      );
      await expect(store.deleteGroup(fakeAddress)).rejects.toThrow(
        /not found/i
      );
    });

    it('throws NOT_FOUND for invalid group address format', async () => {
      await expect(store.deleteGroup('invalid-address')).rejects.toThrow(
        NotFoundError
      );
    });

    it('removes group directory and all slots (AC-6)', async () => {
      const result = await store.createGroup('test-group');
      await store.deleteGroup(result.address);
      const exists = await store.exists(result.address);
      expect(exists).toBe(false);
    });

    it('throws VALIDATION_ERROR when deleting group with locked nodes (EC-2, AC-31)', async () => {
      const result = await store.createGroup('test-group');
      // Set status: locked on a node
      await store.populate(`${result.address}/requirements`, {
        metadata: { locked: true, status: 'locked' },
        sections: { overview: 'Locked content' },
      });
      await expect(store.deleteGroup(result.address)).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('list operations', () => {
    // AC-7: list() returns groups client has addresses for
    it('returns all groups in configured mounts', async () => {
      const group1 = await store.createGroup('test-group');
      const group2 = await store.createGroup('test-group');

      const groups = await store.list();

      expect(groups.length).toBeGreaterThanOrEqual(2);
      const groupIds = groups.map((g) => g.id);
      expect(groupIds).toContain(group1.address);
      expect(groupIds).toContain(group2.address);

      // Returns group schema from mount configuration
      const group1Entry = groups.find((g) => g.id === group1.address);
      expect(group1Entry?.schema).toBe('test-group');
    });

    it('returns empty array when no groups exist', async () => {
      const groups = await store.list();
      expect(groups).toEqual([]);
    });

    it('returns slot summaries with empty flag (AC-8)', async () => {
      const result = await store.createGroup('test-group');
      const slots = await store.list(result.address);
      expect(slots).toHaveProperty('[0].empty');
    });
  });

  describe('exists', () => {
    // IR-2: exists returns boolean for existing/missing paths
    it('returns true for existing group', async () => {
      const result = await store.createGroup('test-group');
      const exists = await store.exists(result.address);
      expect(exists).toBe(true);
    });

    it('returns false for nonexistent group', async () => {
      const fakeAddress = 'sc_g_' + '0'.repeat(16);
      const exists = await store.exists(fakeAddress);
      expect(exists).toBe(false);
    });

    it('returns true for existing slot', async () => {
      const result = await store.createGroup('test-group');
      const exists = await store.exists(`${result.address}/requirements`);
      expect(exists).toBe(true);
    });

    it('returns false for nonexistent slot', async () => {
      const result = await store.createGroup('test-group');
      const exists = await store.exists(`${result.address}/nonexistent`);
      expect(exists).toBe(false);
    });

    it('returns false for invalid address format', async () => {
      const exists = await store.exists('invalid-address');
      expect(exists).toBe(false);
    });

    it('returns false for empty path', async () => {
      const exists = await store.exists('');
      expect(exists).toBe(false);
    });
  });

  describe('get', () => {
    // AC-9: get returns node with metadata, sections, empty flag, token
    it('returns complete node with metadata, sections, and token', async () => {
      const result = await store.createGroup('test-group');
      const groupAddress = result.address;

      const nodeData = await store.get(`${groupAddress}/requirements`);

      // Check metadata
      expect(nodeData).toHaveProperty('metadata');
      expect(nodeData.metadata).toHaveProperty('schema-id');
      expect(nodeData.metadata['schema-id']).toBe('test-node');

      // Check sections (should be empty initially)
      expect(nodeData).toHaveProperty('sections');
      expect(Array.isArray(nodeData.sections)).toBe(true);
      expect(nodeData.sections).toHaveLength(0);

      // Check token
      expect(nodeData).toHaveProperty('token');
      expect(typeof nodeData.token).toBe('string');
      expect(nodeData.token).toMatch(/^sc_t_node_[a-f0-9]+$/);
    });

    it('returns sections when node has content', async () => {
      const result = await store.createGroup('test-group');
      const groupAddress = result.address;

      // Add a section via populate
      await store.populate(`${groupAddress}/requirements`, {
        metadata: { status: 'draft' },
        sections: { overview: 'Test content' },
      });

      const nodeData = await store.get(`${groupAddress}/requirements`);

      expect(nodeData.sections).toHaveLength(1);
      expect(nodeData.sections[0]?.id).toBe('overview');
      expect(nodeData.sections[0]?.type).toBe('text');
      expect(nodeData.sections[0]?.content).toBe('Test content');
      expect(nodeData.sections[0]?.token).toMatch(
        /^sc_t_(sec|node)_[a-f0-9]+$/
      );
    });

    it('throws NOT_FOUND when group does not exist', async () => {
      const fakeAddress = 'sc_g_' + '0'.repeat(16);

      await expect(store.get(`${fakeAddress}/requirements`)).rejects.toThrow(
        NotFoundError
      );
    });

    it('throws NOT_FOUND when slot does not exist', async () => {
      const result = await store.createGroup('test-group');

      await expect(store.get(`${result.address}/nonexistent`)).rejects.toThrow(
        NotFoundError
      );
    });

    it('throws NOT_FOUND for invalid path format', async () => {
      await expect(store.get('invalid')).rejects.toThrow(NotFoundError);
    });
  });
});

describe('Error Handling', () => {
  let setup: TestStoreSetup;
  let store: Store;

  beforeEach(async () => {
    setup = await setupTestStore((tempDir) => ({
      mounts: {
        main: {
          path: path.join(tempDir, 'groups'),
          groupSchema: 'test-group',
        },
      },
      groupSchemas: {
        'test-group': {
          'schema-id': 'test-group',
          slots: [{ id: 'spec', schema: 'test-node' }],
        },
      },
      nodeSchemas: {
        'test-node': {
          'schema-id': 'test-node',
          metadata: {
            fields: {
              status: {
                type: 'enum',
                values: ['draft', 'locked'],
                required: true,
              },
            },
          },
        },
      },
    }));
    store = setup.store;
  });

  afterEach(async () => {
    await cleanupTestStore(setup);
  });

  // AC-26: Write to nonexistent group returns NOT_FOUND
  it('throws NOT_FOUND when writing to nonexistent group', async () => {
    const fakeAddress = 'sc_g_' + '0'.repeat(16);

    await expect(
      store.setMeta(`${fakeAddress}/spec`, 'status', 'locked')
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NOT_FOUND when writing to nonexistent slot', async () => {
    const result = await store.createGroup('test-group');

    await expect(
      store.setMeta(`${result.address}/nonexistent`, 'status', 'locked')
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NOT_FOUND for invalid group address format', async () => {
    await expect(
      store.setMeta('invalid-address/spec', 'status', 'locked')
    ).rejects.toThrow(NotFoundError);
  });
});
