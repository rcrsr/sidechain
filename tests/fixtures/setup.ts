/**
 * Shared test setup and teardown helpers
 * Provides common patterns for temp directory management and store initialization
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { Sidechain } from '../../src/core/store.js';
import type { SidechainConfig } from '../../src/types/config.js';
import type { Store } from '../../src/types/store.js';

import { createTestConfig } from './config.js';

/**
 * Result from setupTestStore
 */
export interface TestStoreSetup {
  tempDir: string;
  store: Store;
  groupsDir: string;
}

/**
 * Create a temporary directory for testing
 * Call cleanupTempDir in afterEach to remove
 */
export async function createTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'sidechain-test-'));
}

/**
 * Remove a temporary directory and all contents
 */
export async function cleanupTempDir(tempDir: string): Promise<void> {
  await fs.rm(tempDir, { recursive: true, force: true });
}

/**
 * Setup a test store with temp directory and groups folder
 * Common pattern used in 8+ test files
 *
 * @param configOrBuilder - Optional config override or function that takes tempDir and returns config
 * @returns Object with tempDir, store, and groupsDir
 *
 * @example
 * ```typescript
 * let setup: TestStoreSetup;
 *
 * beforeEach(async () => {
 *   setup = await setupTestStore();
 * });
 *
 * afterEach(async () => {
 *   await cleanupTestStore(setup);
 * });
 * ```
 */
export async function setupTestStore(
  configOrBuilder?: SidechainConfig | ((tempDir: string) => SidechainConfig)
): Promise<TestStoreSetup> {
  const tempDir = await createTempDir();
  const groupsDir = path.join(tempDir, 'groups');

  let finalConfig: SidechainConfig;
  if (typeof configOrBuilder === 'function') {
    finalConfig = configOrBuilder(tempDir);
  } else {
    finalConfig = configOrBuilder ?? createTestConfig(tempDir);
  }

  const store = await Sidechain.open(finalConfig);

  // Create groups directory
  await fs.mkdir(groupsDir, { recursive: true });

  return { tempDir, store, groupsDir };
}

/**
 * Cleanup after setupTestStore
 */
export async function cleanupTestStore(setup: TestStoreSetup): Promise<void> {
  await cleanupTempDir(setup.tempDir);
}

/**
 * Setup a test store and create a test group
 * Returns the group address for immediate use
 *
 * @param configOrBuilder - Optional config override or function that takes tempDir and returns config
 * @param groupId - Group ID to create (default: 'test-group')
 * @returns Setup object plus groupAddress
 */
export async function setupTestStoreWithGroup(
  configOrBuilder?: SidechainConfig | ((tempDir: string) => SidechainConfig),
  groupId: string = 'test-group'
): Promise<TestStoreSetup & { groupAddress: string }> {
  const setup = await setupTestStore(configOrBuilder);
  const result = await setup.store.createGroup(groupId);

  return {
    ...setup,
    groupAddress: result.address,
  };
}
