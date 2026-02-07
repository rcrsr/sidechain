/**
 * Tests for Store describe and validate operations
 * Covered: IR-23, IR-24, AC-18, AC-19, AC-20, AC-33, AC-36
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Sidechain } from '../../src/core/index.js';
import { FilesystemBackend } from '../../src/backends/filesystem.js';
import type { RawNode } from '../../src/types/backend.js';
import type { SidechainConfig } from '../../src/types/config.js';
import type { Store } from '../../src/types/store.js';
import {
  setupTestStoreWithGroup,
  cleanupTestStore,
  type TestStoreSetup,
} from '../fixtures/index.js';

describe('Describe and Validate Operations', () => {
  let setup: TestStoreSetup & { groupAddress: string };
  let store: Store;
  let groupAddress: string;
  let backend: FilesystemBackend;
  let groupPath: string;

  // Helper to write raw node bypassing validation
  async function writeRawNode(slot: string, rawNode: RawNode): Promise<void> {
    await backend.writeNode(groupPath, slot, rawNode);
  }

  beforeEach(async () => {
    backend = new FilesystemBackend({ nodeExtension: '.md' });

    setup = await setupTestStoreWithGroup((tempDir) => ({
      mounts: {
        main: {
          path: path.join(tempDir, 'groups'),
          groupSchema: 'test-group',
        },
      },
      groupSchemas: {
        'test-group': {
          'schema-id': 'test-group',
          description: 'Test group for validation',
          slots: [
            { id: 'plan', schema: 'test-plan' },
            { id: 'schemaless', schema: 'no-schema' },
          ],
        },
      },
      nodeSchemas: {
        'test-plan': {
          'schema-id': 'test-plan',
          version: '1.0.0',
          description: 'Test plan schema with required sections',
          metadata: {
            fields: {
              status: {
                type: 'enum',
                values: ['draft', 'locked'],
                required: true,
                description: 'Plan status',
              },
              version: {
                type: 'string',
                description: 'Version string',
              },
            },
          },
          sections: {
            required: [
              { id: 'overview', type: 'text', description: 'Overview section' },
              { id: 'goals', type: 'text', description: 'Goals section' },
            ],
            optional: [
              { id: 'notes', type: 'text', description: 'Optional notes' },
            ],
            dynamic: [
              {
                'id-pattern': 'phase-{n}',
                type: 'task-list',
                min: 2,
                description: 'Phase sections with minimum count',
              },
            ],
          },
        },
        'no-schema': {
          'schema-id': 'no-schema',
          description: 'Schemaless node for structural checks',
        },
      },
    }));
    store = setup.store;
    groupAddress = setup.groupAddress;

    // Store group path for backend access
    groupPath = path.join(setup.groupsDir, groupAddress);
  });

  afterEach(async () => {
    await cleanupTestStore(setup);
  });

  describe('describe(schemaOrPath) - schema description', () => {
    // IR-23: describe(schema) returns schema description
    it('returns description for schema ID (node schema)', async () => {
      const result = await store.describe('test-plan');

      expect(result['schema-id']).toBe('test-plan');
      expect(result.type).toBe('node');
      expect(result.description).toBe(
        'Test plan schema with required sections'
      );
    });

    it('returns description for schema ID (group schema)', async () => {
      const result = await store.describe('test-group');

      expect(result['schema-id']).toBe('test-group');
      expect(result.type).toBe('group');
      expect(result.description).toBe('Test group for validation');
    });

    // IR-23: describe(path) returns node schema description
    it('returns description for node path', async () => {
      await store.populate(`${groupAddress}/plan`, {
        metadata: { status: 'draft' },
        sections: {
          overview: 'Test overview',
          goals: 'Test goals',
          'phase-1': [{ id: '1.1', body: 'Task 1' }],
          'phase-2': [{ id: '2.1', body: 'Task 2' }],
        },
      });

      const result = await store.describe(`${groupAddress}/plan`);

      expect(result['schema-id']).toBe('test-plan');
      expect(result.type).toBe('node');
      expect(result.description).toBe(
        'Test plan schema with required sections'
      );
    });

    it('returns description without description field for minimal schema', async () => {
      const minimalConfig: SidechainConfig = {
        mounts: {
          main: {
            path: path.join(setup.tempDir, 'minimal'),
            groupSchema: 'minimal-group',
          },
        },
        groupSchemas: {
          'minimal-group': {
            'schema-id': 'minimal-group',
            slots: [{ id: 'doc', schema: 'minimal-node' }],
          },
        },
        nodeSchemas: {
          'minimal-node': {
            'schema-id': 'minimal-node',
          },
        },
      };

      const minimalStore = await Sidechain.open(minimalConfig);
      const result = await minimalStore.describe('minimal-node');

      expect(result['schema-id']).toBe('minimal-node');
      expect(result.type).toBe('node');
      expect(result.description).toBeUndefined();
    });
  });

  describe('validate(path) - node validation', () => {
    // IR-24, AC-18: validate checks required sections
    it('validates successfully when all required sections present', async () => {
      await store.populate(`${groupAddress}/plan`, {
        metadata: { status: 'draft' },
        sections: {
          overview: 'Overview text',
          goals: 'Goals text',
          'phase-1': [{ id: '1.1', body: 'Task 1' }],
          'phase-2': [{ id: '2.1', body: 'Task 2' }],
        },
      });

      const result = await store.validate(`${groupAddress}/plan`);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    // AC-18: Required sections checked by validate()
    it('reports error when required section is missing', async () => {
      // Write node directly bypassing validation
      await writeRawNode('plan', {
        metadata: { 'schema-id': 'test-plan', status: 'draft' },
        sections: {
          overview: 'Overview text',
          // Missing 'goals' required section
          'phase-1': JSON.stringify([{ id: '1.1', body: 'Task 1' }]),
          'phase-2': JSON.stringify([{ id: '2.1', body: 'Task 2' }]),
        },
      });

      const result = await store.validate(`${groupAddress}/plan`);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const missingSection = result.errors.find((e) =>
        e.message.includes("Required section 'goals' is missing")
      );
      expect(missingSection).toBeDefined();
      expect(missingSection?.path).toBe(`${groupAddress}/plan/goals`);
      expect(missingSection?.schema).toBe('test-plan');
    });

    it('reports multiple missing required sections', async () => {
      // Write node directly bypassing validation
      await writeRawNode('plan', {
        metadata: { 'schema-id': 'test-plan', status: 'draft' },
        sections: {
          // Missing both 'overview' and 'goals'
          'phase-1': JSON.stringify([{ id: '1.1', body: 'Task 1' }]),
          'phase-2': JSON.stringify([{ id: '2.1', body: 'Task 2' }]),
        },
      });

      const result = await store.validate(`${groupAddress}/plan`);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);

      const overviewError = result.errors.find((e) =>
        e.message.includes("Required section 'overview' is missing")
      );
      const goalsError = result.errors.find((e) =>
        e.message.includes("Required section 'goals' is missing")
      );

      expect(overviewError).toBeDefined();
      expect(goalsError).toBeDefined();
    });

    // AC-19: Dynamic section minimum counts checked by validate()
    it('validates successfully when dynamic section minimum met', async () => {
      await store.populate(`${groupAddress}/plan`, {
        metadata: { status: 'draft' },
        sections: {
          overview: 'Overview text',
          goals: 'Goals text',
          'phase-1': [{ id: '1.1', body: 'Task 1' }],
          'phase-2': [{ id: '2.1', body: 'Task 2' }],
        },
      });

      const result = await store.validate(`${groupAddress}/plan`);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('reports error when dynamic section minimum not met', async () => {
      // Write node directly bypassing validation
      await writeRawNode('plan', {
        metadata: { 'schema-id': 'test-plan', status: 'draft' },
        sections: {
          overview: 'Overview text',
          goals: 'Goals text',
          'phase-1': JSON.stringify([{ id: '1.1', body: 'Task 1' }]),
          // Only 1 phase section, but min is 2
        },
      });

      const result = await store.validate(`${groupAddress}/plan`);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const minError = result.errors.find((e) =>
        e.message.includes('minimum 2')
      );
      expect(minError).toBeDefined();
      expect(minError?.schema).toBe('test-plan');
    });

    it('validates successfully with more than minimum dynamic sections', async () => {
      await store.populate(`${groupAddress}/plan`, {
        metadata: { status: 'draft' },
        sections: {
          overview: 'Overview text',
          goals: 'Goals text',
          'phase-1': [{ id: '1.1', body: 'Task 1' }],
          'phase-2': [{ id: '2.1', body: 'Task 2' }],
          'phase-3': [{ id: '3.1', body: 'Task 3' }],
        },
      });

      const result = await store.validate(`${groupAddress}/plan`);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    // AC-36: Schemaless node validation performs structural checks only
    it('validates schemaless node with structural checks only', async () => {
      await store.populate(`${groupAddress}/schemaless`, {
        metadata: { 'schema-id': 'no-schema', someField: 'value' },
        sections: {
          'any-section': 'Any content',
          'another-section': [{ id: '1', data: 'item' }],
        },
      });

      const result = await store.validate(`${groupAddress}/schemaless`);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    // AC-33: Node with 0 sections - get() returns empty array
    it('validates node with no sections', async () => {
      // Write node directly bypassing validation
      await writeRawNode('plan', {
        metadata: { 'schema-id': 'test-plan', status: 'draft' },
        sections: {},
      });

      const node = await store.get(`${groupAddress}/plan`);
      expect(node.sections).toEqual([]);

      const result = await store.validate(`${groupAddress}/plan`);

      // Should fail validation due to missing required sections
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('validates metadata constraints', async () => {
      // Write node directly bypassing validation - missing required status field
      await writeRawNode('plan', {
        metadata: { 'schema-id': 'test-plan' },
        sections: {
          overview: 'Overview text',
          goals: 'Goals text',
          'phase-1': JSON.stringify([{ id: '1.1', body: 'Task 1' }]),
          'phase-2': JSON.stringify([{ id: '2.1', body: 'Task 2' }]),
        },
      });

      const result = await store.validate(`${groupAddress}/plan`);

      expect(result.valid).toBe(false);

      const metadataError = result.errors.find((e) =>
        e.message.includes('status')
      );
      expect(metadataError).toBeDefined();
    });

    it('optional sections do not affect validation', async () => {
      await store.populate(`${groupAddress}/plan`, {
        metadata: { status: 'draft' },
        sections: {
          overview: 'Overview text',
          goals: 'Goals text',
          'phase-1': [{ id: '1.1', body: 'Task 1' }],
          'phase-2': [{ id: '2.1', body: 'Task 2' }],
          // Optional 'notes' section omitted
        },
      });

      const result = await store.validate(`${groupAddress}/plan`);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validate(path) - schema drift detection', () => {
    // AC-20: Schema drift reported when node schema-version differs from current
    it('validates successfully when versions match', async () => {
      await store.populate(`${groupAddress}/plan`, {
        metadata: { status: 'draft', 'schema-version': '1.0.0' },
        sections: {
          overview: 'Overview text',
          goals: 'Goals text',
          'phase-1': [{ id: '1.1', body: 'Task 1' }],
          'phase-2': [{ id: '2.1', body: 'Task 2' }],
        },
      });

      const result = await store.validate(`${groupAddress}/plan`);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('does not report error when no version specified in schema', async () => {
      const noVersionConfig: SidechainConfig = {
        mounts: {
          main: {
            path: path.join(setup.tempDir, 'noversion'),
            groupSchema: 'nv-group',
          },
        },
        groupSchemas: {
          'nv-group': {
            'schema-id': 'nv-group',
            slots: [{ id: 'doc', schema: 'nv-node' }],
          },
        },
        nodeSchemas: {
          'nv-node': {
            'schema-id': 'nv-node',
            // No version field
            sections: {
              required: [{ id: 'content', type: 'text' }],
            },
          },
        },
      };

      await fs.mkdir(path.join(setup.tempDir, 'noversion'), {
        recursive: true,
      });
      const nvStore = await Sidechain.open(noVersionConfig);
      const nvResult = await nvStore.createGroup('nv-group');

      await nvStore.populate(`${nvResult.address}/doc`, {
        metadata: { 'schema-id': 'nv-node' },
        sections: { content: 'Content text' },
      });

      const result = await nvStore.validate(`${nvResult.address}/doc`);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('validates node with extra sections not in schema', async () => {
      await store.populate(`${groupAddress}/plan`, {
        metadata: { status: 'draft' },
        sections: {
          overview: 'Overview text',
          goals: 'Goals text',
          'phase-1': [{ id: '1.1', body: 'Task 1' }],
          'phase-2': [{ id: '2.1', body: 'Task 2' }],
          'extra-section': 'Extra content not in schema',
        },
      });

      const result = await store.validate(`${groupAddress}/plan`);

      // Extra sections are allowed
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns all validation errors at once', async () => {
      // Write node directly bypassing validation
      await writeRawNode('plan', {
        metadata: { 'schema-id': 'test-plan' }, // Missing required status
        sections: {
          overview: 'Overview text',
          // Missing required 'goals'
          // Only 1 phase section, min is 2
          'phase-1': JSON.stringify([{ id: '1.1', body: 'Task 1' }]),
        },
      });

      const result = await store.validate(`${groupAddress}/plan`);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);

      // Check that different types of errors are reported
      const hasMetadataError = result.errors.some((e) =>
        e.message.includes('status')
      );
      const hasSectionError = result.errors.some((e) =>
        e.message.includes('goals')
      );
      const hasMinError = result.errors.some((e) => e.message.includes('min'));

      expect(hasMetadataError).toBe(true);
      expect(hasSectionError).toBe(true);
      expect(hasMinError).toBe(true);
    });
  });
});
