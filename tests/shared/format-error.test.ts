/**
 * Tests for error formatter module
 * Covers: EC-16, EC-17, EC-18, EC-19, EC-20, EC-21, EC-22, EC-23, EC-24, EC-25, EC-26, AC-29, AC-36
 */

import { describe, expect, it } from 'vitest';

import {
  InvalidSchemaError,
  MappingError,
  NameNotFoundError,
  NotFoundError,
  PatternMismatchError,
  SchemaNotFoundError,
  SectionNotFoundError,
  StaleTokenError,
  ValidationError,
} from '../../src/core/errors.js';
import { formatError } from '../../src/shared/format-error.js';

describe('formatError', () => {
  describe('ValidationError formatting', () => {
    // EC-16: ValidationError -> VALIDATION_ERROR, include path, optionally schema
    it('formats ValidationError with schema field', () => {
      const error = new ValidationError(
        'user-auth/requirements/@meta/status',
        'Invalid enum value',
        'initiative-schema'
      );

      const result = formatError(error);

      expect(result).toEqual({
        ok: false,
        error: 'VALIDATION_ERROR',
        path: 'user-auth/requirements/@meta/status',
        message: 'Invalid enum value',
        schema: 'initiative-schema',
      });
    });

    it('formats ValidationError without schema field', () => {
      const error = new ValidationError(
        'group/slot/@meta/field',
        'Type mismatch'
      );

      const result = formatError(error);

      expect(result).toEqual({
        ok: false,
        error: 'VALIDATION_ERROR',
        path: 'group/slot/@meta/field',
        message: 'Type mismatch',
      });
      expect(result.schema).toBeUndefined();
    });
  });

  describe('NotFoundError formatting', () => {
    // EC-17: NotFoundError -> NOT_FOUND, include path
    it('formats NotFoundError with path field', () => {
      const error = new NotFoundError(
        'user-auth/requirements',
        'Slot not found'
      );

      const result = formatError(error);

      expect(result).toEqual({
        ok: false,
        error: 'NOT_FOUND',
        path: 'user-auth/requirements',
        message: 'Slot not found',
      });
    });
  });

  describe('SectionNotFoundError formatting', () => {
    // EC-18: SectionNotFoundError -> SECTION_NOT_FOUND, include path
    it('formats SectionNotFoundError with path field', () => {
      const error = new SectionNotFoundError(
        'user-auth/plan/phase-1',
        'Section not found'
      );

      const result = formatError(error);

      expect(result).toEqual({
        ok: false,
        error: 'SECTION_NOT_FOUND',
        path: 'user-auth/plan/phase-1',
        message: 'Section not found',
      });
    });
  });

  describe('StaleTokenError formatting', () => {
    // EC-19: StaleTokenError -> STALE_TOKEN, include path, current, token
    it('formats StaleTokenError with current and token fields', () => {
      const current = {
        metadata: { status: 'draft' },
        sections: [],
      };
      const error = new StaleTokenError(
        'user-auth/plan',
        'Token mismatch',
        current,
        'new_token_abc123'
      );

      const result = formatError(error);

      expect(result).toEqual({
        ok: false,
        error: 'STALE_TOKEN',
        path: 'user-auth/plan',
        message: 'Token mismatch',
        current: {
          metadata: { status: 'draft' },
          sections: [],
        },
        token: 'new_token_abc123',
      });
    });
  });

  describe('PatternMismatchError formatting', () => {
    // EC-20: PatternMismatchError -> PATTERN_MISMATCH, include path, pattern
    it('formats PatternMismatchError with pattern field', () => {
      const error = new PatternMismatchError(
        'user-auth/plan/invalid-section',
        'phase-{n}',
        'Section does not match pattern'
      );

      const result = formatError(error);

      expect(result).toEqual({
        ok: false,
        error: 'PATTERN_MISMATCH',
        path: 'user-auth/plan/invalid-section',
        message: 'Section does not match pattern',
        pattern: 'phase-{n}',
      });
    });
  });

  describe('SchemaNotFoundError formatting', () => {
    // EC-21: SchemaNotFoundError -> SCHEMA_NOT_FOUND, include schema
    it('formats SchemaNotFoundError with schema field', () => {
      const error = new SchemaNotFoundError(
        'missing-schema',
        'Schema not registered'
      );

      const result = formatError(error);

      expect(result).toEqual({
        ok: false,
        error: 'SCHEMA_NOT_FOUND',
        schema: 'missing-schema',
        message: 'Schema not registered',
      });
    });
  });

  describe('InvalidSchemaError formatting', () => {
    // EC-22: InvalidSchemaError -> INVALID_SCHEMA, optionally details
    it('formats InvalidSchemaError with details field', () => {
      const details = { field: 'metadata.status', reason: 'invalid type' };
      const error = new InvalidSchemaError('Schema validation failed', details);

      const result = formatError(error);

      expect(result).toEqual({
        ok: false,
        error: 'INVALID_SCHEMA',
        message: 'Schema validation failed',
        details: { field: 'metadata.status', reason: 'invalid type' },
      });
    });

    it('formats InvalidSchemaError without details field', () => {
      const error = new InvalidSchemaError('Schema validation failed');

      const result = formatError(error);

      expect(result).toEqual({
        ok: false,
        error: 'INVALID_SCHEMA',
        message: 'Schema validation failed',
      });
      expect(result.details).toBeUndefined();
    });
  });

  describe('NameNotFoundError formatting', () => {
    // EC-23: NameNotFoundError -> NAME_NOT_FOUND
    it('formats NameNotFoundError', () => {
      const error = new NameNotFoundError('Name not found in mapping');

      const result = formatError(error);

      expect(result).toEqual({
        ok: false,
        error: 'NAME_NOT_FOUND',
        message: 'Name not found in mapping',
      });
    });
  });

  describe('MappingError formatting', () => {
    // EC-24: MappingError -> MAPPING_ERROR
    it('formats MappingError', () => {
      const error = new MappingError('Duplicate mapping detected');

      const result = formatError(error);

      expect(result).toEqual({
        ok: false,
        error: 'MAPPING_ERROR',
        message: 'Duplicate mapping detected',
      });
    });
  });

  describe('Generic Error formatting', () => {
    // EC-25: Generic Error -> INTERNAL_ERROR
    it('formats generic Error as INTERNAL_ERROR', () => {
      const error = new Error('Unexpected failure');

      const result = formatError(error);

      expect(result).toEqual({
        ok: false,
        error: 'INTERNAL_ERROR',
        message: 'Unexpected failure',
      });
    });

    it('formats TypeError as INTERNAL_ERROR', () => {
      const error = new TypeError('Type mismatch');

      const result = formatError(error);

      expect(result).toEqual({
        ok: false,
        error: 'INTERNAL_ERROR',
        message: 'Type mismatch',
      });
    });

    it('formats RangeError as INTERNAL_ERROR', () => {
      const error = new RangeError('Value out of range');

      const result = formatError(error);

      expect(result).toEqual({
        ok: false,
        error: 'INTERNAL_ERROR',
        message: 'Value out of range',
      });
    });
  });

  describe('Non-Error value formatting', () => {
    // EC-26: Non-Error value -> INTERNAL_ERROR, message='An unknown error occurred'
    it('formats null as INTERNAL_ERROR with standard message', () => {
      const result = formatError(null);

      expect(result).toEqual({
        ok: false,
        error: 'INTERNAL_ERROR',
        message: 'An unknown error occurred',
      });
    });

    it('formats undefined as INTERNAL_ERROR with standard message', () => {
      const result = formatError(undefined);

      expect(result).toEqual({
        ok: false,
        error: 'INTERNAL_ERROR',
        message: 'An unknown error occurred',
      });
    });

    it('formats string as INTERNAL_ERROR with standard message', () => {
      const result = formatError('error string');

      expect(result).toEqual({
        ok: false,
        error: 'INTERNAL_ERROR',
        message: 'An unknown error occurred',
      });
    });

    it('formats number as INTERNAL_ERROR with standard message', () => {
      const result = formatError(42);

      expect(result).toEqual({
        ok: false,
        error: 'INTERNAL_ERROR',
        message: 'An unknown error occurred',
      });
    });

    it('formats object as INTERNAL_ERROR with standard message', () => {
      const result = formatError({ code: 'TEST', msg: 'test' });

      expect(result).toEqual({
        ok: false,
        error: 'INTERNAL_ERROR',
        message: 'An unknown error occurred',
      });
    });
  });

  describe('ErrorResult shape validation', () => {
    it('always includes ok: false', () => {
      const error = new NotFoundError('path', 'message');
      const result = formatError(error);

      expect(result.ok).toBe(false);
    });

    it('always includes error code string', () => {
      const error = new ValidationError('path', 'message');
      const result = formatError(error);

      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    });

    it('always includes message string', () => {
      const error = new MappingError('message');
      const result = formatError(error);

      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    });
  });

  describe('Boundary cases', () => {
    // AC-29, AC-36: Error formatter boundary tests
    it('handles empty message string', () => {
      const error = new ValidationError('group/slot', '');

      const result = formatError(error);

      expect(result.message).toBe('');
      expect(result.error).toBe('VALIDATION_ERROR');
    });

    it('handles empty path string', () => {
      const error = new NotFoundError('', 'Not found');

      const result = formatError(error);

      expect(result.path).toBe('');
      expect(result.error).toBe('NOT_FOUND');
    });

    it('handles empty pattern string', () => {
      const error = new PatternMismatchError('group/slot', '', 'No match');

      const result = formatError(error);

      expect(result.pattern).toBe('');
      expect(result.error).toBe('PATTERN_MISMATCH');
    });

    it('handles null current state in StaleTokenError', () => {
      const error = new StaleTokenError(
        'group/slot',
        'Token stale',
        null,
        'sc_t_node_abc'
      );

      const result = formatError(error);

      expect(result.current).toBeNull();
      expect(result.token).toBe('sc_t_node_abc');
    });

    it('handles undefined details in InvalidSchemaError explicitly', () => {
      const error = new InvalidSchemaError('Schema error', undefined);

      const result = formatError(error);

      expect(result.details).toBeUndefined();
      expect('details' in result).toBe(false);
    });

    it('handles complex current state structure', () => {
      const currentState = {
        metadata: { status: 'locked', priority: 1, tags: ['urgent'] },
        sections: [
          { id: 'overview', type: 'markdown', content: 'Content here' },
          { id: 'details', type: 'task-list', items: [] },
        ],
      };
      const error = new StaleTokenError(
        'group/slot',
        'Token is stale',
        currentState,
        'sc_t_node_xyz789'
      );

      const result = formatError(error);

      expect(result.current).toEqual(currentState);
      expect(result.token).toBe('sc_t_node_xyz789');
    });

    it('handles complex details structure in InvalidSchemaError', () => {
      const details = {
        errors: [
          { field: 'metadata.status', type: 'missing' },
          { field: 'sections[0]', type: 'invalid' },
        ],
        schemaVersion: '1.0',
        validatedAt: '2026-02-06T12:00:00Z',
      };
      const error = new InvalidSchemaError('Multiple schema errors', details);

      const result = formatError(error);

      expect(result.details).toEqual(details);
    });

    it('handles very long message strings', () => {
      const longMessage = 'A'.repeat(1000);
      const error = new ValidationError('group/slot', longMessage);

      const result = formatError(error);

      expect(result.message).toBe(longMessage);
      expect(result.message.length).toBe(1000);
    });

    it('handles special characters in paths', () => {
      const error = new NotFoundError(
        'group-name/slot_name/section-id',
        'Not found'
      );

      const result = formatError(error);

      expect(result.path).toBe('group-name/slot_name/section-id');
    });

    it('handles special characters in patterns', () => {
      const error = new PatternMismatchError(
        'group/slot',
        'phase-\\d+\\.\\w+',
        'No match'
      );

      const result = formatError(error);

      expect(result.pattern).toBe('phase-\\d+\\.\\w+');
    });
  });
});
