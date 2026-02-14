/**
 * Tests for client implementation with name-to-address mapping
 * Covers: IR-31, IR-32, IR-33
 * EC-3, EC-4, EC-5
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Client } from '../../src/core/client.js';
import { MappingError, NameNotFoundError } from '../../src/core/errors.js';
import type {
  GroupResult,
  NodeResponse,
  Store,
} from '../../src/types/store.js';

// Minimal mock Store for Client unit tests
const mockStore: Store = {} as Store;

describe('Client', () => {
  let tempDir: string;
  let mappingPath: string;
  let client: Client;

  beforeEach(() => {
    // Create temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'client-test-'));
    mappingPath = path.join(tempDir, 'mappings.json');
    client = new Client({
      clientId: 'test-client',
      mappingPath,
      store: mockStore,
    });
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Constructor', () => {
    // IR-4: Client constructor accepts ClientOptions with clientId, mappingPath, store
    it('accepts ClientOptions with clientId, mappingPath, and store', () => {
      const testClient = new Client({
        clientId: 'my-client',
        mappingPath: path.join(tempDir, 'test-mappings.json'),
        store: mockStore,
      });

      expect(testClient).toBeInstanceOf(Client);
      expect(testClient.getClientId()).toBe('my-client');
      expect(testClient.getStore()).toBe(mockStore);
    });

    // IC-5: Client constructor compiles with new signature
    it('stores clientId and store fields', () => {
      const clientId = 'test-id-123';
      const testClient = new Client({
        clientId,
        mappingPath: path.join(tempDir, 'mappings.json'),
        store: mockStore,
      });

      expect(testClient.getClientId()).toBe(clientId);
      expect(testClient.getStore()).toBe(mockStore);
    });
  });

  describe('resolveAddress', () => {
    // IR-31: resolveAddress returns cryptographic address for known name
    it('resolves known name to address', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      const address = client.resolveAddress('user-auth');

      expect(address).toBe('sc_g_7f3a9c2e');
    });

    // IR-31: resolveAddress handles multiple mappings
    it('resolves multiple names independently', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');
      client.saveMapping('payment', 'sc_g_abc12345');

      const addr1 = client.resolveAddress('user-auth');
      const addr2 = client.resolveAddress('payment');

      expect(addr1).toBe('sc_g_7f3a9c2e');
      expect(addr2).toBe('sc_g_abc12345');
    });

    // EC-3: NAME_NOT_FOUND when name not in mappings
    it('throws NAME_NOT_FOUND for unknown name', () => {
      expect(() => client.resolveAddress('unknown')).toThrow(NameNotFoundError);
    });

    // EC-3: NAME_NOT_FOUND includes name in message
    it('includes name in error message', () => {
      expect(() => client.resolveAddress('unknown')).toThrow(
        'Name unknown not found in mappings'
      );
    });

    // EC-3: NAME_NOT_FOUND has correct error code
    it('uses NAME_NOT_FOUND error code', () => {
      try {
        client.resolveAddress('unknown');
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NameNotFoundError);
        expect((error as NameNotFoundError).code).toBe('NAME_NOT_FOUND');
      }
    });

    it('resolves name after restart (persistence)', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      // Create new client instance
      const client2 = new Client({
        clientId: 'test-client-2',
        mappingPath,
        store: mockStore,
      });
      const address = client2.resolveAddress('user-auth');

      expect(address).toBe('sc_g_7f3a9c2e');
    });
  });

  describe('saveMapping', () => {
    // IR-32: saveMapping persists name-address pair to file
    it('saves name-address mapping to file', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      const address = client.resolveAddress('user-auth');
      expect(address).toBe('sc_g_7f3a9c2e');
    });

    // IR-32: saveMapping creates file if missing
    it('creates mapping file if it does not exist', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      const exists = fs.existsSync(mappingPath);
      expect(exists).toBe(true);
    });

    // IR-32: saveMapping creates directory if missing
    it('creates parent directory if missing', () => {
      const deepPath = path.join(tempDir, 'nested', 'deep', 'mappings.json');
      const deepClient = new Client({
        clientId: 'deep-client',
        mappingPath: deepPath,
        store: mockStore,
      });

      deepClient.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      const exists = fs.existsSync(deepPath);
      expect(exists).toBe(true);
    });

    // IR-32: saveMapping with duplicate name + same address is idempotent
    it('is idempotent for same name and address', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      const address = client.resolveAddress('user-auth');
      expect(address).toBe('sc_g_7f3a9c2e');
    });

    // EC-4: MAPPING_ERROR when name already mapped to different address
    it('throws MAPPING_ERROR for name conflict', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      expect(() => client.saveMapping('user-auth', 'sc_g_different')).toThrow(
        MappingError
      );
    });

    // EC-4: MAPPING_ERROR includes name in conflict message
    it('includes name in conflict error message', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      expect(() => client.saveMapping('user-auth', 'sc_g_different')).toThrow(
        'Name user-auth already mapped to different address'
      );
    });

    // EC-4: MAPPING_ERROR has correct error code
    it('uses MAPPING_ERROR error code for conflict', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      try {
        client.saveMapping('user-auth', 'sc_g_different');
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MappingError);
        expect((error as MappingError).code).toBe('MAPPING_ERROR');
      }
    });

    // IR-32: saveMapping stores created timestamp
    it('stores created timestamp with mapping', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      const mappings = client.loadMappings();
      expect(mappings['user-auth']?.created).toBeDefined();
      expect(mappings['user-auth']?.created).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
    });

    // EC-4: MAPPING_ERROR when file unwritable
    it('throws MAPPING_ERROR when file unwritable', () => {
      // Detect WSL or Windows where chmod may not be honored
      const isWslOrWindows =
        process.platform === 'win32' ||
        (process.platform === 'linux' &&
          fs.existsSync('/proc/version') &&
          fs
            .readFileSync('/proc/version', 'utf-8')
            .toLowerCase()
            .includes('microsoft'));

      if (isWslOrWindows) {
        // Skip on platforms without permission enforcement
        return;
      }

      // Write initial file
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      // Make file read-only
      fs.chmodSync(mappingPath, 0o444);

      try {
        expect(() => client.saveMapping('payment', 'sc_g_abc123')).toThrow(
          MappingError
        );
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(mappingPath, 0o644);
      }
    });

    it('uses atomic write with temp file', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      // Verify no temp files left behind
      const files = fs.readdirSync(tempDir);
      expect(files.filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
    });

    it('saves multiple mappings', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');
      client.saveMapping('payment', 'sc_g_abc123');
      client.saveMapping('inventory', 'sc_g_def456');

      const mappings = client.loadMappings();
      expect(Object.keys(mappings)).toHaveLength(3);
      expect(mappings['user-auth']?.address).toBe('sc_g_7f3a9c2e');
      expect(mappings['payment']?.address).toBe('sc_g_abc123');
      expect(mappings['inventory']?.address).toBe('sc_g_def456');
    });
  });

  describe('loadMappings', () => {
    // IR-33: loadMappings returns all stored mappings
    it('returns all stored mappings', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');
      client.saveMapping('payment', 'sc_g_abc123');

      const mappings = client.loadMappings();

      expect(mappings).toEqual({
        'user-auth': {
          address: 'sc_g_7f3a9c2e',
          created: expect.any(String),
        },
        payment: {
          address: 'sc_g_abc123',
          created: expect.any(String),
        },
      });
    });

    // IR-33: loadMappings returns Record<string, MappingEntry>
    it('returns correct structure with address and created', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      const mappings = client.loadMappings();

      expect(mappings['user-auth']).toHaveProperty('address');
      expect(mappings['user-auth']).toHaveProperty('created');
      expect(typeof mappings['user-auth']?.address).toBe('string');
      expect(typeof mappings['user-auth']?.created).toBe('string');
    });

    // EC-5: MAPPING_ERROR when mapping file missing
    it('throws MAPPING_ERROR when file does not exist', () => {
      expect(() => client.loadMappings()).toThrow(MappingError);
      expect(() => client.loadMappings()).toThrow('Mapping file not found');
    });

    // EC-5: MAPPING_ERROR has correct error code for missing file
    it('uses MAPPING_ERROR error code for missing file', () => {
      try {
        client.loadMappings();
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MappingError);
        expect((error as MappingError).code).toBe('MAPPING_ERROR');
      }
    });

    // EC-5: MAPPING_ERROR when file unreadable
    it('throws MAPPING_ERROR when file unreadable', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');
      fs.chmodSync(mappingPath, 0o000);

      try {
        expect(() => client.loadMappings()).toThrow(MappingError);
        expect(() => client.loadMappings()).toThrow('Cannot read mapping file');
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(mappingPath, 0o644);
      }
    });

    // EC-5: MAPPING_ERROR when JSON malformed
    it('throws MAPPING_ERROR for malformed JSON', () => {
      fs.writeFileSync(mappingPath, '{ invalid json }', 'utf-8');

      expect(() => client.loadMappings()).toThrow(MappingError);
      expect(() => client.loadMappings()).toThrow(
        'Invalid JSON in mapping file'
      );
    });

    // EC-5: MAPPING_ERROR has correct error code for malformed JSON
    it('uses MAPPING_ERROR error code for malformed JSON', () => {
      fs.writeFileSync(mappingPath, '{ invalid json }', 'utf-8');

      try {
        client.loadMappings();
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MappingError);
        expect((error as MappingError).code).toBe('MAPPING_ERROR');
      }
    });

    it('returns empty object for empty mappings file', () => {
      fs.writeFileSync(mappingPath, '{}', 'utf-8');

      const mappings = client.loadMappings();

      expect(mappings).toEqual({});
    });

    it('handles file with whitespace and formatting', () => {
      const formatted = JSON.stringify(
        {
          'user-auth': {
            address: 'sc_g_7f3a9c2e',
            created: '2026-02-05T10:00:00Z',
          },
        },
        null,
        2
      );
      fs.writeFileSync(mappingPath, formatted, 'utf-8');

      const mappings = client.loadMappings();

      expect(mappings['user-auth']?.address).toBe('sc_g_7f3a9c2e');
    });
  });

  describe('Integration Scenarios', () => {
    it('supports complete workflow: save, resolve, load', () => {
      // Save mappings
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');
      client.saveMapping('payment', 'sc_g_abc123');

      // Resolve individual names
      expect(client.resolveAddress('user-auth')).toBe('sc_g_7f3a9c2e');
      expect(client.resolveAddress('payment')).toBe('sc_g_abc123');

      // Load all mappings
      const all = client.loadMappings();
      expect(Object.keys(all)).toHaveLength(2);
    });

    it('handles multiple clients with same mapping file', () => {
      const client1 = new Client({
        clientId: 'client-1',
        mappingPath,
        store: mockStore,
      });
      const client2 = new Client({
        clientId: 'client-2',
        mappingPath,
        store: mockStore,
      });

      client1.saveMapping('user-auth', 'sc_g_7f3a9c2e');
      client2.saveMapping('payment', 'sc_g_abc123');

      // Both clients see both mappings
      expect(client1.resolveAddress('payment')).toBe('sc_g_abc123');
      expect(client2.resolveAddress('user-auth')).toBe('sc_g_7f3a9c2e');
    });

    it('preserves mappings across client restart', () => {
      client.saveMapping('user-auth', 'sc_g_7f3a9c2e');
      client.saveMapping('payment', 'sc_g_abc123');

      // Create new client instance
      const client2 = new Client({
        clientId: 'client-restart',
        mappingPath,
        store: mockStore,
      });

      const mappings = client2.loadMappings();
      expect(Object.keys(mappings)).toHaveLength(2);
      expect(client2.resolveAddress('user-auth')).toBe('sc_g_7f3a9c2e');
    });

    it('supports capability-based access pattern', () => {
      // Store returns address, client saves mapping
      const address = 'sc_g_7f3a9c2e';
      client.saveMapping('user-auth', address);

      // LLM uses friendly name, client resolves to address
      const resolved = client.resolveAddress('user-auth');

      // Store operations use address (capability token)
      expect(resolved).toBe(address);
    });
  });

  describe('Edge Cases', () => {
    it('handles mapping file with no parent directory', () => {
      const rootPath = path.join(tempDir, 'mappings.json');
      const rootClient = new Client({
        clientId: 'root-client',
        mappingPath: rootPath,
        store: mockStore,
      });

      rootClient.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      expect(rootClient.resolveAddress('user-auth')).toBe('sc_g_7f3a9c2e');
    });

    it('handles names with special characters', () => {
      client.saveMapping('user-auth-v2', 'sc_g_7f3a9c2e');
      client.saveMapping('payment_system', 'sc_g_abc123');
      client.saveMapping('inventory.old', 'sc_g_def456');

      expect(client.resolveAddress('user-auth-v2')).toBe('sc_g_7f3a9c2e');
      expect(client.resolveAddress('payment_system')).toBe('sc_g_abc123');
      expect(client.resolveAddress('inventory.old')).toBe('sc_g_def456');
    });

    it('handles addresses with different formats', () => {
      client.saveMapping('group1', 'sc_g_abc123');
      client.saveMapping('group2', 'sc_g_0000000000000001');
      client.saveMapping('group3', 'sc_g_ffffffffffffffff');

      expect(client.resolveAddress('group1')).toBe('sc_g_abc123');
      expect(client.resolveAddress('group2')).toBe('sc_g_0000000000000001');
      expect(client.resolveAddress('group3')).toBe('sc_g_ffffffffffffffff');
    });

    it('resolves mapping path to absolute path', () => {
      const relativeClient = new Client({
        clientId: 'relative-client',
        mappingPath: './relative/path/mappings.json',
        store: mockStore,
      });

      // Should work with relative path (converted to absolute internally)
      relativeClient.saveMapping('test', 'sc_g_abc123');

      const resolved = relativeClient.resolveAddress('test');
      expect(resolved).toBe('sc_g_abc123');
    });

    it('handles empty name', () => {
      client.saveMapping('', 'sc_g_empty');

      expect(client.resolveAddress('')).toBe('sc_g_empty');
    });

    it('handles empty address', () => {
      client.saveMapping('empty-addr', '');

      expect(client.resolveAddress('empty-addr')).toBe('');
    });
  });

  describe('createGroup', () => {
    // AC-1: Create named group returns { address, schema, name }
    it('creates named group with schema and name', async () => {
      const mockCreateGroup = async (
        schemaId: string,
        opts?: { client: string; name?: string }
      ): Promise<GroupResult> => {
        expect(schemaId).toBe('test-schema');
        expect(opts?.client).toBe('test-client');
        expect(opts?.name).toBe('my-group');
        return { address: 'sc_g_7f3a9c2e', schema: 'test-schema' };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, createGroup: mockCreateGroup },
      });

      const result = await testClient.createGroup('test-schema', {
        name: 'my-group',
      });

      expect(result).toEqual({
        address: 'sc_g_7f3a9c2e',
        schema: 'test-schema',
        name: 'my-group',
      });

      // Verify mapping was saved
      expect(testClient.resolveAddress('my-group')).toBe('sc_g_7f3a9c2e');
    });

    // AC-2: Create unnamed group returns { address, schema }
    it('creates unnamed group with schema only', async () => {
      const mockCreateGroup = async (
        schemaId: string,
        opts?: { client: string; name?: string }
      ): Promise<GroupResult> => {
        expect(schemaId).toBe('test-schema');
        expect(opts?.client).toBe('test-client');
        expect(opts?.name).toBeUndefined();
        return { address: 'sc_g_abc12345', schema: 'test-schema' };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, createGroup: mockCreateGroup },
      });

      const result = await testClient.createGroup('test-schema');

      expect(result).toEqual({
        address: 'sc_g_abc12345',
        schema: 'test-schema',
      });
      expect(result).not.toHaveProperty('name');

      // Verify no mapping was saved
      expect(() => testClient.resolveAddress('test-schema')).toThrow(
        NameNotFoundError
      );
    });

    // AC-3: Duplicate name raises MappingError
    // EC-4: Name already mapped to different address raises MappingError
    it('throws MappingError when creating group with duplicate name', async () => {
      let callCount = 0;
      const mockCreateGroup = async (
        schemaId: string,
        opts?: { client: string; name?: string }
      ): Promise<GroupResult> => {
        // Return different addresses for successive calls
        callCount++;
        return {
          address: callCount === 1 ? 'sc_g_first_addr' : 'sc_g_second_addr',
          schema: schemaId,
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, createGroup: mockCreateGroup },
      });

      // Create first group with name
      await testClient.createGroup('test-schema', { name: 'existing-group' });

      // Try to create second group with same name but different address
      await expect(
        testClient.createGroup('test-schema', { name: 'existing-group' })
      ).rejects.toThrow(MappingError);
      await expect(
        testClient.createGroup('test-schema', { name: 'existing-group' })
      ).rejects.toThrow(
        'Name existing-group already mapped to different address'
      );
    });

    // IR-4: createGroup calls store.createGroup with clientId
    it('passes clientId to store.createGroup', async () => {
      let capturedOpts: { client: string; name?: string } | undefined;

      const mockCreateGroup = async (
        schemaId: string,
        opts?: { client: string; name?: string }
      ): Promise<GroupResult> => {
        capturedOpts = opts;
        return { address: 'sc_g_test', schema: schemaId };
      };

      const testClient = new Client({
        clientId: 'my-special-client',
        mappingPath,
        store: { ...mockStore, createGroup: mockCreateGroup },
      });

      await testClient.createGroup('test-schema', { name: 'test-group' });

      expect(capturedOpts?.client).toBe('my-special-client');
      expect(capturedOpts?.name).toBe('test-group');
    });

    it('creates multiple groups with different names', async () => {
      let addressCounter = 0;
      const mockCreateGroup = async (
        schemaId: string
      ): Promise<GroupResult> => {
        addressCounter++;
        return {
          address: `sc_g_addr${addressCounter}`,
          schema: schemaId,
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, createGroup: mockCreateGroup },
      });

      const result1 = await testClient.createGroup('schema1', {
        name: 'group1',
      });
      const result2 = await testClient.createGroup('schema2', {
        name: 'group2',
      });

      expect(result1).toEqual({
        address: 'sc_g_addr1',
        schema: 'schema1',
        name: 'group1',
      });
      expect(result2).toEqual({
        address: 'sc_g_addr2',
        schema: 'schema2',
        name: 'group2',
      });

      // Both mappings should be saved
      expect(testClient.resolveAddress('group1')).toBe('sc_g_addr1');
      expect(testClient.resolveAddress('group2')).toBe('sc_g_addr2');
    });

    it('allows same name if address matches (idempotent)', async () => {
      const mockCreateGroup = async (
        schemaId: string
      ): Promise<GroupResult> => {
        return { address: 'sc_g_same_addr', schema: schemaId };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, createGroup: mockCreateGroup },
      });

      // Create first group
      const result1 = await testClient.createGroup('test-schema', {
        name: 'idempotent-group',
      });

      // Create second group with same name and same address (idempotent)
      const result2 = await testClient.createGroup('test-schema', {
        name: 'idempotent-group',
      });

      expect(result1.address).toBe('sc_g_same_addr');
      expect(result2.address).toBe('sc_g_same_addr');
      expect(testClient.resolveAddress('idempotent-group')).toBe(
        'sc_g_same_addr'
      );
    });

    it('creates unnamed group without saving mapping', async () => {
      const mockCreateGroup = async (
        schemaId: string
      ): Promise<GroupResult> => {
        return { address: 'sc_g_unnamed', schema: schemaId };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, createGroup: mockCreateGroup },
      });

      await testClient.createGroup('test-schema');

      // Load mappings to verify nothing was saved
      expect(() => testClient.loadMappings()).toThrow(MappingError);
      expect(() => testClient.loadMappings()).toThrow('Mapping file not found');
    });

    it('propagates store errors', async () => {
      const mockCreateGroup = async (): Promise<GroupResult> => {
        throw new Error('Store error: invalid schema');
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, createGroup: mockCreateGroup },
      });

      await expect(testClient.createGroup('invalid-schema')).rejects.toThrow(
        'Store error: invalid schema'
      );
    });
  });

  describe('get', () => {
    // AC-5: Get by name resolves and returns data
    it('gets node by name with resolution', async () => {
      const mockNodeResponse: NodeResponse = {
        metadata: { status: 'draft' },
        sections: [],
        token: 'test_token',
      };

      const mockGet = async (path: string): Promise<NodeResponse> => {
        expect(path).toBe('sc_g_7f3a9c2e/document');
        return mockNodeResponse;
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, get: mockGet },
      });

      testClient.saveMapping('hello-world', 'sc_g_7f3a9c2e');

      const result = await testClient.get('hello-world/document');

      expect(result).toEqual(mockNodeResponse);
    });

    // AC-6: Get by address returns data
    it('gets node by address with passthrough', async () => {
      const mockNodeResponse: NodeResponse = {
        metadata: { status: 'locked' },
        sections: [{ id: 'overview', type: 'prose', token: 'sec_token' }],
        token: 'test_token',
      };

      const mockGet = async (path: string): Promise<NodeResponse> => {
        expect(path).toBe('sc_g_abc123/document');
        return mockNodeResponse;
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, get: mockGet },
      });

      const result = await testClient.get('sc_g_abc123/document');

      expect(result).toEqual(mockNodeResponse);
    });

    // AC-7: Unregistered name error
    // EC-5: Name not in mappings, not valid address
    it('throws NameNotFoundError for unregistered name', async () => {
      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: mockStore,
      });

      await expect(testClient.get('unknown/document')).rejects.toThrow(
        NameNotFoundError
      );
      await expect(testClient.get('unknown/document')).rejects.toThrow(
        'Name unknown not found in mappings'
      );
    });

    // AC-24: Address passthrough works regardless of name resolution state
    it('uses address passthrough regardless of mapping state', async () => {
      const mockNodeResponse: NodeResponse = {
        metadata: {},
        sections: [],
        token: 'test_token',
      };

      const mockGet = async (path: string): Promise<NodeResponse> => {
        expect(path).toBe('sc_g_xyz789/slot');
        return mockNodeResponse;
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, get: mockGet },
      });

      // No mapping for this address - should still work via passthrough
      const result = await testClient.get('sc_g_xyz789/slot');

      expect(result).toEqual(mockNodeResponse);
    });

    // IR-5: Resolves name to address and reconstructs path
    it('resolves name and reconstructs full path with slot', async () => {
      let capturedPath = '';

      const mockGet = async (path: string): Promise<NodeResponse> => {
        capturedPath = path;
        return {
          metadata: {},
          sections: [],
          token: 'test_token',
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, get: mockGet },
      });

      testClient.saveMapping('my-group', 'sc_g_resolved');

      await testClient.get('my-group/requirements');

      expect(capturedPath).toBe('sc_g_resolved/requirements');
    });

    it('handles path with multiple slashes correctly', async () => {
      let capturedPath = '';

      const mockGet = async (path: string): Promise<NodeResponse> => {
        capturedPath = path;
        return {
          metadata: {},
          sections: [],
          token: 'test_token',
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, get: mockGet },
      });

      testClient.saveMapping('my-group', 'sc_g_resolved');

      // Path with section and item
      await testClient.get('my-group/slot/section');

      expect(capturedPath).toBe('sc_g_resolved/slot/section');
    });

    it('handles deep paths with name resolution', async () => {
      let capturedPath = '';

      const mockGet = async (path: string): Promise<NodeResponse> => {
        capturedPath = path;
        return {
          metadata: {},
          sections: [],
          token: 'test_token',
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, get: mockGet },
      });

      testClient.saveMapping('project', 'sc_g_project_addr');

      await testClient.get('project/plan/phase-1/task-1');

      expect(capturedPath).toBe('sc_g_project_addr/plan/phase-1/task-1');
    });

    it('throws error for path without slot', async () => {
      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: mockStore,
      });

      await expect(testClient.get('group-only')).rejects.toThrow(
        'Path must include slot: group/slot'
      );
    });

    it('handles metadata paths with name resolution', async () => {
      let capturedPath = '';

      const mockGet = async (path: string): Promise<NodeResponse> => {
        capturedPath = path;
        return {
          metadata: { status: 'draft' },
          sections: [],
          token: 'test_token',
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, get: mockGet },
      });

      testClient.saveMapping('docs', 'sc_g_docs_addr');

      await testClient.get('docs/spec/@meta/status');

      expect(capturedPath).toBe('sc_g_docs_addr/spec/@meta/status');
    });

    it('handles address passthrough with metadata paths', async () => {
      let capturedPath = '';

      const mockGet = async (path: string): Promise<NodeResponse> => {
        capturedPath = path;
        return {
          metadata: { status: 'locked' },
          sections: [],
          token: 'test_token',
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, get: mockGet },
      });

      await testClient.get('sc_g_direct_addr/spec/@meta');

      expect(capturedPath).toBe('sc_g_direct_addr/spec/@meta');
    });

    it('propagates store errors', async () => {
      const mockGet = async (): Promise<NodeResponse> => {
        throw new Error('Store error: node not found');
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, get: mockGet },
      });

      testClient.saveMapping('test-group', 'sc_g_test_addr');

      await expect(testClient.get('test-group/missing')).rejects.toThrow(
        'Store error: node not found'
      );
    });

    it('resolves different names to different addresses', async () => {
      const capturedPaths: string[] = [];

      const mockGet = async (path: string): Promise<NodeResponse> => {
        capturedPaths.push(path);
        return {
          metadata: {},
          sections: [],
          token: 'test_token',
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, get: mockGet },
      });

      testClient.saveMapping('group-a', 'sc_g_addr_a');
      testClient.saveMapping('group-b', 'sc_g_addr_b');

      await testClient.get('group-a/slot');
      await testClient.get('group-b/slot');

      expect(capturedPaths).toEqual(['sc_g_addr_a/slot', 'sc_g_addr_b/slot']);
    });
  });

  describe('list', () => {
    // AC-8: List returns name, address, schema, client
    it('returns list with name, address, schema, and client fields', async () => {
      const mockGetGroupMeta = async (address: string) => {
        if (address === 'sc_g_7f3a9c2e') {
          return {
            schema: 'initiative',
            name: null,
            client: 'test-client',
            created: '2026-02-14T10:00:00Z',
          };
        }
        throw new Error('Unknown address');
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, getGroupMeta: mockGetGroupMeta },
      });

      testClient.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      const result = await testClient.list();

      expect(result).toEqual([
        {
          name: 'user-auth',
          address: 'sc_g_7f3a9c2e',
          schema: 'initiative',
          client: 'test-client',
        },
      ]);
    });

    // AC-9, AC-22: List returns empty array when no groups
    it('returns empty array when no mappings exist', async () => {
      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: mockStore,
      });

      const result = await testClient.list();

      expect(result).toEqual([]);
    });

    // AC-10: Multiple clients see only their own groups
    it('returns only groups in client mappings', async () => {
      const mockGetGroupMeta = async (address: string) => {
        const metas: Record<string, unknown> = {
          sc_g_addr1: {
            schema: 'schema1',
            name: null,
            client: 'client-a',
            created: '2026-02-14T10:00:00Z',
          },
          sc_g_addr2: {
            schema: 'schema2',
            name: null,
            client: 'client-a',
            created: '2026-02-14T11:00:00Z',
          },
        };
        return metas[address] as {
          schema: string;
          name: string | null;
          client: string;
          created: string;
        };
      };

      const clientA = new Client({
        clientId: 'client-a',
        mappingPath: path.join(tempDir, 'client-a-mappings.json'),
        store: { ...mockStore, getGroupMeta: mockGetGroupMeta },
      });

      const clientB = new Client({
        clientId: 'client-b',
        mappingPath: path.join(tempDir, 'client-b-mappings.json'),
        store: { ...mockStore, getGroupMeta: mockGetGroupMeta },
      });

      // Client A has two groups
      clientA.saveMapping('group1', 'sc_g_addr1');
      clientA.saveMapping('group2', 'sc_g_addr2');

      // Client B has no groups
      const resultA = await clientA.list();
      const resultB = await clientB.list();

      expect(resultA).toHaveLength(2);
      expect(resultB).toHaveLength(0);
    });

    // AC-19: List includes client field
    it('includes client field in each result', async () => {
      const mockGetGroupMeta = async (address: string) => {
        const clients: Record<string, string> = {
          sc_g_addr1: 'client-alpha',
          sc_g_addr2: 'client-beta',
        };
        return {
          schema: 'test-schema',
          name: null,
          client: clients[address] ?? 'unknown',
          created: '2026-02-14T10:00:00Z',
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, getGroupMeta: mockGetGroupMeta },
      });

      testClient.saveMapping('group1', 'sc_g_addr1');
      testClient.saveMapping('group2', 'sc_g_addr2');

      const result = await testClient.list();

      expect(result[0]?.client).toBe('client-alpha');
      expect(result[1]?.client).toBe('client-beta');
    });

    it('returns multiple groups with metadata', async () => {
      const mockGetGroupMeta = async (address: string) => {
        const metas: Record<string, unknown> = {
          sc_g_addr1: {
            schema: 'initiative',
            name: null,
            client: 'test-client',
            created: '2026-02-14T10:00:00Z',
          },
          sc_g_addr2: {
            schema: 'task',
            name: null,
            client: 'test-client',
            created: '2026-02-14T11:00:00Z',
          },
          sc_g_addr3: {
            schema: 'document',
            name: null,
            client: 'test-client',
            created: '2026-02-14T12:00:00Z',
          },
        };
        return metas[address] as {
          schema: string;
          name: string | null;
          client: string;
          created: string;
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, getGroupMeta: mockGetGroupMeta },
      });

      testClient.saveMapping('user-auth', 'sc_g_addr1');
      testClient.saveMapping('payment', 'sc_g_addr2');
      testClient.saveMapping('inventory', 'sc_g_addr3');

      const result = await testClient.list();

      expect(result).toHaveLength(3);
      expect(result).toEqual([
        {
          name: 'user-auth',
          address: 'sc_g_addr1',
          schema: 'initiative',
          client: 'test-client',
        },
        {
          name: 'payment',
          address: 'sc_g_addr2',
          schema: 'task',
          client: 'test-client',
        },
        {
          name: 'inventory',
          address: 'sc_g_addr3',
          schema: 'document',
          client: 'test-client',
        },
      ]);
    });

    it('skips groups that no longer exist', async () => {
      const mockGetGroupMeta = async (address: string) => {
        if (address === 'sc_g_deleted') {
          throw new Error('Group not found');
        }
        return {
          schema: 'initiative',
          name: null,
          client: 'test-client',
          created: '2026-02-14T10:00:00Z',
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, getGroupMeta: mockGetGroupMeta },
      });

      testClient.saveMapping('existing', 'sc_g_exists');
      testClient.saveMapping('deleted', 'sc_g_deleted');

      const result = await testClient.list();

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('existing');
    });
  });

  describe('rebuildMappings', () => {
    // AC-14: Rebuild recreates mapping file from _meta.json
    it('rebuilds mappings from _meta.json files', async () => {
      const mockList = async () => {
        return [
          { id: 'sc_g_addr1', schema: 'schema1' },
          { id: 'sc_g_addr2', schema: 'schema2' },
        ];
      };

      const mockGetGroupMeta = async (address: string) => {
        if (address === 'sc_g_addr1') {
          return {
            schema: 'schema1',
            name: 'group-one',
            client: 'test-client',
            created: '2026-02-14T10:00:00Z',
          };
        }
        if (address === 'sc_g_addr2') {
          return {
            schema: 'schema2',
            name: 'group-two',
            client: 'test-client',
            created: '2026-02-14T11:00:00Z',
          };
        }
        throw new Error('Unknown address');
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: {
          ...mockStore,
          list: mockList,
          getGroupMeta: mockGetGroupMeta,
        },
      });

      const result = await testClient.rebuildMappings();

      expect(result).toEqual({ recovered: 2 });
      expect(testClient.resolveAddress('group-one')).toBe('sc_g_addr1');
      expect(testClient.resolveAddress('group-two')).toBe('sc_g_addr2');
    });

    // AC-15: Rebuild skips unnamed groups
    it('skips groups without names', async () => {
      const mockList = async () => {
        return [
          { id: 'sc_g_named', schema: 'schema1' },
          { id: 'sc_g_unnamed', schema: 'schema2' },
        ];
      };

      const mockGetGroupMeta = async (address: string) => {
        if (address === 'sc_g_named') {
          return {
            schema: 'schema1',
            name: 'has-name',
            client: 'test-client',
            created: '2026-02-14T10:00:00Z',
          };
        }
        if (address === 'sc_g_unnamed') {
          return {
            schema: 'schema2',
            name: null,
            client: 'test-client',
            created: '2026-02-14T11:00:00Z',
          };
        }
        throw new Error('Unknown address');
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: {
          ...mockStore,
          list: mockList,
          getGroupMeta: mockGetGroupMeta,
        },
      });

      const result = await testClient.rebuildMappings();

      expect(result).toEqual({ recovered: 1 });
      expect(testClient.resolveAddress('has-name')).toBe('sc_g_named');
      expect(() => testClient.resolveAddress('unnamed')).toThrow(
        NameNotFoundError
      );
    });

    // AC-16: Rebuild returns count of recovered mappings
    it('returns count of recovered mappings', async () => {
      const mockList = async () => {
        return [
          { id: 'sc_g_addr1', schema: 'schema1' },
          { id: 'sc_g_addr2', schema: 'schema2' },
          { id: 'sc_g_addr3', schema: 'schema3' },
        ];
      };

      const mockGetGroupMeta = async (address: string) => {
        return {
          schema: 'schema1',
          name: `group-${address.slice(-5)}`,
          client: 'test-client',
          created: '2026-02-14T10:00:00Z',
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: {
          ...mockStore,
          list: mockList,
          getGroupMeta: mockGetGroupMeta,
        },
      });

      const result = await testClient.rebuildMappings();

      expect(result).toEqual({ recovered: 3 });
    });

    // AC-4: Name persists across mapping deletion via _meta.json
    it('recovers mappings after mapping file deletion', async () => {
      const mockList = async () => {
        return [{ id: 'sc_g_persisted', schema: 'schema1' }];
      };

      const mockGetGroupMeta = async () => {
        return {
          schema: 'schema1',
          name: 'persistent-group',
          client: 'test-client',
          created: '2026-02-14T10:00:00Z',
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: {
          ...mockStore,
          list: mockList,
          getGroupMeta: mockGetGroupMeta,
        },
      });

      // Create initial mapping
      testClient.saveMapping('persistent-group', 'sc_g_persisted');
      expect(testClient.resolveAddress('persistent-group')).toBe(
        'sc_g_persisted'
      );

      // Delete mapping file
      fs.unlinkSync(mappingPath);

      // Verify mapping is gone
      expect(() => testClient.resolveAddress('persistent-group')).toThrow(
        NameNotFoundError
      );

      // Rebuild from _meta.json
      const result = await testClient.rebuildMappings();

      expect(result).toEqual({ recovered: 1 });
      expect(testClient.resolveAddress('persistent-group')).toBe(
        'sc_g_persisted'
      );
    });

    it('returns zero recovered when no groups exist', async () => {
      const mockList = async () => {
        return [];
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, list: mockList },
      });

      const result = await testClient.rebuildMappings();

      expect(result).toEqual({ recovered: 0 });
    });

    it('returns zero recovered when all groups are unnamed', async () => {
      const mockList = async () => {
        return [
          { id: 'sc_g_unnamed1', schema: 'schema1' },
          { id: 'sc_g_unnamed2', schema: 'schema2' },
        ];
      };

      const mockGetGroupMeta = async () => {
        return {
          schema: 'schema1',
          name: null,
          client: 'test-client',
          created: '2026-02-14T10:00:00Z',
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: {
          ...mockStore,
          list: mockList,
          getGroupMeta: mockGetGroupMeta,
        },
      });

      const result = await testClient.rebuildMappings();

      expect(result).toEqual({ recovered: 0 });
    });

    it('skips groups with inaccessible metadata', async () => {
      const mockList = async () => {
        return [
          { id: 'sc_g_accessible', schema: 'schema1' },
          { id: 'sc_g_inaccessible', schema: 'schema2' },
        ];
      };

      const mockGetGroupMeta = async (address: string) => {
        if (address === 'sc_g_accessible') {
          return {
            schema: 'schema1',
            name: 'good-group',
            client: 'test-client',
            created: '2026-02-14T10:00:00Z',
          };
        }
        throw new Error('Cannot read metadata');
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: {
          ...mockStore,
          list: mockList,
          getGroupMeta: mockGetGroupMeta,
        },
      });

      const result = await testClient.rebuildMappings();

      expect(result).toEqual({ recovered: 1 });
      expect(testClient.resolveAddress('good-group')).toBe('sc_g_accessible');
    });

    it('handles existing mappings idempotently', async () => {
      const mockList = async () => {
        return [
          { id: 'sc_g_existing', schema: 'schema1' },
          { id: 'sc_g_new', schema: 'schema2' },
        ];
      };

      const mockGetGroupMeta = async (address: string) => {
        if (address === 'sc_g_existing') {
          return {
            schema: 'schema1',
            name: 'existing-group',
            client: 'test-client',
            created: '2026-02-14T10:00:00Z',
          };
        }
        if (address === 'sc_g_new') {
          return {
            schema: 'schema2',
            name: 'new-group',
            client: 'test-client',
            created: '2026-02-14T11:00:00Z',
          };
        }
        throw new Error('Unknown address');
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: {
          ...mockStore,
          list: mockList,
          getGroupMeta: mockGetGroupMeta,
        },
      });

      // Create mapping for one group
      testClient.saveMapping('existing-group', 'sc_g_existing');

      const result = await testClient.rebuildMappings();

      expect(result).toEqual({ recovered: 2 });
      expect(testClient.resolveAddress('existing-group')).toBe('sc_g_existing');
      expect(testClient.resolveAddress('new-group')).toBe('sc_g_new');
    });

    it('rebuilds from empty mapping file', async () => {
      const mockList = async () => {
        return [{ id: 'sc_g_recovered', schema: 'schema1' }];
      };

      const mockGetGroupMeta = async () => {
        return {
          schema: 'schema1',
          name: 'recovered-group',
          client: 'test-client',
          created: '2026-02-14T10:00:00Z',
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: {
          ...mockStore,
          list: mockList,
          getGroupMeta: mockGetGroupMeta,
        },
      });

      // Create empty mapping file
      fs.writeFileSync(mappingPath, '{}', 'utf-8');

      const result = await testClient.rebuildMappings();

      expect(result).toEqual({ recovered: 1 });
      expect(testClient.resolveAddress('recovered-group')).toBe(
        'sc_g_recovered'
      );
    });
  });

  describe('deleteGroup', () => {
    // AC-11: Delete by name removes group and mapping
    it('deletes group by name and removes mapping', async () => {
      const mockDeleteGroup = async (address: string) => {
        expect(address).toBe('sc_g_7f3a9c2e');
        return { ok: true as const };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, deleteGroup: mockDeleteGroup },
      });

      testClient.saveMapping('user-auth', 'sc_g_7f3a9c2e');

      const result = await testClient.deleteGroup('user-auth');

      expect(result).toEqual({ ok: true });

      // Verify mapping was removed
      expect(() => testClient.resolveAddress('user-auth')).toThrow(
        NameNotFoundError
      );
    });

    // AC-12: Delete by address removes group
    it('deletes group by address', async () => {
      const mockDeleteGroup = async (address: string) => {
        expect(address).toBe('sc_g_abc123');
        return { ok: true as const };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, deleteGroup: mockDeleteGroup },
      });

      const result = await testClient.deleteGroup('sc_g_abc123');

      expect(result).toEqual({ ok: true });
    });

    // AC-13, EC-6: Delete unregistered name throws NameNotFoundError
    it('throws NameNotFoundError for unregistered name', async () => {
      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: mockStore,
      });

      await expect(testClient.deleteGroup('unknown')).rejects.toThrow(
        NameNotFoundError
      );
      await expect(testClient.deleteGroup('unknown')).rejects.toThrow(
        'Name unknown not found in mappings'
      );
    });

    it('deletes by address and removes mapping if exists', async () => {
      const mockDeleteGroup = async (address: string) => {
        expect(address).toBe('sc_g_mapped');
        return { ok: true as const };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, deleteGroup: mockDeleteGroup },
      });

      testClient.saveMapping('my-group', 'sc_g_mapped');

      const result = await testClient.deleteGroup('sc_g_mapped');

      expect(result).toEqual({ ok: true });

      // Verify mapping was removed
      expect(() => testClient.resolveAddress('my-group')).toThrow(
        NameNotFoundError
      );
    });

    it('deletes by address without error if no mapping exists', async () => {
      const mockDeleteGroup = async (address: string) => {
        expect(address).toBe('sc_g_unmapped');
        return { ok: true as const };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, deleteGroup: mockDeleteGroup },
      });

      // No mapping created
      const result = await testClient.deleteGroup('sc_g_unmapped');

      expect(result).toEqual({ ok: true });
    });

    it('propagates store delete errors', async () => {
      const mockDeleteGroup = async () => {
        return {
          ok: false as const,
          error: 'DELETE_ERROR',
          message: 'Node is locked',
        };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, deleteGroup: mockDeleteGroup },
      });

      testClient.saveMapping('locked-group', 'sc_g_locked');

      await expect(testClient.deleteGroup('locked-group')).rejects.toThrow(
        'Node is locked'
      );
    });

    it('deletes multiple groups independently', async () => {
      let deletedAddresses: string[] = [];

      const mockDeleteGroup = async (address: string) => {
        deletedAddresses.push(address);
        return { ok: true as const };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, deleteGroup: mockDeleteGroup },
      });

      testClient.saveMapping('group1', 'sc_g_addr1');
      testClient.saveMapping('group2', 'sc_g_addr2');
      testClient.saveMapping('group3', 'sc_g_addr3');

      await testClient.deleteGroup('group1');
      await testClient.deleteGroup('sc_g_addr2'); // By address
      await testClient.deleteGroup('group3');

      expect(deletedAddresses).toEqual([
        'sc_g_addr1',
        'sc_g_addr2',
        'sc_g_addr3',
      ]);

      // Verify mappings removed
      expect(() => testClient.resolveAddress('group1')).toThrow(
        NameNotFoundError
      );
      expect(() => testClient.resolveAddress('group2')).toThrow(
        NameNotFoundError
      );
      expect(() => testClient.resolveAddress('group3')).toThrow(
        NameNotFoundError
      );
    });

    it('deletes by name resolves to correct address', async () => {
      let capturedAddress = '';

      const mockDeleteGroup = async (address: string) => {
        capturedAddress = address;
        return { ok: true as const };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, deleteGroup: mockDeleteGroup },
      });

      testClient.saveMapping('my-project', 'sc_g_project_address');

      await testClient.deleteGroup('my-project');

      expect(capturedAddress).toBe('sc_g_project_address');
    });

    it('handles empty mappings file on delete by address', async () => {
      const mockDeleteGroup = async (address: string) => {
        expect(address).toBe('sc_g_addr');
        return { ok: true as const };
      };

      const testClient = new Client({
        clientId: 'test-client',
        mappingPath,
        store: { ...mockStore, deleteGroup: mockDeleteGroup },
      });

      // No mappings file exists
      const result = await testClient.deleteGroup('sc_g_addr');

      expect(result).toEqual({ ok: true });
    });
  });
});
