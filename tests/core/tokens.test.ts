/**
 * Tests for token generation and validation
 * Covers: AC-10, AC-21, AC-22, AC-23, AC-24, AC-25
 */

import { describe, expect, it } from 'vitest';

import {
  generateNodeToken,
  generateSalt,
  generateSectionToken,
  validateToken,
} from '../../src/core/tokens.js';

describe('Token Generation', () => {
  const salt = 'test-salt-abc123';

  describe('Node Tokens', () => {
    // AC-21: Token generation produces sc_t_node_* prefix for node tokens
    it('generates node token with sc_t_node_ prefix', () => {
      const content = { metadata: { status: 'draft' }, sections: [] };
      const token = generateNodeToken(content, salt);

      expect(token).toMatch(/^sc_t_node_[a-f0-9]{64}$/);
      expect(token.startsWith('sc_t_node_')).toBe(true);
    });

    // AC-21: Same content + same salt produces same token (deterministic)
    it('produces deterministic token for same content and salt', () => {
      const content = { metadata: { status: 'draft' }, sections: [] };
      const token1 = generateNodeToken(content, salt);
      const token2 = generateNodeToken(content, salt);

      expect(token1).toBe(token2);
    });

    // AC-21: Different content produces different token
    it('produces different token for different content', () => {
      const content1 = { metadata: { status: 'draft' }, sections: [] };
      const content2 = { metadata: { status: 'locked' }, sections: [] };
      const token1 = generateNodeToken(content1, salt);
      const token2 = generateNodeToken(content2, salt);

      expect(token1).not.toBe(token2);
    });

    it('produces different token with different salt', () => {
      const content = { metadata: { status: 'draft' }, sections: [] };
      const token1 = generateNodeToken(content, 'salt-1');
      const token2 = generateNodeToken(content, 'salt-2');

      expect(token1).not.toBe(token2);
    });

    it('generates token for complex nested content', () => {
      const content = {
        metadata: {
          status: 'draft',
          tags: ['feature', 'backend'],
          created: '2026-02-05',
        },
        sections: [
          { id: 'overview', type: 'prose', content: 'Feature description' },
          { id: 'requirements', type: 'task-list', items: ['AC-1', 'AC-2'] },
        ],
      };
      const token = generateNodeToken(content, salt);

      expect(token).toMatch(/^sc_t_node_[a-f0-9]{64}$/);
    });
  });

  describe('Section Tokens', () => {
    // AC-21: Token generation produces sc_t_sec_* prefix for section tokens
    it('generates section token with sc_t_sec_ prefix', () => {
      const content = { type: 'prose', content: 'Section text' };
      const token = generateSectionToken(content, salt);

      expect(token).toMatch(/^sc_t_sec_[a-f0-9]{64}$/);
      expect(token.startsWith('sc_t_sec_')).toBe(true);
    });

    // AC-21: Same content + same salt produces same token (deterministic)
    it('produces deterministic token for same content and salt', () => {
      const content = { type: 'prose', content: 'Section text' };
      const token1 = generateSectionToken(content, salt);
      const token2 = generateSectionToken(content, salt);

      expect(token1).toBe(token2);
    });

    // AC-21: Different content produces different token
    it('produces different token for different content', () => {
      const content1 = { type: 'prose', content: 'Section text v1' };
      const content2 = { type: 'prose', content: 'Section text v2' };
      const token1 = generateSectionToken(content1, salt);
      const token2 = generateSectionToken(content2, salt);

      expect(token1).not.toBe(token2);
    });

    it('produces different token with different salt', () => {
      const content = { type: 'prose', content: 'Section text' };
      const token1 = generateSectionToken(content, 'salt-1');
      const token2 = generateSectionToken(content, 'salt-2');

      expect(token1).not.toBe(token2);
    });
  });

  describe('Node vs Section Token Distinction', () => {
    // AC-25: Section tokens allow parallel updates to different sections without contention
    it('generates different prefixes for node vs section tokens', () => {
      const content = { data: 'same content' };
      const nodeToken = generateNodeToken(content, salt);
      const sectionToken = generateSectionToken(content, salt);

      expect(nodeToken).toMatch(/^sc_t_node_/);
      expect(sectionToken).toMatch(/^sc_t_sec_/);
      expect(nodeToken).not.toBe(sectionToken);
    });

    it('node and section tokens have same hash length', () => {
      const content = { data: 'test' };
      const nodeToken = generateNodeToken(content, salt);
      const sectionToken = generateSectionToken(content, salt);

      const nodeHash = nodeToken.replace('sc_t_node_', '');
      const sectionHash = sectionToken.replace('sc_t_sec_', '');

      expect(nodeHash.length).toBe(64); // SHA-256 hex
      expect(sectionHash.length).toBe(64);
    });
  });
});

describe('Token Validation', () => {
  const salt = 'test-salt-def456';

  describe('Permissive Mode', () => {
    // AC-23: Permissive mode allows tokenless writes
    it('accepts absent token in permissive mode', () => {
      const content = { metadata: { status: 'draft' } };
      const result = validateToken(undefined, content, salt, 'permissive');

      expect(result).toBe(true);
    });

    // AC-10: Token validation accepts matching token
    it('accepts matching node token in permissive mode', () => {
      const content = { metadata: { status: 'draft' }, sections: [] };
      const token = generateNodeToken(content, salt);
      const result = validateToken(token, content, salt, 'permissive');

      expect(result).toBe(true);
    });

    // AC-10: Token validation accepts matching token
    it('accepts matching section token in permissive mode', () => {
      const content = { type: 'prose', content: 'Text' };
      const token = generateSectionToken(content, salt);
      const result = validateToken(token, content, salt, 'permissive');

      expect(result).toBe(true);
    });

    // AC-22: Token validation rejects stale token
    it('rejects stale node token in permissive mode', () => {
      const oldContent = { metadata: { status: 'draft' }, sections: [] };
      const newContent = { metadata: { status: 'locked' }, sections: [] };
      const staleToken = generateNodeToken(oldContent, salt);
      const result = validateToken(staleToken, newContent, salt, 'permissive');

      expect(result).toBe(false);
    });

    // AC-22: Token validation rejects stale token
    it('rejects stale section token in permissive mode', () => {
      const oldContent = { type: 'prose', content: 'Old text' };
      const newContent = { type: 'prose', content: 'New text' };
      const staleToken = generateSectionToken(oldContent, salt);
      const result = validateToken(staleToken, newContent, salt, 'permissive');

      expect(result).toBe(false);
    });

    it('rejects token with wrong prefix', () => {
      const content = { data: 'test' };
      const invalidToken = 'sc_t_wrong_abc123';
      const result = validateToken(invalidToken, content, salt, 'permissive');

      expect(result).toBe(false);
    });

    it('rejects malformed token', () => {
      const content = { data: 'test' };
      const malformedToken = 'not-a-valid-token';
      const result = validateToken(malformedToken, content, salt, 'permissive');

      expect(result).toBe(false);
    });
  });

  describe('Strict Mode', () => {
    // AC-24: Strict mode rejects tokenless writes
    it('rejects absent token in strict mode', () => {
      const content = { metadata: { status: 'draft' } };
      const result = validateToken(undefined, content, salt, 'strict');

      expect(result).toBe(false);
    });

    // AC-10: Token validation accepts matching token
    it('accepts matching node token in strict mode', () => {
      const content = { metadata: { status: 'draft' }, sections: [] };
      const token = generateNodeToken(content, salt);
      const result = validateToken(token, content, salt, 'strict');

      expect(result).toBe(true);
    });

    // AC-10: Token validation accepts matching token
    it('accepts matching section token in strict mode', () => {
      const content = { type: 'prose', content: 'Text' };
      const token = generateSectionToken(content, salt);
      const result = validateToken(token, content, salt, 'strict');

      expect(result).toBe(true);
    });

    // AC-22: Token validation rejects stale token
    it('rejects stale node token in strict mode', () => {
      const oldContent = { metadata: { status: 'draft' }, sections: [] };
      const newContent = { metadata: { status: 'locked' }, sections: [] };
      const staleToken = generateNodeToken(oldContent, salt);
      const result = validateToken(staleToken, newContent, salt, 'strict');

      expect(result).toBe(false);
    });

    // AC-22: Token validation rejects stale token
    it('rejects stale section token in strict mode', () => {
      const oldContent = { type: 'prose', content: 'Old text' };
      const newContent = { type: 'prose', content: 'New text' };
      const staleToken = generateSectionToken(oldContent, salt);
      const result = validateToken(staleToken, newContent, salt, 'strict');

      expect(result).toBe(false);
    });

    it('rejects token with wrong prefix', () => {
      const content = { data: 'test' };
      const invalidToken = 'sc_t_wrong_abc123';
      const result = validateToken(invalidToken, content, salt, 'strict');

      expect(result).toBe(false);
    });

    it('rejects malformed token', () => {
      const content = { data: 'test' };
      const malformedToken = 'not-a-valid-token';
      const result = validateToken(malformedToken, content, salt, 'strict');

      expect(result).toBe(false);
    });
  });

  describe('Token Scope Validation', () => {
    // AC-25: Separate section tokens allow parallel writes
    it('validates node token against node content', () => {
      const nodeContent = {
        metadata: { status: 'draft' },
        sections: [
          { id: 'phase-1', type: 'task-list' },
          { id: 'phase-2', type: 'task-list' },
        ],
      };
      const token = generateNodeToken(nodeContent, salt);
      const result = validateToken(token, nodeContent, salt, 'permissive');

      expect(result).toBe(true);
    });

    it('validates section token against section content', () => {
      const sectionContent = { id: 'phase-1', type: 'task-list', items: [] };
      const token = generateSectionToken(sectionContent, salt);
      const result = validateToken(token, sectionContent, salt, 'permissive');

      expect(result).toBe(true);
    });

    // AC-25: Section tokens allow parallel updates to different sections without contention
    it('section token does not match node content', () => {
      const nodeContent = { metadata: { status: 'draft' }, sections: [] };
      const sectionContent = { type: 'prose', content: 'Text' };

      const sectionToken = generateSectionToken(sectionContent, salt);
      const result = validateToken(
        sectionToken,
        nodeContent,
        salt,
        'permissive'
      );

      expect(result).toBe(false);
    });

    // AC-25: Section tokens allow parallel updates to different sections without contention
    it('node token does not match section content', () => {
      const nodeContent = { metadata: { status: 'draft' }, sections: [] };
      const sectionContent = { type: 'prose', content: 'Text' };

      const nodeToken = generateNodeToken(nodeContent, salt);
      const result = validateToken(
        nodeToken,
        sectionContent,
        salt,
        'permissive'
      );

      expect(result).toBe(false);
    });
  });
});

describe('Salt Generation', () => {
  it('generates random salt', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();

    expect(salt1).toBeDefined();
    expect(salt2).toBeDefined();
    expect(salt1).not.toBe(salt2);
  });

  it('generates salt with hex characters', () => {
    const salt = generateSalt();

    expect(salt).toMatch(/^[a-f0-9]+$/);
  });

  it('generates salt with sufficient entropy', () => {
    const salt = generateSalt();

    // 32 bytes = 64 hex characters
    expect(salt.length).toBe(64);
  });

  it('produces unpredictable tokens with different salts', () => {
    const content = { data: 'test' };
    const salt1 = generateSalt();
    const salt2 = generateSalt();

    const token1 = generateNodeToken(content, salt1);
    const token2 = generateNodeToken(content, salt2);

    expect(token1).not.toBe(token2);
  });
});

describe('Parallel Section Updates', () => {
  // AC-25: Section tokens allow parallel updates to different sections without contention
  it('different section tokens for different sections allow parallel updates', () => {
    const salt = 'parallel-test-salt';

    // Simulate two agents working on different sections
    const section1Content = {
      id: 'phase-1',
      type: 'task-list',
      items: ['Task 1.1', 'Task 1.2'],
    };
    const section2Content = {
      id: 'phase-2',
      type: 'task-list',
      items: ['Task 2.1', 'Task 2.2'],
    };

    // Each section gets its own token
    const token1 = generateSectionToken(section1Content, salt);
    const token2 = generateSectionToken(section2Content, salt);

    // Tokens are different
    expect(token1).not.toBe(token2);

    // Agent 1 updates section 1
    const section1Updated = {
      ...section1Content,
      items: ['Task 1.1', 'Task 1.2', 'Task 1.3'],
    };

    // Agent 2 updates section 2 (no contention)
    const section2Updated = {
      ...section2Content,
      items: ['Task 2.1', 'Task 2.2', 'Task 2.3'],
    };

    // Agent 1's token is valid for section 1 (before update)
    expect(validateToken(token1, section1Content, salt, 'strict')).toBe(true);

    // Agent 2's token is valid for section 2 (before update)
    expect(validateToken(token2, section2Content, salt, 'strict')).toBe(true);

    // After updates, tokens are stale for their respective sections
    expect(validateToken(token1, section1Updated, salt, 'strict')).toBe(false);
    expect(validateToken(token2, section2Updated, salt, 'strict')).toBe(false);

    // But Agent 2's token is still independent from Agent 1's content
    expect(token1).not.toBe(token2);
  });

  it('node token would cause false contention for parallel section updates', () => {
    const salt = 'contention-test-salt';

    // Full node content
    const nodeContent = {
      metadata: { status: 'draft' },
      sections: [
        { id: 'phase-1', type: 'task-list', items: ['Task 1.1'] },
        { id: 'phase-2', type: 'task-list', items: ['Task 2.1'] },
      ],
    };

    const nodeToken = generateNodeToken(nodeContent, salt);

    // Agent 1 updates phase-1
    const updatedNode1 = {
      ...nodeContent,
      sections: [
        { id: 'phase-1', type: 'task-list', items: ['Task 1.1', 'Task 1.2'] },
        { id: 'phase-2', type: 'task-list', items: ['Task 2.1'] },
      ],
    };

    // Node token is now stale even though Agent 2 only wants to update phase-2
    expect(validateToken(nodeToken, updatedNode1, salt, 'strict')).toBe(false);

    // This demonstrates why section tokens are needed for parallel updates
  });
});

describe('Edge Cases', () => {
  const salt = 'edge-case-salt';

  it('handles empty object content', () => {
    const content = {};
    const token = generateNodeToken(content, salt);

    expect(token).toMatch(/^sc_t_node_[a-f0-9]{64}$/);
    expect(validateToken(token, content, salt, 'permissive')).toBe(true);
  });

  it('handles null values in content', () => {
    const content = { value: null };
    const token = generateNodeToken(content, salt);

    expect(token).toMatch(/^sc_t_node_[a-f0-9]{64}$/);
    expect(validateToken(token, content, salt, 'permissive')).toBe(true);
  });

  it('handles array content', () => {
    const content = [1, 2, 3];
    const token = generateSectionToken(content, salt);

    expect(token).toMatch(/^sc_t_sec_[a-f0-9]{64}$/);
    expect(validateToken(token, content, salt, 'permissive')).toBe(true);
  });

  it('handles string content', () => {
    const content = 'plain string';
    const token = generateSectionToken(content, salt);

    expect(token).toMatch(/^sc_t_sec_[a-f0-9]{64}$/);
    expect(validateToken(token, content, salt, 'permissive')).toBe(true);
  });

  it('handles number content', () => {
    const content = 42;
    const token = generateNodeToken(content, salt);

    expect(token).toMatch(/^sc_t_node_[a-f0-9]{64}$/);
    expect(validateToken(token, content, salt, 'permissive')).toBe(true);
  });

  it('detects content change in nested structure', () => {
    const content1 = {
      metadata: { status: 'draft', details: { author: 'Alice' } },
    };
    const content2 = {
      metadata: { status: 'draft', details: { author: 'Bob' } },
    };
    const token1 = generateNodeToken(content1, salt);

    expect(validateToken(token1, content2, salt, 'permissive')).toBe(false);
  });

  it('tokens are sensitive to property order', () => {
    // JSON.stringify is order-dependent, so property order affects tokens
    // This is acceptable behavior - callers should maintain consistent ordering
    const content1 = { a: 1, b: 2 };
    const content2 = { b: 2, a: 1 };
    const token1 = generateNodeToken(content1, salt);
    const token2 = generateNodeToken(content2, salt);

    // Different property order produces different token
    // This is expected behavior with JSON.stringify
    expect(token1).not.toBe(token2);
  });

  it('handles empty salt', () => {
    const content = { data: 'test' };
    const token1 = generateNodeToken(content, '');
    const token2 = generateNodeToken(content, 'non-empty-salt');

    expect(token1).not.toBe(token2);
    expect(validateToken(token1, content, '', 'permissive')).toBe(true);
  });

  it('validates with exact salt match required', () => {
    const content = { data: 'test' };
    const token = generateNodeToken(content, 'salt-1');

    expect(validateToken(token, content, 'salt-1', 'permissive')).toBe(true);
    expect(validateToken(token, content, 'salt-2', 'permissive')).toBe(false);
  });
});
