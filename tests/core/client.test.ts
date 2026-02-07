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

describe('Client', () => {
  let tempDir: string;
  let mappingPath: string;
  let client: Client;

  beforeEach(() => {
    // Create temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'client-test-'));
    mappingPath = path.join(tempDir, 'mappings.json');
    client = new Client(mappingPath);
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
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
      const client2 = new Client(mappingPath);
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
      const deepClient = new Client(deepPath);

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
      const client1 = new Client(mappingPath);
      const client2 = new Client(mappingPath);

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
      const client2 = new Client(mappingPath);

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
      const rootClient = new Client(rootPath);

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
      const relativeClient = new Client('./relative/path/mappings.json');

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
});
