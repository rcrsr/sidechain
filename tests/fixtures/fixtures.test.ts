/**
 * Tests to verify shared fixtures compile and work correctly
 * This is a meta-test - validates the test infrastructure itself
 */

import { describe, expect, it, vi } from 'vitest';

import {
  cleanupTestStore,
  createMockStore,
  createTestConfig,
  createTestConfigWithMetadata,
  createTestConfigWithPlan,
  createTestNodeSchema,
  createTestNodeSchemaWithMetadata,
  createTestPlanSchema,
  setupTestStore,
  setupTestStoreWithGroup,
} from './index.js';

describe('Test Fixtures', () => {
  describe('Config Builders', () => {
    it('creates minimal test config', () => {
      const config = createTestConfig('/tmp/test');

      expect(config.mounts.main).toBeDefined();
      expect(config.mounts.main.path).toBe('/tmp/test/groups');
      expect(config.groupSchemas['test-group']).toBeDefined();
      expect(config.nodeSchemas['test-node']).toBeDefined();
    });

    it('creates config with metadata', () => {
      const config = createTestConfigWithMetadata('/tmp/test');

      expect(config.nodeSchemas['test-node'].metadata).toBeDefined();
      expect(
        config.nodeSchemas['test-node'].metadata?.fields.status
      ).toBeDefined();
    });

    it('creates config with plan schema', () => {
      const config = createTestConfigWithPlan('/tmp/test');

      expect(config.nodeSchemas['test-plan']).toBeDefined();
      expect(config.nodeSchemas['test-plan'].sections?.dynamic).toBeDefined();
    });

    it('creates node schemas', () => {
      const minimal = createTestNodeSchema();
      expect(minimal['schema-id']).toBe('test-node');

      const withMetadata = createTestNodeSchemaWithMetadata();
      expect(withMetadata.metadata?.fields.status).toBeDefined();

      const plan = createTestPlanSchema();
      expect(plan.sections?.dynamic).toBeDefined();
    });
  });

  describe('Mock Store', () => {
    it('creates mock store with all methods', () => {
      const store = createMockStore();

      // Store operations
      expect(vi.isMockFunction(store.list)).toBe(true);
      expect(vi.isMockFunction(store.get)).toBe(true);
      expect(vi.isMockFunction(store.exists)).toBe(true);
      expect(vi.isMockFunction(store.createGroup)).toBe(true);
      expect(vi.isMockFunction(store.deleteGroup)).toBe(true);
      expect(vi.isMockFunction(store.meta)).toBe(true);
      expect(vi.isMockFunction(store.setMeta)).toBe(true);

      // Section operations
      expect(vi.isMockFunction(store.section)).toBe(true);
      expect(vi.isMockFunction(store.writeSection)).toBe(true);

      // Item operations
      expect(vi.isMockFunction(store.item.get)).toBe(true);
      expect(vi.isMockFunction(store.item.add)).toBe(true);

      // Control plane
      expect(vi.isMockFunction(store.mounts)).toBe(true);
      expect(vi.isMockFunction(store.listSchemas)).toBe(true);
    });

    it('allows configuring mock returns', async () => {
      const store = createMockStore();

      vi.mocked(store.exists).mockResolvedValue(true);
      const result = await store.exists('test/path');

      expect(result).toBe(true);
      expect(store.exists).toHaveBeenCalledWith('test/path');
    });
  });

  describe('Store Setup Helpers', () => {
    it('sets up and cleans up test store', async () => {
      const setup = await setupTestStore();

      expect(setup.tempDir).toBeTruthy();
      expect(setup.store).toBeDefined();
      expect(setup.groupsDir).toContain('groups');

      await cleanupTestStore(setup);
    });

    it('sets up test store with group', async () => {
      const setup = await setupTestStoreWithGroup();

      expect(setup.groupAddress).toBeTruthy();
      expect(setup.groupAddress).toMatch(/^sc_g_/);

      await cleanupTestStore(setup);
    });
  });
});
