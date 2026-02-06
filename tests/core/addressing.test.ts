/**
 * Tests for addressing utilities
 * Covers path parsing, validation, slug algorithm, and name resolution
 */

import { describe, expect, it } from 'vitest';

import {
  generateGroupAddress,
  InMemoryAddressResolver,
  isValidGroupAddress,
  parsePath,
  slugify,
} from '../../src/core/addressing.js';
import { NameNotFoundError } from '../../src/core/errors.js';

describe('parsePath', () => {
  // Path parsing: valid paths decompose into components
  describe('valid path parsing', () => {
    it('parses group only', () => {
      const result = parsePath('user-auth');

      expect(result).toEqual({
        group: 'user-auth',
        isMeta: false,
      });
    });

    it('parses group and slot', () => {
      const result = parsePath('user-auth/requirements');

      expect(result).toEqual({
        group: 'user-auth',
        slot: 'requirements',
        isMeta: false,
      });
    });

    it('parses group, slot, and section', () => {
      const result = parsePath('user-auth/plan/phase-1');

      expect(result).toEqual({
        group: 'user-auth',
        slot: 'plan',
        section: 'phase-1',
        isMeta: false,
      });
    });

    it('parses full path with item', () => {
      const result = parsePath('user-auth/plan/phase-1/1.2');

      expect(result).toEqual({
        group: 'user-auth',
        slot: 'plan',
        section: 'phase-1',
        item: '1.2',
        isMeta: false,
      });
    });

    it('handles empty path', () => {
      const result = parsePath('');

      expect(result).toEqual({
        isMeta: false,
      });
    });

    it('filters out empty segments', () => {
      const result = parsePath('group//slot///section');

      expect(result).toEqual({
        group: 'group',
        slot: 'slot',
        section: 'section',
        isMeta: false,
      });
    });
  });

  // Path parsing: @meta and @meta/<field> paths resolve correctly
  describe('@meta path handling', () => {
    it('parses @meta path', () => {
      const result = parsePath('user-auth/requirements/@meta');

      expect(result).toEqual({
        group: 'user-auth',
        slot: 'requirements',
        isMeta: true,
      });
    });

    it('parses @meta/<field> path', () => {
      const result = parsePath('user-auth/requirements/@meta/status');

      expect(result).toEqual({
        group: 'user-auth',
        slot: 'requirements',
        isMeta: true,
        metaField: 'status',
      });
    });

    it('parses @meta with nested field path', () => {
      const result = parsePath('group/slot/@meta/field-name');

      expect(result).toEqual({
        group: 'group',
        slot: 'slot',
        isMeta: true,
        metaField: 'field-name',
      });
    });

    it('does not treat @meta as section when not in position 3', () => {
      const result = parsePath('group/@meta');

      expect(result).toEqual({
        group: 'group',
        slot: '@meta',
        isMeta: false,
      });
    });
  });

  // Path parsing: ../ traversal rejected
  describe('path traversal validation', () => {
    it('rejects path with ../ traversal', () => {
      expect(() => parsePath('group/../other')).toThrow(
        'Path traversal not allowed'
      );
    });

    it('rejects path with .. in middle', () => {
      expect(() => parsePath('group/slot/../section')).toThrow(
        'Path traversal not allowed'
      );
    });

    it('rejects path with .. at end', () => {
      expect(() => parsePath('group/slot/..')).toThrow(
        'Path traversal not allowed'
      );
    });

    it('rejects path with multiple .. sequences', () => {
      expect(() => parsePath('../../group/slot')).toThrow(
        'Path traversal not allowed'
      );
    });
  });

  describe('edge cases', () => {
    it('handles single slash', () => {
      const result = parsePath('/');

      expect(result).toEqual({
        isMeta: false,
      });
    });

    it('handles leading slash', () => {
      const result = parsePath('/group/slot');

      expect(result).toEqual({
        group: 'group',
        slot: 'slot',
        isMeta: false,
      });
    });

    it('handles trailing slash', () => {
      const result = parsePath('group/slot/');

      expect(result).toEqual({
        group: 'group',
        slot: 'slot',
        isMeta: false,
      });
    });
  });
});

describe('slugify', () => {
  // Slug algorithm: converts text to URL-safe slugs
  describe('basic transformations', () => {
    it('converts to lowercase', () => {
      expect(slugify('User Auth Feature')).toBe('user-auth-feature');
    });

    it('replaces spaces with hyphens', () => {
      expect(slugify('user auth feature')).toBe('user-auth-feature');
    });

    it('strips special characters', () => {
      expect(slugify('user@auth#feature!')).toBe('userauthfeature');
    });

    it('handles mixed case and special chars', () => {
      expect(slugify('User-Auth & Feature!')).toBe('user-auth-feature');
    });

    it('trims whitespace', () => {
      expect(slugify('  user auth  ')).toBe('user-auth');
    });
  });

  describe('multiple spaces and hyphens', () => {
    it('collapses multiple spaces to single hyphen', () => {
      expect(slugify('user    auth')).toBe('user-auth');
    });

    it('collapses multiple hyphens to single hyphen', () => {
      expect(slugify('user---auth')).toBe('user-auth');
    });

    it('removes leading hyphens', () => {
      expect(slugify('-user-auth')).toBe('user-auth');
    });

    it('removes trailing hyphens', () => {
      expect(slugify('user-auth-')).toBe('user-auth');
    });

    it('removes leading and trailing hyphens', () => {
      expect(slugify('--user-auth--')).toBe('user-auth');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(slugify('')).toBe('');
    });

    it('handles only special characters', () => {
      expect(slugify('@#$%^&*()')).toBe('');
    });

    it('handles only spaces', () => {
      expect(slugify('   ')).toBe('');
    });

    it('preserves numbers', () => {
      expect(slugify('Feature 123 Test')).toBe('feature-123-test');
    });

    it('preserves existing hyphens in correct positions', () => {
      expect(slugify('user-auth-feature')).toBe('user-auth-feature');
    });
  });

  describe('real-world examples', () => {
    it('converts typical initiative name', () => {
      expect(slugify('User Authentication System')).toBe(
        'user-authentication-system'
      );
    });

    it('converts name with version', () => {
      expect(slugify('API v2.0 Migration')).toBe('api-v20-migration');
    });

    it('converts name with punctuation', () => {
      expect(slugify("Client's Dashboard Redesign")).toBe(
        'clients-dashboard-redesign'
      );
    });

    it('handles Unicode characters by stripping', () => {
      expect(slugify('Feature™ with emoji 🚀')).toBe('feature-with-emoji');
    });
  });
});

describe('InMemoryAddressResolver', () => {
  // Friendly name resolution and NAME_NOT_FOUND error
  describe('resolve', () => {
    it('returns address for mapped name', async () => {
      const resolver = new InMemoryAddressResolver();
      await resolver.save('user-auth', 'sc_g_7f3a9c2e');

      const address = await resolver.resolve('user-auth');

      expect(address).toBe('sc_g_7f3a9c2e');
    });

    it('throws NAME_NOT_FOUND for unmapped name', async () => {
      const resolver = new InMemoryAddressResolver();

      try {
        await resolver.resolve('nonexistent');
        expect.fail('Should have thrown NameNotFoundError');
      } catch (error) {
        expect(error).toBeInstanceOf(NameNotFoundError);
      }
    });

    it('throws NameNotFoundError with correct message', async () => {
      const resolver = new InMemoryAddressResolver();

      try {
        await resolver.resolve('missing-name');
        expect.fail('Should have thrown NameNotFoundError');
      } catch (error) {
        expect(error).toBeInstanceOf(NameNotFoundError);
        expect((error as NameNotFoundError).message).toBe(
          'No address mapping found for name: missing-name'
        );
      }
    });

    it('throws error with NAME_NOT_FOUND code', async () => {
      const resolver = new InMemoryAddressResolver();

      try {
        await resolver.resolve('missing');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NameNotFoundError);
        expect((error as NameNotFoundError).code).toBe('NAME_NOT_FOUND');
      }
    });
  });

  describe('save', () => {
    it('saves name to address mapping', async () => {
      const resolver = new InMemoryAddressResolver();

      await resolver.save('test-group', 'sc_g_abc123');
      const address = await resolver.resolve('test-group');

      expect(address).toBe('sc_g_abc123');
    });

    it('overwrites existing mapping', async () => {
      const resolver = new InMemoryAddressResolver();

      await resolver.save('group', 'sc_g_old');
      await resolver.save('group', 'sc_g_new');
      const address = await resolver.resolve('group');

      expect(address).toBe('sc_g_new');
    });

    it('handles multiple mappings', async () => {
      const resolver = new InMemoryAddressResolver();

      await resolver.save('group1', 'sc_g_111');
      await resolver.save('group2', 'sc_g_222');
      await resolver.save('group3', 'sc_g_333');

      expect(await resolver.resolve('group1')).toBe('sc_g_111');
      expect(await resolver.resolve('group2')).toBe('sc_g_222');
      expect(await resolver.resolve('group3')).toBe('sc_g_333');
    });
  });

  describe('load', () => {
    it('returns empty map initially', async () => {
      const resolver = new InMemoryAddressResolver();

      const mappings = await resolver.load();

      expect(mappings.size).toBe(0);
    });

    it('returns all saved mappings', async () => {
      const resolver = new InMemoryAddressResolver();

      await resolver.save('name1', 'addr1');
      await resolver.save('name2', 'addr2');

      const mappings = await resolver.load();

      expect(mappings.size).toBe(2);
      expect(mappings.get('name1')).toBe('addr1');
      expect(mappings.get('name2')).toBe('addr2');
    });

    it('returns copy of mappings', async () => {
      const resolver = new InMemoryAddressResolver();
      await resolver.save('name', 'address');

      const mappings1 = await resolver.load();
      const mappings2 = await resolver.load();

      expect(mappings1).not.toBe(mappings2);
      expect(mappings1.get('name')).toBe(mappings2.get('name'));
    });
  });
});

describe('isValidGroupAddress', () => {
  it('validates correct group address format', () => {
    expect(isValidGroupAddress('sc_g_7f3a9c2e')).toBe(true);
    expect(isValidGroupAddress('sc_g_abc123def456')).toBe(true);
    expect(isValidGroupAddress('sc_g_0000000000000000')).toBe(true);
  });

  it('rejects invalid prefix', () => {
    expect(isValidGroupAddress('sc_x_7f3a9c2e')).toBe(false);
    expect(isValidGroupAddress('group_7f3a9c2e')).toBe(false);
    expect(isValidGroupAddress('7f3a9c2e')).toBe(false);
  });

  it('rejects uppercase hex', () => {
    expect(isValidGroupAddress('sc_g_7F3A9C2E')).toBe(false);
    expect(isValidGroupAddress('sc_g_ABC123')).toBe(false);
  });

  it('rejects invalid hex characters', () => {
    expect(isValidGroupAddress('sc_g_xyz123')).toBe(false);
    expect(isValidGroupAddress('sc_g_7f3a9c2g')).toBe(false);
  });

  it('rejects empty hash', () => {
    expect(isValidGroupAddress('sc_g_')).toBe(false);
  });

  it('rejects missing parts', () => {
    expect(isValidGroupAddress('sc_g')).toBe(false);
    expect(isValidGroupAddress('')).toBe(false);
  });
});

describe('generateGroupAddress', () => {
  it('generates address with correct format', () => {
    const address = generateGroupAddress('initiative-schema', 'random-salt');

    expect(address).toMatch(/^sc_g_[a-f0-9]+$/);
  });

  it('generates consistent address for same inputs', () => {
    const addr1 = generateGroupAddress('schema', 'salt');
    const addr2 = generateGroupAddress('schema', 'salt');

    expect(addr1).toBe(addr2);
  });

  it('generates different addresses for different schema IDs', () => {
    const addr1 = generateGroupAddress('schema1', 'salt');
    const addr2 = generateGroupAddress('schema2', 'salt');

    expect(addr1).not.toBe(addr2);
  });

  it('generates different addresses for different salts', () => {
    const addr1 = generateGroupAddress('schema', 'salt1');
    const addr2 = generateGroupAddress('schema', 'salt2');

    expect(addr1).not.toBe(addr2);
  });

  it('generates valid group address', () => {
    const address = generateGroupAddress('test-schema', 'test-salt');

    expect(isValidGroupAddress(address)).toBe(true);
  });
});
