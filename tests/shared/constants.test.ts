/**
 * Tests for shared constants module
 * Covers: AC-41
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONFIG_FILE,
  DEFAULT_NODE_EXTENSION,
  GROUP_ADDRESS_PREFIX,
  MCP_PROTOCOL_VERSION,
  TOKEN_PREFIX_NODE,
  TOKEN_PREFIX_SECTION,
} from '../../src/shared/constants.js';

describe('Constants Module', () => {
  describe('AC-41: Constants module exports all 6 magic string constants', () => {
    it('exports TOKEN_PREFIX_NODE with correct value', () => {
      expect(TOKEN_PREFIX_NODE).toBe('sc_t_node_');
    });

    it('exports TOKEN_PREFIX_SECTION with correct value', () => {
      expect(TOKEN_PREFIX_SECTION).toBe('sc_t_sec_');
    });

    it('exports GROUP_ADDRESS_PREFIX with correct value', () => {
      expect(GROUP_ADDRESS_PREFIX).toBe('sc_g_');
    });

    it('exports MCP_PROTOCOL_VERSION with correct value', () => {
      expect(MCP_PROTOCOL_VERSION).toBe('2024-11-05');
    });

    it('exports DEFAULT_CONFIG_FILE with correct value', () => {
      expect(DEFAULT_CONFIG_FILE).toBe('sidechain.json');
    });

    it('exports DEFAULT_NODE_EXTENSION with correct value', () => {
      expect(DEFAULT_NODE_EXTENSION).toBe('.md');
    });
  });
});
