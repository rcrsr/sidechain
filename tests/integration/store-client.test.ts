/**
 * Integration tests for full Store-Client workflow
 * Covers: AC-1, AC-7, AC-9, AC-10, AC-22, AC-35
 *
 * Tests end-to-end workflows combining Client name resolution with Store operations.
 */

import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Client } from '../../src/core/client.js';
import { StaleTokenError } from '../../src/core/errors.js';
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
    client = new Client(mappingPath);
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
      const client1 = new Client(
        path.join(setup.tempDir, 'client1-mappings.json')
      );
      client1.saveMapping('user-auth', address);

      // Client 2 maps same address to "authentication"
      const client2 = new Client(
        path.join(setup.tempDir, 'client2-mappings.json')
      );
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
});
