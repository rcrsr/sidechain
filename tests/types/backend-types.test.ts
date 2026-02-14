/**
 * Test: Type definitions for Backend interface with GroupMeta
 * Covers: IR-1, IR-2, IC-1
 */

import { describe, expect, it } from 'vitest';
import type {
  Backend,
  GroupMeta,
  SlotDef,
} from '../../src/backends/interface.js';

describe('Backend Type Definitions', () => {
  it('IR-1: Backend.createGroup accepts GroupMeta parameter', () => {
    // Type check: this should compile without errors
    const mockBackend: Backend = {
      async createGroup(
        resolvedPath: string,
        slots: SlotDef[],
        meta: GroupMeta
      ): Promise<void> {
        expect(typeof resolvedPath).toBe('string');
        expect(Array.isArray(slots)).toBe(true);
        expect(typeof meta.schema).toBe('string');
        expect(meta.name === null || typeof meta.name === 'string').toBe(true);
        expect(typeof meta.client).toBe('string');
        expect(typeof meta.created).toBe('string');
      },
      async readGroupMeta(resolvedPath: string): Promise<GroupMeta> {
        return {
          schema: 'test-schema',
          name: null,
          client: 'test-client',
          created: '2026-02-14T00:00:00Z',
        };
      },
      async deleteGroup(): Promise<void> {},
      async listGroups(): Promise<Array<{ id: string; schema: string }>> {
        return [];
      },
      async readNode(): Promise<{
        metadata: Record<string, unknown>;
        sections: Record<string, string>;
      }> {
        return { metadata: {}, sections: {} };
      },
      async writeNode(): Promise<void> {},
      async exists(): Promise<boolean> {
        return false;
      },
    };

    expect(mockBackend).toBeDefined();
  });

  it('IR-2: Backend.readGroupMeta returns GroupMeta', () => {
    // Type check: GroupMeta structure
    const meta: GroupMeta = {
      schema: 'initiative',
      name: 'user-auth',
      client: 'test-client',
      created: '2026-02-14T00:00:00Z',
    };

    expect(meta.schema).toBe('initiative');
    expect(meta.name).toBe('user-auth');
    expect(meta.client).toBe('test-client');
    expect(meta.created).toBe('2026-02-14T00:00:00Z');
  });

  it('IC-1: GroupMeta exports correctly from types/backend.ts', () => {
    // Type check: GroupMeta is properly exported
    const metaWithNull: GroupMeta = {
      schema: 'initiative',
      name: null,
      client: 'test-client',
      created: '2026-02-14T00:00:00Z',
    };

    expect(metaWithNull.name).toBe(null);
  });

  it('GroupMeta allows null name field', () => {
    // Type check: name can be null or string
    const withNull: GroupMeta = {
      schema: 'test',
      name: null,
      client: 'test',
      created: '2026-02-14',
    };

    const withString: GroupMeta = {
      schema: 'test',
      name: 'test-name',
      client: 'test',
      created: '2026-02-14',
    };

    expect(withNull.name).toBe(null);
    expect(withString.name).toBe('test-name');
  });
});
