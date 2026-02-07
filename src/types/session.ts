/**
 * Session interface - wraps Store with token caching and lifecycle management
 * Extends Store interface with close() method for resource cleanup
 */

import type { Store } from './store.js';

/**
 * Session extends Store with session lifecycle management
 * IR-1: constructor(store: Store) - wraps Store instance
 * IR-14: close() - discards token cache and releases session
 * IC-1: Session extends full Store interface
 */
export interface Session extends Store {
  /**
   * Discard token cache and release the session
   * Session becomes unusable after close
   */
  close(): void;
}
