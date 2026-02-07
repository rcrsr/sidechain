/**
 * Tests for path resolution helper
 * Covers: EC-1, EC-2, EC-3, AC-24, AC-25, AC-26, AC-32, AC-33
 */

import { describe, expect, it } from 'vitest';

import type { Backend, RawNode } from '../../../src/types/backend.js';
import { NotFoundError } from '../../../src/core/errors.js';
import { resolveNodePath } from '../../../src/core/helpers/resolve-path.js';

/**
 * Mock backend for testing
 */
class MockBackend implements Backend {
  private nodes = new Map<string, RawNode>();

  setNode(path: string, slot: string, node: RawNode): void {
    this.nodes.set(`${path}/${slot}`, node);
  }

  async createGroup(): Promise<void> {
    throw new Error('Not implemented');
  }

  async deleteGroup(): Promise<void> {
    throw new Error('Not implemented');
  }

  async listGroups(): Promise<never[]> {
    return [];
  }

  async readNode(resolvedPath: string, slot: string): Promise<RawNode> {
    const key = `${resolvedPath}/${slot}`;
    const node = this.nodes.get(key);
    if (node === undefined) {
      throw new NotFoundError(`${resolvedPath}/${slot}`, 'Node not found');
    }
    return node;
  }

  async writeNode(): Promise<void> {
    throw new Error('Not implemented');
  }

  async exists(resolvedPath: string, slot?: string): Promise<boolean> {
    if (slot === undefined) {
      return false;
    }
    const key = `${resolvedPath}/${slot}`;
    return this.nodes.has(key);
  }
}

describe('resolveNodePath', () => {
  describe('EC-1: Path with fewer than 2 parts throws NotFoundError', () => {
    it('throws NotFoundError for empty path', async () => {
      const backend = new MockBackend();
      const resolveGroupPath = async () => '/resolved/path';

      await expect(
        resolveNodePath('', backend, resolveGroupPath)
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError for single part path', async () => {
      const backend = new MockBackend();
      const resolveGroupPath = async () => '/resolved/path';

      await expect(
        resolveNodePath('sc_g_abc123', backend, resolveGroupPath)
      ).rejects.toThrow(NotFoundError);

      try {
        await resolveNodePath('sc_g_abc123', backend, resolveGroupPath);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
        if (error instanceof NotFoundError) {
          expect(error.message).toBe('Invalid node path: sc_g_abc123');
          expect(error.path).toBe('sc_g_abc123');
        }
      }
    });

    it('throws NotFoundError for path with only slashes', async () => {
      const backend = new MockBackend();
      const resolveGroupPath = async () => '/resolved/path';

      await expect(
        resolveNodePath('/', backend, resolveGroupPath)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('EC-2: Invalid group address throws NotFoundError', () => {
    it('throws NotFoundError for group address without prefix', async () => {
      const backend = new MockBackend();
      const resolveGroupPath = async () => '/resolved/path';

      await expect(
        resolveNodePath('invalid_group/slot', backend, resolveGroupPath)
      ).rejects.toThrow(NotFoundError);

      try {
        await resolveNodePath('invalid_group/slot', backend, resolveGroupPath);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
        if (error instanceof NotFoundError) {
          expect(error.message).toBe('Invalid group address: invalid_group');
          expect(error.path).toBe('invalid_group/slot');
        }
      }
    });

    it('throws NotFoundError for group address with wrong prefix', async () => {
      const backend = new MockBackend();
      const resolveGroupPath = async () => '/resolved/path';

      await expect(
        resolveNodePath('wrong_g_abc123/slot', backend, resolveGroupPath)
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError for group address with non-hex characters', async () => {
      const backend = new MockBackend();
      const resolveGroupPath = async () => '/resolved/path';

      await expect(
        resolveNodePath('sc_g_xyz123/slot', backend, resolveGroupPath)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('EC-3: Missing node throws NotFoundError', () => {
    it('throws NotFoundError when node does not exist', async () => {
      const backend = new MockBackend();
      const resolveGroupPath = async () => '/resolved/path';

      await expect(
        resolveNodePath('sc_g_abc123/slot', backend, resolveGroupPath)
      ).rejects.toThrow(NotFoundError);

      try {
        await resolveNodePath('sc_g_abc123/slot', backend, resolveGroupPath);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
        if (error instanceof NotFoundError) {
          expect(error.message).toBe('Node not found: sc_g_abc123/slot');
          expect(error.path).toBe('sc_g_abc123/slot');
        }
      }
    });

    it('throws NotFoundError when group exists but slot does not', async () => {
      const backend = new MockBackend();
      backend.setNode('/resolved/path', 'other-slot', {
        metadata: {},
        sections: {},
      });
      const resolveGroupPath = async () => '/resolved/path';

      await expect(
        resolveNodePath('sc_g_abc123/missing-slot', backend, resolveGroupPath)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('AC-32: Trailing slashes handled', () => {
    it('handles path with single trailing slash', async () => {
      const backend = new MockBackend();
      const rawNode: RawNode = {
        metadata: { status: 'draft' },
        sections: { overview: 'content' },
      };
      backend.setNode('/resolved/path', 'slot', rawNode);
      const resolveGroupPath = async () => '/resolved/path';

      const result = await resolveNodePath(
        'sc_g_abc123/slot/',
        backend,
        resolveGroupPath
      );

      expect(result.group).toBe('sc_g_abc123');
      expect(result.slot).toBe('slot');
      expect(result.resolvedPath).toBe('/resolved/path');
      expect(result.rawNode).toEqual(rawNode);
    });

    it('handles path with multiple trailing slashes', async () => {
      const backend = new MockBackend();
      const rawNode: RawNode = {
        metadata: { status: 'draft' },
        sections: {},
      };
      backend.setNode('/resolved/path', 'slot', rawNode);
      const resolveGroupPath = async () => '/resolved/path';

      const result = await resolveNodePath(
        'sc_g_abc123/slot///',
        backend,
        resolveGroupPath
      );

      expect(result.group).toBe('sc_g_abc123');
      expect(result.slot).toBe('slot');
    });
  });

  describe('AC-33: Empty segments handled', () => {
    it('handles path with empty segment between parts', async () => {
      const backend = new MockBackend();
      const rawNode: RawNode = {
        metadata: {},
        sections: {},
      };
      backend.setNode('/resolved/path', 'slot', rawNode);
      const resolveGroupPath = async () => '/resolved/path';

      const result = await resolveNodePath(
        'sc_g_abc123//slot',
        backend,
        resolveGroupPath
      );

      expect(result.group).toBe('sc_g_abc123');
      expect(result.slot).toBe('slot');
    });

    it('handles path with multiple empty segments', async () => {
      const backend = new MockBackend();
      const rawNode: RawNode = {
        metadata: {},
        sections: {},
      };
      backend.setNode('/resolved/path', 'slot', rawNode);
      const resolveGroupPath = async () => '/resolved/path';

      const result = await resolveNodePath(
        'sc_g_abc123///slot',
        backend,
        resolveGroupPath
      );

      expect(result.group).toBe('sc_g_abc123');
      expect(result.slot).toBe('slot');
    });
  });

  describe('Successful path resolution', () => {
    it('returns resolved node for valid path', async () => {
      const backend = new MockBackend();
      const rawNode: RawNode = {
        metadata: { status: 'draft', priority: 1 },
        sections: { overview: 'Section content' },
      };
      backend.setNode('/resolved/path', 'requirements', rawNode);
      const resolveGroupPath = async (group: string) => {
        expect(group).toBe('sc_g_7f3a9c2e');
        return '/resolved/path';
      };

      const result = await resolveNodePath(
        'sc_g_7f3a9c2e/requirements',
        backend,
        resolveGroupPath
      );

      expect(result).toEqual({
        group: 'sc_g_7f3a9c2e',
        slot: 'requirements',
        resolvedPath: '/resolved/path',
        rawNode,
      });
    });

    it('resolves path with extra segments beyond slot', async () => {
      const backend = new MockBackend();
      const rawNode: RawNode = {
        metadata: {},
        sections: { section: 'content' },
      };
      backend.setNode('/resolved/path', 'slot', rawNode);
      const resolveGroupPath = async () => '/resolved/path';

      const result = await resolveNodePath(
        'sc_g_abc123/slot/section/item',
        backend,
        resolveGroupPath
      );

      expect(result.group).toBe('sc_g_abc123');
      expect(result.slot).toBe('slot');
      expect(result.rawNode).toEqual(rawNode);
    });
  });
});
