/**
 * Typed error definitions for sidechain operations
 * Each error class carries its error code as a discriminant
 */

/**
 * Base error class for all sidechain errors
 */
export class SidechainError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Value fails schema constraint
 * EC-1
 */
export class ValidationError extends SidechainError {
  constructor(
    public readonly path: string,
    message: string,
    public readonly schema?: string
  ) {
    super('VALIDATION_ERROR', message);
  }
}

/**
 * Group or slot does not exist
 * EC-2
 */
export class NotFoundError extends SidechainError {
  constructor(
    public readonly path: string,
    message: string
  ) {
    super('NOT_FOUND', message);
  }
}

/**
 * Section ID not present in node
 * EC-4
 */
export class SectionNotFoundError extends SidechainError {
  constructor(
    public readonly path: string,
    message: string
  ) {
    super('SECTION_NOT_FOUND', message);
  }
}

/**
 * Content changed since token issued
 * EC-5
 */
export class StaleTokenError extends SidechainError {
  constructor(
    public readonly path: string,
    message: string,
    public readonly current: unknown,
    public readonly token: string
  ) {
    super('STALE_TOKEN', message);
  }
}

/**
 * Schema definition malformed
 * EC-7
 */
export class InvalidSchemaError extends SidechainError {
  constructor(
    message: string,
    public readonly details?: unknown
  ) {
    super('INVALID_SCHEMA', message);
  }
}

/**
 * Referenced schema not registered
 * EC-6
 */
export class SchemaNotFoundError extends SidechainError {
  constructor(
    public readonly schema: string,
    message: string
  ) {
    super('SCHEMA_NOT_FOUND', message);
  }
}

/**
 * Dynamic section ID fails pattern
 * EC-8
 */
export class PatternMismatchError extends SidechainError {
  constructor(
    public readonly path: string,
    public readonly pattern: string,
    message: string
  ) {
    super('PATTERN_MISMATCH', message);
  }
}

/**
 * Friendly name has no address mapping
 * EC-3
 */
export class NameNotFoundError extends SidechainError {
  constructor(message: string) {
    super('NAME_NOT_FOUND', message);
  }
}

/**
 * Client mapping file error
 * EC-9
 */
export class MappingError extends SidechainError {
  constructor(message: string) {
    super('MAPPING_ERROR', message);
  }
}
