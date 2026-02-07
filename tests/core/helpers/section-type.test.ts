/**
 * Tests for section type resolution helper
 * Covers: AC-2, AC-34
 */

import { describe, expect, it } from 'vitest';

import type { NodeSchema } from '../../../src/types/schema.js';
import { resolveSectionType } from '../../../src/core/helpers/section-type.js';

describe('resolveSectionType', () => {
  describe('AC-34: Returns text when nodeSchema.sections is undefined', () => {
    it('returns text for schema without sections property', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        metadata: {
          fields: {
            status: { type: 'string' },
          },
        },
      };

      const result = resolveSectionType(schema, 'any-section');

      expect(result).toBe('text');
    });

    it('returns text for minimal schema', () => {
      const schema: NodeSchema = {
        'schema-id': 'minimal',
      };

      const result = resolveSectionType(schema, 'overview');

      expect(result).toBe('text');
    });
  });

  describe('Required sections', () => {
    it('returns correct type for required section', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          required: [
            { id: 'overview', type: 'text' },
            { id: 'tasks', type: 'task-list' },
            { id: 'references', type: 'reference-list' },
          ],
        },
      };

      expect(resolveSectionType(schema, 'overview')).toBe('text');
      expect(resolveSectionType(schema, 'tasks')).toBe('task-list');
      expect(resolveSectionType(schema, 'references')).toBe('reference-list');
    });

    it('returns text for non-existent section when only required sections defined', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          required: [{ id: 'overview', type: 'text' }],
        },
      };

      const result = resolveSectionType(schema, 'missing-section');

      expect(result).toBe('text');
    });
  });

  describe('Optional sections', () => {
    it('returns correct type for optional section', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          optional: [
            { id: 'notes', type: 'text' },
            { id: 'checklist', type: 'checklist' },
          ],
        },
      };

      expect(resolveSectionType(schema, 'notes')).toBe('text');
      expect(resolveSectionType(schema, 'checklist')).toBe('checklist');
    });

    it('prioritizes required over optional when searching', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          required: [{ id: 'overview', type: 'text' }],
          optional: [{ id: 'details', type: 'task-list' }],
        },
      };

      expect(resolveSectionType(schema, 'overview')).toBe('text');
      expect(resolveSectionType(schema, 'details')).toBe('task-list');
    });
  });

  describe('Dynamic pattern sections', () => {
    it('returns correct type for section matching dynamic pattern', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          dynamic: [
            { 'id-pattern': 'phase-{n}', type: 'task-list' },
            { 'id-pattern': 'section-{name}', type: 'text' },
          ],
        },
      };

      expect(resolveSectionType(schema, 'phase-1')).toBe('task-list');
      expect(resolveSectionType(schema, 'phase-42')).toBe('task-list');
      expect(resolveSectionType(schema, 'section-overview')).toBe('text');
      expect(resolveSectionType(schema, 'section-details')).toBe('text');
    });

    it('returns text for section not matching any dynamic pattern', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          dynamic: [{ 'id-pattern': 'phase-{n}', type: 'task-list' }],
        },
      };

      const result = resolveSectionType(schema, 'overview');

      expect(result).toBe('text');
    });

    it('matches first dynamic pattern when multiple patterns match', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          dynamic: [
            { 'id-pattern': 'phase-{n}', type: 'task-list' },
            { 'id-pattern': 'phase-{name}', type: 'checklist' },
          ],
        },
      };

      // phase-1 matches both patterns, should return first match
      const result = resolveSectionType(schema, 'phase-1');

      expect(result).toBe('task-list');
    });
  });

  describe('Resolution order', () => {
    it('checks required sections before optional', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          required: [{ id: 'overview', type: 'task-list' }],
          optional: [{ id: 'overview', type: 'text' }],
        },
      };

      // Should match required first (even though having duplicates is unusual)
      const result = resolveSectionType(schema, 'overview');

      expect(result).toBe('task-list');
    });

    it('checks optional sections before dynamic patterns', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          optional: [{ id: 'phase-1', type: 'text' }],
          dynamic: [{ 'id-pattern': 'phase-{n}', type: 'task-list' }],
        },
      };

      // Should match optional exact match before dynamic pattern
      const result = resolveSectionType(schema, 'phase-1');

      expect(result).toBe('text');
    });

    it('follows full resolution order: required → optional → dynamic → text', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          required: [{ id: 'req-section', type: 'checklist' }],
          optional: [{ id: 'opt-section', type: 'table' }],
          dynamic: [{ 'id-pattern': 'phase-{n}', type: 'task-list' }],
        },
      };

      expect(resolveSectionType(schema, 'req-section')).toBe('checklist');
      expect(resolveSectionType(schema, 'opt-section')).toBe('table');
      expect(resolveSectionType(schema, 'phase-1')).toBe('task-list');
      expect(resolveSectionType(schema, 'unknown')).toBe('text');
    });
  });

  describe('Content type variations', () => {
    it('handles all content type IDs', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          required: [
            { id: 'text-sec', type: 'text' },
            { id: 'task-sec', type: 'task-list' },
            { id: 'collection-sec', type: 'collection' },
            { id: 'checklist-sec', type: 'checklist' },
            { id: 'table-sec', type: 'table' },
            { id: 'kv-sec', type: 'key-value' },
            { id: 'ref-sec', type: 'reference-list' },
          ],
        },
      };

      expect(resolveSectionType(schema, 'text-sec')).toBe('text');
      expect(resolveSectionType(schema, 'task-sec')).toBe('task-list');
      expect(resolveSectionType(schema, 'collection-sec')).toBe('collection');
      expect(resolveSectionType(schema, 'checklist-sec')).toBe('checklist');
      expect(resolveSectionType(schema, 'table-sec')).toBe('table');
      expect(resolveSectionType(schema, 'kv-sec')).toBe('key-value');
      expect(resolveSectionType(schema, 'ref-sec')).toBe('reference-list');
    });
  });

  describe('Edge cases', () => {
    it('handles empty required sections array', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          required: [],
        },
      };

      const result = resolveSectionType(schema, 'any-section');

      expect(result).toBe('text');
    });

    it('handles empty optional sections array', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          optional: [],
        },
      };

      const result = resolveSectionType(schema, 'any-section');

      expect(result).toBe('text');
    });

    it('handles empty dynamic sections array', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          dynamic: [],
        },
      };

      const result = resolveSectionType(schema, 'any-section');

      expect(result).toBe('text');
    });

    it('handles section ID with special characters', () => {
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        sections: {
          required: [{ id: 'section-with-dashes', type: 'task-list' }],
        },
      };

      const result = resolveSectionType(schema, 'section-with-dashes');

      expect(result).toBe('task-list');
    });
  });
});
