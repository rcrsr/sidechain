/**
 * Tests for Store metadata operations
 * Covered: IR-8, IR-9, IR-10, IR-11, EC-9, EC-12, AC-10, AC-16, AC-22, AC-27, AC-28
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StaleTokenError, ValidationError } from '../../src/core/errors.js';
import type { Store } from '../../src/types/store.js';
import {
  setupTestStoreWithGroup,
  cleanupTestStore,
  createTestConfigWithMetadata,
  type TestStoreSetup,
} from '../fixtures/index.js';

describe('Metadata Operations', () => {
  let setup: TestStoreSetup & { groupAddress: string };
  let store: Store;
  let groupAddress: string;

  beforeEach(async () => {
    setup = await setupTestStoreWithGroup((tempDir) =>
      createTestConfigWithMetadata(tempDir)
    );
    store = setup.store;
    groupAddress = setup.groupAddress;

    // Initialize node with required metadata
    await store.populate(`${groupAddress}/requirements`, {
      metadata: { status: 'draft' },
      sections: { overview: 'Test overview' },
    });
  });

  afterEach(async () => {
    await cleanupTestStore(setup);
  });

  describe('meta(path) - read all metadata', () => {
    // IR-8: meta(path) returns all metadata fields with token
    it('returns all metadata fields with token', async () => {
      const result = await store.meta(`${groupAddress}/requirements`);

      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('token');

      expect(result.metadata).toHaveProperty('schema-id', 'test-node');
      expect(result.metadata).toHaveProperty('status', 'draft');

      expect(typeof result.token).toBe('string');
      expect(result.token).toMatch(/^sc_t_node_[a-f0-9]+$/);
    });

    it('returns all metadata including optional fields when set', async () => {
      // Set optional fields
      await store.setMeta(`${groupAddress}/requirements`, {
        priority: 'high',
        assignee: 'Alice',
      });

      const result = await store.meta(`${groupAddress}/requirements`);

      expect(result.metadata).toMatchObject({
        'schema-id': 'test-node',
        status: 'draft',
        priority: 'high',
        assignee: 'Alice',
      });
    });
  });

  describe('meta(path, field) - read single field', () => {
    // IR-9: meta(path, field) returns single field value with token
    it('returns single field value with token', async () => {
      const result = await store.meta(`${groupAddress}/requirements`, 'status');

      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('token');

      expect(result.value).toBe('draft');
      expect(typeof result.token).toBe('string');
      expect(result.token).toMatch(/^sc_t_node_[a-f0-9]+$/);
    });

    it('returns undefined for optional field not set', async () => {
      const result = await store.meta(
        `${groupAddress}/requirements`,
        'assignee'
      );

      expect(result.value).toBeUndefined();
      expect(result.token).toMatch(/^sc_t_node_[a-f0-9]+$/);
    });

    it('returns undefined for field not in schema', async () => {
      const result = await store.meta(
        `${groupAddress}/requirements`,
        'nonexistent'
      );

      expect(result.value).toBeUndefined();
    });
  });

  describe('setMeta(path, field, value) - single field update', () => {
    // IR-10: setMeta(path, field, value) updates field and returns previous value
    it('updates single field and returns previous value', async () => {
      const result = await store.setMeta(
        `${groupAddress}/requirements`,
        'status',
        'in-progress'
      );

      expect(result).toMatchObject({
        ok: true,
        path: `${groupAddress}/requirements`,
        value: { status: 'in-progress' },
        previous: 'draft',
      });

      expect(result.token).toMatch(/^sc_t_node_[a-f0-9]+$/);

      // Verify update persisted
      const { value } = await store.meta(
        `${groupAddress}/requirements`,
        'status'
      );
      expect(value).toBe('in-progress');
    });

    it('returns undefined as previous value for unset optional field', async () => {
      const result = await store.setMeta(
        `${groupAddress}/requirements`,
        'assignee',
        'Bob'
      );

      expect(result.previous).toBeUndefined();
      expect(result.value).toEqual({ assignee: 'Bob' });
    });

    it('returns fresh token after update', async () => {
      const { token: token1 } = await store.meta(
        `${groupAddress}/requirements`
      );

      const { token: token2 } = await store.setMeta(
        `${groupAddress}/requirements`,
        'status',
        'completed'
      );

      expect(token2).not.toBe(token1);
      expect(token2).toMatch(/^sc_t_node_[a-f0-9]+$/);
    });
  });

  describe('setMeta(path, fields) - multiple fields update', () => {
    // IR-11: setMeta(path, fields) updates multiple fields
    it('updates multiple fields and returns previous values', async () => {
      const result = await store.setMeta(`${groupAddress}/requirements`, {
        status: 'completed',
        priority: 'high',
        assignee: 'Charlie',
      });

      expect(result).toMatchObject({
        ok: true,
        path: `${groupAddress}/requirements`,
        value: {
          status: 'completed',
          priority: 'high',
          assignee: 'Charlie',
        },
      });

      // Previous values for status (was 'draft'), priority and assignee (unset)
      expect(result.previous).toEqual({
        status: 'draft',
        priority: undefined,
        assignee: undefined,
      });

      expect(result.token).toMatch(/^sc_t_node_[a-f0-9]+$/);

      // Verify updates persisted
      const { metadata } = await store.meta(`${groupAddress}/requirements`);
      expect(metadata).toMatchObject({
        status: 'completed',
        priority: 'high',
        assignee: 'Charlie',
      });
    });

    it('updates array field correctly', async () => {
      const result = await store.setMeta(`${groupAddress}/requirements`, {
        tags: ['urgent', 'backend', 'api'],
      });

      expect(result.value).toEqual({
        tags: ['urgent', 'backend', 'api'],
      });

      const { value } = await store.meta(
        `${groupAddress}/requirements`,
        'tags'
      );
      expect(value).toEqual(['urgent', 'backend', 'api']);
    });

    it('updates date field with valid format', async () => {
      const result = await store.setMeta(`${groupAddress}/requirements`, {
        dueDate: '2026-03-15',
      });

      expect(result.value).toEqual({ dueDate: '2026-03-15' });

      const { value } = await store.meta(
        `${groupAddress}/requirements`,
        'dueDate'
      );
      expect(value).toBe('2026-03-15');
    });
  });

  describe('setMeta with token - concurrency control', () => {
    // AC-10: setMeta with valid token succeeds
    it('succeeds when valid token provided', async () => {
      const { token } = await store.meta(`${groupAddress}/requirements`);

      const result = await store.setMeta(
        `${groupAddress}/requirements`,
        'status',
        'in-progress',
        { token }
      );

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ status: 'in-progress' });
    });

    // EC-12, AC-22, AC-28: setMeta with stale token throws STALE_TOKEN with current state
    it('throws STALE_TOKEN when token is stale', async () => {
      const { token: staleToken } = await store.meta(
        `${groupAddress}/requirements`
      );

      // Modify node to invalidate token
      await store.setMeta(`${groupAddress}/requirements`, 'priority', 'high');

      // Try to update with stale token
      await expect(
        store.setMeta(`${groupAddress}/requirements`, 'status', 'completed', {
          token: staleToken,
        })
      ).rejects.toThrow(StaleTokenError);
    });

    it('STALE_TOKEN error includes current state and fresh token', async () => {
      const { token: staleToken } = await store.meta(
        `${groupAddress}/requirements`
      );

      // Modify node
      await store.setMeta(`${groupAddress}/requirements`, 'priority', 'medium');

      try {
        await store.setMeta(
          `${groupAddress}/requirements`,
          'status',
          'completed',
          { token: staleToken }
        );
        expect.fail('Should have thrown StaleTokenError');
      } catch (error) {
        expect(error).toBeInstanceOf(StaleTokenError);

        if (error instanceof StaleTokenError) {
          expect(error.code).toBe('STALE_TOKEN');
          expect(error.path).toBe(`${groupAddress}/requirements`);

          // Current state includes updated metadata
          expect(error.current).toHaveProperty('metadata');
          const current = error.current as {
            metadata: Record<string, unknown>;
          };
          expect(current.metadata).toMatchObject({
            status: 'draft',
            priority: 'medium',
          });

          // Fresh token provided
          expect(error.token).toMatch(/^sc_t_node_[a-f0-9]+$/);
          expect(error.token).not.toBe(staleToken);
        }
      }
    });

    it('can retry with fresh token from STALE_TOKEN error', async () => {
      const { token: staleToken } = await store.meta(
        `${groupAddress}/requirements`
      );

      // Modify node
      await store.setMeta(`${groupAddress}/requirements`, 'priority', 'low');

      // Try with stale token, catch error, retry with fresh token
      let freshToken: string;
      try {
        await store.setMeta(
          `${groupAddress}/requirements`,
          'status',
          'completed',
          { token: staleToken }
        );
      } catch (error) {
        if (error instanceof StaleTokenError) {
          freshToken = error.token;
        } else {
          throw error;
        }
      }

      // Retry with fresh token should succeed
      const result = await store.setMeta(
        `${groupAddress}/requirements`,
        'status',
        'completed',
        { token: freshToken! }
      );

      expect(result.ok).toBe(true);
    });
  });

  describe('setMeta validation', () => {
    // AC-16: Required metadata fields enforced on every write
    it('enforces required field presence', async () => {
      // Create a new node without the required field to test validation
      const newGroup = await store.createGroup('test-group', {
        client: 'test',
      });

      // Try to set optional field without setting required field first
      await expect(
        store.setMeta(`${newGroup.address}/requirements`, {
          assignee: 'Dave',
          // status is required but not included, and doesn't exist yet
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        store.setMeta(`${newGroup.address}/requirements`, {
          assignee: 'Dave',
        })
      ).rejects.toThrow(/required.*status/i);
    });

    // EC-9, AC-27: Invalid enum value throws VALIDATION_ERROR with allowed values
    it('rejects invalid enum value with allowed values in message', async () => {
      await expect(
        store.setMeta(
          `${groupAddress}/requirements`,
          'status',
          'invalid-status'
        )
      ).rejects.toThrow(ValidationError);

      try {
        await store.setMeta(
          `${groupAddress}/requirements`,
          'status',
          'invalid-status'
        );
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);

        if (error instanceof ValidationError) {
          expect(error.code).toBe('VALIDATION_ERROR');
          expect(error.message).toMatch(/draft/);
          expect(error.message).toMatch(/in-progress/);
          expect(error.message).toMatch(/completed/);
          expect(error.path).toMatch(/@meta\/status$/);
        }
      }
    });

    it('rejects invalid enum value for optional field', async () => {
      await expect(
        store.setMeta(
          `${groupAddress}/requirements`,
          'priority',
          'super-urgent'
        )
      ).rejects.toThrow(ValidationError);

      try {
        await store.setMeta(
          `${groupAddress}/requirements`,
          'priority',
          'super-urgent'
        );
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        if (error instanceof ValidationError) {
          expect(error.message).toMatch(/low/);
          expect(error.message).toMatch(/medium/);
          expect(error.message).toMatch(/high/);
        }
      }
    });

    it('rejects wrong type for string field', async () => {
      await expect(
        store.setMeta(`${groupAddress}/requirements`, 'assignee', 123)
      ).rejects.toThrow(ValidationError);

      await expect(
        store.setMeta(`${groupAddress}/requirements`, 'assignee', 123)
      ).rejects.toThrow(/must be string/i);
    });

    it('rejects invalid date format', async () => {
      // Note: validation checks format (YYYY-MM-DD), not semantic validity
      // So "2026-13-01" (invalid month) passes format validation

      await expect(
        store.setMeta(`${groupAddress}/requirements`, 'dueDate', '2026/03/15')
      ).rejects.toThrow(ValidationError);

      await expect(
        store.setMeta(`${groupAddress}/requirements`, 'dueDate', 'tomorrow')
      ).rejects.toThrow(/YYYY-MM-DD/);
    });

    it('rejects non-array value for string[] field', async () => {
      await expect(
        store.setMeta(`${groupAddress}/requirements`, 'tags', 'single-tag')
      ).rejects.toThrow(ValidationError);

      await expect(
        store.setMeta(`${groupAddress}/requirements`, 'tags', 'single-tag')
      ).rejects.toThrow(/must be array/i);
    });

    it('rejects array with non-string elements', async () => {
      await expect(
        store.setMeta(`${groupAddress}/requirements`, 'tags', ['valid', 123])
      ).rejects.toThrow(ValidationError);

      await expect(
        store.setMeta(`${groupAddress}/requirements`, 'tags', ['valid', 123])
      ).rejects.toThrow(/must be string/i);
    });
  });

  describe('concurrent write scenarios', () => {
    // AC-28: Stale token on concurrent write returns STALE_TOKEN with current state
    it('detects concurrent modification and returns current state', async () => {
      // Simulate two agents reading same node
      const agent1Read = await store.meta(`${groupAddress}/requirements`);
      const agent2Read = await store.meta(`${groupAddress}/requirements`);

      // Agent 1 writes successfully
      await store.setMeta(`${groupAddress}/requirements`, 'priority', 'high', {
        token: agent1Read.token,
      });

      // Agent 2 write fails with stale token
      try {
        await store.setMeta(`${groupAddress}/requirements`, 'assignee', 'Eve', {
          token: agent2Read.token,
        });
        expect.fail('Should have thrown StaleTokenError');
      } catch (error) {
        expect(error).toBeInstanceOf(StaleTokenError);

        if (error instanceof StaleTokenError) {
          // Current state reflects Agent 1's change
          const current = error.current as {
            metadata: Record<string, unknown>;
          };
          expect(current.metadata).toMatchObject({
            priority: 'high',
          });

          // Agent 2 should not see their attempted change
          expect(current.metadata['assignee']).toBeUndefined();
        }
      }
    });

    it('allows sequential updates with token chaining', async () => {
      let { token } = await store.meta(`${groupAddress}/requirements`);

      // Update 1
      const result1 = await store.setMeta(
        `${groupAddress}/requirements`,
        'status',
        'in-progress',
        { token }
      );
      token = result1.token;

      // Update 2
      const result2 = await store.setMeta(
        `${groupAddress}/requirements`,
        'priority',
        'high',
        { token }
      );
      token = result2.token;

      // Update 3
      const result3 = await store.setMeta(
        `${groupAddress}/requirements`,
        'assignee',
        'Frank',
        { token }
      );

      expect(result3.ok).toBe(true);

      // Verify all updates persisted
      const { metadata } = await store.meta(`${groupAddress}/requirements`);
      expect(metadata).toMatchObject({
        status: 'in-progress',
        priority: 'high',
        assignee: 'Frank',
      });
    });
  });
});
