/**
 * Tests for MCP tool routing
 * Covers: IC-13, EC-13, EC-14, EC-15
 *
 * Validates:
 * - All 22 tool calls route correctly to Store methods
 * - Overload handling for set_meta (field+value vs fields)
 * - Parameter variant handling for describe and describe_group
 * - Error handling: unknown tool, missing arg, invalid arg type
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

import { routeToolCall } from '../../src/mcp/router.js';
import type { ControlPlane } from '../../src/types/control-plane.js';
import type { ItemOps } from '../../src/types/item.js';
import type { Store } from '../../src/types/store.js';

/**
 * Mock Store implementation for testing routing
 */
function createMockStore(): Store & ControlPlane {
  return {
    // Store operations
    list: vi.fn(),
    get: vi.fn(),
    exists: vi.fn(),
    createGroup: vi.fn(),
    deleteGroup: vi.fn(),
    describeGroup: vi.fn(),
    validateGroup: vi.fn(),
    meta: vi.fn(),
    setMeta: vi.fn(),
    sections: vi.fn(),
    section: vi.fn(),
    writeSection: vi.fn(),
    appendSection: vi.fn(),
    addSection: vi.fn(),
    removeSection: vi.fn(),
    populate: vi.fn(),
    describe: vi.fn(),
    validate: vi.fn(),

    // Item operations
    item: {
      get: vi.fn(),
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    } as unknown as ItemOps,

    // ControlPlane operations
    mounts: vi.fn(),
    listSchemas: vi.fn(),
    getSchema: vi.fn(),
    registerSchema: vi.fn(),
    info: vi.fn(),
    listContentTypes: vi.fn(),
  };
}

describe('MCP Tool Routing', () => {
  let store: Store & ControlPlane;

  beforeEach(() => {
    store = createMockStore();
  });

  describe('sidechain_list', () => {
    test('routes to store.list() without group parameter', async () => {
      vi.mocked(store.list).mockResolvedValue([
        { id: 'sc_g_123', schema: 'initiative' },
      ]);

      const result = await routeToolCall('sidechain_list', {}, store);

      expect(store.list).toHaveBeenCalledWith();
      expect(result).toEqual({
        ok: true,
        groups: [{ id: 'sc_g_123', schema: 'initiative' }],
      });
    });

    test('routes to store.list(group) with group parameter', async () => {
      vi.mocked(store.list).mockResolvedValue([
        { id: 'spec', schema: 'specification', empty: false },
      ]);

      const result = await routeToolCall(
        'sidechain_list',
        { group: 'sc_g_123' },
        store
      );

      expect(store.list).toHaveBeenCalledWith('sc_g_123');
      expect(result).toEqual({
        ok: true,
        slots: [{ id: 'spec', schema: 'specification', empty: false }],
      });
    });
  });

  describe('sidechain_get', () => {
    test('routes to store.get(path)', async () => {
      vi.mocked(store.get).mockResolvedValue({
        metadata: { status: 'draft' },
        sections: [],
        token: 'token_123',
      });

      const result = await routeToolCall(
        'sidechain_get',
        { path: 'sc_g_123/spec' },
        store
      );

      expect(store.get).toHaveBeenCalledWith('sc_g_123/spec');
      expect(result).toEqual({
        ok: true,
        metadata: { status: 'draft' },
        sections: [],
        token: 'token_123',
      });
    });

    test('throws error when path is missing', async () => {
      await expect(routeToolCall('sidechain_get', {}, store)).rejects.toThrow(
        'Missing required argument: path'
      );
    });
  });

  describe('sidechain_exists', () => {
    test('routes to store.exists(path)', async () => {
      vi.mocked(store.exists).mockResolvedValue(true);

      const result = await routeToolCall(
        'sidechain_exists',
        { path: 'sc_g_123/spec' },
        store
      );

      expect(store.exists).toHaveBeenCalledWith('sc_g_123/spec');
      expect(result).toEqual({ ok: true, exists: true });
    });
  });

  describe('sidechain_create_group', () => {
    test('routes to store.createGroup(id) with default client "mcp" [IR-5, AC-6]', async () => {
      vi.mocked(store.createGroup).mockResolvedValue({
        address: 'sc_g_abc',
        schema: 'initiative',
      });

      const result = await routeToolCall(
        'sidechain_create_group',
        { id: 'initiative' },
        store
      );

      expect(store.createGroup).toHaveBeenCalledWith('initiative', {
        client: 'mcp',
      });
      expect(result).toEqual({
        ok: true,
        address: 'sc_g_abc',
        schema: 'initiative',
      });
    });

    test('routes to store.createGroup(id) with custom client from args [IR-5, AC-6]', async () => {
      vi.mocked(store.createGroup).mockResolvedValue({
        address: 'sc_g_xyz',
        schema: 'initiative',
      });

      const result = await routeToolCall(
        'sidechain_create_group',
        { id: 'initiative', client: 'custom-client' },
        store
      );

      expect(store.createGroup).toHaveBeenCalledWith('initiative', {
        client: 'custom-client',
      });
      expect(result).toEqual({
        ok: true,
        address: 'sc_g_xyz',
        schema: 'initiative',
      });
    });

    test('throws error when id is missing [EC-10]', async () => {
      await expect(
        routeToolCall('sidechain_create_group', {}, store)
      ).rejects.toThrow('Missing required argument: id');
    });

    test('propagates store InvalidSchemaError [EC-11]', async () => {
      const invalidSchemaError = new Error('Invalid schema: unknown-schema');
      invalidSchemaError.name = 'InvalidSchemaError';
      vi.mocked(store.createGroup).mockRejectedValue(invalidSchemaError);

      await expect(
        routeToolCall('sidechain_create_group', { id: 'unknown-schema' }, store)
      ).rejects.toThrow('Invalid schema: unknown-schema');
    });
  });

  describe('sidechain_delete_group', () => {
    test('routes to store.deleteGroup(id)', async () => {
      vi.mocked(store.deleteGroup).mockResolvedValue({
        ok: true,
        value: undefined,
      });

      const result = await routeToolCall(
        'sidechain_delete_group',
        { id: 'sc_g_123' },
        store
      );

      expect(store.deleteGroup).toHaveBeenCalledWith('sc_g_123');
      expect(result).toEqual({ ok: true, value: undefined });
    });
  });

  describe('sidechain_describe_group', () => {
    test('routes to store.getSchema(schema) when schema parameter provided', async () => {
      vi.mocked(store.getSchema).mockResolvedValue({
        'schema-id': 'initiative',
        slots: [],
      });

      const result = await routeToolCall(
        'sidechain_describe_group',
        { schema: 'initiative' },
        store
      );

      expect(store.getSchema).toHaveBeenCalledWith('initiative');
      expect(result).toEqual({
        ok: true,
        schema: { 'schema-id': 'initiative', slots: [] },
      });
    });

    test('routes to store.describeGroup(group) when group parameter provided', async () => {
      vi.mocked(store.describeGroup).mockResolvedValue({
        address: 'sc_g_123',
        schema: 'initiative',
        slots: [],
      });

      const result = await routeToolCall(
        'sidechain_describe_group',
        { group: 'sc_g_123' },
        store
      );

      expect(store.describeGroup).toHaveBeenCalledWith('sc_g_123');
      expect(result).toEqual({
        ok: true,
        address: 'sc_g_123',
        schema: 'initiative',
        slots: [],
      });
    });

    test('throws error when neither schema nor group provided', async () => {
      await expect(
        routeToolCall('sidechain_describe_group', {}, store)
      ).rejects.toThrow('Missing required argument: schema or group');
    });
  });

  describe('sidechain_validate_group', () => {
    test('routes to store.validateGroup(group)', async () => {
      vi.mocked(store.validateGroup).mockResolvedValue({
        valid: true,
        errors: [],
      });

      const result = await routeToolCall(
        'sidechain_validate_group',
        { group: 'sc_g_123' },
        store
      );

      expect(store.validateGroup).toHaveBeenCalledWith('sc_g_123');
      expect(result).toEqual({ ok: true, valid: true, errors: [] });
    });
  });

  describe('sidechain_meta', () => {
    test('routes to store.meta(path) without field parameter', async () => {
      vi.mocked(store.meta).mockResolvedValue({
        metadata: { status: 'draft' },
        token: 'token_123',
      });

      const result = await routeToolCall(
        'sidechain_meta',
        { path: 'sc_g_123/spec' },
        store
      );

      expect(store.meta).toHaveBeenCalledWith('sc_g_123/spec');
      expect(result).toEqual({
        ok: true,
        metadata: { status: 'draft' },
        token: 'token_123',
      });
    });

    test('routes to store.meta(path, field) with field parameter', async () => {
      vi.mocked(store.meta).mockResolvedValue({
        value: 'draft',
        token: 'token_123',
      });

      const result = await routeToolCall(
        'sidechain_meta',
        { path: 'sc_g_123/spec', field: 'status' },
        store
      );

      expect(store.meta).toHaveBeenCalledWith('sc_g_123/spec', 'status');
      expect(result).toEqual({
        ok: true,
        value: 'draft',
        token: 'token_123',
      });
    });
  });

  describe('sidechain_set_meta', () => {
    test('routes to store.setMeta(path, field, value) for single field', async () => {
      vi.mocked(store.setMeta).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_123',
      });

      const result = await routeToolCall(
        'sidechain_set_meta',
        { path: 'sc_g_123/spec', field: 'status', value: 'locked' },
        store
      );

      expect(store.setMeta).toHaveBeenCalledWith(
        'sc_g_123/spec',
        'status',
        'locked',
        undefined
      );
      expect(result).toEqual({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_123',
      });
    });

    test('routes to store.setMeta(path, fields) for multiple fields', async () => {
      vi.mocked(store.setMeta).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_123',
      });

      const result = await routeToolCall(
        'sidechain_set_meta',
        {
          path: 'sc_g_123/spec',
          fields: { status: 'locked', priority: 'high' },
        },
        store
      );

      expect(store.setMeta).toHaveBeenCalledWith(
        'sc_g_123/spec',
        { status: 'locked', priority: 'high' },
        undefined
      );
      expect(result).toEqual({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_123',
      });
    });

    test('passes token option when provided (single field)', async () => {
      vi.mocked(store.setMeta).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_new',
      });

      await routeToolCall(
        'sidechain_set_meta',
        {
          path: 'sc_g_123/spec',
          field: 'status',
          value: 'locked',
          token: 'token_old',
        },
        store
      );

      expect(store.setMeta).toHaveBeenCalledWith(
        'sc_g_123/spec',
        'status',
        'locked',
        { token: 'token_old' }
      );
    });

    test('passes token option when provided (multiple fields)', async () => {
      vi.mocked(store.setMeta).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_new',
      });

      await routeToolCall(
        'sidechain_set_meta',
        {
          path: 'sc_g_123/spec',
          fields: { status: 'locked' },
          token: 'token_old',
        },
        store
      );

      expect(store.setMeta).toHaveBeenCalledWith(
        'sc_g_123/spec',
        { status: 'locked' },
        { token: 'token_old' }
      );
    });

    test('throws error when neither field+value nor fields provided', async () => {
      await expect(
        routeToolCall('sidechain_set_meta', { path: 'sc_g_123/spec' }, store)
      ).rejects.toThrow('Missing required argument: field+value or fields');
    });
  });

  describe('sidechain_sections', () => {
    test('routes to store.sections(path)', async () => {
      vi.mocked(store.sections).mockResolvedValue([
        { id: 'overview', type: 'text' },
      ]);

      const result = await routeToolCall(
        'sidechain_sections',
        { path: 'sc_g_123/spec' },
        store
      );

      expect(store.sections).toHaveBeenCalledWith('sc_g_123/spec');
      expect(result).toEqual({
        ok: true,
        sections: [{ id: 'overview', type: 'text' }],
      });
    });
  });

  describe('sidechain_section', () => {
    test('routes to store.section(path, section)', async () => {
      vi.mocked(store.section).mockResolvedValue({
        id: 'overview',
        type: 'text',
        content: 'Content here',
        token: 'token_123',
      });

      const result = await routeToolCall(
        'sidechain_section',
        { path: 'sc_g_123/spec', section: 'overview' },
        store
      );

      expect(store.section).toHaveBeenCalledWith('sc_g_123/spec', 'overview');
      expect(result).toEqual({
        ok: true,
        id: 'overview',
        type: 'text',
        content: 'Content here',
        token: 'token_123',
      });
    });
  });

  describe('sidechain_write_section', () => {
    test('routes to store.writeSection(path, section, content)', async () => {
      vi.mocked(store.writeSection).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_123',
        nodeToken: 'node_token_123',
      });

      const result = await routeToolCall(
        'sidechain_write_section',
        {
          path: 'sc_g_123/spec',
          section: 'overview',
          content: 'New content',
        },
        store
      );

      expect(store.writeSection).toHaveBeenCalledWith(
        'sc_g_123/spec',
        'overview',
        'New content',
        undefined
      );
      expect(result).toEqual({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_123',
        nodeToken: 'node_token_123',
      });
    });

    test('passes token option when provided', async () => {
      vi.mocked(store.writeSection).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_new',
        nodeToken: 'node_token_new',
      });

      await routeToolCall(
        'sidechain_write_section',
        {
          path: 'sc_g_123/spec',
          section: 'overview',
          content: 'New content',
          token: 'token_old',
        },
        store
      );

      expect(store.writeSection).toHaveBeenCalledWith(
        'sc_g_123/spec',
        'overview',
        'New content',
        { token: 'token_old' }
      );
    });
  });

  describe('sidechain_append_section', () => {
    test('routes to store.appendSection(path, section, content)', async () => {
      vi.mocked(store.appendSection).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_123',
        nodeToken: 'node_token_123',
      });

      const result = await routeToolCall(
        'sidechain_append_section',
        {
          path: 'sc_g_123/spec',
          section: 'overview',
          content: 'Appended text',
        },
        store
      );

      expect(store.appendSection).toHaveBeenCalledWith(
        'sc_g_123/spec',
        'overview',
        'Appended text',
        undefined
      );
      expect(result).toEqual({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_123',
        nodeToken: 'node_token_123',
      });
    });
  });

  describe('sidechain_add_section', () => {
    test('routes to store.addSection(path, def) without after', async () => {
      vi.mocked(store.addSection).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
      });

      const result = await routeToolCall(
        'sidechain_add_section',
        { path: 'sc_g_123/spec', id: 'notes', type: 'text' },
        store
      );

      expect(store.addSection).toHaveBeenCalledWith('sc_g_123/spec', {
        id: 'notes',
        type: 'text',
      });
      expect(result).toEqual({ ok: true, path: 'sc_g_123/spec' });
    });

    test('routes to store.addSection(path, def) with after', async () => {
      vi.mocked(store.addSection).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
      });

      await routeToolCall(
        'sidechain_add_section',
        {
          path: 'sc_g_123/spec',
          id: 'notes',
          type: 'text',
          after: 'overview',
        },
        store
      );

      expect(store.addSection).toHaveBeenCalledWith('sc_g_123/spec', {
        id: 'notes',
        type: 'text',
        after: 'overview',
      });
    });
  });

  describe('sidechain_remove_section', () => {
    test('routes to store.removeSection(path, section)', async () => {
      vi.mocked(store.removeSection).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
      });

      const result = await routeToolCall(
        'sidechain_remove_section',
        { path: 'sc_g_123/spec', section: 'notes' },
        store
      );

      expect(store.removeSection).toHaveBeenCalledWith(
        'sc_g_123/spec',
        'notes'
      );
      expect(result).toEqual({ ok: true, path: 'sc_g_123/spec' });
    });
  });

  describe('sidechain_populate', () => {
    test('routes to store.populate(path, data) with both metadata and sections', async () => {
      vi.mocked(store.populate).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
        sections: 2,
        metadata: 1,
        token: 'token_123',
      });

      const result = await routeToolCall(
        'sidechain_populate',
        {
          path: 'sc_g_123/spec',
          metadata: { status: 'draft' },
          sections: { overview: 'Content', notes: 'Notes' },
        },
        store
      );

      expect(store.populate).toHaveBeenCalledWith(
        'sc_g_123/spec',
        {
          metadata: { status: 'draft' },
          sections: { overview: 'Content', notes: 'Notes' },
        },
        undefined
      );
      expect(result).toEqual({
        ok: true,
        path: 'sc_g_123/spec',
        sections: 2,
        metadata: 1,
        token: 'token_123',
      });
    });

    test('routes to store.populate with only metadata (empty sections)', async () => {
      vi.mocked(store.populate).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
        sections: 0,
        metadata: 1,
        token: 'token_123',
      });

      await routeToolCall(
        'sidechain_populate',
        {
          path: 'sc_g_123/spec',
          metadata: { status: 'draft' },
        },
        store
      );

      expect(store.populate).toHaveBeenCalledWith(
        'sc_g_123/spec',
        { metadata: { status: 'draft' }, sections: {} },
        undefined
      );
    });
  });

  describe('sidechain_item_get', () => {
    test('routes to store.item.get(path, section, item)', async () => {
      vi.mocked(store.item.get).mockResolvedValue({
        content: { id: '1.1', title: 'Task 1' },
        token: 'token_123',
      });

      const result = await routeToolCall(
        'sidechain_item_get',
        { path: 'sc_g_123/plan', section: 'phase-1', item: '1.1' },
        store
      );

      expect(store.item.get).toHaveBeenCalledWith(
        'sc_g_123/plan',
        'phase-1',
        '1.1'
      );
      expect(result).toEqual({
        ok: true,
        content: { id: '1.1', title: 'Task 1' },
        token: 'token_123',
      });
    });
  });

  describe('sidechain_item_add', () => {
    test('routes to store.item.add(path, section, data)', async () => {
      vi.mocked(store.item.add).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/plan',
        item: '1.1',
        token: 'token_123',
        nodeToken: 'node_token_123',
      });

      const result = await routeToolCall(
        'sidechain_item_add',
        {
          path: 'sc_g_123/plan',
          section: 'phase-1',
          data: { title: 'New task' },
        },
        store
      );

      expect(store.item.add).toHaveBeenCalledWith('sc_g_123/plan', 'phase-1', {
        title: 'New task',
      });
      expect(result).toEqual({
        ok: true,
        path: 'sc_g_123/plan',
        item: '1.1',
        token: 'token_123',
        nodeToken: 'node_token_123',
      });
    });
  });

  describe('sidechain_item_update', () => {
    test('routes to store.item.update(path, section, item, data)', async () => {
      vi.mocked(store.item.update).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/plan',
        item: '1.1',
        previous: { title: 'Old title' },
        token: 'token_123',
        nodeToken: 'node_token_123',
      });

      const result = await routeToolCall(
        'sidechain_item_update',
        {
          path: 'sc_g_123/plan',
          section: 'phase-1',
          item: '1.1',
          data: { title: 'Updated title' },
        },
        store
      );

      expect(store.item.update).toHaveBeenCalledWith(
        'sc_g_123/plan',
        'phase-1',
        '1.1',
        { title: 'Updated title' },
        undefined
      );
      expect(result).toEqual({
        ok: true,
        path: 'sc_g_123/plan',
        item: '1.1',
        previous: { title: 'Old title' },
        token: 'token_123',
        nodeToken: 'node_token_123',
      });
    });
  });

  describe('sidechain_item_remove', () => {
    test('routes to store.item.remove(path, section, item)', async () => {
      vi.mocked(store.item.remove).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/plan',
      });

      const result = await routeToolCall(
        'sidechain_item_remove',
        { path: 'sc_g_123/plan', section: 'phase-1', item: '1.1' },
        store
      );

      expect(store.item.remove).toHaveBeenCalledWith(
        'sc_g_123/plan',
        'phase-1',
        '1.1'
      );
      expect(result).toEqual({ ok: true, path: 'sc_g_123/plan' });
    });
  });

  describe('sidechain_describe', () => {
    test('routes to store.describe(schema) when schema parameter provided', async () => {
      vi.mocked(store.describe).mockResolvedValue({
        schema: 'specification',
        metadata: {},
        sections: [],
      });

      const result = await routeToolCall(
        'sidechain_describe',
        { schema: 'specification' },
        store
      );

      expect(store.describe).toHaveBeenCalledWith('specification');
      expect(result).toEqual({
        ok: true,
        schema: 'specification',
        metadata: {},
        sections: [],
      });
    });

    test('routes to store.describe(path) when path parameter provided', async () => {
      vi.mocked(store.describe).mockResolvedValue({
        schema: 'specification',
        metadata: {},
        sections: [],
      });

      const result = await routeToolCall(
        'sidechain_describe',
        { path: 'sc_g_123/spec' },
        store
      );

      expect(store.describe).toHaveBeenCalledWith('sc_g_123/spec');
      expect(result).toEqual({
        ok: true,
        schema: 'specification',
        metadata: {},
        sections: [],
      });
    });

    test('throws error when neither schema nor path provided', async () => {
      await expect(
        routeToolCall('sidechain_describe', {}, store)
      ).rejects.toThrow('Missing required argument: schema or path');
    });
  });

  describe('sidechain_validate', () => {
    test('routes to store.validate(path)', async () => {
      vi.mocked(store.validate).mockResolvedValue({
        valid: true,
        errors: [],
      });

      const result = await routeToolCall(
        'sidechain_validate',
        { path: 'sc_g_123/spec' },
        store
      );

      expect(store.validate).toHaveBeenCalledWith('sc_g_123/spec');
      expect(result).toEqual({ ok: true, valid: true, errors: [] });
    });
  });

  describe('Error handling', () => {
    test('throws error for unknown tool name [EC-13]', async () => {
      await expect(
        routeToolCall('sidechain_unknown', {}, store)
      ).rejects.toThrow('Unknown tool: sidechain_unknown');
    });

    test('throws error for missing required string argument [EC-14]', async () => {
      await expect(
        routeToolCall('sidechain_section', { path: 'sc_g_123/spec' }, store)
      ).rejects.toThrow('Missing required argument: section');
    });

    test('throws error for invalid argument type with (must be object) suffix [EC-15]', async () => {
      await expect(
        routeToolCall(
          'sidechain_item_add',
          { path: 'sc_g_123/plan', section: 'phase-1', data: 'invalid-string' },
          store
        )
      ).rejects.toThrow('Missing required argument: data (must be object)');
    });
  });
});
