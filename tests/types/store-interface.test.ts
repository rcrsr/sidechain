/**
 * Type-level tests for Store interface
 * Covered: IR-3, IC-4
 *
 * These tests verify that the Store interface accepts the correct signatures.
 * They are compilation tests - if TypeScript compiles them, the types are correct.
 */

import { describe, expect, it } from 'vitest';
import type { Store, GroupResult } from '../../src/types/store.js';

describe('Store Interface Type Signatures', () => {
  // IR-3: createGroup accepts opts parameter with client and optional name
  it('createGroup accepts schemaId only (backward compatibility)', () => {
    const mockStore: Store = {
      createGroup: async (
        schemaId: string,
        opts?: { client: string; name?: string }
      ) => {
        return { address: 'sc_g_test', schema: schemaId };
      },
    } as Store;

    // This should compile - opts is optional
    const result: Promise<GroupResult> = mockStore.createGroup('test-schema');
    expect(result).toBeDefined();
  });

  // IC-4: Store interface signature accepts optional opts
  it('createGroup accepts opts with client', () => {
    const mockStore: Store = {
      createGroup: async (
        schemaId: string,
        opts?: { client: string; name?: string }
      ) => {
        return { address: 'sc_g_test', schema: schemaId };
      },
    } as Store;

    // This should compile - client is provided
    const result: Promise<GroupResult> = mockStore.createGroup('test-schema', {
      client: 'test-client',
    });
    expect(result).toBeDefined();
  });

  // IC-4: Store interface signature accepts optional opts with both client and name
  it('createGroup accepts opts with client and name', () => {
    const mockStore: Store = {
      createGroup: async (
        schemaId: string,
        opts?: { client: string; name?: string }
      ) => {
        return { address: 'sc_g_test', schema: schemaId };
      },
    } as Store;

    // This should compile - both client and name provided
    const result: Promise<GroupResult> = mockStore.createGroup('test-schema', {
      client: 'test-client',
      name: 'my-group',
    });
    expect(result).toBeDefined();
  });

  // IC-4: Store interface signature accepts opts with client and undefined name
  it('createGroup accepts opts with client and undefined name', () => {
    const mockStore: Store = {
      createGroup: async (
        schemaId: string,
        opts?: { client: string; name?: string }
      ) => {
        return { address: 'sc_g_test', schema: schemaId };
      },
    } as Store;

    // This should compile - name can be explicitly undefined
    const result: Promise<GroupResult> = mockStore.createGroup('test-schema', {
      client: 'test-client',
      name: undefined,
    });
    expect(result).toBeDefined();
  });

  it('GroupResult has correct shape', () => {
    const result: GroupResult = {
      address: 'sc_g_7f3a9c2e',
      schema: 'test-schema',
    };

    expect(result.address).toBe('sc_g_7f3a9c2e');
    expect(result.schema).toBe('test-schema');
  });
});
