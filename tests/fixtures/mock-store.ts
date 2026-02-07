/**
 * Mock Store implementation for testing CLI and MCP routing
 * Replaces duplicated mock implementations in cli.test.ts and routing.test.ts
 */

import { vi } from 'vitest';

import type { ControlPlane } from '../../src/types/control-plane.js';
import type { ItemOps } from '../../src/types/item.js';
import type { Store } from '../../src/types/store.js';

/**
 * Create a mock Store with all operations stubbed via vitest
 * All methods return vi.fn() mocks that can be configured per-test
 *
 * @example
 * ```typescript
 * const store = createMockStore();
 * vi.mocked(store.get).mockResolvedValue({ metadata: {}, sections: [] });
 * await store.get('path');
 * expect(store.get).toHaveBeenCalledWith('path');
 * ```
 */
export function createMockStore(): Store & ControlPlane {
  return {
    // Store operations
    list: vi.fn(),
    get: vi.fn(),
    exists: vi.fn(),
    createGroup: vi.fn(),
    deleteGroup: vi.fn(),
    describeGroup: vi.fn(),
    validateGroup: vi.fn(),
    meta: vi.fn(),
    setMeta: vi.fn(),
    sections: vi.fn(),
    section: vi.fn(),
    writeSection: vi.fn(),
    appendSection: vi.fn(),
    addSection: vi.fn(),
    removeSection: vi.fn(),
    populate: vi.fn(),
    describe: vi.fn(),
    validate: vi.fn(),

    // Item operations
    item: {
      get: vi.fn(),
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    } as unknown as ItemOps,

    // ControlPlane operations
    mounts: vi.fn(),
    listSchemas: vi.fn(),
    getSchema: vi.fn(),
    registerSchema: vi.fn(),
    info: vi.fn(),
    listContentTypes: vi.fn(),
  };
}
