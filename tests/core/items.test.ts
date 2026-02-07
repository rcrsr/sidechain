/**
 * Tests for Store item operations
 * Covered: IR-19, IR-20, IR-21, IR-22, EC-7, EC-8, EC-9, EC-10, EC-11, EC-12, AC-15, AC-30, AC-37
 */

import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  NotFoundError,
  SectionNotFoundError,
  StaleTokenError,
  ValidationError,
} from '../../src/core/errors.js';
import type { SidechainConfig } from '../../src/types/config.js';
import type { Store } from '../../src/types/store.js';
import {
  setupTestStoreWithGroup,
  cleanupTestStore,
  type TestStoreSetup,
} from '../fixtures/index.js';

describe('Item Operations', () => {
  let setup: TestStoreSetup & { groupAddress: string };
  let store: Store;
  let groupAddress: string;

  beforeEach(async () => {
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
          slots: [{ id: 'plan', schema: 'test-plan' }],
        },
      },
      nodeSchemas: {
        'test-plan': {
          'schema-id': 'test-plan',
          metadata: {
            fields: {
              status: {
                type: 'enum',
                values: ['draft', 'locked'],
                required: true,
                description: 'Plan status',
              },
            },
          },
          sections: {
            required: [{ id: 'overview', type: 'text' }],
            optional: [
              { id: 'tasks', type: 'task-list' },
              { id: 'notes', type: 'text' },
            ],
            dynamic: [{ 'id-pattern': 'phase-{n}', type: 'task-list', min: 1 }],
          },
        },
      },
    }));
    store = setup.store;
    groupAddress = setup.groupAddress;

    // Initialize node with required sections and structured content
    await store.populate(`${groupAddress}/plan`, {
      metadata: { status: 'draft' },
      sections: {
        overview: 'Initial overview',
        notes: JSON.stringify({ type: 'note', content: 'Some notes' }),
        'phase-1': [
          { id: '1.1', body: 'Task 1' },
          { id: '1.2', body: 'Task 2' },
        ],
        tasks: [
          { id: 'task-1', title: 'First task', done: false },
          { id: 'task-2', title: 'Second task', done: true },
        ],
      },
    });
  });

  afterEach(async () => {
    await cleanupTestStore(setup);
  });

  describe('item.get(path, section, item) - retrieve item', () => {
    // IR-19: item.get returns item from structured section
    it('returns item content and token from structured section', async () => {
      const result = await store.item.get(
        `${groupAddress}/plan`,
        'phase-1',
        '1.1'
      );

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('token');
      expect(result.token).toMatch(/^sc_t_sec_/);

      const item = result.content as { id: string; body: string };
      expect(item.id).toBe('1.1');
      expect(item.body).toBe('Task 1');
    });

    it('returns item from optional structured section', async () => {
      const result = await store.item.get(
        `${groupAddress}/plan`,
        'tasks',
        'task-1'
      );

      const item = result.content as {
        id: string;
        title: string;
        done: boolean;
      };
      expect(item.id).toBe('task-1');
      expect(item.title).toBe('First task');
      expect(item.done).toBe(false);
    });

    // EC-7: Section not found
    it('throws SECTION_NOT_FOUND when section does not exist', async () => {
      await expect(
        store.item.get(`${groupAddress}/plan`, 'nonexistent', 'item-1')
      ).rejects.toThrow(SectionNotFoundError);

      try {
        await store.item.get(`${groupAddress}/plan`, 'nonexistent', 'item-1');
      } catch (error) {
        expect(error).toBeInstanceOf(SectionNotFoundError);
        expect((error as SectionNotFoundError).path).toBe(
          `${groupAddress}/plan/nonexistent`
        );
        expect((error as SectionNotFoundError).message).toContain(
          "Section 'nonexistent' not found in node"
        );
      }
    });

    // EC-8: Content not array
    it('throws VALIDATION_ERROR when section content is not an array', async () => {
      await expect(
        store.item.get(`${groupAddress}/plan`, 'notes', 'item-1')
      ).rejects.toThrow(ValidationError);

      try {
        await store.item.get(`${groupAddress}/plan`, 'notes', 'item-1');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toBe(
          'Section content is not an array'
        );
      }
    });

    // EC-9: Item not found
    it('throws NOT_FOUND when item not found in section', async () => {
      await expect(
        store.item.get(`${groupAddress}/plan`, 'phase-1', 'nonexistent')
      ).rejects.toThrow(NotFoundError);

      try {
        await store.item.get(`${groupAddress}/plan`, 'phase-1', 'nonexistent');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
        expect((error as NotFoundError).message).toBe(
          "Item 'nonexistent' not found in section"
        );
      }
    });
  });

  describe('item.add(path, section, data) - add item', () => {
    // IR-20: item.add dispatches by content type
    // AC-15: item.add dispatches by section content type and validates data
    // AC-37: Item add generates unique ID when data.id not provided
    it('adds item to structured section with auto-generated ID', async () => {
      const result = await store.item.add(`${groupAddress}/plan`, 'phase-1', {
        body: 'New task',
      });

      expect(result.ok).toBe(true);
      expect(result.path).toMatch(
        new RegExp(`${groupAddress}/plan/phase-1/item-`)
      );
      expect(result.item).toMatch(/^item-/);
      expect(result.token).toMatch(/^sc_t_sec_/);
      expect(result.nodeToken).toMatch(/^sc_t_node_/);

      // Verify item was added
      const section = await store.section(`${groupAddress}/plan`, 'phase-1');
      const items = JSON.parse(section.content as string) as {
        id: string;
        body: string;
      }[];
      expect(items.length).toBe(3);

      const newItem = items.find((i) => i.id === result.item);
      expect(newItem).toBeDefined();
      expect(newItem?.body).toBe('New task');
    });

    it('adds item with explicit ID', async () => {
      const result = await store.item.add(`${groupAddress}/plan`, 'phase-1', {
        id: '1.3',
        body: 'Task with explicit ID',
      });

      expect(result.ok).toBe(true);
      expect(result.item).toBe('1.3');
      expect(result.path).toBe(`${groupAddress}/plan/phase-1/1.3`);

      // Verify item was added
      const item = await store.item.get(
        `${groupAddress}/plan`,
        'phase-1',
        '1.3'
      );
      const itemContent = item.content as { id: string; body: string };
      expect(itemContent.id).toBe('1.3');
      expect(itemContent.body).toBe('Task with explicit ID');
    });

    it('adds item to optional structured section', async () => {
      const result = await store.item.add(`${groupAddress}/plan`, 'tasks', {
        title: 'New task',
        done: false,
      });

      expect(result.ok).toBe(true);
      expect(result.item).toMatch(/^item-/);

      // Verify item was added
      const section = await store.section(`${groupAddress}/plan`, 'tasks');
      const items = JSON.parse(section.content as string) as {
        id: string;
        title: string;
      }[];
      expect(items.length).toBe(3);
    });

    // AC-30: Item add to text section returns VALIDATION_ERROR
    // EC-10: Text section item add
    it('throws VALIDATION_ERROR when adding to text section', async () => {
      await expect(
        store.item.add(`${groupAddress}/plan`, 'overview', {
          text: 'Some content',
        })
      ).rejects.toThrow(ValidationError);

      try {
        await store.item.add(`${groupAddress}/plan`, 'overview', {
          text: 'Some content',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toBe(
          'Cannot add item to text section'
        );
      }
    });

    // EC-11: Duplicate item ID
    it('throws VALIDATION_ERROR when adding duplicate ID', async () => {
      await expect(
        store.item.add(`${groupAddress}/plan`, 'phase-1', {
          id: '1.1',
          body: 'Duplicate',
        })
      ).rejects.toThrow(ValidationError);

      try {
        await store.item.add(`${groupAddress}/plan`, 'phase-1', {
          id: '1.1',
          body: 'Duplicate',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toBe(
          "Item with id '1.1' already exists"
        );
      }
    });

    it('throws SECTION_NOT_FOUND when section does not exist', async () => {
      await expect(
        store.item.add(`${groupAddress}/plan`, 'nonexistent', {
          body: 'Task',
        })
      ).rejects.toThrow(SectionNotFoundError);
    });
  });

  describe('item.update(path, section, item, fields, opts?) - update item', () => {
    // IR-21: item.update modifies fields
    it('updates item fields and returns previous values', async () => {
      const result = await store.item.update(
        `${groupAddress}/plan`,
        'phase-1',
        '1.1',
        { body: 'Updated task 1', completed: true }
      );

      expect(result.ok).toBe(true);
      expect(result.path).toBe(`${groupAddress}/plan/phase-1/1.1`);
      expect(result.item).toBe('1.1');
      expect(result.previous).toEqual({ id: '1.1', body: 'Task 1' });
      expect(result.token).toMatch(/^sc_t_sec_/);
      expect(result.nodeToken).toMatch(/^sc_t_node_/);

      // Verify update
      const item = await store.item.get(
        `${groupAddress}/plan`,
        'phase-1',
        '1.1'
      );
      const content = item.content as {
        id: string;
        body: string;
        completed: boolean;
      };
      expect(content.body).toBe('Updated task 1');
      expect(content.completed).toBe(true);
      expect(content.id).toBe('1.1'); // ID preserved
    });

    it('merges new fields with existing item', async () => {
      const result = await store.item.update(
        `${groupAddress}/plan`,
        'tasks',
        'task-1',
        { done: true }
      );

      expect(result.ok).toBe(true);

      // Verify merge
      const item = await store.item.get(
        `${groupAddress}/plan`,
        'tasks',
        'task-1'
      );
      const content = item.content as {
        id: string;
        title: string;
        done: boolean;
      };
      expect(content.title).toBe('First task'); // Original preserved
      expect(content.done).toBe(true); // Updated
    });

    // EC-12: Stale token
    it('throws STALE_TOKEN when section token is stale', async () => {
      const { token } = await store.item.get(
        `${groupAddress}/plan`,
        'phase-1',
        '1.1'
      );

      // Modify section to invalidate token
      await store.item.add(`${groupAddress}/plan`, 'phase-1', {
        body: 'Another task',
      });

      await expect(
        store.item.update(
          `${groupAddress}/plan`,
          'phase-1',
          '1.1',
          { body: 'Update with stale token' },
          { token }
        )
      ).rejects.toThrow(StaleTokenError);

      try {
        await store.item.update(
          `${groupAddress}/plan`,
          'phase-1',
          '1.1',
          { body: 'Update with stale token' },
          { token }
        );
      } catch (error) {
        expect(error).toBeInstanceOf(StaleTokenError);
        expect((error as StaleTokenError).code).toBe('STALE_TOKEN');
        expect((error as StaleTokenError).current).toHaveProperty('metadata');
        expect((error as StaleTokenError).current).toHaveProperty('sections');
        expect((error as StaleTokenError).token).toMatch(/^sc_t_sec_/);
      }
    });

    it('succeeds with valid section token', async () => {
      const { token } = await store.item.get(
        `${groupAddress}/plan`,
        'phase-1',
        '1.1'
      );

      const result = await store.item.update(
        `${groupAddress}/plan`,
        'phase-1',
        '1.1',
        { body: 'Update with valid token' },
        { token }
      );

      expect(result.ok).toBe(true);
      expect(result.token).not.toBe(token); // New token issued
    });

    it('succeeds with valid node token', async () => {
      const { token: nodeToken } = await store.get(`${groupAddress}/plan`);

      const result = await store.item.update(
        `${groupAddress}/plan`,
        'phase-1',
        '1.1',
        { body: 'Update with node token' },
        { token: nodeToken }
      );

      expect(result.ok).toBe(true);
    });

    it('throws SECTION_NOT_FOUND when section does not exist', async () => {
      await expect(
        store.item.update(`${groupAddress}/plan`, 'nonexistent', '1.1', {
          body: 'Update',
        })
      ).rejects.toThrow(SectionNotFoundError);
    });

    it('throws error when item not found', async () => {
      await expect(
        store.item.update(`${groupAddress}/plan`, 'phase-1', 'nonexistent', {
          body: 'Update',
        })
      ).rejects.toThrow("Item 'nonexistent' not found in section");
    });
  });

  describe('item.remove(path, section, item) - remove item', () => {
    // IR-22: item.remove deletes item
    it('removes item from structured section', async () => {
      const result = await store.item.remove(
        `${groupAddress}/plan`,
        'phase-1',
        '1.1'
      );

      expect(result.ok).toBe(true);
      expect(result.path).toBe(`${groupAddress}/plan/phase-1/1.1`);

      // Verify removal
      const section = await store.section(`${groupAddress}/plan`, 'phase-1');
      const items = JSON.parse(section.content as string) as { id: string }[];
      expect(items.length).toBe(1);
      expect(items.find((i) => i.id === '1.1')).toBeUndefined();
      expect(items.find((i) => i.id === '1.2')).toBeDefined();
    });

    it('removes item from optional structured section', async () => {
      const result = await store.item.remove(
        `${groupAddress}/plan`,
        'tasks',
        'task-1'
      );

      expect(result.ok).toBe(true);

      // Verify removal
      const section = await store.section(`${groupAddress}/plan`, 'tasks');
      const items = JSON.parse(section.content as string) as { id: string }[];
      expect(items.length).toBe(1);
      expect(items.find((i) => i.id === 'task-1')).toBeUndefined();
    });

    it('throws SECTION_NOT_FOUND when section does not exist', async () => {
      await expect(
        store.item.remove(`${groupAddress}/plan`, 'nonexistent', 'item-1')
      ).rejects.toThrow(SectionNotFoundError);
    });

    it('throws error when item not found', async () => {
      await expect(
        store.item.remove(`${groupAddress}/plan`, 'phase-1', 'nonexistent')
      ).rejects.toThrow("Item 'nonexistent' not found in section");
    });

    it('removes all items from section successfully', async () => {
      await store.item.remove(`${groupAddress}/plan`, 'phase-1', '1.1');
      await store.item.remove(`${groupAddress}/plan`, 'phase-1', '1.2');

      const section = await store.section(`${groupAddress}/plan`, 'phase-1');
      const items = JSON.parse(section.content as string) as unknown[];
      expect(items.length).toBe(0);
    });
  });
});
