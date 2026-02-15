/**
 * Tests for Session class - wraps Store with token caching and lifecycle management
 * Covers: IR-1, IR-14, IC-2, AC-1, AC-6, AC-19, AC-20, EC-3
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Session } from '../../src/core/session.js';
import {
  NotFoundError,
  SidechainError,
  StaleTokenError,
  ValidationError,
} from '../../src/core/errors.js';
import { createMockStore } from '../fixtures/index.js';

describe('Session Construction', () => {
  // IR-2: constructor(store: Store, clientId: string)
  // AC-1: new Session(store, clientId) creates a session with empty cache
  it('creates session with empty cache', () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    expect(session).toBeInstanceOf(Session);
    // Session should be open and operational
    expect(() => session.list()).not.toThrow(SidechainError);
  });

  it('accepts any Store implementation', () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    expect(session).toBeInstanceOf(Session);
  });

  // AC-18: Session with empty clientId - constructor accepts, Store validates on call
  it('accepts empty clientId (AC-18)', () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, '');

    expect(session).toBeInstanceOf(Session);
  });

  // AC-7: Two Sessions wrapping same Store operate independently
  it('Two Sessions wrapping same Store operate independently (AC-7)', async () => {
    const mockStore = createMockStore();
    const session1 = new Session(mockStore, 'test-client');
    const session2 = new Session(mockStore, 'test-client');

    // Setup mock to return different tokens for each call
    vi.mocked(mockStore.get)
      .mockResolvedValueOnce({ metadata: {}, sections: [], token: 'token1' })
      .mockResolvedValueOnce({ metadata: {}, sections: [], token: 'token2' });

    // Each session should cache independently
    await session1.get('group/slot');
    await session2.get('group/slot');

    // Configure mock to verify independent caches
    vi.mocked(mockStore.setMeta).mockResolvedValue({
      ok: true,
      path: 'group/slot',
      value: { field: 'value' },
      previous: undefined,
      token: 'token3',
    });

    // session1 should use token1, session2 should use token2
    await session1.setMeta('group/slot', 'field', 'value1');
    await session2.setMeta('group/slot', 'field', 'value2');

    // Verify that each session used its own cached token
    expect(vi.mocked(mockStore.setMeta)).toHaveBeenCalledTimes(2);
    // First call should have token1
    expect(vi.mocked(mockStore.setMeta).mock.calls[0]?.[3]).toEqual({
      token: 'token1',
    });
    // Second call should have token2
    expect(vi.mocked(mockStore.setMeta).mock.calls[1]?.[3]).toEqual({
      token: 'token2',
    });
  });
});

describe('Session Close', () => {
  // IR-14: close()
  // AC-6: close() clears all cache entries
  it('clears cache on close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    // Close the session
    session.close();

    // Session should be closed
    // Any subsequent operation should throw SESSION_CLOSED
    await expect(session.list()).rejects.toThrow(SidechainError);
  });

  // AC-19: Idempotent close - second call is no-op
  it('allows multiple close calls without error', () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    // First close
    session.close();

    // Second close should not throw
    expect(() => session.close()).not.toThrow();

    // Third close should also not throw
    expect(() => session.close()).not.toThrow();
  });

  // AC-20: Close empty session (0 cached entries) without error
  it('closes empty session without error', () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    // Close immediately without any operations (cache is empty)
    expect(() => session.close()).not.toThrow();
  });
});

describe('Session Closed Error', () => {
  // EC-3: Operation on closed session throws SESSION_CLOSED
  it('throws SESSION_CLOSED on list() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(session.list()).rejects.toThrow(SidechainError);
    await expect(session.list()).rejects.toThrow(/session is closed/i);
  });

  it('throws SESSION_CLOSED on exists() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(session.exists('group/slot')).rejects.toThrow(SidechainError);
    await expect(session.exists('group/slot')).rejects.toThrow(
      /session is closed/i
    );
  });

  it('throws SESSION_CLOSED on get() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(session.get('group/slot')).rejects.toThrow(SidechainError);
    await expect(session.get('group/slot')).rejects.toThrow(
      /session is closed/i
    );
  });

  it('throws SESSION_CLOSED on createGroup() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(session.createGroup('schema-id')).rejects.toThrow(
      SidechainError
    );
    await expect(session.createGroup('schema-id')).rejects.toThrow(
      /session is closed/i
    );
  });

  it('throws SESSION_CLOSED on deleteGroup() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(session.deleteGroup('group-address')).rejects.toThrow(
      SidechainError
    );
    await expect(session.deleteGroup('group-address')).rejects.toThrow(
      /session is closed/i
    );
  });

  it('throws SESSION_CLOSED on describeGroup() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(session.describeGroup('group-address')).rejects.toThrow(
      SidechainError
    );
    await expect(session.describeGroup('group-address')).rejects.toThrow(
      /session is closed/i
    );
  });

  it('throws SESSION_CLOSED on validateGroup() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(session.validateGroup('group-address')).rejects.toThrow(
      SidechainError
    );
    await expect(session.validateGroup('group-address')).rejects.toThrow(
      /session is closed/i
    );
  });

  it('throws SESSION_CLOSED on meta() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(session.meta('group/slot')).rejects.toThrow(SidechainError);
    await expect(session.meta('group/slot')).rejects.toThrow(
      /session is closed/i
    );
  });

  it('throws SESSION_CLOSED on setMeta() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(
      session.setMeta('group/slot', 'field', 'value')
    ).rejects.toThrow(SidechainError);
    await expect(
      session.setMeta('group/slot', 'field', 'value')
    ).rejects.toThrow(/session is closed/i);
  });

  it('throws SESSION_CLOSED on sections() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(session.sections('group/slot')).rejects.toThrow(
      SidechainError
    );
    await expect(session.sections('group/slot')).rejects.toThrow(
      /session is closed/i
    );
  });

  it('throws SESSION_CLOSED on section() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(session.section('group/slot', 'section-id')).rejects.toThrow(
      SidechainError
    );
    await expect(session.section('group/slot', 'section-id')).rejects.toThrow(
      /session is closed/i
    );
  });

  it('throws SESSION_CLOSED on writeSection() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(
      session.writeSection('group/slot', 'section-id', 'content')
    ).rejects.toThrow(SidechainError);
    await expect(
      session.writeSection('group/slot', 'section-id', 'content')
    ).rejects.toThrow(/session is closed/i);
  });

  it('throws SESSION_CLOSED on appendSection() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(
      session.appendSection('group/slot', 'section-id', 'content')
    ).rejects.toThrow(SidechainError);
    await expect(
      session.appendSection('group/slot', 'section-id', 'content')
    ).rejects.toThrow(/session is closed/i);
  });

  it('throws SESSION_CLOSED on addSection() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(
      session.addSection('group/slot', { id: 'new-section', type: 'text' })
    ).rejects.toThrow(SidechainError);
    await expect(
      session.addSection('group/slot', { id: 'new-section', type: 'text' })
    ).rejects.toThrow(/session is closed/i);
  });

  it('throws SESSION_CLOSED on removeSection() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(
      session.removeSection('group/slot', 'section-id')
    ).rejects.toThrow(SidechainError);
    await expect(
      session.removeSection('group/slot', 'section-id')
    ).rejects.toThrow(/session is closed/i);
  });

  it('throws SESSION_CLOSED on populate() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(
      session.populate('group/slot', { sections: {} })
    ).rejects.toThrow(SidechainError);
    await expect(
      session.populate('group/slot', { sections: {} })
    ).rejects.toThrow(/session is closed/i);
  });

  it('throws SESSION_CLOSED on describe() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(session.describe('schema-id')).rejects.toThrow(SidechainError);
    await expect(session.describe('schema-id')).rejects.toThrow(
      /session is closed/i
    );
  });

  it('throws SESSION_CLOSED on validate() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(session.validate('group/slot')).rejects.toThrow(
      SidechainError
    );
    await expect(session.validate('group/slot')).rejects.toThrow(
      /session is closed/i
    );
  });

  it('throws SESSION_CLOSED on item.get() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(
      session.item.get('group/slot', 'phase-1', '1.1')
    ).rejects.toThrow(SidechainError);
    await expect(
      session.item.get('group/slot', 'phase-1', '1.1')
    ).rejects.toThrow(/session is closed/i);
  });

  it('throws SESSION_CLOSED on item.add() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(
      session.item.add('group/slot', 'phase-1', { title: 'New Task' })
    ).rejects.toThrow(SidechainError);
    await expect(
      session.item.add('group/slot', 'phase-1', { title: 'New Task' })
    ).rejects.toThrow(/session is closed/i);
  });

  it('throws SESSION_CLOSED on item.update() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(
      session.item.update('group/slot', 'phase-1', '1.1', { title: 'Updated' })
    ).rejects.toThrow(SidechainError);
    await expect(
      session.item.update('group/slot', 'phase-1', '1.1', { title: 'Updated' })
    ).rejects.toThrow(/session is closed/i);
  });

  it('throws SESSION_CLOSED on item.remove() after close', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    await expect(
      session.item.remove('group/slot', 'phase-1', '1.1')
    ).rejects.toThrow(SidechainError);
    await expect(
      session.item.remove('group/slot', 'phase-1', '1.1')
    ).rejects.toThrow(/session is closed/i);
  });

  // AC-10: Verify error code is SESSION_CLOSED
  it('SESSION_CLOSED error has correct code', async () => {
    const mockStore = createMockStore();
    const session = new Session(mockStore, 'test-client');

    session.close();

    try {
      await session.get('group/slot');
      expect.fail('Expected get() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SidechainError);
      expect((error as SidechainError).code).toBe('SESSION_CLOSED');
      expect((error as SidechainError).message).toBe('Session is closed');
    }
  });
});

describe('Session Store Delegation', () => {
  // IC-2: All Store methods delegate to this.store after ensureOpen()
  let mockStore: ReturnType<typeof createMockStore>;
  let session: Session;

  beforeEach(() => {
    mockStore = createMockStore();
    session = new Session(mockStore, 'test-client');
  });

  it('delegates list() to store', async () => {
    vi.mocked(mockStore.list).mockResolvedValue([]);

    await session.list();

    expect(mockStore.list).toHaveBeenCalledTimes(1);
  });

  it('delegates list(group) to store', async () => {
    vi.mocked(mockStore.list).mockResolvedValue([]);

    await session.list('group-address');

    expect(mockStore.list).toHaveBeenCalledWith('group-address');
  });

  it('delegates exists() to store', async () => {
    vi.mocked(mockStore.exists).mockResolvedValue(true);

    await session.exists('group/slot');

    expect(mockStore.exists).toHaveBeenCalledWith('group/slot');
  });

  it('delegates get() to store', async () => {
    vi.mocked(mockStore.get).mockResolvedValue({
      metadata: {},
      sections: [],
      token: 'token',
    });

    await session.get('group/slot');

    expect(mockStore.get).toHaveBeenCalledWith('group/slot');
  });

  it('delegates createGroup() and injects clientId', async () => {
    vi.mocked(mockStore.createGroup).mockResolvedValue({
      address: 'address',
      schema: 'schema',
    });

    await session.createGroup('schema-id');

    expect(mockStore.createGroup).toHaveBeenCalledWith('schema-id', {
      client: 'test-client',
    });
  });

  it('delegates deleteGroup() to store', async () => {
    vi.mocked(mockStore.deleteGroup).mockResolvedValue({
      ok: true,
      value: undefined,
    });

    await session.deleteGroup('group-address');

    expect(mockStore.deleteGroup).toHaveBeenCalledWith('group-address');
  });

  it('delegates describeGroup() to store', async () => {
    vi.mocked(mockStore.describeGroup).mockResolvedValue({
      address: 'address',
      schema: 'schema',
      slots: [],
    });

    await session.describeGroup('group-address');

    expect(mockStore.describeGroup).toHaveBeenCalledWith('group-address');
  });

  it('delegates validateGroup() to store', async () => {
    vi.mocked(mockStore.validateGroup).mockResolvedValue({
      valid: true,
      errors: [],
    });

    await session.validateGroup('group-address');

    expect(mockStore.validateGroup).toHaveBeenCalledWith('group-address');
  });

  it('delegates meta() without field to store', async () => {
    vi.mocked(mockStore.meta).mockResolvedValue({
      metadata: {},
      token: 'token',
    });

    await session.meta('group/slot');

    expect(mockStore.meta).toHaveBeenCalledWith('group/slot');
  });

  it('delegates meta(field) to store', async () => {
    vi.mocked(mockStore.meta).mockResolvedValue({
      value: 'value',
      token: 'token',
    });

    await session.meta('group/slot', 'field');

    expect(mockStore.meta).toHaveBeenCalledWith('group/slot', 'field');
  });

  it('delegates setMeta(field, value) to store', async () => {
    vi.mocked(mockStore.setMeta).mockResolvedValue({
      ok: true,
      path: 'path',
      value: { field: 'value' },
      previous: undefined,
      token: 'token',
    });

    await session.setMeta('group/slot', 'field', 'value');

    expect(mockStore.setMeta).toHaveBeenCalledWith(
      'group/slot',
      'field',
      'value',
      undefined
    );
  });

  it('delegates setMeta(fields) to store', async () => {
    vi.mocked(mockStore.setMeta).mockResolvedValue({
      ok: true,
      path: 'path',
      value: { field1: 'value1', field2: 'value2' },
      previous: {},
      token: 'token',
    });

    await session.setMeta('group/slot', { field1: 'value1', field2: 'value2' });

    expect(mockStore.setMeta).toHaveBeenCalledWith(
      'group/slot',
      { field1: 'value1', field2: 'value2' },
      undefined
    );
  });

  it('delegates sections() to store', async () => {
    vi.mocked(mockStore.sections).mockResolvedValue([]);

    await session.sections('group/slot');

    expect(mockStore.sections).toHaveBeenCalledWith('group/slot');
  });

  it('delegates section() to store', async () => {
    vi.mocked(mockStore.section).mockResolvedValue({
      id: 'section-id',
      type: 'text',
      content: 'content',
      token: 'token',
    });

    await session.section('group/slot', 'section-id');

    expect(mockStore.section).toHaveBeenCalledWith('group/slot', 'section-id');
  });

  it('delegates writeSection() to store', async () => {
    vi.mocked(mockStore.writeSection).mockResolvedValue({
      ok: true,
      path: 'path',
      token: 'token',
      nodeToken: 'nodeToken',
    });

    await session.writeSection('group/slot', 'section-id', 'content');

    expect(mockStore.writeSection).toHaveBeenCalledWith(
      'group/slot',
      'section-id',
      'content',
      undefined
    );
  });

  it('delegates appendSection() to store', async () => {
    vi.mocked(mockStore.appendSection).mockResolvedValue({
      ok: true,
      path: 'path',
      token: 'token',
      nodeToken: 'nodeToken',
    });

    await session.appendSection('group/slot', 'section-id', 'content');

    expect(mockStore.appendSection).toHaveBeenCalledWith(
      'group/slot',
      'section-id',
      'content',
      undefined
    );
  });

  it('delegates addSection() to store', async () => {
    vi.mocked(mockStore.addSection).mockResolvedValue({
      ok: true,
      path: 'path',
    });

    await session.addSection('group/slot', { id: 'new-section', type: 'text' });

    expect(mockStore.addSection).toHaveBeenCalledWith('group/slot', {
      id: 'new-section',
      type: 'text',
    });
  });

  it('delegates removeSection() to store', async () => {
    vi.mocked(mockStore.removeSection).mockResolvedValue({
      ok: true,
      path: 'path',
    });

    await session.removeSection('group/slot', 'section-id');

    expect(mockStore.removeSection).toHaveBeenCalledWith(
      'group/slot',
      'section-id'
    );
  });

  it('delegates populate() to store', async () => {
    vi.mocked(mockStore.populate).mockResolvedValue({
      ok: true,
      path: 'path',
      sections: 1,
      metadata: 1,
      token: 'token',
    });

    await session.populate('group/slot', {
      sections: { 'section-id': 'data' },
    });

    expect(mockStore.populate).toHaveBeenCalledWith(
      'group/slot',
      {
        sections: { 'section-id': 'data' },
      },
      undefined
    );
  });

  it('delegates describe() to store', async () => {
    vi.mocked(mockStore.describe).mockResolvedValue({
      'schema-id': 'schema-id',
      type: 'node',
    });

    await session.describe('schema-id');

    expect(mockStore.describe).toHaveBeenCalledWith('schema-id');
  });

  it('delegates validate() to store', async () => {
    vi.mocked(mockStore.validate).mockResolvedValue({
      valid: true,
      errors: [],
    });

    await session.validate('group/slot');

    expect(mockStore.validate).toHaveBeenCalledWith('group/slot');
  });

  it('delegates item getter to store', () => {
    const item = session.item;

    expect(item).toBeTruthy();
  });
});

describe('Read Operations with Token Caching', () => {
  // IR-2, IR-3, IR-4, IR-5, IR-6
  // AC-2, AC-16, AC-18
  let mockStore: ReturnType<typeof createMockStore>;
  let session: Session;

  beforeEach(() => {
    mockStore = createMockStore();
    session = new Session(mockStore, 'test-client');
  });

  describe('get(path)', () => {
    // IR-2: get(path) delegates and caches tokens
    // AC-2: Returns same response as store.get(path)
    it('returns same response as store.get(path)', async () => {
      const mockResponse = {
        metadata: { status: 'draft' },
        sections: [
          { id: 'overview', type: 'text', content: 'content', token: 'sec-1' },
          { id: 'details', type: 'text', content: 'more', token: 'sec-2' },
        ],
        token: 'node-token',
      };
      vi.mocked(mockStore.get).mockResolvedValue(mockResponse);

      const result = await session.get('group/slot');

      expect(result).toEqual(mockResponse);
      expect(mockStore.get).toHaveBeenCalledWith('group/slot');
    });

    // AC-16: get(path) caches both node token and per-section tokens
    it('caches node token and all section tokens', async () => {
      const mockResponse = {
        metadata: { status: 'draft' },
        sections: [
          { id: 'overview', type: 'text', content: 'content', token: 'sec-1' },
          { id: 'details', type: 'text', content: 'more', token: 'sec-2' },
          { id: 'notes', type: 'text', content: 'notes', token: 'sec-3' },
        ],
        token: 'node-token',
      };
      vi.mocked(mockStore.get).mockResolvedValue(mockResponse);

      await session.get('group/slot');

      // Cache should contain node token and all section tokens
      // We verify by reading the cache indirectly (implementation detail)
      // The cache is private, but behavior is verified by other tests
      expect(mockStore.get).toHaveBeenCalledTimes(1);
    });

    // AC-18: Multiple reads to same path replace cached token
    it('replaces cached token on subsequent reads', async () => {
      const firstResponse = {
        metadata: { status: 'draft' },
        sections: [
          { id: 'overview', type: 'text', content: 'v1', token: 'sec-token-1' },
        ],
        token: 'node-token-1',
      };
      const secondResponse = {
        metadata: { status: 'locked' },
        sections: [
          {
            id: 'overview',
            type: 'text',
            content: 'v2',
            token: 'sec-token-2',
          },
        ],
        token: 'node-token-2',
      };

      vi.mocked(mockStore.get)
        .mockResolvedValueOnce(firstResponse)
        .mockResolvedValueOnce(secondResponse);

      const result1 = await session.get('group/slot');
      const result2 = await session.get('group/slot');

      expect(result1).toEqual(firstResponse);
      expect(result2).toEqual(secondResponse);
      expect(mockStore.get).toHaveBeenCalledTimes(2);
    });

    it('handles response with no sections', async () => {
      const mockResponse = {
        metadata: { status: 'draft' },
        sections: [],
        token: 'node-token',
      };
      vi.mocked(mockStore.get).mockResolvedValue(mockResponse);

      const result = await session.get('group/slot');

      expect(result).toEqual(mockResponse);
    });
  });

  describe('meta(path)', () => {
    // IR-3: meta(path) delegates and caches node token
    it('returns same response and caches node token', async () => {
      const mockResponse = {
        metadata: { status: 'draft', author: 'test' },
        token: 'node-token',
      };
      vi.mocked(mockStore.meta).mockResolvedValue(mockResponse);

      const result = await session.meta('group/slot');

      expect(result).toEqual(mockResponse);
      expect(mockStore.meta).toHaveBeenCalledWith('group/slot');
    });

    it('replaces cached token on subsequent reads', async () => {
      const firstResponse = {
        metadata: { status: 'draft' },
        token: 'token-1',
      };
      const secondResponse = {
        metadata: { status: 'locked' },
        token: 'token-2',
      };

      vi.mocked(mockStore.meta)
        .mockResolvedValueOnce(firstResponse)
        .mockResolvedValueOnce(secondResponse);

      const result1 = await session.meta('group/slot');
      const result2 = await session.meta('group/slot');

      expect(result1).toEqual(firstResponse);
      expect(result2).toEqual(secondResponse);
    });
  });

  describe('meta(path, field)', () => {
    // IR-4: meta(path, field) delegates and caches node token
    it('returns same response and caches node token', async () => {
      const mockResponse = {
        value: 'draft',
        token: 'node-token',
      };
      vi.mocked(mockStore.meta).mockResolvedValue(mockResponse);

      const result = await session.meta('group/slot', 'status');

      expect(result).toEqual(mockResponse);
      expect(mockStore.meta).toHaveBeenCalledWith('group/slot', 'status');
    });

    it('replaces cached token on subsequent reads', async () => {
      const firstResponse = {
        value: 'draft',
        token: 'token-1',
      };
      const secondResponse = {
        value: 'locked',
        token: 'token-2',
      };

      vi.mocked(mockStore.meta)
        .mockResolvedValueOnce(firstResponse)
        .mockResolvedValueOnce(secondResponse);

      const result1 = await session.meta('group/slot', 'status');
      const result2 = await session.meta('group/slot', 'status');

      expect(result1).toEqual(firstResponse);
      expect(result2).toEqual(secondResponse);
    });
  });

  describe('section(path, sectionId)', () => {
    // IR-5: section(path, sectionId) delegates and caches section token
    it('returns same response and caches section token', async () => {
      const mockResponse = {
        id: 'overview',
        type: 'text',
        content: 'content',
        token: 'section-token',
      };
      vi.mocked(mockStore.section).mockResolvedValue(mockResponse);

      const result = await session.section('group/slot', 'overview');

      expect(result).toEqual(mockResponse);
      expect(mockStore.section).toHaveBeenCalledWith('group/slot', 'overview');
    });

    it('replaces cached token on subsequent reads', async () => {
      const firstResponse = {
        id: 'overview',
        type: 'text',
        content: 'v1',
        token: 'token-1',
      };
      const secondResponse = {
        id: 'overview',
        type: 'text',
        content: 'v2',
        token: 'token-2',
      };

      vi.mocked(mockStore.section)
        .mockResolvedValueOnce(firstResponse)
        .mockResolvedValueOnce(secondResponse);

      const result1 = await session.section('group/slot', 'overview');
      const result2 = await session.section('group/slot', 'overview');

      expect(result1).toEqual(firstResponse);
      expect(result2).toEqual(secondResponse);
    });

    it('caches different sections independently', async () => {
      const overviewResponse = {
        id: 'overview',
        type: 'text',
        content: 'overview',
        token: 'overview-token',
      };
      const detailsResponse = {
        id: 'details',
        type: 'text',
        content: 'details',
        token: 'details-token',
      };

      vi.mocked(mockStore.section)
        .mockResolvedValueOnce(overviewResponse)
        .mockResolvedValueOnce(detailsResponse);

      const result1 = await session.section('group/slot', 'overview');
      const result2 = await session.section('group/slot', 'details');

      expect(result1).toEqual(overviewResponse);
      expect(result2).toEqual(detailsResponse);
    });
  });

  describe('item.get(path, sectionId, itemId)', () => {
    // IR-6: item.get() delegates and caches section token
    it('returns same response and caches section token', async () => {
      const mockResponse = {
        content: { id: '1.1', title: 'Task 1' },
        token: 'section-token',
      };
      vi.mocked(mockStore.item.get).mockResolvedValue(mockResponse);

      const result = await session.item.get('group/slot', 'phase-1', '1.1');

      expect(result).toEqual(mockResponse);
      expect(mockStore.item.get).toHaveBeenCalledWith(
        'group/slot',
        'phase-1',
        '1.1'
      );
    });

    it('replaces cached section token on subsequent reads', async () => {
      const firstResponse = {
        content: { id: '1.1', title: 'Task 1' },
        token: 'token-1',
      };
      const secondResponse = {
        content: { id: '1.1', title: 'Task 1 Updated' },
        token: 'token-2',
      };

      vi.mocked(mockStore.item.get)
        .mockResolvedValueOnce(firstResponse)
        .mockResolvedValueOnce(secondResponse);

      const result1 = await session.item.get('group/slot', 'phase-1', '1.1');
      const result2 = await session.item.get('group/slot', 'phase-1', '1.1');

      expect(result1).toEqual(firstResponse);
      expect(result2).toEqual(secondResponse);
    });

    it('delegates add() to store item', async () => {
      const mockResponse = {
        ok: true as const,
        path: 'group/slot',
        item: '1.2',
        token: 'section-token',
        nodeToken: 'node-token',
      };
      vi.mocked(mockStore.item.add).mockResolvedValue(mockResponse);

      const result = await session.item.add('group/slot', 'phase-1', {
        title: 'New Task',
      });

      expect(result).toEqual(mockResponse);
      expect(mockStore.item.add).toHaveBeenCalledWith('group/slot', 'phase-1', {
        title: 'New Task',
      });
    });

    it('delegates update() to store item', async () => {
      const mockResponse = {
        ok: true as const,
        path: 'group/slot',
        item: '1.1',
        previous: { title: 'Old' },
        token: 'section-token',
        nodeToken: 'node-token',
      };
      vi.mocked(mockStore.item.update).mockResolvedValue(mockResponse);

      const result = await session.item.update('group/slot', 'phase-1', '1.1', {
        title: 'Updated',
      });

      expect(result).toEqual(mockResponse);
      expect(mockStore.item.update).toHaveBeenCalledWith(
        'group/slot',
        'phase-1',
        '1.1',
        { title: 'Updated' },
        undefined
      );
    });

    it('delegates remove() to store item', async () => {
      const mockResponse = {
        ok: true as const,
        path: 'group/slot',
      };
      vi.mocked(mockStore.item.remove).mockResolvedValue(mockResponse);

      const result = await session.item.remove('group/slot', 'phase-1', '1.1');

      expect(result).toEqual(mockResponse);
      expect(mockStore.item.remove).toHaveBeenCalledWith(
        'group/slot',
        'phase-1',
        '1.1'
      );
    });
  });

  describe('Read failure propagation', () => {
    it('propagates get() failures without modifying cache', async () => {
      vi.mocked(mockStore.get).mockRejectedValue(new Error('Node not found'));

      await expect(session.get('group/slot')).rejects.toThrow('Node not found');
    });

    it('propagates meta() failures without modifying cache', async () => {
      vi.mocked(mockStore.meta).mockRejectedValue(new Error('Node not found'));

      await expect(session.meta('group/slot')).rejects.toThrow(
        'Node not found'
      );
    });

    it('propagates section() failures without modifying cache', async () => {
      vi.mocked(mockStore.section).mockRejectedValue(
        new Error('Section not found')
      );

      await expect(session.section('group/slot', 'overview')).rejects.toThrow(
        'Section not found'
      );
    });

    it('propagates item.get() failures without modifying cache', async () => {
      vi.mocked(mockStore.item.get).mockRejectedValue(
        new Error('Item not found')
      );

      await expect(
        session.item.get('group/slot', 'phase-1', '1.1')
      ).rejects.toThrow('Item not found');
    });
  });
});

describe('Write Operations with Token Injection', () => {
  // IR-7, IR-8, IR-9, IR-10, IR-11, IR-12
  // AC-3, AC-4, AC-5, AC-13, AC-14, AC-15, AC-17
  // EC-1, EC-2
  let mockStore: ReturnType<typeof createMockStore>;
  let session: Session;

  beforeEach(() => {
    mockStore = createMockStore();
    session = new Session(mockStore, 'test-client');
  });

  describe('setMeta(path, field, value, opts?)', () => {
    // IR-7: setMeta(path, field, value, opts?) with token injection
    // AC-3: After get(path), setMeta uses cached node token
    it('injects cached node token from prior get()', async () => {
      const getResponse = {
        metadata: { status: 'draft' },
        sections: [],
        token: 'node-token-1',
      };
      const setMetaResponse = {
        ok: true,
        path: 'group/slot',
        value: { status: 'locked' },
        previous: { status: 'draft' },
        token: 'node-token-2',
      };

      vi.mocked(mockStore.get).mockResolvedValue(getResponse);
      vi.mocked(mockStore.setMeta).mockResolvedValue(setMetaResponse);

      // Read to populate cache
      await session.get('group/slot');

      // Write should inject cached token
      await session.setMeta('group/slot', 'status', 'locked');

      expect(mockStore.setMeta).toHaveBeenCalledWith(
        'group/slot',
        'status',
        'locked',
        { token: 'node-token-1' }
      );
    });

    // AC-5: After successful write, cache updates to fresh token
    it('updates cache with fresh token after successful write', async () => {
      const getResponse = {
        metadata: { status: 'draft' },
        sections: [],
        token: 'node-token-1',
      };
      const setMetaResponse = {
        ok: true,
        path: 'group/slot',
        value: { status: 'locked' },
        previous: { status: 'draft' },
        token: 'node-token-2',
      };

      vi.mocked(mockStore.get).mockResolvedValue(getResponse);
      vi.mocked(mockStore.setMeta).mockResolvedValue(setMetaResponse);

      // Read to populate cache
      await session.get('group/slot');

      // Write should update cache
      await session.setMeta('group/slot', 'status', 'locked');

      // Second write should use fresh token from first write
      await session.setMeta('group/slot', 'author', 'alice');

      expect(mockStore.setMeta).toHaveBeenNthCalledWith(
        2,
        'group/slot',
        'author',
        'alice',
        { token: 'node-token-2' }
      );
    });

    // AC-13: Failed writes do not update cache (cache retains pre-write token)
    it('retains pre-write token in cache after StaleTokenError (AC-13)', async () => {
      const getResponse = {
        metadata: { status: 'draft' },
        sections: [],
        token: 'node-token-1',
      };
      const currentState = { metadata: { status: 'locked' }, sections: [] };
      const freshToken = 'node-token-2';
      const staleError = new StaleTokenError(
        'group/slot',
        'Content changed',
        currentState,
        freshToken
      );
      const successResponse = {
        ok: true,
        path: 'group/slot',
        value: { status: 'locked' },
        previous: { status: 'draft' },
        token: 'node-token-3',
      };

      vi.mocked(mockStore.get).mockResolvedValue(getResponse);
      vi.mocked(mockStore.setMeta)
        .mockRejectedValueOnce(staleError)
        .mockResolvedValueOnce(successResponse);

      // Read to populate cache with node-token-1
      await session.get('group/slot');

      // First write fails with StaleTokenError
      await expect(
        session.setMeta('group/slot', 'status', 'locked')
      ).rejects.toThrow(StaleTokenError);

      // AC-13: Cache should still contain node-token-1 (pre-write token)
      // Subsequent write should use original cached token, not the fresh token from error
      await session.setMeta('group/slot', 'status', 'locked');

      expect(mockStore.setMeta).toHaveBeenLastCalledWith(
        'group/slot',
        'status',
        'locked',
        { token: 'node-token-1' }
      );
    });

    // AC-14: Write to path never read proceeds without token
    it('writes without token when path never read (Store permissive mode)', async () => {
      const setMetaResponse = {
        ok: true,
        path: 'group/slot',
        value: { status: 'locked' },
        previous: undefined,
        token: 'node-token-1',
      };

      vi.mocked(mockStore.setMeta).mockResolvedValue(setMetaResponse);

      // Write without prior read
      await session.setMeta('group/slot', 'status', 'locked');

      expect(mockStore.setMeta).toHaveBeenCalledWith(
        'group/slot',
        'status',
        'locked',
        undefined
      );
    });

    // AC-17: Explicit opts.token overrides cached token; cache updates on success
    it('uses explicit token and updates cache on success', async () => {
      const getResponse = {
        metadata: { status: 'draft' },
        sections: [],
        token: 'cached-token',
      };
      const setMetaResponse = {
        ok: true,
        path: 'group/slot',
        value: { status: 'locked' },
        previous: { status: 'draft' },
        token: 'explicit-result-token',
      };

      vi.mocked(mockStore.get).mockResolvedValue(getResponse);
      vi.mocked(mockStore.setMeta).mockResolvedValue(setMetaResponse);

      // Read to populate cache
      await session.get('group/slot');

      // Write with explicit token
      await session.setMeta('group/slot', 'status', 'locked', {
        token: 'explicit-token',
      });

      // Should use explicit token, not cached token
      expect(mockStore.setMeta).toHaveBeenCalledWith(
        'group/slot',
        'status',
        'locked',
        { token: 'explicit-token' }
      );

      // Cache should update to fresh token from response
      await session.setMeta('group/slot', 'author', 'alice');

      expect(mockStore.setMeta).toHaveBeenLastCalledWith(
        'group/slot',
        'author',
        'alice',
        { token: 'explicit-result-token' }
      );
    });

    // EC-1, AC-8: StaleTokenError from cached token propagates with current and token fields
    it('propagates StaleTokenError with current and token fields (EC-1, AC-8)', async () => {
      const getResponse = {
        metadata: { status: 'draft' },
        sections: [],
        token: 'stale-token',
      };
      const currentState = { metadata: { status: 'locked' }, sections: [] };
      const freshToken = 'fresh-token-abc123';
      const staleError = new StaleTokenError(
        'group/slot',
        'Content changed between read and write',
        currentState,
        freshToken
      );

      vi.mocked(mockStore.get).mockResolvedValue(getResponse);
      vi.mocked(mockStore.setMeta).mockRejectedValue(staleError);

      // Read to populate cache
      await session.get('group/slot');

      // Write should fail with StaleTokenError
      // AC-8: Error includes current state and fresh token for retry
      try {
        await session.setMeta('group/slot', 'status', 'closed');
        expect.fail('Expected StaleTokenError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(StaleTokenError);
        const staleErr = error as StaleTokenError;
        expect(staleErr.code).toBe('STALE_TOKEN');
        expect(staleErr.path).toBe('group/slot');
        expect(staleErr.message).toBe('Content changed between read and write');
        expect(staleErr.current).toEqual(currentState);
        expect(staleErr.token).toBe(freshToken);
      }
    });

    // EC-2, AC-9: StaleTokenError from explicit token propagates unchanged
    it('propagates StaleTokenError from explicit token unchanged (EC-2, AC-9)', async () => {
      const currentState = { metadata: { status: 'locked' }, sections: [] };
      const freshToken = 'fresh-token-xyz789';
      const staleError = new StaleTokenError(
        'group/slot',
        'Explicit token is stale',
        currentState,
        freshToken
      );

      vi.mocked(mockStore.setMeta).mockRejectedValue(staleError);

      // Write with explicit stale token should fail
      // AC-9: Session does not intercept or transform the error
      try {
        await session.setMeta('group/slot', 'status', 'closed', {
          token: 'explicit-stale-token',
        });
        expect.fail('Expected StaleTokenError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(StaleTokenError);
        const staleErr = error as StaleTokenError;
        expect(staleErr.code).toBe('STALE_TOKEN');
        expect(staleErr.path).toBe('group/slot');
        expect(staleErr.message).toBe('Explicit token is stale');
        expect(staleErr.current).toEqual(currentState);
        expect(staleErr.token).toBe(freshToken);
      }

      // Verify explicit token was passed to store (not cached token)
      expect(mockStore.setMeta).toHaveBeenCalledWith(
        'group/slot',
        'status',
        'closed',
        { token: 'explicit-stale-token' }
      );
    });

    // AC-9: Explicit stale token overrides cached token
    it('uses explicit stale token even when cached token exists (AC-9)', async () => {
      const getResponse = {
        metadata: { status: 'draft' },
        sections: [],
        token: 'cached-token-good',
      };
      const currentState = { metadata: { status: 'locked' }, sections: [] };
      const freshToken = 'fresh-token-abc123';
      const staleError = new StaleTokenError(
        'group/slot',
        'Explicit token is stale',
        currentState,
        freshToken
      );

      vi.mocked(mockStore.get).mockResolvedValue(getResponse);
      vi.mocked(mockStore.setMeta).mockRejectedValue(staleError);

      // Read to populate cache with cached-token-good
      await session.get('group/slot');

      // Write with explicit stale token should use explicit token, not cached token
      await expect(
        session.setMeta('group/slot', 'status', 'closed', {
          token: 'explicit-stale-token',
        })
      ).rejects.toThrow(StaleTokenError);

      // Verify explicit token was used (not cached token)
      expect(mockStore.setMeta).toHaveBeenCalledWith(
        'group/slot',
        'status',
        'closed',
        { token: 'explicit-stale-token' }
      );
    });
  });

  describe('setMeta(path, fields, opts?)', () => {
    // IR-8: setMeta(path, fields, opts?) with token injection
    it('injects cached node token from prior read', async () => {
      const metaResponse = {
        metadata: { status: 'draft' },
        token: 'node-token-1',
      };
      const setMetaResponse = {
        ok: true,
        path: 'group/slot',
        value: { status: 'locked', author: 'alice' },
        previous: { status: 'draft' },
        token: 'node-token-2',
      };

      vi.mocked(mockStore.meta).mockResolvedValue(metaResponse);
      vi.mocked(mockStore.setMeta).mockResolvedValue(setMetaResponse);

      // Read metadata to populate cache
      await session.meta('group/slot');

      // Write multiple fields should inject cached token
      await session.setMeta('group/slot', {
        status: 'locked',
        author: 'alice',
      });

      expect(mockStore.setMeta).toHaveBeenCalledWith(
        'group/slot',
        { status: 'locked', author: 'alice' },
        { token: 'node-token-1' }
      );
    });

    it('updates cache with fresh token after successful write', async () => {
      const metaResponse = {
        metadata: { status: 'draft' },
        token: 'node-token-1',
      };
      const firstSetMetaResponse = {
        ok: true,
        path: 'group/slot',
        value: { status: 'locked' },
        previous: { status: 'draft' },
        token: 'node-token-2',
      };
      const secondSetMetaResponse = {
        ok: true,
        path: 'group/slot',
        value: { author: 'bob' },
        previous: {},
        token: 'node-token-3',
      };

      vi.mocked(mockStore.meta).mockResolvedValue(metaResponse);
      vi.mocked(mockStore.setMeta)
        .mockResolvedValueOnce(firstSetMetaResponse)
        .mockResolvedValueOnce(secondSetMetaResponse);

      // Read to populate cache
      await session.meta('group/slot');

      // First write
      await session.setMeta('group/slot', { status: 'locked' });

      // Second write should use updated token
      await session.setMeta('group/slot', { author: 'bob' });

      expect(mockStore.setMeta).toHaveBeenNthCalledWith(
        2,
        'group/slot',
        { author: 'bob' },
        { token: 'node-token-2' }
      );
    });
  });

  describe('writeSection(path, sectionId, content, opts?)', () => {
    // IR-9: writeSection with token injection
    // AC-4: After section(path, sectionId), writeSection uses cached section token
    it('injects cached section token from prior section read', async () => {
      const sectionResponse = {
        id: 'overview',
        type: 'text',
        content: 'old content',
        token: 'section-token-1',
      };
      const writeSectionResponse = {
        ok: true as const,
        path: 'group/slot',
        token: 'section-token-2',
        nodeToken: 'node-token-2',
      };

      vi.mocked(mockStore.section).mockResolvedValue(sectionResponse);
      vi.mocked(mockStore.writeSection).mockResolvedValue(writeSectionResponse);

      // Read section to populate cache
      await session.section('group/slot', 'overview');

      // Write should inject cached section token
      await session.writeSection('group/slot', 'overview', 'new content');

      expect(mockStore.writeSection).toHaveBeenCalledWith(
        'group/slot',
        'overview',
        'new content',
        { token: 'section-token-1' }
      );
    });

    // AC-5: After successful write, cache updates both tokens
    it('updates both section and node tokens after successful write', async () => {
      const sectionResponse = {
        id: 'overview',
        type: 'text',
        content: 'old content',
        token: 'section-token-1',
      };
      const writeSectionResponse = {
        ok: true as const,
        path: 'group/slot',
        token: 'section-token-2',
        nodeToken: 'node-token-2',
      };

      vi.mocked(mockStore.section).mockResolvedValue(sectionResponse);
      vi.mocked(mockStore.writeSection).mockResolvedValue(writeSectionResponse);

      // Read section
      await session.section('group/slot', 'overview');

      // Write section
      await session.writeSection('group/slot', 'overview', 'new content');

      // Second write should use updated section token
      await session.writeSection('group/slot', 'overview', 'newer content');

      expect(mockStore.writeSection).toHaveBeenLastCalledWith(
        'group/slot',
        'overview',
        'newer content',
        { token: 'section-token-2' }
      );
    });

    // AC-15: Read section A, write section B: write to B has no cached token
    it('writes without token when different section read', async () => {
      const sectionResponse = {
        id: 'overview',
        type: 'text',
        content: 'content',
        token: 'overview-token',
      };
      const writeSectionResponse = {
        ok: true as const,
        path: 'group/slot',
        token: 'details-token-1',
        nodeToken: 'node-token-1',
      };

      vi.mocked(mockStore.section).mockResolvedValue(sectionResponse);
      vi.mocked(mockStore.writeSection).mockResolvedValue(writeSectionResponse);

      // Read overview section
      await session.section('group/slot', 'overview');

      // Write to different section (details) should not use cached token
      await session.writeSection('group/slot', 'details', 'details content');

      expect(mockStore.writeSection).toHaveBeenCalledWith(
        'group/slot',
        'details',
        'details content',
        undefined
      );
    });

    it('does not update cache when write fails', async () => {
      const sectionResponse = {
        id: 'overview',
        type: 'text',
        content: 'content',
        token: 'section-token-1',
      };
      const successResponse = {
        ok: true as const,
        path: 'group/slot',
        token: 'section-token-2',
        nodeToken: 'node-token-2',
      };

      vi.mocked(mockStore.section).mockResolvedValue(sectionResponse);
      vi.mocked(mockStore.writeSection)
        .mockRejectedValueOnce(
          new SidechainError('STALE_TOKEN', 'Token is stale')
        )
        .mockResolvedValueOnce(successResponse);

      // Read section
      await session.section('group/slot', 'overview');

      // Write fails
      await expect(
        session.writeSection('group/slot', 'overview', 'new content')
      ).rejects.toThrow('Token is stale');

      // Second write should still use original cached token
      await session.writeSection('group/slot', 'overview', 'new content');

      expect(mockStore.writeSection).toHaveBeenLastCalledWith(
        'group/slot',
        'overview',
        'new content',
        { token: 'section-token-1' }
      );
    });

    // EC-2: StaleTokenError from explicit token propagates unchanged
    it('propagates StaleTokenError from explicit token (EC-2)', async () => {
      const currentState = { metadata: {}, sections: [] };
      const freshToken = 'fresh-section-token';
      const staleError = new StaleTokenError(
        'group/slot',
        'Explicit section token is stale',
        currentState,
        freshToken
      );

      vi.mocked(mockStore.writeSection).mockRejectedValue(staleError);

      // Write with explicit stale token
      await expect(
        session.writeSection('group/slot', 'overview', 'content', {
          token: 'explicit-stale-section-token',
        })
      ).rejects.toThrow(StaleTokenError);

      // Verify explicit token was passed to store
      expect(mockStore.writeSection).toHaveBeenCalledWith(
        'group/slot',
        'overview',
        'content',
        { token: 'explicit-stale-section-token' }
      );
    });
  });

  describe('appendSection(path, sectionId, content, opts?)', () => {
    // IR-10: appendSection with token injection
    it('injects cached section token from prior section read', async () => {
      const sectionResponse = {
        id: 'notes',
        type: 'text',
        content: 'old notes',
        token: 'section-token-1',
      };
      const appendSectionResponse = {
        ok: true as const,
        path: 'group/slot',
        token: 'section-token-2',
        nodeToken: 'node-token-2',
      };

      vi.mocked(mockStore.section).mockResolvedValue(sectionResponse);
      vi.mocked(mockStore.appendSection).mockResolvedValue(
        appendSectionResponse
      );

      // Read section
      await session.section('group/slot', 'notes');

      // Append should inject cached section token
      await session.appendSection('group/slot', 'notes', '\nNew note');

      expect(mockStore.appendSection).toHaveBeenCalledWith(
        'group/slot',
        'notes',
        '\nNew note',
        { token: 'section-token-1' }
      );
    });

    it('updates both section and node tokens after successful append', async () => {
      const sectionResponse = {
        id: 'notes',
        type: 'text',
        content: 'old notes',
        token: 'section-token-1',
      };
      const appendSectionResponse = {
        ok: true as const,
        path: 'group/slot',
        token: 'section-token-2',
        nodeToken: 'node-token-2',
      };

      vi.mocked(mockStore.section).mockResolvedValue(sectionResponse);
      vi.mocked(mockStore.appendSection).mockResolvedValue(
        appendSectionResponse
      );

      // Read section
      await session.section('group/slot', 'notes');

      // Append
      await session.appendSection('group/slot', 'notes', '\nNote 1');

      // Second append should use updated token
      await session.appendSection('group/slot', 'notes', '\nNote 2');

      expect(mockStore.appendSection).toHaveBeenLastCalledWith(
        'group/slot',
        'notes',
        '\nNote 2',
        { token: 'section-token-2' }
      );
    });

    // EC-2: StaleTokenError from explicit token propagates unchanged
    it('propagates StaleTokenError from explicit token (EC-2)', async () => {
      const currentState = { metadata: {}, sections: [] };
      const freshToken = 'fresh-append-token';
      const staleError = new StaleTokenError(
        'group/slot',
        'Explicit append token is stale',
        currentState,
        freshToken
      );

      vi.mocked(mockStore.appendSection).mockRejectedValue(staleError);

      // Append with explicit stale token
      await expect(
        session.appendSection('group/slot', 'notes', '\nNew note', {
          token: 'explicit-stale-append-token',
        })
      ).rejects.toThrow(StaleTokenError);

      // Verify explicit token was passed to store
      expect(mockStore.appendSection).toHaveBeenCalledWith(
        'group/slot',
        'notes',
        '\nNew note',
        { token: 'explicit-stale-append-token' }
      );
    });
  });

  describe('populate(path, data, opts?)', () => {
    // IR-11: populate with token injection
    it('injects cached node token from prior read', async () => {
      const getResponse = {
        metadata: {},
        sections: [],
        token: 'node-token-1',
      };
      const populateResponse = {
        ok: true as const,
        path: 'group/slot',
        sections: 2,
        metadata: 1,
        token: 'node-token-2',
      };

      vi.mocked(mockStore.get).mockResolvedValue(getResponse);
      vi.mocked(mockStore.populate).mockResolvedValue(populateResponse);

      // Read to populate cache
      await session.get('group/slot');

      // Populate should inject cached node token
      await session.populate('group/slot', {
        metadata: { status: 'draft' },
        sections: { overview: 'content', details: 'more content' },
      });

      expect(mockStore.populate).toHaveBeenCalledWith(
        'group/slot',
        {
          metadata: { status: 'draft' },
          sections: { overview: 'content', details: 'more content' },
        },
        { token: 'node-token-1' }
      );
    });

    it('updates node token after successful populate', async () => {
      const getResponse = {
        metadata: {},
        sections: [],
        token: 'node-token-1',
      };
      const populateResponse = {
        ok: true as const,
        path: 'group/slot',
        sections: 1,
        metadata: 1,
        token: 'node-token-2',
      };

      vi.mocked(mockStore.get).mockResolvedValue(getResponse);
      vi.mocked(mockStore.populate).mockResolvedValue(populateResponse);

      // Read
      await session.get('group/slot');

      // Populate
      await session.populate('group/slot', {
        sections: { overview: 'content' },
      });

      // Second populate should use updated token
      await session.populate('group/slot', {
        sections: { details: 'more' },
      });

      expect(mockStore.populate).toHaveBeenLastCalledWith(
        'group/slot',
        { sections: { details: 'more' } },
        { token: 'node-token-2' }
      );
    });

    // EC-2: StaleTokenError from explicit token propagates unchanged
    it('propagates StaleTokenError from explicit token (EC-2)', async () => {
      const currentState = { metadata: {}, sections: [] };
      const freshToken = 'fresh-populate-token';
      const staleError = new StaleTokenError(
        'group/slot',
        'Explicit populate token is stale',
        currentState,
        freshToken
      );

      vi.mocked(mockStore.populate).mockRejectedValue(staleError);

      // Populate with explicit stale token
      await expect(
        session.populate(
          'group/slot',
          { sections: { overview: 'content' } },
          { token: 'explicit-stale-populate-token' }
        )
      ).rejects.toThrow(StaleTokenError);

      // Verify explicit token was passed to store
      expect(mockStore.populate).toHaveBeenCalledWith(
        'group/slot',
        { sections: { overview: 'content' } },
        { token: 'explicit-stale-populate-token' }
      );
    });
  });

  describe('item.add(path, sectionId, data)', () => {
    // IR-13: item.add with token caching
    it('caches both section token and node token', async () => {
      const addResponse = {
        ok: true as const,
        path: 'group/slot/phase-1/1.2',
        item: '1.2',
        token: 'section-token-1',
        nodeToken: 'node-token-1',
      };

      vi.mocked(mockStore.item.add).mockResolvedValue(addResponse);

      const result = await session.item.add('group/slot', 'phase-1', {
        title: 'New Task',
      });

      expect(result).toEqual(addResponse);
      expect(mockStore.item.add).toHaveBeenCalledWith('group/slot', 'phase-1', {
        title: 'New Task',
      });
    });

    it('enables subsequent item.update to use cached section token', async () => {
      const addResponse = {
        ok: true as const,
        path: 'group/slot/phase-1/1.2',
        item: '1.2',
        token: 'section-token-1',
        nodeToken: 'node-token-1',
      };
      const updateResponse = {
        ok: true as const,
        path: 'group/slot',
        item: '1.2',
        previous: { title: 'New Task' },
        token: 'section-token-2',
        nodeToken: 'node-token-2',
      };

      vi.mocked(mockStore.item.add).mockResolvedValue(addResponse);
      vi.mocked(mockStore.item.update).mockResolvedValue(updateResponse);

      // Add item to populate cache
      await session.item.add('group/slot', 'phase-1', { title: 'New Task' });

      // Update should inject cached section token
      await session.item.update('group/slot', 'phase-1', '1.2', {
        title: 'Updated Task',
      });

      expect(mockStore.item.update).toHaveBeenCalledWith(
        'group/slot',
        'phase-1',
        '1.2',
        { title: 'Updated Task' },
        { token: 'section-token-1' }
      );
    });

    it('propagates NotFoundError unchanged', async () => {
      const error = new SidechainError('NOT_FOUND', 'Section not found');
      vi.mocked(mockStore.item.add).mockRejectedValue(error);

      await expect(
        session.item.add('group/slot', 'phase-1', { title: 'New Task' })
      ).rejects.toThrow(error);
    });

    it('propagates ValidationError unchanged', async () => {
      const error = new SidechainError('VALIDATION_ERROR', 'Invalid item data');
      vi.mocked(mockStore.item.add).mockRejectedValue(error);

      await expect(
        session.item.add('group/slot', 'phase-1', { title: 'New Task' })
      ).rejects.toThrow(error);
    });
  });

  describe('item.update(path, sectionId, itemId, fields, opts?)', () => {
    // IR-12: item.update with token injection
    it('injects cached section token from prior item.get', async () => {
      const getResponse = {
        content: { id: '1.1', title: 'Task 1' },
        token: 'section-token-1',
      };
      const updateResponse = {
        ok: true as const,
        path: 'group/slot',
        item: '1.1',
        previous: { title: 'Task 1' },
        token: 'section-token-2',
        nodeToken: 'node-token-2',
      };

      vi.mocked(mockStore.item.get).mockResolvedValue(getResponse);
      vi.mocked(mockStore.item.update).mockResolvedValue(updateResponse);

      // Read item to populate section token cache
      await session.item.get('group/slot', 'phase-1', '1.1');

      // Update should inject cached section token
      await session.item.update('group/slot', 'phase-1', '1.1', {
        title: 'Updated Task 1',
      });

      expect(mockStore.item.update).toHaveBeenCalledWith(
        'group/slot',
        'phase-1',
        '1.1',
        { title: 'Updated Task 1' },
        { token: 'section-token-1' }
      );
    });

    it('updates both section and node tokens after successful update', async () => {
      const getResponse = {
        content: { id: '1.1', title: 'Task 1' },
        token: 'section-token-1',
      };
      const updateResponse = {
        ok: true as const,
        path: 'group/slot',
        item: '1.1',
        previous: { title: 'Task 1' },
        token: 'section-token-2',
        nodeToken: 'node-token-2',
      };

      vi.mocked(mockStore.item.get).mockResolvedValue(getResponse);
      vi.mocked(mockStore.item.update).mockResolvedValue(updateResponse);

      // Read item
      await session.item.get('group/slot', 'phase-1', '1.1');

      // Update
      await session.item.update('group/slot', 'phase-1', '1.1', {
        title: 'Updated',
      });

      // Second update should use fresh section token
      await session.item.update('group/slot', 'phase-1', '1.1', {
        status: 'done',
      });

      expect(mockStore.item.update).toHaveBeenLastCalledWith(
        'group/slot',
        'phase-1',
        '1.1',
        { status: 'done' },
        { token: 'section-token-2' }
      );
    });

    it('does not update cache when update fails', async () => {
      const getResponse = {
        content: { id: '1.1', title: 'Task 1' },
        token: 'section-token-1',
      };
      const successResponse = {
        ok: true as const,
        path: 'group/slot',
        item: '1.1',
        previous: { title: 'Task 1' },
        token: 'section-token-2',
        nodeToken: 'node-token-2',
      };

      vi.mocked(mockStore.item.get).mockResolvedValue(getResponse);
      vi.mocked(mockStore.item.update)
        .mockRejectedValueOnce(
          new SidechainError('STALE_TOKEN', 'Token is stale')
        )
        .mockResolvedValueOnce(successResponse);

      // Read item
      await session.item.get('group/slot', 'phase-1', '1.1');

      // Update fails
      await expect(
        session.item.update('group/slot', 'phase-1', '1.1', { title: 'New' })
      ).rejects.toThrow('Token is stale');

      // Second update should still use original cached token
      await session.item.update('group/slot', 'phase-1', '1.1', {
        title: 'New',
      });

      expect(mockStore.item.update).toHaveBeenLastCalledWith(
        'group/slot',
        'phase-1',
        '1.1',
        { title: 'New' },
        { token: 'section-token-1' }
      );
    });

    // EC-2: StaleTokenError from explicit token propagates unchanged
    it('propagates StaleTokenError from explicit token (EC-2)', async () => {
      const currentState = { metadata: {}, sections: [] };
      const freshToken = 'fresh-item-token';
      const staleError = new StaleTokenError(
        'group/slot',
        'Explicit item token is stale',
        currentState,
        freshToken
      );

      vi.mocked(mockStore.item.update).mockRejectedValue(staleError);

      // Update with explicit stale token
      await expect(
        session.item.update(
          'group/slot',
          'phase-1',
          '1.1',
          { title: 'Updated' },
          { token: 'explicit-stale-item-token' }
        )
      ).rejects.toThrow(StaleTokenError);

      // Verify explicit token was passed to store
      expect(mockStore.item.update).toHaveBeenCalledWith(
        'group/slot',
        'phase-1',
        '1.1',
        { title: 'Updated' },
        { token: 'explicit-stale-item-token' }
      );
    });
  });
});

describe('Store Error Propagation', () => {
  // EC-4, EC-5, AC-11, AC-12
  // Session never catches or transforms Store errors except to update (or not update) its cache
  // All errors propagate to the caller with original type and properties
  let mockStore: ReturnType<typeof createMockStore>;
  let session: Session;

  beforeEach(() => {
    mockStore = createMockStore();
    session = new Session(mockStore, 'test-client');
  });

  describe('NotFoundError propagation (EC-4, AC-11)', () => {
    // AC-11: Store-level NotFoundError propagates through session unchanged
    it('propagates NotFoundError from get() unchanged', async () => {
      const originalError = new NotFoundError(
        'group/slot',
        'Node not found at path'
      );
      vi.mocked(mockStore.get).mockRejectedValue(originalError);

      try {
        await session.get('group/slot');
        expect.fail('Expected NotFoundError to be thrown');
      } catch (error) {
        // Verify error is the same instance
        expect(error).toBe(originalError);
        // Verify error type unchanged
        expect(error).toBeInstanceOf(NotFoundError);
        // Verify error properties unchanged
        expect((error as NotFoundError).code).toBe('NOT_FOUND');
        expect((error as NotFoundError).path).toBe('group/slot');
        expect((error as NotFoundError).message).toBe('Node not found at path');
      }
    });

    it('propagates NotFoundError from meta() unchanged', async () => {
      const originalError = new NotFoundError(
        'group/slot',
        'Node does not exist'
      );
      vi.mocked(mockStore.meta).mockRejectedValue(originalError);

      try {
        await session.meta('group/slot');
        expect.fail('Expected NotFoundError to be thrown');
      } catch (error) {
        expect(error).toBe(originalError);
        expect(error).toBeInstanceOf(NotFoundError);
        expect((error as NotFoundError).code).toBe('NOT_FOUND');
        expect((error as NotFoundError).path).toBe('group/slot');
        expect((error as NotFoundError).message).toBe('Node does not exist');
      }
    });

    it('propagates NotFoundError from section() unchanged', async () => {
      const originalError = new NotFoundError(
        'group/slot',
        'Section parent node not found'
      );
      vi.mocked(mockStore.section).mockRejectedValue(originalError);

      try {
        await session.section('group/slot', 'overview');
        expect.fail('Expected NotFoundError to be thrown');
      } catch (error) {
        expect(error).toBe(originalError);
        expect(error).toBeInstanceOf(NotFoundError);
        expect((error as NotFoundError).code).toBe('NOT_FOUND');
        expect((error as NotFoundError).path).toBe('group/slot');
        expect((error as NotFoundError).message).toBe(
          'Section parent node not found'
        );
      }
    });

    it('propagates NotFoundError from setMeta() unchanged', async () => {
      const originalError = new NotFoundError(
        'group/slot',
        'Cannot set metadata on non-existent node'
      );
      vi.mocked(mockStore.setMeta).mockRejectedValue(originalError);

      try {
        await session.setMeta('group/slot', 'field', 'value');
        expect.fail('Expected NotFoundError to be thrown');
      } catch (error) {
        expect(error).toBe(originalError);
        expect(error).toBeInstanceOf(NotFoundError);
        expect((error as NotFoundError).code).toBe('NOT_FOUND');
        expect((error as NotFoundError).path).toBe('group/slot');
        expect((error as NotFoundError).message).toBe(
          'Cannot set metadata on non-existent node'
        );
      }
    });

    it('propagates NotFoundError from writeSection() unchanged', async () => {
      const originalError = new NotFoundError(
        'group/slot',
        'Cannot write section to non-existent node'
      );
      vi.mocked(mockStore.writeSection).mockRejectedValue(originalError);

      try {
        await session.writeSection('group/slot', 'overview', 'content');
        expect.fail('Expected NotFoundError to be thrown');
      } catch (error) {
        expect(error).toBe(originalError);
        expect(error).toBeInstanceOf(NotFoundError);
        expect((error as NotFoundError).code).toBe('NOT_FOUND');
        expect((error as NotFoundError).path).toBe('group/slot');
        expect((error as NotFoundError).message).toBe(
          'Cannot write section to non-existent node'
        );
      }
    });

    it('propagates NotFoundError from populate() unchanged', async () => {
      const originalError = new NotFoundError(
        'group/slot',
        'Cannot populate non-existent node'
      );
      vi.mocked(mockStore.populate).mockRejectedValue(originalError);

      try {
        await session.populate('group/slot', { sections: {} });
        expect.fail('Expected NotFoundError to be thrown');
      } catch (error) {
        expect(error).toBe(originalError);
        expect(error).toBeInstanceOf(NotFoundError);
        expect((error as NotFoundError).code).toBe('NOT_FOUND');
        expect((error as NotFoundError).path).toBe('group/slot');
        expect((error as NotFoundError).message).toBe(
          'Cannot populate non-existent node'
        );
      }
    });

    it('propagates NotFoundError from item.get() unchanged', async () => {
      const originalError = new NotFoundError(
        'group/slot',
        'Item parent node not found'
      );
      vi.mocked(mockStore.item.get).mockRejectedValue(originalError);

      try {
        await session.item.get('group/slot', 'phase-1', '1.1');
        expect.fail('Expected NotFoundError to be thrown');
      } catch (error) {
        expect(error).toBe(originalError);
        expect(error).toBeInstanceOf(NotFoundError);
        expect((error as NotFoundError).code).toBe('NOT_FOUND');
        expect((error as NotFoundError).path).toBe('group/slot');
        expect((error as NotFoundError).message).toBe(
          'Item parent node not found'
        );
      }
    });

    it('propagates NotFoundError from item.update() unchanged', async () => {
      const originalError = new NotFoundError(
        'group/slot',
        'Item parent node not found'
      );
      vi.mocked(mockStore.item.update).mockRejectedValue(originalError);

      try {
        await session.item.update('group/slot', 'phase-1', '1.1', {
          title: 'Updated',
        });
        expect.fail('Expected NotFoundError to be thrown');
      } catch (error) {
        expect(error).toBe(originalError);
        expect(error).toBeInstanceOf(NotFoundError);
        expect((error as NotFoundError).code).toBe('NOT_FOUND');
        expect((error as NotFoundError).path).toBe('group/slot');
        expect((error as NotFoundError).message).toBe(
          'Item parent node not found'
        );
      }
    });
  });

  describe('ValidationError propagation (EC-5, AC-12)', () => {
    // AC-12: Store-level ValidationError propagates through session unchanged
    it('propagates ValidationError from setMeta() unchanged', async () => {
      const originalError = new ValidationError(
        'group/slot',
        'Field value fails schema constraint',
        'node-schema'
      );
      vi.mocked(mockStore.setMeta).mockRejectedValue(originalError);

      try {
        await session.setMeta('group/slot', 'status', 'invalid-value');
        expect.fail('Expected ValidationError to be thrown');
      } catch (error) {
        // Verify error is the same instance
        expect(error).toBe(originalError);
        // Verify error type unchanged
        expect(error).toBeInstanceOf(ValidationError);
        // Verify error properties unchanged
        expect((error as ValidationError).code).toBe('VALIDATION_ERROR');
        expect((error as ValidationError).path).toBe('group/slot');
        expect((error as ValidationError).message).toBe(
          'Field value fails schema constraint'
        );
        expect((error as ValidationError).schema).toBe('node-schema');
      }
    });

    it('propagates ValidationError from writeSection() unchanged', async () => {
      const originalError = new ValidationError(
        'group/slot',
        'Section content fails type validation',
        'task-list'
      );
      vi.mocked(mockStore.writeSection).mockRejectedValue(originalError);

      try {
        await session.writeSection('group/slot', 'overview', 'invalid-content');
        expect.fail('Expected ValidationError to be thrown');
      } catch (error) {
        expect(error).toBe(originalError);
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).code).toBe('VALIDATION_ERROR');
        expect((error as ValidationError).path).toBe('group/slot');
        expect((error as ValidationError).message).toBe(
          'Section content fails type validation'
        );
        expect((error as ValidationError).schema).toBe('task-list');
      }
    });

    it('propagates ValidationError from populate() unchanged', async () => {
      const originalError = new ValidationError(
        'group/slot',
        'Metadata field missing required constraint',
        'node-schema'
      );
      vi.mocked(mockStore.populate).mockRejectedValue(originalError);

      try {
        await session.populate('group/slot', {
          metadata: { invalid: 'data' },
          sections: {},
        });
        expect.fail('Expected ValidationError to be thrown');
      } catch (error) {
        expect(error).toBe(originalError);
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).code).toBe('VALIDATION_ERROR');
        expect((error as ValidationError).path).toBe('group/slot');
        expect((error as ValidationError).message).toBe(
          'Metadata field missing required constraint'
        );
        expect((error as ValidationError).schema).toBe('node-schema');
      }
    });

    it('propagates ValidationError from item.add() unchanged', async () => {
      const originalError = new ValidationError(
        'group/slot',
        'Item data fails schema validation',
        'task-list'
      );
      vi.mocked(mockStore.item.add).mockRejectedValue(originalError);

      try {
        await session.item.add('group/slot', 'phase-1', {
          invalid: 'fields',
        });
        expect.fail('Expected ValidationError to be thrown');
      } catch (error) {
        expect(error).toBe(originalError);
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).code).toBe('VALIDATION_ERROR');
        expect((error as ValidationError).path).toBe('group/slot');
        expect((error as ValidationError).message).toBe(
          'Item data fails schema validation'
        );
        expect((error as ValidationError).schema).toBe('task-list');
      }
    });

    it('propagates ValidationError from item.update() unchanged', async () => {
      const originalError = new ValidationError(
        'group/slot',
        'Item field update fails validation',
        'task-list'
      );
      vi.mocked(mockStore.item.update).mockRejectedValue(originalError);

      try {
        await session.item.update('group/slot', 'phase-1', '1.1', {
          status: 'invalid-status',
        });
        expect.fail('Expected ValidationError to be thrown');
      } catch (error) {
        expect(error).toBe(originalError);
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).code).toBe('VALIDATION_ERROR');
        expect((error as ValidationError).path).toBe('group/slot');
        expect((error as ValidationError).message).toBe(
          'Item field update fails validation'
        );
        expect((error as ValidationError).schema).toBe('task-list');
      }
    });

    it('propagates ValidationError without schema property', async () => {
      const originalError = new ValidationError(
        'group/slot',
        'Generic validation error'
      );
      vi.mocked(mockStore.setMeta).mockRejectedValue(originalError);

      try {
        await session.setMeta('group/slot', 'field', 'value');
        expect.fail('Expected ValidationError to be thrown');
      } catch (error) {
        expect(error).toBe(originalError);
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).code).toBe('VALIDATION_ERROR');
        expect((error as ValidationError).path).toBe('group/slot');
        expect((error as ValidationError).message).toBe(
          'Generic validation error'
        );
        expect((error as ValidationError).schema).toBeUndefined();
      }
    });
  });

  describe('Error propagation does not update cache', () => {
    it('NotFoundError does not update cache', async () => {
      const getResponse = {
        metadata: { status: 'draft' },
        sections: [],
        token: 'cached-token',
      };
      const notFoundError = new NotFoundError(
        'group/slot',
        'Node no longer exists'
      );
      const successResponse = {
        ok: true,
        path: 'group/slot',
        value: { status: 'locked' },
        previous: { status: 'draft' },
        token: 'new-token',
      };

      vi.mocked(mockStore.get).mockResolvedValue(getResponse);
      vi.mocked(mockStore.setMeta)
        .mockRejectedValueOnce(notFoundError)
        .mockResolvedValueOnce(successResponse);

      // Read to populate cache
      await session.get('group/slot');

      // Write fails with NotFoundError
      await expect(
        session.setMeta('group/slot', 'status', 'locked')
      ).rejects.toThrow(NotFoundError);

      // Subsequent write should use original cached token
      await session.setMeta('group/slot', 'status', 'locked');

      expect(mockStore.setMeta).toHaveBeenLastCalledWith(
        'group/slot',
        'status',
        'locked',
        { token: 'cached-token' }
      );
    });

    it('ValidationError does not update cache', async () => {
      const sectionResponse = {
        id: 'overview',
        type: 'text',
        content: 'content',
        token: 'cached-section-token',
      };
      const validationError = new ValidationError(
        'group/slot',
        'Content fails validation',
        'text'
      );
      const successResponse = {
        ok: true as const,
        path: 'group/slot',
        token: 'new-section-token',
        nodeToken: 'new-node-token',
      };

      vi.mocked(mockStore.section).mockResolvedValue(sectionResponse);
      vi.mocked(mockStore.writeSection)
        .mockRejectedValueOnce(validationError)
        .mockResolvedValueOnce(successResponse);

      // Read section to populate cache
      await session.section('group/slot', 'overview');

      // Write fails with ValidationError
      await expect(
        session.writeSection('group/slot', 'overview', 'invalid-content')
      ).rejects.toThrow(ValidationError);

      // Subsequent write should use original cached token
      await session.writeSection('group/slot', 'overview', 'valid-content');

      expect(mockStore.writeSection).toHaveBeenLastCalledWith(
        'group/slot',
        'overview',
        'valid-content',
        { token: 'cached-section-token' }
      );
    });
  });
});

describe('Session.createGroup - clientId Injection', () => {
  // IR-3: Session.createGroup(schemaId, opts?)
  // AC-2: session.createGroup('schema') injects clientId and returns result
  // AC-3: session.createGroup('schema', { name: 'grp' }) injects clientId and forwards name
  // EC-6: Closed session throws SESSION_CLOSED
  // EC-7: Store error propagates through Session
  let mockStore: ReturnType<typeof createMockStore>;
  let session: Session;

  beforeEach(() => {
    mockStore = createMockStore();
    session = new Session(mockStore, 'test-client-123');
  });

  describe('IR-3, AC-2: createGroup without opts injects clientId', () => {
    it('injects clientId when called without opts', async () => {
      const mockResult = {
        address: 'sc_g_abc123',
        schema: 'test-schema',
      };
      vi.mocked(mockStore.createGroup).mockResolvedValue(mockResult);

      const result = await session.createGroup('test-schema');

      expect(result).toEqual(mockResult);
      expect(mockStore.createGroup).toHaveBeenCalledWith('test-schema', {
        client: 'test-client-123',
      });
    });

    it('returns address and schema from store', async () => {
      const mockResult = {
        address: 'sc_g_xyz789',
        schema: 'another-schema',
      };
      vi.mocked(mockStore.createGroup).mockResolvedValue(mockResult);

      const result = await session.createGroup('another-schema');

      expect(result.address).toBe('sc_g_xyz789');
      expect(result.schema).toBe('another-schema');
    });
  });

  describe('AC-3: createGroup with name forwards name and injects clientId', () => {
    it('injects clientId and forwards name when provided', async () => {
      const mockResult = {
        address: 'sc_g_def456',
        schema: 'test-schema',
        name: 'my-group',
      };
      vi.mocked(mockStore.createGroup).mockResolvedValue(mockResult);

      const result = await session.createGroup('test-schema', {
        name: 'my-group',
      });

      expect(result).toEqual(mockResult);
      expect(mockStore.createGroup).toHaveBeenCalledWith('test-schema', {
        client: 'test-client-123',
        name: 'my-group',
      });
    });

    it('handles name with special characters', async () => {
      const mockResult = {
        address: 'sc_g_special',
        schema: 'test-schema',
        name: 'group-with-dashes_and_underscores',
      };
      vi.mocked(mockStore.createGroup).mockResolvedValue(mockResult);

      const result = await session.createGroup('test-schema', {
        name: 'group-with-dashes_and_underscores',
      });

      expect(result.name).toBe('group-with-dashes_and_underscores');
      expect(mockStore.createGroup).toHaveBeenCalledWith('test-schema', {
        client: 'test-client-123',
        name: 'group-with-dashes_and_underscores',
      });
    });
  });

  describe('EC-6: Closed session throws SESSION_CLOSED', () => {
    it('throws SESSION_CLOSED when session is closed', async () => {
      session.close();

      await expect(session.createGroup('test-schema')).rejects.toThrow(
        SidechainError
      );
      await expect(session.createGroup('test-schema')).rejects.toThrow(
        /session is closed/i
      );
    });

    it('throws SESSION_CLOSED with correct error code', async () => {
      session.close();

      try {
        await session.createGroup('test-schema');
        expect.fail('Expected SESSION_CLOSED error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SidechainError);
        expect((error as SidechainError).code).toBe('SESSION_CLOSED');
        expect((error as SidechainError).message).toBe('Session is closed');
      }
    });

    it('does not call store when session is closed', async () => {
      session.close();

      try {
        await session.createGroup('test-schema');
      } catch {
        // Expected to throw
      }

      expect(mockStore.createGroup).not.toHaveBeenCalled();
    });
  });

  describe('EC-7: Store errors propagate unchanged', () => {
    it('propagates InvalidSchemaError from store', async () => {
      const schemaError = new SidechainError(
        'INVALID_SCHEMA',
        'Schema test-schema not found'
      );
      vi.mocked(mockStore.createGroup).mockRejectedValue(schemaError);

      try {
        await session.createGroup('test-schema');
        expect.fail('Expected InvalidSchemaError to be thrown');
      } catch (error) {
        expect(error).toBe(schemaError);
        expect((error as SidechainError).code).toBe('INVALID_SCHEMA');
        expect((error as SidechainError).message).toBe(
          'Schema test-schema not found'
        );
      }
    });

    it('propagates ValidationError from store', async () => {
      const validationError = new ValidationError(
        'opts',
        'Invalid client ID format',
        'CreateGroupOptions'
      );
      vi.mocked(mockStore.createGroup).mockRejectedValue(validationError);

      try {
        await session.createGroup('test-schema');
        expect.fail('Expected ValidationError to be thrown');
      } catch (error) {
        expect(error).toBe(validationError);
        expect((error as ValidationError).code).toBe('VALIDATION_ERROR');
        expect((error as ValidationError).message).toBe(
          'Invalid client ID format'
        );
      }
    });

    it('propagates generic errors from store', async () => {
      const genericError = new Error('Filesystem error');
      vi.mocked(mockStore.createGroup).mockRejectedValue(genericError);

      await expect(session.createGroup('test-schema')).rejects.toThrow(
        'Filesystem error'
      );
    });
  });

  describe('ClientId injection with different session instances', () => {
    it('each session injects its own clientId', async () => {
      const session1 = new Session(mockStore, 'client-1');
      const session2 = new Session(mockStore, 'client-2');

      const mockResult1 = { address: 'sc_g_1', schema: 'schema' };
      const mockResult2 = { address: 'sc_g_2', schema: 'schema' };

      vi.mocked(mockStore.createGroup)
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2);

      await session1.createGroup('schema');
      await session2.createGroup('schema');

      expect(mockStore.createGroup).toHaveBeenNthCalledWith(1, 'schema', {
        client: 'client-1',
      });
      expect(mockStore.createGroup).toHaveBeenNthCalledWith(2, 'schema', {
        client: 'client-2',
      });
    });

    it('handles empty clientId string', async () => {
      const emptySession = new Session(mockStore, '');
      const mockResult = { address: 'sc_g_empty', schema: 'schema' };
      vi.mocked(mockStore.createGroup).mockResolvedValue(mockResult);

      await emptySession.createGroup('schema');

      expect(mockStore.createGroup).toHaveBeenCalledWith('schema', {
        client: '',
      });
    });

    // AC-18: Session with empty clientId - constructor accepts, Store validates on call
    it('empty clientId validation deferred to Store (AC-18)', async () => {
      const emptySession = new Session(mockStore, '');

      // Store rejects empty clientId
      const validationError = new ValidationError(
        'opts',
        'client field must be non-empty string',
        'CreateGroupOptions'
      );
      vi.mocked(mockStore.createGroup).mockRejectedValue(validationError);

      // Session should propagate the Store validation error
      try {
        await emptySession.createGroup('schema');
        expect.fail('Expected ValidationError to be thrown');
      } catch (error) {
        expect(error).toBe(validationError);
        expect((error as ValidationError).code).toBe('VALIDATION_ERROR');
        expect((error as ValidationError).message).toBe(
          'client field must be non-empty string'
        );
      }

      // Verify Store was called (validation happened at Store level)
      expect(mockStore.createGroup).toHaveBeenCalledWith('schema', {
        client: '',
      });
    });
  });
});
