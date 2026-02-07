/**
 * Tests for token validation helper
 * Covers: EC-4, EC-5, EC-6, AC-27, AC-28, AC-35
 */

import { describe, expect, it } from 'vitest';

import type { RawNode } from '../../../src/types/backend.js';
import { StaleTokenError } from '../../../src/core/errors.js';
import { validateWriteToken } from '../../../src/core/helpers/validate-token.js';
import {
  generateNodeToken,
  generateSectionToken,
} from '../../../src/core/tokens.js';

describe('validateWriteToken', () => {
  const TEST_SALT = 'test-salt-abc123';

  describe('EC-6, AC-28: Undefined token is no-op', () => {
    it('does not throw when opts is undefined', () => {
      const rawNode: RawNode = {
        metadata: { status: 'draft' },
        sections: { overview: 'content' },
      };

      expect(() => {
        validateWriteToken(rawNode, undefined, 'group/slot', TEST_SALT);
      }).not.toThrow();
    });

    it('does not throw when opts.token is undefined', () => {
      const rawNode: RawNode = {
        metadata: {},
        sections: {},
      };

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: undefined },
          'group/slot',
          TEST_SALT
        );
      }).not.toThrow();
    });

    it('does not throw when token is undefined with sectionId provided', () => {
      const rawNode: RawNode = {
        metadata: {},
        sections: { overview: 'content' },
      };

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: undefined },
          'group/slot',
          TEST_SALT,
          'overview'
        );
      }).not.toThrow();
    });
  });

  describe('AC-35: Empty string token triggers validation', () => {
    it('throws StaleTokenError for empty string token (unrecognized prefix)', () => {
      const rawNode: RawNode = {
        metadata: {},
        sections: { overview: 'content' },
      };

      // Empty string doesn't match sc_t_sec_ or sc_t_node_ prefix
      // Validated against node token and fails
      expect(() => {
        validateWriteToken(
          rawNode,
          { token: '' },
          'group/slot',
          TEST_SALT,
          'overview'
        );
      }).toThrow(StaleTokenError);
    });

    it('throws StaleTokenError for empty token without sectionId', () => {
      const rawNode: RawNode = {
        metadata: {},
        sections: {},
      };

      // AC-35: Empty string (not undefined) enters validation code path
      // Validated against node token and fails
      expect(() => {
        validateWriteToken(rawNode, { token: '' }, 'group/slot', TEST_SALT);
      }).toThrow(StaleTokenError);
    });
  });

  describe('EC-4, AC-27: Stale section token throws with correct current and token', () => {
    it('throws StaleTokenError when section content changed', () => {
      const rawNode: RawNode = {
        metadata: { status: 'draft' },
        sections: { overview: 'new content' },
      };
      const oldSectionToken = generateSectionToken('old content', TEST_SALT);

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: oldSectionToken },
          'group/slot',
          TEST_SALT,
          'overview'
        );
      }).toThrow(StaleTokenError);

      try {
        validateWriteToken(
          rawNode,
          { token: oldSectionToken },
          'group/slot',
          TEST_SALT,
          'overview'
        );
      } catch (error) {
        expect(error).toBeInstanceOf(StaleTokenError);
        if (error instanceof StaleTokenError) {
          expect(error.code).toBe('STALE_TOKEN');
          expect(error.path).toBe('group/slot/overview');
          expect(error.message).toBe(
            'Section content has changed since token was issued'
          );

          // Verify current state structure
          expect(error.current).toEqual({
            metadata: { status: 'draft' },
            sections: [{ id: 'overview', content: 'new content' }],
          });

          // Verify new token is provided
          expect(error.token).toBeDefined();
          expect(typeof error.token).toBe('string');
          expect(error.token.startsWith('sc_t_sec_')).toBe(true);

          // Verify new token is for current content
          const expectedToken = generateSectionToken('new content', TEST_SALT);
          expect(error.token).toBe(expectedToken);
        }
      }
    });

    it('does not throw when section token matches current content', () => {
      const rawNode: RawNode = {
        metadata: {},
        sections: { overview: 'content' },
      };
      const validToken = generateSectionToken('content', TEST_SALT);

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: validToken },
          'group/slot',
          TEST_SALT,
          'overview'
        );
      }).not.toThrow();
    });

    it('includes all sections in current state', () => {
      const rawNode: RawNode = {
        metadata: { status: 'locked' },
        sections: {
          overview: 'overview content',
          details: 'details content',
          tasks: 'tasks content',
        },
      };
      const oldToken = generateSectionToken('old overview', TEST_SALT);

      try {
        validateWriteToken(
          rawNode,
          { token: oldToken },
          'group/slot',
          TEST_SALT,
          'overview'
        );
      } catch (error) {
        if (error instanceof StaleTokenError) {
          expect(error.current).toEqual({
            metadata: { status: 'locked' },
            sections: [
              { id: 'overview', content: 'overview content' },
              { id: 'details', content: 'details content' },
              { id: 'tasks', content: 'tasks content' },
            ],
          });
        }
      }
    });
  });

  describe('EC-5: Stale node token throws StaleTokenError', () => {
    it('throws StaleTokenError when node content changed', () => {
      const rawNode: RawNode = {
        metadata: { status: 'locked' },
        sections: { overview: 'new content' },
      };
      const oldNodeContent = {
        metadata: { status: 'draft' },
        sections: { overview: 'old content' },
      };
      const oldNodeToken = generateNodeToken(oldNodeContent, TEST_SALT);

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: oldNodeToken },
          'group/slot',
          TEST_SALT
        );
      }).toThrow(StaleTokenError);

      try {
        validateWriteToken(
          rawNode,
          { token: oldNodeToken },
          'group/slot',
          TEST_SALT
        );
      } catch (error) {
        expect(error).toBeInstanceOf(StaleTokenError);
        if (error instanceof StaleTokenError) {
          expect(error.code).toBe('STALE_TOKEN');
          expect(error.path).toBe('group/slot');
          expect(error.message).toBe(
            'Content has changed since token was issued'
          );

          // Verify current state
          expect(error.current).toEqual({
            metadata: { status: 'locked' },
            sections: [{ id: 'overview', content: 'new content' }],
          });

          // Verify new token
          expect(error.token).toBeDefined();
          expect(error.token.startsWith('sc_t_node_')).toBe(true);

          // Verify new token is for current content
          const expectedToken = generateNodeToken(
            { metadata: rawNode.metadata, sections: rawNode.sections },
            TEST_SALT
          );
          expect(error.token).toBe(expectedToken);
        }
      }
    });

    it('does not throw when node token matches current content', () => {
      const rawNode: RawNode = {
        metadata: { status: 'draft' },
        sections: { overview: 'content' },
      };
      const validToken = generateNodeToken(
        { metadata: rawNode.metadata, sections: rawNode.sections },
        TEST_SALT
      );

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: validToken },
          'group/slot',
          TEST_SALT
        );
      }).not.toThrow();
    });

    it('throws when metadata changes', () => {
      const rawNode: RawNode = {
        metadata: { status: 'locked' },
        sections: { overview: 'content' },
      };
      const oldNodeContent = {
        metadata: { status: 'draft' },
        sections: { overview: 'content' },
      };
      const oldToken = generateNodeToken(oldNodeContent, TEST_SALT);

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: oldToken },
          'group/slot',
          TEST_SALT
        );
      }).toThrow(StaleTokenError);
    });

    it('throws when sections change', () => {
      const rawNode: RawNode = {
        metadata: { status: 'draft' },
        sections: { overview: 'new content', details: 'more content' },
      };
      const oldNodeContent = {
        metadata: { status: 'draft' },
        sections: { overview: 'old content' },
      };
      const oldToken = generateNodeToken(oldNodeContent, TEST_SALT);

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: oldToken },
          'group/slot',
          TEST_SALT
        );
      }).toThrow(StaleTokenError);
    });
  });

  describe('Token type handling', () => {
    it('validates section token when provided for section update', () => {
      const rawNode: RawNode = {
        metadata: {},
        sections: { overview: 'content', details: 'other content' },
      };
      const sectionToken = generateSectionToken('content', TEST_SALT);

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: sectionToken },
          'group/slot',
          TEST_SALT,
          'overview'
        );
      }).not.toThrow();
    });

    it('validates node token when provided without sectionId', () => {
      const rawNode: RawNode = {
        metadata: { status: 'draft' },
        sections: { overview: 'content' },
      };
      const nodeToken = generateNodeToken(
        { metadata: rawNode.metadata, sections: rawNode.sections },
        TEST_SALT
      );

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: nodeToken },
          'group/slot',
          TEST_SALT
        );
      }).not.toThrow();
    });

    it('ignores section token when sectionId is undefined', () => {
      const rawNode: RawNode = {
        metadata: {},
        sections: { overview: 'content' },
      };
      const sectionToken = generateSectionToken('content', TEST_SALT);

      // Section token without sectionId - defensive handling, no-op
      expect(() => {
        validateWriteToken(
          rawNode,
          { token: sectionToken },
          'group/slot',
          TEST_SALT
        );
      }).not.toThrow();
    });

    it('validates unrecognized token prefix against node token', () => {
      const rawNode: RawNode = {
        metadata: { status: 'draft' },
        sections: { overview: 'content' },
      };

      // Token with unrecognized prefix - validated against node token
      expect(() => {
        validateWriteToken(
          rawNode,
          { token: 'invalid_prefix_abc123' },
          'group/slot',
          TEST_SALT
        );
      }).toThrow(StaleTokenError);

      try {
        validateWriteToken(
          rawNode,
          { token: 'invalid_prefix_abc123' },
          'group/slot',
          TEST_SALT
        );
      } catch (error) {
        expect(error).toBeInstanceOf(StaleTokenError);
        if (error instanceof StaleTokenError) {
          expect(error.code).toBe('STALE_TOKEN');
          expect(error.path).toBe('group/slot');
          expect(error.message).toBe(
            'Content has changed since token was issued'
          );

          // Verify current state
          expect(error.current).toEqual({
            metadata: { status: 'draft' },
            sections: [{ id: 'overview', content: 'content' }],
          });

          // Verify new token is a valid node token
          expect(error.token).toBeDefined();
          expect(error.token.startsWith('sc_t_node_')).toBe(true);

          const expectedToken = generateNodeToken(
            { metadata: rawNode.metadata, sections: rawNode.sections },
            TEST_SALT
          );
          expect(error.token).toBe(expectedToken);
        }
      }
    });
  });

  describe('Different salt values', () => {
    it('throws when token generated with different salt', () => {
      const rawNode: RawNode = {
        metadata: {},
        sections: { overview: 'content' },
      };
      const tokenWithDifferentSalt = generateSectionToken(
        'content',
        'different-salt'
      );

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: tokenWithDifferentSalt },
          'group/slot',
          TEST_SALT,
          'overview'
        );
      }).toThrow(StaleTokenError);
    });

    it('validates when salt matches', () => {
      const rawNode: RawNode = {
        metadata: {},
        sections: { overview: 'content' },
      };
      const salt = 'custom-salt-xyz';
      const validToken = generateSectionToken('content', salt);

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: validToken },
          'group/slot',
          salt,
          'overview'
        );
      }).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('handles empty metadata', () => {
      const rawNode: RawNode = {
        metadata: {},
        sections: {},
      };
      const validToken = generateNodeToken(
        { metadata: {}, sections: {} },
        TEST_SALT
      );

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: validToken },
          'group/slot',
          TEST_SALT
        );
      }).not.toThrow();
    });

    it('handles empty sections', () => {
      const rawNode: RawNode = {
        metadata: { status: 'draft' },
        sections: {},
      };
      const validToken = generateNodeToken(
        { metadata: { status: 'draft' }, sections: {} },
        TEST_SALT
      );

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: validToken },
          'group/slot',
          TEST_SALT
        );
      }).not.toThrow();
    });

    it('handles complex metadata structure', () => {
      const rawNode: RawNode = {
        metadata: {
          status: 'locked',
          priority: 1,
          tags: ['urgent', 'important'],
          nested: { field: 'value' },
        },
        sections: {},
      };
      const validToken = generateNodeToken(
        { metadata: rawNode.metadata, sections: {} },
        TEST_SALT
      );

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: validToken },
          'group/slot',
          TEST_SALT
        );
      }).not.toThrow();
    });

    it('handles long section content', () => {
      const longContent = 'x'.repeat(10000);
      const rawNode: RawNode = {
        metadata: {},
        sections: { overview: longContent },
      };
      const validToken = generateSectionToken(longContent, TEST_SALT);

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: validToken },
          'group/slot',
          TEST_SALT,
          'overview'
        );
      }).not.toThrow();
    });

    it('handles section with special characters', () => {
      const rawNode: RawNode = {
        metadata: {},
        sections: { 'section-with-dashes': 'content' },
      };
      const validToken = generateSectionToken('content', TEST_SALT);

      expect(() => {
        validateWriteToken(
          rawNode,
          { token: validToken },
          'group/slot',
          TEST_SALT,
          'section-with-dashes'
        );
      }).not.toThrow();
    });
  });
});
