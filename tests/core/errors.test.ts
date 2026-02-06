/**
 * Tests for error classes
 * Covers: EC-1, EC-2, EC-3, EC-4, EC-5, EC-6, EC-7, EC-8, EC-9, EC-10, EC-11, EC-12, EC-13
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
  SidechainError,
  StaleTokenError,
  ValidationError,
} from '../../src/core/errors.js';

describe('SidechainError', () => {
  // Base error class tests
  it('creates error with code and message', () => {
    const error = new SidechainError('TEST_CODE', 'Test message');

    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
    expect(error.name).toBe('SidechainError');
  });

  it('extends Error with stack trace', () => {
    const error = new SidechainError('TEST_CODE', 'Test message');

    expect(error).toBeInstanceOf(Error);
    expect(error.stack).toBeDefined();
  });
});

describe('NotFoundError', () => {
  // EC-1, EC-10: Group or slot does not exist
  it('includes code, path, and message', () => {
    const error = new NotFoundError('user-auth/requirements', 'Slot not found');

    expect(error.code).toBe('NOT_FOUND');
    expect(error.path).toBe('user-auth/requirements');
    expect(error.message).toBe('Slot not found');
  });

  it('has correct response shape', () => {
    const error = new NotFoundError('group/slot', 'Not found');

    const response = {
      code: error.code,
      path: error.path,
      message: error.message,
    };

    expect(response).toEqual({
      code: 'NOT_FOUND',
      path: 'group/slot',
      message: 'Not found',
    });
  });

  it('extends SidechainError', () => {
    const error = new NotFoundError('path/to/resource', 'Missing');

    expect(error).toBeInstanceOf(SidechainError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('ValidationError', () => {
  // EC-2, EC-9: Value fails schema constraint
  it('includes code, path, message, and schema', () => {
    const error = new ValidationError(
      'user-auth/requirements/@meta/status',
      'Invalid enum value',
      'initiative-schema'
    );

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.path).toBe('user-auth/requirements/@meta/status');
    expect(error.message).toBe('Invalid enum value');
    expect(error.schema).toBe('initiative-schema');
  });

  it('has correct response shape with schema', () => {
    const error = new ValidationError(
      'group/slot/@meta/field',
      'Type mismatch',
      'test-schema'
    );

    const response = {
      code: error.code,
      path: error.path,
      message: error.message,
      schema: error.schema,
    };

    expect(response).toEqual({
      code: 'VALIDATION_ERROR',
      path: 'group/slot/@meta/field',
      message: 'Type mismatch',
      schema: 'test-schema',
    });
  });

  it('allows optional schema parameter', () => {
    const error = new ValidationError('path/to/field', 'Validation failed');

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.path).toBe('path/to/field');
    expect(error.message).toBe('Validation failed');
    expect(error.schema).toBeUndefined();
  });

  it('extends SidechainError', () => {
    const error = new ValidationError('path', 'Invalid', 'schema');

    expect(error).toBeInstanceOf(SidechainError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('NameNotFoundError', () => {
  // EC-3: Friendly name has no address mapping
  it('includes code and message', () => {
    const error = new NameNotFoundError('No mapping for name: user-auth');

    expect(error.code).toBe('NAME_NOT_FOUND');
    expect(error.message).toBe('No mapping for name: user-auth');
  });

  it('has correct response shape', () => {
    const error = new NameNotFoundError('Name not found');

    const response = {
      code: error.code,
      message: error.message,
    };

    expect(response).toEqual({
      code: 'NAME_NOT_FOUND',
      message: 'Name not found',
    });
  });

  it('does not include path property', () => {
    const error = new NameNotFoundError('Missing name');

    expect(error).not.toHaveProperty('path');
  });

  it('extends SidechainError', () => {
    const error = new NameNotFoundError('Not found');

    expect(error).toBeInstanceOf(SidechainError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('MappingError', () => {
  // EC-4, EC-5: Client mapping file error
  it('includes code and message', () => {
    const error = new MappingError('Failed to read mapping file');

    expect(error.code).toBe('MAPPING_ERROR');
    expect(error.message).toBe('Failed to read mapping file');
  });

  it('has correct response shape', () => {
    const error = new MappingError('Mapping error occurred');

    const response = {
      code: error.code,
      message: error.message,
    };

    expect(response).toEqual({
      code: 'MAPPING_ERROR',
      message: 'Mapping error occurred',
    });
  });

  it('does not include path property', () => {
    const error = new MappingError('File error');

    expect(error).not.toHaveProperty('path');
  });

  it('extends SidechainError', () => {
    const error = new MappingError('Error');

    expect(error).toBeInstanceOf(SidechainError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('SchemaNotFoundError', () => {
  // EC-6: Referenced schema not registered
  it('includes code, schema, and message', () => {
    const error = new SchemaNotFoundError(
      'initiative-schema',
      'Schema not registered'
    );

    expect(error.code).toBe('SCHEMA_NOT_FOUND');
    expect(error.schema).toBe('initiative-schema');
    expect(error.message).toBe('Schema not registered');
  });

  it('has correct response shape', () => {
    const error = new SchemaNotFoundError('missing-schema', 'Not found');

    const response = {
      code: error.code,
      schema: error.schema,
      message: error.message,
    };

    expect(response).toEqual({
      code: 'SCHEMA_NOT_FOUND',
      schema: 'missing-schema',
      message: 'Not found',
    });
  });

  it('extends SidechainError', () => {
    const error = new SchemaNotFoundError('schema', 'Missing');

    expect(error).toBeInstanceOf(SidechainError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('InvalidSchemaError', () => {
  // EC-7: Schema definition malformed
  it('includes code, message, and details', () => {
    const details = { field: 'metadata.status', reason: 'Invalid type' };
    const error = new InvalidSchemaError(
      'Malformed schema definition',
      details
    );

    expect(error.code).toBe('INVALID_SCHEMA');
    expect(error.message).toBe('Malformed schema definition');
    expect(error.details).toEqual(details);
  });

  it('has correct response shape with details', () => {
    const details = { line: 42, column: 15 };
    const error = new InvalidSchemaError('Parse error', details);

    const response = {
      code: error.code,
      message: error.message,
      details: error.details,
    };

    expect(response).toEqual({
      code: 'INVALID_SCHEMA',
      message: 'Parse error',
      details: { line: 42, column: 15 },
    });
  });

  it('allows optional details parameter', () => {
    const error = new InvalidSchemaError('Schema invalid');

    expect(error.code).toBe('INVALID_SCHEMA');
    expect(error.message).toBe('Schema invalid');
    expect(error.details).toBeUndefined();
  });

  it('extends SidechainError', () => {
    const error = new InvalidSchemaError('Invalid');

    expect(error).toBeInstanceOf(SidechainError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('StaleTokenError', () => {
  // EC-12: Content changed since token issued
  it('includes code, path, message, current, and token', () => {
    const current = { metadata: { status: 'locked' }, sections: [] };
    const error = new StaleTokenError(
      'user-auth/plan',
      'Token expired',
      current,
      'new_token_abc123'
    );

    expect(error.code).toBe('STALE_TOKEN');
    expect(error.path).toBe('user-auth/plan');
    expect(error.message).toBe('Token expired');
    expect(error.current).toEqual(current);
    expect(error.token).toBe('new_token_abc123');
  });

  it('has correct response shape for retry without re-read', () => {
    const current = {
      metadata: { status: 'draft', created: '2026-02-05' },
      sections: [{ id: 'overview', content: 'Updated content' }],
    };
    const error = new StaleTokenError(
      'group/slot',
      'Content changed',
      current,
      'fresh_token_xyz'
    );

    const response = {
      code: error.code,
      path: error.path,
      message: error.message,
      current: error.current,
      token: error.token,
    };

    expect(response).toEqual({
      code: 'STALE_TOKEN',
      path: 'group/slot',
      message: 'Content changed',
      current: {
        metadata: { status: 'draft', created: '2026-02-05' },
        sections: [{ id: 'overview', content: 'Updated content' }],
      },
      token: 'fresh_token_xyz',
    });
  });

  it('supports unknown type for current object', () => {
    const error = new StaleTokenError(
      'path',
      'Stale',
      { arbitrary: 'data' },
      'token'
    );

    expect(error.current).toEqual({ arbitrary: 'data' });
  });

  it('extends SidechainError', () => {
    const error = new StaleTokenError('path', 'Stale', {}, 'token');

    expect(error).toBeInstanceOf(SidechainError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('PatternMismatchError', () => {
  // EC-13: Dynamic section ID fails pattern
  it('includes code, path, pattern, and message', () => {
    const error = new PatternMismatchError(
      'user-auth/plan/phase-abc',
      'phase-{n}',
      'Section ID does not match pattern'
    );

    expect(error.code).toBe('PATTERN_MISMATCH');
    expect(error.path).toBe('user-auth/plan/phase-abc');
    expect(error.pattern).toBe('phase-{n}');
    expect(error.message).toBe('Section ID does not match pattern');
  });

  it('has correct response shape', () => {
    const error = new PatternMismatchError(
      'group/slot/section-x',
      'section-\\d+',
      'Pattern mismatch'
    );

    const response = {
      code: error.code,
      path: error.path,
      pattern: error.pattern,
      message: error.message,
    };

    expect(response).toEqual({
      code: 'PATTERN_MISMATCH',
      path: 'group/slot/section-x',
      pattern: 'section-\\d+',
      message: 'Pattern mismatch',
    });
  });

  it('extends SidechainError', () => {
    const error = new PatternMismatchError('path', 'pattern', 'Mismatch');

    expect(error).toBeInstanceOf(SidechainError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('SectionNotFoundError', () => {
  // EC-8, EC-11: Section ID not present in node
  it('includes code, path, and message', () => {
    const error = new SectionNotFoundError(
      'user-auth/plan/missing-section',
      'Section not found'
    );

    expect(error.code).toBe('SECTION_NOT_FOUND');
    expect(error.path).toBe('user-auth/plan/missing-section');
    expect(error.message).toBe('Section not found');
  });

  it('has correct response shape', () => {
    const error = new SectionNotFoundError('group/slot/section', 'Not found');

    const response = {
      code: error.code,
      path: error.path,
      message: error.message,
    };

    expect(response).toEqual({
      code: 'SECTION_NOT_FOUND',
      path: 'group/slot/section',
      message: 'Not found',
    });
  });

  it('extends SidechainError', () => {
    const error = new SectionNotFoundError('path', 'Missing');

    expect(error).toBeInstanceOf(SidechainError);
    expect(error).toBeInstanceOf(Error);
  });
});
