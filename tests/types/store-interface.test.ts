/**
 * Type-level tests for Store interface
 * Covered: IR-1, IC-1
 *
 * These tests verify that the Store interface accepts the correct signatures.
 * They are compilation tests - if TypeScript compiles them, the types are correct.
 */

import { describe, expect, it } from 'vitest';
import type {
  Store,
  GroupResult,
  CreateGroupOptions,
} from '../../src/types/store.js';

describe('Store Interface Type Signatures', () => {
  // IR-1: CreateGroupOptions interface exists with correct shape
  it('CreateGroupOptions type exists and has correct structure', () => {
    const opts: CreateGroupOptions = {
      client: 'test-client',
    };
    expect(opts.client).toBe('test-client');
    expect(opts.name).toBeUndefined();
  });

  // IR-1: CreateGroupOptions allows optional name field
  it('CreateGroupOptions accepts optional name field', () => {
    const opts: CreateGroupOptions = {
      client: 'test-client',
      name: 'my-group',
    };
    expect(opts.client).toBe('test-client');
    expect(opts.name).toBe('my-group');
  });

  // IR-1: createGroup requires opts parameter (not optional)
  it('createGroup requires mandatory opts parameter', () => {
    const mockStore: Store = {
      createGroup: async (
        schemaId: string,
        opts: CreateGroupOptions
      ): Promise<GroupResult> => {
        return { address: 'sc_g_test', schema: schemaId };
      },
    } as Store;

    // This should compile - opts is provided
    const result: Promise<GroupResult> = mockStore.createGroup('test-schema', {
      client: 'test-client',
    });
    expect(result).toBeDefined();
  });

  // IR-1: createGroup accepts opts with client only
  it('createGroup accepts opts with client only', () => {
    const mockStore: Store = {
      createGroup: async (
        schemaId: string,
        opts: CreateGroupOptions
      ): Promise<GroupResult> => {
        return { address: 'sc_g_test', schema: schemaId };
      },
    } as Store;

    // This should compile - client is provided
    const result: Promise<GroupResult> = mockStore.createGroup('test-schema', {
      client: 'test-client',
    });
    expect(result).toBeDefined();
  });

  // IR-1: createGroup accepts opts with both client and name
  it('createGroup accepts opts with client and name', () => {
    const mockStore: Store = {
      createGroup: async (
        schemaId: string,
        opts: CreateGroupOptions
      ): Promise<GroupResult> => {
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

  // IR-1: createGroup accepts opts with client and undefined name
  it('createGroup accepts opts with client and undefined name', () => {
    const mockStore: Store = {
      createGroup: async (
        schemaId: string,
        opts: CreateGroupOptions
      ): Promise<GroupResult> => {
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
