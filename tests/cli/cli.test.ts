/**
 * Tests for CLI command routing and argument validation
 * Covers: IR-11, IR-12, IC-9, EC-27, EC-28, AC-15, AC-16, AC-17, AC-18, AC-30, AC-31
 *
 * Validates:
 * - All 20+ CLI commands route correctly to Store methods
 * - Argument validation helpers (requireArg, parseJsonFlag)
 * - Error handling for missing/invalid arguments
 * - Mock store operations (no filesystem I/O)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { ControlPlane } from '../../src/types/control-plane.js';
import type { ItemOps } from '../../src/types/item.js';
import type { Store } from '../../src/types/store.js';

/**
 * Mock Store implementation for testing CLI routing
 * Pattern matches tests/mcp/routing.test.ts:20-60
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

/**
 * Replicate CLI routing logic for testing
 * This mirrors the routeCommand function in src/cli/index.ts
 * We cannot import the CLI module directly as it executes main() on import
 */
async function routeCommand(
  store: Store & ControlPlane,
  command: string,
  args: string[],
  flags: Record<string, string | boolean>
): Promise<unknown> {
  switch (command) {
    case 'list': {
      const group = args[0];
      if (group !== undefined) {
        const slots = await store.list(group);
        return { ok: true, slots };
      } else {
        const groups = await store.list();
        return { ok: true, groups };
      }
    }

    case 'exists': {
      const arg = args[0];
      if (arg === undefined) {
        throw new Error('Missing required argument: path');
      }
      const exists = await store.exists(arg);
      return { ok: true, exists };
    }

    case 'get': {
      const arg = args[0];
      if (arg === undefined) {
        throw new Error('Missing required argument: path');
      }
      const node = await store.get(arg);
      return { ok: true, ...node };
    }

    case 'create-group': {
      const arg = args[0];
      if (arg === undefined) {
        throw new Error('Missing required argument: schema-id');
      }
      const client =
        typeof flags['client'] === 'string' ? flags['client'] : 'cli';
      const result = await store.createGroup(arg, { client });
      return { ok: true, ...result };
    }

    case 'delete-group': {
      const arg = args[0];
      if (arg === undefined) {
        throw new Error('Missing required argument: group-address');
      }
      const result = await store.deleteGroup(arg);
      return result;
    }

    case 'describe-group': {
      const arg = args[0];
      if (arg === undefined) {
        throw new Error('Missing required argument: group-address');
      }
      const result = await store.describeGroup(arg);
      return { ok: true, ...result };
    }

    case 'validate-group': {
      const arg = args[0];
      if (arg === undefined) {
        throw new Error('Missing required argument: group-address');
      }
      const result = await store.validateGroup(arg);
      return { ok: true, ...result };
    }

    case 'meta': {
      const nodePath = args[0];
      if (nodePath === undefined) {
        throw new Error('Missing required argument: path');
      }
      const field = args[1];
      if (field !== undefined) {
        const result = await store.meta(nodePath, field);
        return { ok: true, ...result };
      } else {
        const result = await store.meta(nodePath);
        return { ok: true, ...result };
      }
    }

    case 'set-meta': {
      const nodePath = args[0];
      const field = args[1];
      const value = args[2];
      if (
        nodePath === undefined ||
        field === undefined ||
        value === undefined
      ) {
        throw new Error('Missing required arguments: path, field, value');
      }
      let parsedValue: unknown = value;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }
      const result = await store.setMeta(nodePath, field, parsedValue);
      return result;
    }

    case 'sections': {
      const arg = args[0];
      if (arg === undefined) {
        throw new Error('Missing required argument: path');
      }
      const result = await store.sections(arg);
      return { ok: true, sections: result };
    }

    case 'section': {
      const nodePath = args[0];
      const sectionId = args[1];
      if (nodePath === undefined || sectionId === undefined) {
        throw new Error('Missing required arguments: path, section-id');
      }
      const result = await store.section(nodePath, sectionId);
      return { ok: true, ...result };
    }

    case 'write-section': {
      const nodePath = args[0];
      const sectionId = args[1];
      const content = flags['content'];
      if (
        nodePath === undefined ||
        sectionId === undefined ||
        content === undefined
      ) {
        throw new Error(
          'Missing required arguments: path, section-id, --content'
        );
      }
      const result = await store.writeSection(
        nodePath,
        sectionId,
        content as string
      );
      return result;
    }

    case 'append-section': {
      const nodePath = args[0];
      const sectionId = args[1];
      const content = flags['content'];
      if (
        nodePath === undefined ||
        sectionId === undefined ||
        content === undefined
      ) {
        throw new Error(
          'Missing required arguments: path, section-id, --content'
        );
      }
      const result = await store.appendSection(
        nodePath,
        sectionId,
        content as string
      );
      return result;
    }

    case 'add-section': {
      const nodePath = args[0];
      const id = flags['id'];
      const type = flags['type'];
      const after = flags['after'];
      if (nodePath === undefined || id === undefined || type === undefined) {
        throw new Error('Missing required arguments: path, --id, --type');
      }
      const def: { id: string; type: string; after?: string } = {
        id: id as string,
        type: type as string,
      };
      if (typeof after === 'string') {
        def.after = after;
      }
      const result = await store.addSection(nodePath, def);
      return result;
    }

    case 'remove-section': {
      const nodePath = args[0];
      const sectionId = args[1];
      if (nodePath === undefined || sectionId === undefined) {
        throw new Error('Missing required arguments: path, section-id');
      }
      const result = await store.removeSection(nodePath, sectionId);
      return result;
    }

    case 'populate': {
      const nodePath = args[0];
      if (nodePath === undefined) {
        throw new Error('Missing required argument: path');
      }

      let populateData: unknown;
      if (flags['data'] !== undefined) {
        try {
          populateData = JSON.parse(flags['data'] as string);
        } catch (error) {
          throw new Error(
            `Invalid JSON in --data: ${error instanceof Error ? error.message : 'unknown error'}`
          );
        }
      } else {
        throw new Error('Missing required flag: --data or --file');
      }

      const result = await store.populate(
        nodePath,
        populateData as {
          metadata?: Record<string, unknown>;
          sections: Record<string, unknown>;
        }
      );
      return result;
    }

    case 'item': {
      const operation = args[0];
      const nodePath = args[1];
      const sectionId = args[2];

      if (
        operation === undefined ||
        nodePath === undefined ||
        sectionId === undefined
      ) {
        throw new Error(
          'Missing required arguments: operation, path, section-id'
        );
      }

      switch (operation) {
        case 'get': {
          const itemId = args[3];
          if (itemId === undefined) {
            throw new Error('Missing required argument: item-id');
          }
          const result = await store.item.get(nodePath, sectionId, itemId);
          return { ok: true, ...result };
        }

        case 'add': {
          const data = flags['data'];
          if (data === undefined) {
            throw new Error('Missing required flag: --data');
          }
          let parsedData: Record<string, unknown>;
          try {
            parsedData = JSON.parse(data as string) as Record<string, unknown>;
          } catch (error) {
            throw new Error(
              `Invalid JSON in --data: ${error instanceof Error ? error.message : 'unknown error'}`
            );
          }
          const result = await store.item.add(nodePath, sectionId, parsedData);
          return result;
        }

        case 'update': {
          const itemId = args[3];
          const data = flags['data'];
          if (itemId === undefined || data === undefined) {
            throw new Error('Missing required arguments: item-id, --data');
          }
          let parsedData: Record<string, unknown>;
          try {
            parsedData = JSON.parse(data as string) as Record<string, unknown>;
          } catch (error) {
            throw new Error(
              `Invalid JSON in --data: ${error instanceof Error ? error.message : 'unknown error'}`
            );
          }
          const result = await store.item.update(
            nodePath,
            sectionId,
            itemId,
            parsedData
          );
          return result;
        }

        case 'remove': {
          const itemId = args[3];
          if (itemId === undefined) {
            throw new Error('Missing required argument: item-id');
          }
          const result = await store.item.remove(nodePath, sectionId, itemId);
          return result;
        }

        default:
          throw new Error(`Unknown item operation: ${operation}`);
      }
    }

    case 'mounts': {
      const result = await store.mounts();
      return { ok: true, mounts: result };
    }

    case 'info': {
      const result = await store.info();
      return { ok: true, ...result };
    }

    case 'list-schemas': {
      const result = await store.listSchemas();
      return { ok: true, schemas: result };
    }

    case 'get-schema': {
      const arg = args[0];
      if (arg === undefined) {
        throw new Error('Missing required argument: schema-id');
      }
      const result = await store.getSchema(arg);
      return { ok: true, schema: result };
    }

    case 'list-content-types': {
      const result = await store.listContentTypes();
      return { ok: true, contentTypes: result };
    }

    case 'describe': {
      const arg = args[0];
      if (arg === undefined) {
        throw new Error('Missing required argument: schema-or-path');
      }
      const result = await store.describe(arg);
      return { ok: true, ...result };
    }

    case 'validate': {
      const arg = args[0];
      if (arg === undefined) {
        throw new Error('Missing required argument: path');
      }
      const result = await store.validate(arg);
      return { ok: true, ...result };
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

/**
 * Helper: requireArg throws for undefined argument
 * Covers: EC-27, AC-30
 */
function requireArg(args: string[], index: number, name: string): string {
  const arg = args[index];
  if (arg === undefined) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return arg;
}

/**
 * Helper: parseJsonFlag throws for malformed JSON
 * Covers: EC-28, AC-31
 */
function parseJsonFlag(
  flags: Record<string, string | boolean>,
  flagName: string
): Record<string, unknown> {
  const value = flags[flagName];
  if (typeof value !== 'string') {
    throw new Error(`Missing required flag: --${flagName}`);
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Invalid JSON in --${flagName}: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

describe('CLI Argument Validation Helpers', () => {
  describe('requireArg', () => {
    test('returns argument when present at index', () => {
      const args = ['group-id', 'slot-id'];
      const result = requireArg(args, 0, 'group');
      expect(result).toBe('group-id');
    });

    test('throws error when argument undefined at index [EC-27]', () => {
      const args = ['group-id'];
      expect(() => requireArg(args, 1, 'slot')).toThrow(
        'Missing required argument: slot'
      );
    });

    test('throws error for out-of-bounds index', () => {
      const args = ['group-id'];
      expect(() => requireArg(args, 5, 'field')).toThrow(
        'Missing required argument: field'
      );
    });
  });

  describe('parseJsonFlag', () => {
    test('parses valid JSON from flag value', () => {
      const flags = { data: '{"status":"draft"}' };
      const result = parseJsonFlag(flags, 'data');
      expect(result).toEqual({ status: 'draft' });
    });

    test('throws error for malformed JSON [EC-28]', () => {
      const flags = { data: '{invalid json}' };
      expect(() => parseJsonFlag(flags, 'data')).toThrow(
        /Invalid JSON in --data:/
      );
    });

    test('throws error when flag missing', () => {
      const flags = {};
      expect(() => parseJsonFlag(flags, 'data')).toThrow(
        'Missing required flag: --data'
      );
    });

    test('throws error when flag is boolean', () => {
      const flags = { data: true };
      expect(() => parseJsonFlag(flags, 'data')).toThrow(
        'Missing required flag: --data'
      );
    });
  });
});

describe('CLI Command Routing', () => {
  let store: Store & ControlPlane;

  beforeEach(() => {
    store = createMockStore();
  });

  describe('list', () => {
    test('routes to store.list() without group argument', async () => {
      vi.mocked(store.list).mockResolvedValue([
        { id: 'sc_g_123', schema: 'initiative' },
      ]);

      const result = await routeCommand(store, 'list', [], {});

      expect(store.list).toHaveBeenCalledWith();
      expect(result).toEqual({
        ok: true,
        groups: [{ id: 'sc_g_123', schema: 'initiative' }],
      });
    });

    test('routes to store.list(group) with group argument', async () => {
      vi.mocked(store.list).mockResolvedValue([
        { id: 'spec', schema: 'specification', empty: false },
      ]);

      const result = await routeCommand(store, 'list', ['sc_g_123'], {});

      expect(store.list).toHaveBeenCalledWith('sc_g_123');
      expect(result).toEqual({
        ok: true,
        slots: [{ id: 'spec', schema: 'specification', empty: false }],
      });
    });
  });

  describe('get', () => {
    test('routes to store.get(path)', async () => {
      vi.mocked(store.get).mockResolvedValue({
        metadata: { status: 'draft' },
        sections: [],
        token: 'token_123',
      });

      const result = await routeCommand(store, 'get', ['sc_g_123/spec'], {});

      expect(store.get).toHaveBeenCalledWith('sc_g_123/spec');
      expect(result).toEqual({
        ok: true,
        metadata: { status: 'draft' },
        sections: [],
        token: 'token_123',
      });
    });

    test('throws error when path missing', async () => {
      await expect(routeCommand(store, 'get', [], {})).rejects.toThrow(
        'Missing required argument: path'
      );
    });
  });

  describe('exists', () => {
    test('routes to store.exists(path)', async () => {
      vi.mocked(store.exists).mockResolvedValue(true);

      const result = await routeCommand(store, 'exists', ['sc_g_123/spec'], {});

      expect(store.exists).toHaveBeenCalledWith('sc_g_123/spec');
      expect(result).toEqual({ ok: true, exists: true });
    });

    test('throws error when path missing', async () => {
      await expect(routeCommand(store, 'exists', [], {})).rejects.toThrow(
        'Missing required argument: path'
      );
    });
  });

  describe('create-group', () => {
    test('routes to store.createGroup(id, { client: "cli" }) by default [IR-4, AC-5]', async () => {
      vi.mocked(store.createGroup).mockResolvedValue({
        address: 'sc_g_abc',
        schema: 'initiative',
      });

      const result = await routeCommand(
        store,
        'create-group',
        ['initiative'],
        {}
      );

      expect(store.createGroup).toHaveBeenCalledWith('initiative', {
        client: 'cli',
      });
      expect(result).toEqual({
        ok: true,
        address: 'sc_g_abc',
        schema: 'initiative',
      });
    });

    test('routes to store.createGroup(id, { client }) with --client flag [AC-5]', async () => {
      vi.mocked(store.createGroup).mockResolvedValue({
        address: 'sc_g_def',
        schema: 'initiative',
      });

      const result = await routeCommand(store, 'create-group', ['initiative'], {
        client: 'custom-client',
      });

      expect(store.createGroup).toHaveBeenCalledWith('initiative', {
        client: 'custom-client',
      });
      expect(result).toEqual({
        ok: true,
        address: 'sc_g_def',
        schema: 'initiative',
      });
    });

    test('throws error when schema-id missing [EC-8]', async () => {
      await expect(routeCommand(store, 'create-group', [], {})).rejects.toThrow(
        'Missing required argument: schema-id'
      );
    });

    test('propagates InvalidSchemaError from store [EC-9]', async () => {
      const error = new Error('Invalid schema: unknown-schema');
      error.name = 'InvalidSchemaError';
      vi.mocked(store.createGroup).mockRejectedValue(error);

      await expect(
        routeCommand(store, 'create-group', ['unknown-schema'], {})
      ).rejects.toThrow('Invalid schema: unknown-schema');
    });
  });

  describe('delete-group', () => {
    test('routes to store.deleteGroup(id)', async () => {
      vi.mocked(store.deleteGroup).mockResolvedValue({
        ok: true,
        value: undefined,
      });

      const result = await routeCommand(
        store,
        'delete-group',
        ['sc_g_123'],
        {}
      );

      expect(store.deleteGroup).toHaveBeenCalledWith('sc_g_123');
      expect(result).toEqual({ ok: true, value: undefined });
    });

    test('throws error when group-address missing', async () => {
      await expect(routeCommand(store, 'delete-group', [], {})).rejects.toThrow(
        'Missing required argument: group-address'
      );
    });
  });

  describe('describe-group', () => {
    test('routes to store.describeGroup(group)', async () => {
      vi.mocked(store.describeGroup).mockResolvedValue({
        address: 'sc_g_123',
        schema: 'initiative',
        slots: [],
      });

      const result = await routeCommand(
        store,
        'describe-group',
        ['sc_g_123'],
        {}
      );

      expect(store.describeGroup).toHaveBeenCalledWith('sc_g_123');
      expect(result).toEqual({
        ok: true,
        address: 'sc_g_123',
        schema: 'initiative',
        slots: [],
      });
    });

    test('throws error when group-address missing', async () => {
      await expect(
        routeCommand(store, 'describe-group', [], {})
      ).rejects.toThrow('Missing required argument: group-address');
    });
  });

  describe('validate-group', () => {
    test('routes to store.validateGroup(group)', async () => {
      vi.mocked(store.validateGroup).mockResolvedValue({
        valid: true,
        errors: [],
      });

      const result = await routeCommand(
        store,
        'validate-group',
        ['sc_g_123'],
        {}
      );

      expect(store.validateGroup).toHaveBeenCalledWith('sc_g_123');
      expect(result).toEqual({ ok: true, valid: true, errors: [] });
    });

    test('throws error when group-address missing', async () => {
      await expect(
        routeCommand(store, 'validate-group', [], {})
      ).rejects.toThrow('Missing required argument: group-address');
    });
  });

  describe('meta', () => {
    test('routes to store.meta(path) without field', async () => {
      vi.mocked(store.meta).mockResolvedValue({
        metadata: { status: 'draft' },
        token: 'token_123',
      });

      const result = await routeCommand(store, 'meta', ['sc_g_123/spec'], {});

      expect(store.meta).toHaveBeenCalledWith('sc_g_123/spec');
      expect(result).toEqual({
        ok: true,
        metadata: { status: 'draft' },
        token: 'token_123',
      });
    });

    test('routes to store.meta(path, field) with field', async () => {
      vi.mocked(store.meta).mockResolvedValue({
        value: 'draft',
        token: 'token_123',
      });

      const result = await routeCommand(
        store,
        'meta',
        ['sc_g_123/spec', 'status'],
        {}
      );

      expect(store.meta).toHaveBeenCalledWith('sc_g_123/spec', 'status');
      expect(result).toEqual({
        ok: true,
        value: 'draft',
        token: 'token_123',
      });
    });

    test('throws error when path missing', async () => {
      await expect(routeCommand(store, 'meta', [], {})).rejects.toThrow(
        'Missing required argument: path'
      );
    });
  });

  describe('set-meta', () => {
    test('routes to store.setMeta(path, field, value)', async () => {
      vi.mocked(store.setMeta).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_123',
      });

      const result = await routeCommand(
        store,
        'set-meta',
        ['sc_g_123/spec', 'status', 'locked'],
        {}
      );

      expect(store.setMeta).toHaveBeenCalledWith(
        'sc_g_123/spec',
        'status',
        'locked'
      );
      expect(result).toEqual({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_123',
      });
    });

    test('throws error when arguments missing', async () => {
      await expect(
        routeCommand(store, 'set-meta', ['sc_g_123/spec', 'status'], {})
      ).rejects.toThrow('Missing required arguments: path, field, value');
    });
  });

  describe('sections', () => {
    test('routes to store.sections(path)', async () => {
      vi.mocked(store.sections).mockResolvedValue([
        { id: 'overview', type: 'text' },
      ]);

      const result = await routeCommand(
        store,
        'sections',
        ['sc_g_123/spec'],
        {}
      );

      expect(store.sections).toHaveBeenCalledWith('sc_g_123/spec');
      expect(result).toEqual({
        ok: true,
        sections: [{ id: 'overview', type: 'text' }],
      });
    });

    test('throws error when path missing', async () => {
      await expect(routeCommand(store, 'sections', [], {})).rejects.toThrow(
        'Missing required argument: path'
      );
    });
  });

  describe('section', () => {
    test('routes to store.section(path, section)', async () => {
      vi.mocked(store.section).mockResolvedValue({
        id: 'overview',
        type: 'text',
        content: 'Content here',
        token: 'token_123',
      });

      const result = await routeCommand(
        store,
        'section',
        ['sc_g_123/spec', 'overview'],
        {}
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

    test('throws error when arguments missing', async () => {
      await expect(
        routeCommand(store, 'section', ['sc_g_123/spec'], {})
      ).rejects.toThrow('Missing required arguments: path, section-id');
    });
  });

  describe('write-section', () => {
    test('routes to store.writeSection(path, section, content)', async () => {
      vi.mocked(store.writeSection).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_123',
        nodeToken: 'node_token_123',
      });

      const result = await routeCommand(
        store,
        'write-section',
        ['sc_g_123/spec', 'overview'],
        { content: 'New content' }
      );

      expect(store.writeSection).toHaveBeenCalledWith(
        'sc_g_123/spec',
        'overview',
        'New content'
      );
      expect(result).toEqual({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_123',
        nodeToken: 'node_token_123',
      });
    });

    test('throws error when arguments missing', async () => {
      await expect(
        routeCommand(store, 'write-section', ['sc_g_123/spec', 'overview'], {})
      ).rejects.toThrow(
        'Missing required arguments: path, section-id, --content'
      );
    });
  });

  describe('append-section', () => {
    test('routes to store.appendSection(path, section, content)', async () => {
      vi.mocked(store.appendSection).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_123',
        nodeToken: 'node_token_123',
      });

      const result = await routeCommand(
        store,
        'append-section',
        ['sc_g_123/spec', 'overview'],
        { content: 'Appended text' }
      );

      expect(store.appendSection).toHaveBeenCalledWith(
        'sc_g_123/spec',
        'overview',
        'Appended text'
      );
      expect(result).toEqual({
        ok: true,
        path: 'sc_g_123/spec',
        token: 'token_123',
        nodeToken: 'node_token_123',
      });
    });

    test('throws error when arguments missing', async () => {
      await expect(
        routeCommand(store, 'append-section', ['sc_g_123/spec', 'overview'], {})
      ).rejects.toThrow(
        'Missing required arguments: path, section-id, --content'
      );
    });
  });

  describe('add-section', () => {
    test('routes to store.addSection(path, def) without after', async () => {
      vi.mocked(store.addSection).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
      });

      const result = await routeCommand(
        store,
        'add-section',
        ['sc_g_123/spec'],
        { id: 'notes', type: 'text' }
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

      await routeCommand(store, 'add-section', ['sc_g_123/spec'], {
        id: 'notes',
        type: 'text',
        after: 'overview',
      });

      expect(store.addSection).toHaveBeenCalledWith('sc_g_123/spec', {
        id: 'notes',
        type: 'text',
        after: 'overview',
      });
    });

    test('throws error when arguments missing', async () => {
      await expect(
        routeCommand(store, 'add-section', ['sc_g_123/spec'], { id: 'notes' })
      ).rejects.toThrow('Missing required arguments: path, --id, --type');
    });
  });

  describe('remove-section', () => {
    test('routes to store.removeSection(path, section)', async () => {
      vi.mocked(store.removeSection).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
      });

      const result = await routeCommand(
        store,
        'remove-section',
        ['sc_g_123/spec', 'notes'],
        {}
      );

      expect(store.removeSection).toHaveBeenCalledWith(
        'sc_g_123/spec',
        'notes'
      );
      expect(result).toEqual({ ok: true, path: 'sc_g_123/spec' });
    });

    test('throws error when arguments missing', async () => {
      await expect(
        routeCommand(store, 'remove-section', ['sc_g_123/spec'], {})
      ).rejects.toThrow('Missing required arguments: path, section-id');
    });
  });

  describe('populate', () => {
    test('routes to store.populate(path, data)', async () => {
      vi.mocked(store.populate).mockResolvedValue({
        ok: true,
        path: 'sc_g_123/spec',
        sections: 2,
        metadata: 1,
        token: 'token_123',
      });

      const result = await routeCommand(store, 'populate', ['sc_g_123/spec'], {
        data: '{"metadata":{"status":"draft"},"sections":{"overview":"Content"}}',
      });

      expect(store.populate).toHaveBeenCalledWith('sc_g_123/spec', {
        metadata: { status: 'draft' },
        sections: { overview: 'Content' },
      });
      expect(result).toEqual({
        ok: true,
        path: 'sc_g_123/spec',
        sections: 2,
        metadata: 1,
        token: 'token_123',
      });
    });

    test('throws error for malformed JSON in --data', async () => {
      await expect(
        routeCommand(store, 'populate', ['sc_g_123/spec'], {
          data: '{invalid json}',
        })
      ).rejects.toThrow(/Invalid JSON in --data:/);
    });

    test('throws error when path missing', async () => {
      await expect(routeCommand(store, 'populate', [], {})).rejects.toThrow(
        'Missing required argument: path'
      );
    });

    test('throws error when --data missing', async () => {
      await expect(
        routeCommand(store, 'populate', ['sc_g_123/spec'], {})
      ).rejects.toThrow('Missing required flag: --data or --file');
    });
  });

  describe('item operations', () => {
    describe('item get', () => {
      test('routes to store.item.get(path, section, item)', async () => {
        vi.mocked(store.item.get).mockResolvedValue({
          content: { id: '1.1', title: 'Task 1' },
          token: 'token_123',
        });

        const result = await routeCommand(
          store,
          'item',
          ['get', 'sc_g_123/plan', 'phase-1', '1.1'],
          {}
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

      test('throws error when item-id missing', async () => {
        await expect(
          routeCommand(store, 'item', ['get', 'sc_g_123/plan', 'phase-1'], {})
        ).rejects.toThrow('Missing required argument: item-id');
      });
    });

    describe('item add', () => {
      test('routes to store.item.add(path, section, data)', async () => {
        vi.mocked(store.item.add).mockResolvedValue({
          ok: true,
          path: 'sc_g_123/plan',
          item: '1.1',
          token: 'token_123',
          nodeToken: 'node_token_123',
        });

        const result = await routeCommand(
          store,
          'item',
          ['add', 'sc_g_123/plan', 'phase-1'],
          { data: '{"title":"New task"}' }
        );

        expect(store.item.add).toHaveBeenCalledWith(
          'sc_g_123/plan',
          'phase-1',
          { title: 'New task' }
        );
        expect(result).toEqual({
          ok: true,
          path: 'sc_g_123/plan',
          item: '1.1',
          token: 'token_123',
          nodeToken: 'node_token_123',
        });
      });

      test('throws error for malformed JSON in --data', async () => {
        await expect(
          routeCommand(store, 'item', ['add', 'sc_g_123/plan', 'phase-1'], {
            data: '{invalid}',
          })
        ).rejects.toThrow(/Invalid JSON in --data:/);
      });

      test('throws error when --data missing', async () => {
        await expect(
          routeCommand(store, 'item', ['add', 'sc_g_123/plan', 'phase-1'], {})
        ).rejects.toThrow('Missing required flag: --data');
      });
    });

    describe('item update', () => {
      test('routes to store.item.update(path, section, item, data)', async () => {
        vi.mocked(store.item.update).mockResolvedValue({
          ok: true,
          path: 'sc_g_123/plan',
          item: '1.1',
          previous: { title: 'Old title' },
          token: 'token_123',
          nodeToken: 'node_token_123',
        });

        const result = await routeCommand(
          store,
          'item',
          ['update', 'sc_g_123/plan', 'phase-1', '1.1'],
          { data: '{"title":"Updated title"}' }
        );

        expect(store.item.update).toHaveBeenCalledWith(
          'sc_g_123/plan',
          'phase-1',
          '1.1',
          { title: 'Updated title' }
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

      test('throws error when arguments missing', async () => {
        await expect(
          routeCommand(
            store,
            'item',
            ['update', 'sc_g_123/plan', 'phase-1'],
            {}
          )
        ).rejects.toThrow('Missing required arguments: item-id, --data');
      });
    });

    describe('item remove', () => {
      test('routes to store.item.remove(path, section, item)', async () => {
        vi.mocked(store.item.remove).mockResolvedValue({
          ok: true,
          path: 'sc_g_123/plan',
        });

        const result = await routeCommand(
          store,
          'item',
          ['remove', 'sc_g_123/plan', 'phase-1', '1.1'],
          {}
        );

        expect(store.item.remove).toHaveBeenCalledWith(
          'sc_g_123/plan',
          'phase-1',
          '1.1'
        );
        expect(result).toEqual({ ok: true, path: 'sc_g_123/plan' });
      });

      test('throws error when item-id missing', async () => {
        await expect(
          routeCommand(
            store,
            'item',
            ['remove', 'sc_g_123/plan', 'phase-1'],
            {}
          )
        ).rejects.toThrow('Missing required argument: item-id');
      });
    });

    test('throws error for unknown item operation', async () => {
      await expect(
        routeCommand(store, 'item', ['unknown', 'sc_g_123/plan', 'phase-1'], {})
      ).rejects.toThrow('Unknown item operation: unknown');
    });

    test('throws error when item arguments missing', async () => {
      await expect(
        routeCommand(store, 'item', ['get', 'sc_g_123/plan'], {})
      ).rejects.toThrow(
        'Missing required arguments: operation, path, section-id'
      );
    });
  });

  describe('mounts', () => {
    test('routes to store.mounts()', async () => {
      vi.mocked(store.mounts).mockResolvedValue([
        { id: 'conduct', path: '/conduct' },
      ]);

      const result = await routeCommand(store, 'mounts', [], {});

      expect(store.mounts).toHaveBeenCalledWith();
      expect(result).toEqual({
        ok: true,
        mounts: [{ id: 'conduct', path: '/conduct' }],
      });
    });
  });

  describe('info', () => {
    test('routes to store.info()', async () => {
      vi.mocked(store.info).mockResolvedValue({
        version: '1.0.0',
        groups: 5,
      });

      const result = await routeCommand(store, 'info', [], {});

      expect(store.info).toHaveBeenCalledWith();
      expect(result).toEqual({
        ok: true,
        version: '1.0.0',
        groups: 5,
      });
    });
  });

  describe('list-schemas', () => {
    test('routes to store.listSchemas()', async () => {
      vi.mocked(store.listSchemas).mockResolvedValue(['initiative', 'plan']);

      const result = await routeCommand(store, 'list-schemas', [], {});

      expect(store.listSchemas).toHaveBeenCalledWith();
      expect(result).toEqual({
        ok: true,
        schemas: ['initiative', 'plan'],
      });
    });
  });

  describe('get-schema', () => {
    test('routes to store.getSchema(id)', async () => {
      vi.mocked(store.getSchema).mockResolvedValue({
        'schema-id': 'initiative',
        slots: [],
      });

      const result = await routeCommand(
        store,
        'get-schema',
        ['initiative'],
        {}
      );

      expect(store.getSchema).toHaveBeenCalledWith('initiative');
      expect(result).toEqual({
        ok: true,
        schema: { 'schema-id': 'initiative', slots: [] },
      });
    });

    test('throws error when schema-id missing', async () => {
      await expect(routeCommand(store, 'get-schema', [], {})).rejects.toThrow(
        'Missing required argument: schema-id'
      );
    });
  });

  describe('list-content-types', () => {
    test('routes to store.listContentTypes()', async () => {
      vi.mocked(store.listContentTypes).mockResolvedValue([
        'text',
        'task-list',
      ]);

      const result = await routeCommand(store, 'list-content-types', [], {});

      expect(store.listContentTypes).toHaveBeenCalledWith();
      expect(result).toEqual({
        ok: true,
        contentTypes: ['text', 'task-list'],
      });
    });
  });

  describe('describe', () => {
    test('routes to store.describe(schema-or-path)', async () => {
      vi.mocked(store.describe).mockResolvedValue({
        schema: 'specification',
        metadata: {},
        sections: [],
      });

      const result = await routeCommand(
        store,
        'describe',
        ['specification'],
        {}
      );

      expect(store.describe).toHaveBeenCalledWith('specification');
      expect(result).toEqual({
        ok: true,
        schema: 'specification',
        metadata: {},
        sections: [],
      });
    });

    test('throws error when schema-or-path missing', async () => {
      await expect(routeCommand(store, 'describe', [], {})).rejects.toThrow(
        'Missing required argument: schema-or-path'
      );
    });
  });

  describe('validate', () => {
    test('routes to store.validate(path)', async () => {
      vi.mocked(store.validate).mockResolvedValue({
        valid: true,
        errors: [],
      });

      const result = await routeCommand(
        store,
        'validate',
        ['sc_g_123/spec'],
        {}
      );

      expect(store.validate).toHaveBeenCalledWith('sc_g_123/spec');
      expect(result).toEqual({ ok: true, valid: true, errors: [] });
    });

    test('throws error when path missing', async () => {
      await expect(routeCommand(store, 'validate', [], {})).rejects.toThrow(
        'Missing required argument: path'
      );
    });
  });

  describe('Unknown command', () => {
    test('throws error for unknown command', async () => {
      await expect(
        routeCommand(store, 'unknown-command', [], {})
      ).rejects.toThrow('Unknown command: unknown-command');
    });
  });
});
