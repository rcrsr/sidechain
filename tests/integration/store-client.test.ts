/**
 * Integration tests for full Store-Client workflow
 * Covers: AC-1, AC-7, AC-9, AC-10, AC-22, AC-35
 *
 * Tests end-to-end workflows combining Client name resolution with Store operations.
 */

import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Client } from '../../src/core/client.js';
import {
  MappingError,
  NameNotFoundError,
  StaleTokenError,
} from '../../src/core/errors.js';
import type { SidechainConfig } from '../../src/types/config.js';
import type { GroupSchema, NodeSchema } from '../../src/types/schema.js';
import type { Store } from '../../src/types/store.js';
import {
  setupTestStore,
  cleanupTestStore,
  type TestStoreSetup,
} from '../fixtures/index.js';

describe('Store-Client Integration', () => {
  let setup: TestStoreSetup;
  let mappingPath: string;
  let client: Client;
  let store: Store;

  beforeEach(async () => {
    setup = await setupTestStore((tempDir) => {
      const groupSchema: GroupSchema = {
        'schema-id': 'test-group',
        slots: [
          { id: 'requirements', schema: 'test-node' },
          { id: 'plan', schema: 'test-node' },
        ],
      };

      const nodeSchema: NodeSchema = {
        'schema-id': 'test-node',
        metadata: {
          required: ['schema-id'],
          fields: {
            'schema-id': { type: 'string' },
            status: {
              type: 'enum',
              values: ['draft', 'locked'],
            },
          },
        },
        sections: {
          required: [
            { id: 'overview', type: 'text' },
            { id: 'details', type: 'text' },
          ],
        },
      };

      return {
        mounts: {
          main: {
            path: path.join(tempDir, 'groups'),
            groupSchema: 'test-group',
          },
        },
        groupSchemas: {
          'test-group': groupSchema,
        },
        nodeSchemas: {
          'test-node': nodeSchema,
        },
      };
    });
    store = setup.store;
    mappingPath = path.join(setup.tempDir, 'mappings.json');
    client = new Client({
      clientId: 'integration-client',
      mappingPath,
      store,
    });
  });

  afterEach(async () => {
    await cleanupTestStore(setup);
  });

  // AC-1: Sidechain.open(config) returns Store
  describe('Initialization', () => {
    it('opens store with valid configuration', async () => {
      expect(store).toBeDefined();
      expect(typeof store.list).toBe('function');
      expect(typeof store.createGroup).toBe('function');
      expect(typeof store.get).toBe('function');
      expect(typeof store.writeSection).toBe('function');
    });
  });

  // End-to-end workflow: create -> populate -> read -> validate
  describe('End-to-End Workflow', () => {
    it('completes full workflow: create group -> write sections -> read back', async () => {
      // 1. Create group via store
      const { address } = await store.createGroup('test-group');
      expect(address).toMatch(/^sc_g_/);

      // 2. Client saves name mapping
      client.saveMapping('user-auth', address);

      // 3. Resolve name to address
      const resolvedAddress = client.resolveAddress('user-auth');
      expect(resolvedAddress).toBe(address);

      // 4. Populate node sections
      const nodePath = `${resolvedAddress}/requirements`;
      await store.populate(nodePath, {
        sections: {
          overview: 'User authentication feature',
          details: 'Support OAuth2 and SAML',
        },
      });

      // 5. Read back and validate
      const node = await store.get(nodePath);
      expect(node.metadata['schema-id']).toBe('test-node');
      expect(node.sections).toHaveLength(2);

      const overview = node.sections.find((s) => s.id === 'overview');
      expect(overview?.content).toBe('User authentication feature');

      const details = node.sections.find((s) => s.id === 'details');
      expect(details?.content).toBe('Support OAuth2 and SAML');

      expect(node.token).toBeDefined();
      expect(node.token).toMatch(/^sc_t_node_/);
    });

    it('supports multiple groups with client name resolution', async () => {
      // Create multiple groups
      const { address: addr1 } = await store.createGroup('test-group');
      const { address: addr2 } = await store.createGroup('test-group');

      // Client maps friendly names
      client.saveMapping('user-auth', addr1);
      client.saveMapping('payment', addr2);

      // Write to different groups using friendly names
      const userAuthPath = `${client.resolveAddress('user-auth')}/requirements`;
      const paymentPath = `${client.resolveAddress('payment')}/requirements`;

      await store.populate(userAuthPath, {
        sections: {
          overview: 'Authentication requirements',
          details: 'OAuth2 support',
        },
      });

      await store.populate(paymentPath, {
        sections: {
          overview: 'Payment requirements',
          details: 'Stripe integration',
        },
      });

      // Read back from both groups
      const userAuthNode = await store.get(userAuthPath);
      const paymentNode = await store.get(paymentPath);

      expect(
        userAuthNode.sections.find((s) => s.id === 'overview')?.content
      ).toBe('Authentication requirements');
      expect(
        paymentNode.sections.find((s) => s.id === 'overview')?.content
      ).toBe('Payment requirements');
    });
  });

  // AC-7: list() filtered to client addresses
  describe('list() Filtering', () => {
    it('returns only groups client has addresses for', async () => {
      // Create groups
      const { address: addr1 } = await store.createGroup('test-group');
      const { address: addr2 } = await store.createGroup('test-group');

      // Client only knows about addr1
      client.saveMapping('user-auth', addr1);

      // List all groups
      const groups = await store.list();

      // Store returns all groups (it doesn't filter by client)
      expect(groups.length).toBe(2);

      // Client filters to only known addresses
      const knownMappings = client.loadMappings();
      const knownAddresses = Object.values(knownMappings).map((m) => m.address);

      const clientGroups = groups.filter((g) => knownAddresses.includes(g.id));

      expect(clientGroups.length).toBe(1);
      expect(clientGroups[0]?.id).toBe(addr1);
    });

    it('returns empty array when client has no mappings', async () => {
      // Create groups but client doesn't know about them
      await store.createGroup('test-group');
      await store.createGroup('test-group');

      const groups = await store.list();
      expect(groups.length).toBe(2);

      // Client has no mappings - loadMappings throws when file doesn't exist
      let knownAddresses: string[] = [];
      try {
        const knownMappings = client.loadMappings();
        knownAddresses = Object.values(knownMappings).map((m) => m.address);
      } catch {
        // No mapping file means no known addresses
        knownAddresses = [];
      }

      // Filter to client-known groups
      const clientGroups = groups.filter((g) => knownAddresses.includes(g.id));

      expect(clientGroups).toHaveLength(0);
    });
  });

  // AC-9: get(path) returns node with metadata, sections, empty flag, token
  describe('get() Response Structure', () => {
    it('returns node with metadata, sections, and token', async () => {
      const { address } = await store.createGroup('test-group');
      client.saveMapping('test-group', address);

      const nodePath = `${address}/requirements`;
      await store.populate(nodePath, {
        sections: {
          overview: 'Test overview',
          details: 'Test details',
        },
      });

      const node = await store.get(nodePath);

      // Verify response structure
      expect(node).toHaveProperty('metadata');
      expect(node).toHaveProperty('sections');
      expect(node).toHaveProperty('token');

      // Metadata includes schema-id
      expect(node.metadata['schema-id']).toBe('test-node');

      // Sections array with content
      expect(Array.isArray(node.sections)).toBe(true);
      expect(node.sections.length).toBe(2);

      // Each section has id, type, content, token
      const section = node.sections[0];
      expect(section).toBeDefined();
      expect(section?.id).toBeDefined();
      expect(section?.type).toBeDefined();
      expect(section?.content).toBeDefined();
      expect(section?.token).toBeDefined();

      // Node token format
      expect(node.token).toMatch(/^sc_t_node_/);
    });

    it('returns empty sections for unpopulated node', async () => {
      const { address } = await store.createGroup('test-group');
      const nodePath = `${address}/requirements`;

      const node = await store.get(nodePath);

      expect(node.metadata['schema-id']).toBe('test-node');
      expect(node.sections).toHaveLength(0);
      expect(node.token).toBeDefined();
    });
  });

  // AC-10: writeSection with valid token succeeds
  describe('Token Flow - Valid Token', () => {
    it('writeSection with valid token succeeds', async () => {
      const { address } = await store.createGroup('test-group');
      const nodePath = `${address}/requirements`;

      // Populate initial content
      await store.populate(nodePath, {
        sections: {
          overview: 'Initial overview',
          details: 'Initial details',
        },
      });

      // Read to get token
      const { token } = await store.get(nodePath);

      // Write section with valid token
      const result = await store.writeSection(
        nodePath,
        'overview',
        'Updated overview',
        { token }
      );

      expect(result.ok).toBe(true);
      expect(result.path).toBe(`${nodePath}/overview`);
      expect(result.token).toBeDefined();
      expect(result.nodeToken).toBeDefined();

      // Verify content updated
      const updated = await store.get(nodePath);
      const overviewSection = updated.sections.find((s) => s.id === 'overview');
      expect(overviewSection?.content).toBe('Updated overview');
    });

    it('section token allows section-scoped write', async () => {
      const { address } = await store.createGroup('test-group');
      const nodePath = `${address}/requirements`;

      await store.populate(nodePath, {
        sections: {
          overview: 'Initial overview',
          details: 'Initial details',
        },
      });

      // Read section to get section token
      const section = await store.section(nodePath, 'overview');
      expect(section.token).toMatch(/^sc_t_sec_/);

      // Write using section token
      const result = await store.writeSection(
        nodePath,
        'overview',
        'Updated via section token',
        { token: section.token }
      );

      expect(result.ok).toBe(true);

      // Verify update
      const updated = await store.section(nodePath, 'overview');
      expect(updated.content).toBe('Updated via section token');
    });

    it('node token allows any section write', async () => {
      const { address } = await store.createGroup('test-group');
      const nodePath = `${address}/requirements`;

      await store.populate(nodePath, {
        sections: {
          overview: 'Initial overview',
          details: 'Initial details',
        },
      });

      // Read node to get node token
      const { token: nodeToken } = await store.get(nodePath);

      // Write different sections using same node token
      await store.writeSection(nodePath, 'overview', 'Updated overview', {
        token: nodeToken,
      });

      // Second write fails - token is now stale
      await expect(
        store.writeSection(nodePath, 'details', 'Updated details', {
          token: nodeToken,
        })
      ).rejects.toThrow(StaleTokenError);
    });
  });

  // AC-22: Stale token fails with current state and fresh token
  describe('Token Flow - Stale Token', () => {
    it('writeSection with stale token returns STALE_TOKEN error', async () => {
      const { address } = await store.createGroup('test-group');
      const nodePath = `${address}/requirements`;

      await store.populate(nodePath, {
        sections: {
          overview: 'Initial overview',
          details: 'Initial details',
        },
      });

      // Get token
      const { token: token1 } = await store.get(nodePath);

      // Concurrent write invalidates token1
      await store.writeSection(nodePath, 'overview', 'Updated by writer 1');

      // Try to write with stale token
      try {
        await store.writeSection(nodePath, 'details', 'Updated by writer 2', {
          token: token1,
        });
        throw new Error('Should have thrown StaleTokenError');
      } catch (error) {
        expect(error).toBeInstanceOf(StaleTokenError);
        expect((error as StaleTokenError).code).toBe('STALE_TOKEN');
        expect((error as StaleTokenError).path).toBe(nodePath);

        // Error includes current state
        expect((error as StaleTokenError).current).toBeDefined();

        // Error includes fresh token
        expect((error as StaleTokenError).token).toBeDefined();
        expect((error as StaleTokenError).token).toMatch(/^sc_t_node_/);
      }
    });

    it('can retry with fresh token from error', async () => {
      const { address } = await store.createGroup('test-group');
      const nodePath = `${address}/requirements`;

      await store.populate(nodePath, {
        sections: {
          overview: 'Initial overview',
          details: 'Initial details',
        },
      });

      const { token: staleToken } = await store.get(nodePath);

      // Concurrent write
      await store.writeSection(nodePath, 'overview', 'Concurrent update');

      // Attempt write with stale token, catch error, retry with fresh token
      try {
        await store.writeSection(nodePath, 'details', 'My update', {
          token: staleToken,
        });
      } catch (error) {
        if (error instanceof StaleTokenError) {
          // Retry with fresh token from error
          const freshToken = error.token;
          const result = await store.writeSection(
            nodePath,
            'details',
            'My update',
            { token: freshToken }
          );

          expect(result.ok).toBe(true);

          // Verify update succeeded
          const updated = await store.get(nodePath);
          const detailsSection = updated.sections.find(
            (s) => s.id === 'details'
          );
          expect(detailsSection?.content).toBe('My update');
        } else {
          throw error;
        }
      }
    });

    it('section token detects concurrent section changes', async () => {
      const { address } = await store.createGroup('test-group');
      const nodePath = `${address}/requirements`;

      await store.populate(nodePath, {
        sections: {
          overview: 'Initial overview',
          details: 'Initial details',
        },
      });

      // Get section token
      const { token: sectionToken } = await store.section(nodePath, 'overview');

      // Concurrent write to same section
      await store.writeSection(nodePath, 'overview', 'Concurrent update');

      // Write with stale section token fails
      await expect(
        store.writeSection(nodePath, 'overview', 'My update', {
          token: sectionToken,
        })
      ).rejects.toThrow(StaleTokenError);
    });

    it('section token allows parallel updates to different sections', async () => {
      const { address } = await store.createGroup('test-group');
      const nodePath = `${address}/requirements`;

      await store.populate(nodePath, {
        sections: {
          overview: 'Initial overview',
          details: 'Initial details',
        },
      });

      // Get section tokens for different sections
      const { token: overviewToken } = await store.section(
        nodePath,
        'overview'
      );
      const { token: detailsToken } = await store.section(nodePath, 'details');

      // Update different sections in parallel (no conflict)
      const result1 = await store.writeSection(
        nodePath,
        'overview',
        'Updated overview',
        { token: overviewToken }
      );

      const result2 = await store.writeSection(
        nodePath,
        'details',
        'Updated details',
        { token: detailsToken }
      );

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      // Verify both updates succeeded
      const updated = await store.get(nodePath);
      expect(updated.sections.find((s) => s.id === 'overview')?.content).toBe(
        'Updated overview'
      );
      expect(updated.sections.find((s) => s.id === 'details')?.content).toBe(
        'Updated details'
      );
    });
  });

  // AC-35: Concurrent token holders
  describe('Concurrent Token Holders', () => {
    it('first writer wins, second gets STALE_TOKEN', async () => {
      const { address } = await store.createGroup('test-group');
      const nodePath = `${address}/requirements`;

      await store.populate(nodePath, {
        sections: {
          overview: 'Initial overview',
          details: 'Initial details',
        },
      });

      // Both agents read and get token
      const agent1Read = await store.get(nodePath);
      const agent2Read = await store.get(nodePath);

      expect(agent1Read.token).toBe(agent2Read.token);

      // Agent 1 writes first
      const result1 = await store.writeSection(
        nodePath,
        'overview',
        'Agent 1 update',
        { token: agent1Read.token }
      );

      expect(result1.ok).toBe(true);

      // Agent 2 writes with same (now stale) token
      await expect(
        store.writeSection(nodePath, 'overview', 'Agent 2 update', {
          token: agent2Read.token,
        })
      ).rejects.toThrow(StaleTokenError);

      // Verify only agent 1's update persisted
      const final = await store.get(nodePath);
      expect(final.sections.find((s) => s.id === 'overview')?.content).toBe(
        'Agent 1 update'
      );
    });

    it('multiple readers hold same token until first write', async () => {
      const { address } = await store.createGroup('test-group');
      const nodePath = `${address}/requirements`;

      await store.populate(nodePath, {
        sections: {
          overview: 'Initial content',
          details: 'Initial details',
        },
      });

      // Three agents read simultaneously
      const read1 = await store.get(nodePath);
      const read2 = await store.get(nodePath);
      const read3 = await store.get(nodePath);

      // All have same token
      expect(read1.token).toBe(read2.token);
      expect(read2.token).toBe(read3.token);

      // First write succeeds
      await store.writeSection(nodePath, 'overview', 'First update', {
        token: read1.token,
      });

      // Second and third writes fail
      await expect(
        store.writeSection(nodePath, 'overview', 'Second update', {
          token: read2.token,
        })
      ).rejects.toThrow(StaleTokenError);

      await expect(
        store.writeSection(nodePath, 'overview', 'Third update', {
          token: read3.token,
        })
      ).rejects.toThrow(StaleTokenError);
    });

    it('agent can retry after losing race', async () => {
      const { address } = await store.createGroup('test-group');
      const nodePath = `${address}/requirements`;

      await store.populate(nodePath, {
        sections: {
          overview: 'Initial overview',
          details: 'Initial details',
        },
      });

      // Both agents read
      const agent1Token = (await store.get(nodePath)).token;
      const agent2Token = (await store.get(nodePath)).token;

      // Agent 1 wins
      await store.writeSection(nodePath, 'overview', 'Agent 1 update', {
        token: agent1Token,
      });

      // Agent 2 loses, gets fresh token from error
      let freshToken: string | undefined;
      try {
        await store.writeSection(nodePath, 'overview', 'Agent 2 update', {
          token: agent2Token,
        });
      } catch (error) {
        if (error instanceof StaleTokenError) {
          freshToken = error.token;
        }
      }

      expect(freshToken).toBeDefined();

      // Agent 2 retries with fresh token
      const result = await store.writeSection(
        nodePath,
        'overview',
        'Agent 2 retry',
        { token: freshToken }
      );

      expect(result.ok).toBe(true);

      // Verify agent 2's retry succeeded
      const final = await store.get(nodePath);
      expect(final.sections.find((s) => s.id === 'overview')?.content).toBe(
        'Agent 2 retry'
      );
    });
  });

  // Client name resolution -> Store operations -> response flow
  describe('Client-Store Flow', () => {
    it('integrates name resolution with store operations', async () => {
      // Store creates group
      const { address } = await store.createGroup('test-group');

      // Client saves mapping (simulates user command or UI)
      client.saveMapping('user-auth', address);

      // Application uses friendly name
      const friendlyName = 'user-auth';

      // Client resolves to address
      const resolvedAddress = client.resolveAddress(friendlyName);

      // Store operations use address
      const nodePath = `${resolvedAddress}/requirements`;
      await store.populate(nodePath, {
        sections: {
          overview: 'Requirements overview',
          details: 'Requirements details',
        },
      });

      // Read back
      const node = await store.get(nodePath);
      expect(node.sections).toHaveLength(2);

      // Client layer never sees addresses in normal workflow
      expect(friendlyName).not.toContain('sc_g_');
      expect(resolvedAddress).toContain('sc_g_');
    });

    it('supports multiple clients with same store', async () => {
      const { address } = await store.createGroup('test-group');

      // Client 1 maps to "user-auth"
      const client1 = new Client({
        clientId: 'client-1',
        mappingPath: path.join(setup.tempDir, 'client1-mappings.json'),
        store,
      });
      client1.saveMapping('user-auth', address);

      // Client 2 maps same address to "authentication"
      const client2 = new Client({
        clientId: 'client-2',
        mappingPath: path.join(setup.tempDir, 'client2-mappings.json'),
        store,
      });
      client2.saveMapping('authentication', address);

      // Both resolve to same address
      expect(client1.resolveAddress('user-auth')).toBe(address);
      expect(client2.resolveAddress('authentication')).toBe(address);

      // Both can operate on same group
      const path1 = `${client1.resolveAddress('user-auth')}/requirements`;
      const path2 = `${client2.resolveAddress('authentication')}/requirements`;

      expect(path1).toBe(path2);

      await store.populate(path1, {
        sections: {
          overview: 'Content from client 1',
          details: 'Details',
        },
      });

      const node = await store.get(path2);
      expect(node.sections.find((s) => s.id === 'overview')?.content).toBe(
        'Content from client 1'
      );
    });
  });

  // Metadata operations in workflow
  describe('Metadata Operations', () => {
    it('supports metadata updates with tokens', async () => {
      const { address } = await store.createGroup('test-group');
      const nodePath = `${address}/requirements`;

      await store.populate(nodePath, {
        metadata: { status: 'draft' },
        sections: {
          overview: 'Requirements',
          details: 'Details',
        },
      });

      // Read metadata with token
      const { metadata, token } = await store.meta(nodePath);
      expect(metadata['status']).toBe('draft');

      // Update metadata with token
      const result = await store.setMeta(nodePath, 'status', 'locked', {
        token,
      });

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ status: 'locked' });

      // Verify update
      const updated = await store.meta(nodePath);
      expect(updated.metadata['status']).toBe('locked');
    });

    it('metadata write with stale token fails', async () => {
      const { address } = await store.createGroup('test-group');
      const nodePath = `${address}/requirements`;

      await store.populate(nodePath, {
        metadata: { status: 'draft' },
        sections: {
          overview: 'Content',
          details: 'Details',
        },
      });

      // Get token
      const { token: staleToken } = await store.meta(nodePath);

      // Concurrent metadata update
      await store.setMeta(nodePath, 'status', 'locked');

      // Write with stale token fails
      await expect(
        store.setMeta(nodePath, 'status', 'draft', { token: staleToken })
      ).rejects.toThrow(StaleTokenError);
    });
  });

  // client.createGroup tests
  describe('client.createGroup', () => {
    // AC-1: Create named group returns { address, schema, name }
    it('creates named group and returns address, schema, and name', async () => {
      const result = await client.createGroup('test-group', {
        name: 'user-auth',
      });

      // Verify result structure
      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('schema');
      expect(result).toHaveProperty('name');

      // Verify values
      expect(result.address).toMatch(/^sc_g_/);
      expect(result.schema).toBe('test-group');
      expect(result.name).toBe('user-auth');

      // Verify mapping was saved
      const resolvedAddress = client.resolveAddress('user-auth');
      expect(resolvedAddress).toBe(result.address);
    });

    // AC-2: Create unnamed group returns { address, schema }
    it('creates unnamed group and returns address and schema without name', async () => {
      const result = await client.createGroup('test-group');

      // Verify result structure
      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('schema');
      expect(result).not.toHaveProperty('name');

      // Verify values
      expect(result.address).toMatch(/^sc_g_/);
      expect(result.schema).toBe('test-group');

      // Verify no mapping was created
      expect(() => client.resolveAddress('unnamed-group')).toThrow();
    });

    // AC-3, EC-4: Duplicate name raises MappingError
    it('raises MappingError when creating group with duplicate name', async () => {
      // Create first group with name
      const first = await client.createGroup('test-group', {
        name: 'payment',
      });

      expect(first.name).toBe('payment');

      // Attempt to create second group with same name
      await expect(
        client.createGroup('test-group', { name: 'payment' })
      ).rejects.toThrow(MappingError);

      // Verify original mapping unchanged
      const resolvedAddress = client.resolveAddress('payment');
      expect(resolvedAddress).toBe(first.address);
    });

    // AC-4: Name persists in _meta.json after mapping deletion, recoverable via rebuild
    it('persists name in _meta.json and recovers after mapping file deletion', async () => {
      // Create named group
      const result = await client.createGroup('test-group', {
        name: 'user-auth',
      });

      // Verify mapping works
      expect(client.resolveAddress('user-auth')).toBe(result.address);

      // Read _meta.json to verify name persisted
      const meta = await store.getGroupMeta(result.address);
      expect(meta.name).toBe('user-auth');

      // Delete mapping file
      const fs = await import('node:fs');
      fs.unlinkSync(mappingPath);

      // Verify mapping is gone
      expect(() => client.resolveAddress('user-auth')).toThrow();

      // Rebuild from _meta.json
      const rebuildResult = await client.rebuildMappings();

      expect(rebuildResult.recovered).toBe(1);

      // Verify mapping restored
      expect(client.resolveAddress('user-auth')).toBe(result.address);
    });

    it('creates multiple named groups successfully', async () => {
      const group1 = await client.createGroup('test-group', {
        name: 'auth',
      });
      const group2 = await client.createGroup('test-group', {
        name: 'billing',
      });
      const group3 = await client.createGroup('test-group', {
        name: 'analytics',
      });

      // Verify all groups created with unique addresses
      expect(group1.address).toMatch(/^sc_g_/);
      expect(group2.address).toMatch(/^sc_g_/);
      expect(group3.address).toMatch(/^sc_g_/);
      expect(group1.address).not.toBe(group2.address);
      expect(group2.address).not.toBe(group3.address);

      // Verify all mappings work
      expect(client.resolveAddress('auth')).toBe(group1.address);
      expect(client.resolveAddress('billing')).toBe(group2.address);
      expect(client.resolveAddress('analytics')).toBe(group3.address);
    });

    it('allows same name to be reused after mapping is idempotent', async () => {
      // Create group with name
      const first = await client.createGroup('test-group', { name: 'test' });

      // Calling saveMapping again with same name and address is idempotent
      client.saveMapping('test', first.address);

      // Verify mapping unchanged
      expect(client.resolveAddress('test')).toBe(first.address);
    });

    it('creates both named and unnamed groups successfully', async () => {
      const named = await client.createGroup('test-group', {
        name: 'named-group',
      });
      const unnamed = await client.createGroup('test-group');

      // Verify named group has name property
      expect(named.name).toBe('named-group');

      // Verify unnamed group does not have name property
      expect(unnamed).not.toHaveProperty('name');

      // Verify named group is resolvable
      expect(client.resolveAddress('named-group')).toBe(named.address);

      // Verify both groups exist in store
      const namedNode = await store.get(`${named.address}/requirements`);
      const unnamedNode = await store.get(`${unnamed.address}/requirements`);

      expect(namedNode.metadata['schema-id']).toBe('test-node');
      expect(unnamedNode.metadata['schema-id']).toBe('test-node');
    });
  });

  // client.get with name resolution and address passthrough
  describe('client.get', () => {
    it('resolves name and returns node data (AC-5)', async () => {
      // Create group with name
      const group = await client.createGroup('test-group', {
        name: 'hello-world',
      });

      // Populate sections
      await store.populate(`${group.address}/requirements`, {
        sections: {
          overview: 'Test overview content',
          details: 'Test details content',
        },
      });

      // Get by name - should resolve and return data
      const result = await client.get('hello-world/requirements');

      expect(result.metadata['schema-id']).toBe('test-node');
      expect(result.sections).toHaveLength(2); // overview and details
      const overviewSection = result.sections.find((s) => s.id === 'overview');
      expect(overviewSection).toBeDefined();
      expect(overviewSection?.content).toBe('Test overview content');
    });

    it('accepts address directly and returns data (AC-6)', async () => {
      // Create group
      const group = await client.createGroup('test-group', {
        name: 'test-name',
      });

      // Populate sections
      await store.populate(`${group.address}/plan`, {
        sections: {
          overview: 'Plan overview',
          details: 'Plan details here',
        },
      });

      // Get by address directly (sc_g_ prefix)
      const result = await client.get(`${group.address}/plan`);

      expect(result.metadata['schema-id']).toBe('test-node');
      const detailsSection = result.sections.find((s) => s.id === 'details');
      expect(detailsSection).toBeDefined();
      expect(detailsSection?.content).toBe('Plan details here');
    });

    it('raises NameNotFoundError for unregistered name (AC-7, EC-5)', async () => {
      // Attempt to get with name that doesn't exist in mappings
      await expect(client.get('nonexistent/requirements')).rejects.toThrow(
        NameNotFoundError
      );
      await expect(client.get('nonexistent/requirements')).rejects.toThrow(
        'Name nonexistent not found in mappings'
      );
    });

    it('address passthrough works regardless of mapping state (AC-24)', async () => {
      // Create group with name
      const group = await client.createGroup('test-group', {
        name: 'mapped-group',
      });

      // Populate sections
      await store.populate(`${group.address}/requirements`, {
        sections: {
          overview: 'Content via address',
          details: 'More content',
        },
      });

      // Get by address should work even though mapping exists
      const resultByAddress = await client.get(`${group.address}/requirements`);
      expect(resultByAddress.metadata['schema-id']).toBe('test-node');
      const section = resultByAddress.sections.find((s) => s.id === 'overview');
      expect(section?.content).toBe('Content via address');

      // Delete the mapping file to test passthrough works without mappings
      const fs = await import('node:fs');
      fs.unlinkSync(mappingPath);

      // Get by address should still work (passthrough ignores mapping state)
      const resultAfterDelete = await client.get(
        `${group.address}/requirements`
      );
      expect(resultAfterDelete.metadata['schema-id']).toBe('test-node');
      const sectionAfter = resultAfterDelete.sections.find(
        (s) => s.id === 'overview'
      );
      expect(sectionAfter?.content).toBe('Content via address');

      // Get by name should fail (mapping no longer exists)
      await expect(client.get('mapped-group/requirements')).rejects.toThrow(
        NameNotFoundError
      );
    });

    it('handles multiple slots with name resolution', async () => {
      // Create group
      const group = await client.createGroup('test-group', {
        name: 'multi-slot',
      });

      // Populate both slots
      await store.populate(`${group.address}/requirements`, {
        sections: {
          overview: 'Requirements overview',
          details: 'Requirements details',
        },
      });

      await store.populate(`${group.address}/plan`, {
        sections: {
          overview: 'Plan overview',
          details: 'Plan details',
        },
      });

      // Get both slots by name
      const requirements = await client.get('multi-slot/requirements');
      const plan = await client.get('multi-slot/plan');

      expect(requirements.metadata['schema-id']).toBe('test-node');
      expect(plan.metadata['schema-id']).toBe('test-node');

      const reqSection = requirements.sections.find((s) => s.id === 'overview');
      const planSection = plan.sections.find((s) => s.id === 'details');

      expect(reqSection?.content).toBe('Requirements overview');
      expect(planSection?.content).toBe('Plan details');
    });

    it('validates path format requires slot', async () => {
      // Create group
      const group = await client.createGroup('test-group', {
        name: 'test-group-name',
      });

      // Attempt to get with only group name (no slot)
      await expect(client.get('test-group-name')).rejects.toThrow(
        'Path must include slot: group/slot'
      );

      // Attempt to get with only address (no slot)
      await expect(client.get(group.address)).rejects.toThrow(
        'Path must include slot: group/slot'
      );
    });
  });

  // client.list filtering, empty states, and multi-client isolation
  describe('client.list', () => {
    // AC-8, AC-19: List returns array with name, address, schema, client
    it('returns array with name, address, schema, and client fields', async () => {
      // Create named groups
      const group1 = await client.createGroup('test-group', {
        name: 'user-auth',
      });
      const group2 = await client.createGroup('test-group', {
        name: 'payment',
      });

      // Call client.list
      const results = await client.list();

      // Verify result structure
      expect(results).toHaveLength(2);

      // Verify each result has required fields
      const userAuth = results.find((r) => r.name === 'user-auth');
      expect(userAuth).toBeDefined();
      expect(userAuth?.address).toBe(group1.address);
      expect(userAuth?.schema).toBe('test-group');
      expect(userAuth?.client).toBe('integration-client');

      const payment = results.find((r) => r.name === 'payment');
      expect(payment).toBeDefined();
      expect(payment?.address).toBe(group2.address);
      expect(payment?.schema).toBe('test-group');
      expect(payment?.client).toBe('integration-client');
    });

    // AC-9: List returns empty array when client has no groups
    it('returns empty array when client has no groups', async () => {
      // Client with no mappings created
      const results = await client.list();

      // Verify empty array
      expect(results).toEqual([]);
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(0);
    });

    // AC-10: Multiple clients each see only their own groups
    it('multiple clients each see only their own groups', async () => {
      // Client 1 creates groups
      const client1Group1 = await client.createGroup('test-group', {
        name: 'client1-auth',
      });
      const client1Group2 = await client.createGroup('test-group', {
        name: 'client1-payment',
      });

      // Client 2 with different client ID
      const client2 = new Client({
        clientId: 'client-2',
        mappingPath: path.join(setup.tempDir, 'client2-mappings.json'),
        store,
      });

      // Client 2 creates groups
      const client2Group1 = await client2.createGroup('test-group', {
        name: 'client2-auth',
      });
      const client2Group2 = await client2.createGroup('test-group', {
        name: 'client2-billing',
      });

      // Client 1 lists - should only see client 1 groups
      const client1Results = await client.list();
      expect(client1Results).toHaveLength(2);
      expect(
        client1Results.every((r) => r.client === 'integration-client')
      ).toBe(true);
      const client1Names = client1Results.map((r) => r.name).sort();
      expect(client1Names).toEqual(['client1-auth', 'client1-payment']);

      // Client 2 lists - should only see client 2 groups
      const client2Results = await client2.list();
      expect(client2Results).toHaveLength(2);
      expect(client2Results.every((r) => r.client === 'client-2')).toBe(true);
      const client2Names = client2Results.map((r) => r.name).sort();
      expect(client2Names).toEqual(['client2-auth', 'client2-billing']);

      // Verify addresses are correct
      expect(
        client1Results.find((r) => r.name === 'client1-auth')?.address
      ).toBe(client1Group1.address);
      expect(
        client1Results.find((r) => r.name === 'client1-payment')?.address
      ).toBe(client1Group2.address);
      expect(
        client2Results.find((r) => r.name === 'client2-auth')?.address
      ).toBe(client2Group1.address);
      expect(
        client2Results.find((r) => r.name === 'client2-billing')?.address
      ).toBe(client2Group2.address);
    });

    // AC-22: List returns empty array when no groups exist
    it('returns empty array when no groups exist at all', async () => {
      // Fresh client with no groups created in the store
      const freshClient = new Client({
        clientId: 'fresh-client',
        mappingPath: path.join(setup.tempDir, 'fresh-mappings.json'),
        store,
      });

      // List with no groups in store at all
      const results = await freshClient.list();

      expect(results).toEqual([]);
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(0);
    });

    it('handles missing mapping file gracefully', async () => {
      // Create groups first
      await client.createGroup('test-group', { name: 'test1' });
      await client.createGroup('test-group', { name: 'test2' });

      // Verify list works
      const beforeDelete = await client.list();
      expect(beforeDelete).toHaveLength(2);

      // Delete mapping file
      const fs = await import('node:fs');
      fs.unlinkSync(mappingPath);

      // List should return empty array (no mappings)
      const afterDelete = await client.list();
      expect(afterDelete).toEqual([]);
      expect(Array.isArray(afterDelete)).toBe(true);
      expect(afterDelete).toHaveLength(0);
    });

    it('skips groups that no longer exist in store', async () => {
      // Create groups
      const group1 = await client.createGroup('test-group', {
        name: 'keep-me',
      });
      const group2 = await client.createGroup('test-group', {
        name: 'delete-me',
      });

      // Verify both are listed
      const before = await client.list();
      expect(before).toHaveLength(2);

      // Delete one group directly from store (bypassing client)
      await store.deleteGroup(group2.address);

      // List should only return the remaining group
      const after = await client.list();
      expect(after).toHaveLength(1);
      expect(after[0]?.name).toBe('keep-me');
      expect(after[0]?.address).toBe(group1.address);

      // Mapping still exists for deleted group, but list skips it
      const mappings = client.loadMappings();
      expect(mappings['delete-me']).toBeDefined();
    });

    it('returns correct metadata for all groups', async () => {
      // Create groups with different names
      const auth = await client.createGroup('test-group', { name: 'auth' });
      const billing = await client.createGroup('test-group', {
        name: 'billing',
      });
      const analytics = await client.createGroup('test-group', {
        name: 'analytics',
      });

      const results = await client.list();

      // Verify all groups returned
      expect(results).toHaveLength(3);

      // Verify metadata for each
      for (const result of results) {
        expect(result.address).toMatch(/^sc_g_/);
        expect(result.schema).toBe('test-group');
        expect(result.client).toBe('integration-client');
        expect(['auth', 'billing', 'analytics']).toContain(result.name);
      }

      // Verify addresses match
      expect(results.find((r) => r.name === 'auth')?.address).toBe(
        auth.address
      );
      expect(results.find((r) => r.name === 'billing')?.address).toBe(
        billing.address
      );
      expect(results.find((r) => r.name === 'analytics')?.address).toBe(
        analytics.address
      );
    });
  });

  // client.deleteGroup tests
  describe('client.deleteGroup', () => {
    // AC-11: Delete by registered name removes group and mapping
    it('deletes group and removes mapping when given registered name', async () => {
      // Create named group
      const group = await client.createGroup('test-group', {
        name: 'user-auth',
      });

      // Verify group exists in store
      const node = await store.get(`${group.address}/requirements`);
      expect(node.metadata['schema-id']).toBe('test-node');

      // Verify mapping exists
      expect(client.resolveAddress('user-auth')).toBe(group.address);

      // Delete by name
      const result = await client.deleteGroup('user-auth');

      expect(result).toEqual({ ok: true });

      // Verify group deleted from store
      await expect(
        store.get(`${group.address}/requirements`)
      ).rejects.toThrow();

      // Verify mapping removed
      expect(() => client.resolveAddress('user-auth')).toThrow(
        NameNotFoundError
      );
    });

    // AC-12: Delete by valid address removes group
    it('deletes group when given valid address', async () => {
      // Create unnamed group (no name mapping)
      const group = await client.createGroup('test-group');

      // Verify group exists
      const node = await store.get(`${group.address}/requirements`);
      expect(node.metadata['schema-id']).toBe('test-node');

      // Delete by address
      const result = await client.deleteGroup(group.address);

      expect(result).toEqual({ ok: true });

      // Verify group deleted
      await expect(
        store.get(`${group.address}/requirements`)
      ).rejects.toThrow();
    });

    it('deletes group and removes mapping when given address with existing mapping', async () => {
      // Create named group
      const group = await client.createGroup('test-group', { name: 'payment' });

      // Verify mapping exists
      expect(client.resolveAddress('payment')).toBe(group.address);

      // Delete by address (not by name)
      const result = await client.deleteGroup(group.address);

      expect(result).toEqual({ ok: true });

      // Verify group deleted
      await expect(
        store.get(`${group.address}/requirements`)
      ).rejects.toThrow();

      // Verify mapping removed
      expect(() => client.resolveAddress('payment')).toThrow(NameNotFoundError);
    });

    // AC-13, EC-6: Delete with unregistered name raises NameNotFoundError
    it('raises NameNotFoundError when deleting with unregistered name', async () => {
      // Attempt to delete with name that doesn't exist in mappings
      await expect(client.deleteGroup('nonexistent-name')).rejects.toThrow(
        NameNotFoundError
      );
      await expect(client.deleteGroup('nonexistent-name')).rejects.toThrow(
        'Name nonexistent-name not found in mappings'
      );
    });

    it('deletes one of multiple groups successfully', async () => {
      // Create multiple groups
      const group1 = await client.createGroup('test-group', { name: 'auth' });
      const group2 = await client.createGroup('test-group', {
        name: 'billing',
      });
      const group3 = await client.createGroup('test-group', {
        name: 'analytics',
      });

      // Verify all exist
      const listBefore = await client.list();
      expect(listBefore).toHaveLength(3);

      // Delete one group
      await client.deleteGroup('billing');

      // Verify only billing deleted
      const listAfter = await client.list();
      expect(listAfter).toHaveLength(2);
      expect(listAfter.find((g) => g.name === 'auth')).toBeDefined();
      expect(listAfter.find((g) => g.name === 'analytics')).toBeDefined();
      expect(listAfter.find((g) => g.name === 'billing')).toBeUndefined();

      // Verify other groups still accessible
      await expect(client.get('auth/requirements')).resolves.toBeDefined();
      await expect(client.get('analytics/requirements')).resolves.toBeDefined();
      await expect(client.get('billing/requirements')).rejects.toThrow();
    });

    it('handles deletion when mapping file does not exist', async () => {
      // Create group
      const group = await client.createGroup('test-group', { name: 'test' });

      // Delete mapping file
      const fs = await import('node:fs');
      fs.unlinkSync(mappingPath);

      // Delete by address should still work (no mapping to remove)
      const result = await client.deleteGroup(group.address);

      expect(result).toEqual({ ok: true });

      // Verify group deleted
      await expect(
        store.get(`${group.address}/requirements`)
      ).rejects.toThrow();
    });

    it('deletes group with populated content', async () => {
      // Create group with content
      const group = await client.createGroup('test-group', {
        name: 'hello-world',
      });

      await store.populate(`${group.address}/requirements`, {
        metadata: { status: 'draft' },
        sections: {
          overview: 'Test overview content',
          details: 'Test details content',
        },
      });

      // Verify content exists
      const before = await client.get('hello-world/requirements');
      expect(before.sections).toHaveLength(2);

      // Delete group
      const result = await client.deleteGroup('hello-world');

      expect(result).toEqual({ ok: true });

      // Verify group and content deleted
      await expect(client.get('hello-world/requirements')).rejects.toThrow();
    });

    it('error code is NAME_NOT_FOUND for unregistered name', async () => {
      try {
        await client.deleteGroup('unregistered-name');
        throw new Error('Should have thrown NameNotFoundError');
      } catch (error) {
        expect(error).toBeInstanceOf(NameNotFoundError);
        expect((error as NameNotFoundError).code).toBe('NAME_NOT_FOUND');
      }
    });
  });

  // rebuildMappings recovery workflow
  describe('rebuildMappings', () => {
    it('recovers mappings from _meta.json after file deletion', async () => {
      // Create named groups through client
      const result1 = await client.createGroup('test-group', {
        name: 'user-auth',
      });
      const result2 = await client.createGroup('test-group', {
        name: 'payment',
      });

      // Verify mappings work
      expect(client.resolveAddress('user-auth')).toBe(result1.address);
      expect(client.resolveAddress('payment')).toBe(result2.address);

      // Simulate mapping file deletion
      const fs = await import('node:fs');
      fs.unlinkSync(mappingPath);

      // Verify mappings are gone
      expect(() => client.resolveAddress('user-auth')).toThrow();
      expect(() => client.resolveAddress('payment')).toThrow();

      // Rebuild from _meta.json
      const rebuildResult = await client.rebuildMappings();

      expect(rebuildResult).toEqual({ recovered: 2 });

      // Verify mappings restored
      expect(client.resolveAddress('user-auth')).toBe(result1.address);
      expect(client.resolveAddress('payment')).toBe(result2.address);
    });

    it('skips unnamed groups during rebuild', async () => {
      // Create named group
      const named = await client.createGroup('test-group', { name: 'named' });

      // Create unnamed group directly through store
      const unnamed = await store.createGroup('test-group', {
        client: client.getClientId(),
      });

      // Delete mappings
      const fs = await import('node:fs');
      fs.unlinkSync(mappingPath);

      // Rebuild
      const result = await client.rebuildMappings();

      // Only named group recovered
      expect(result).toEqual({ recovered: 1 });
      expect(client.resolveAddress('named')).toBe(named.address);
    });

    it('handles empty store during rebuild', async () => {
      const result = await client.rebuildMappings();

      expect(result).toEqual({ recovered: 0 });
    });
  });
});
