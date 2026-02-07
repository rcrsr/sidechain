/**
 * Shared error formatter module
 * Covers: IR-10, IC-7, AC-12
 *
 * Maps 9 error classes to specific error codes and field sets.
 * Output shape: { ok: false, error: string, message: string, ...fields }
 */

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
} from '../core/errors.js';

/**
 * Error result interface with optional fields per error type
 * Covers: IR-10
 */
export interface ErrorResult {
  ok: false;
  error: string;
  message: string;
  path?: string;
  schema?: string;
  current?: unknown;
  token?: string;
  pattern?: string;
  details?: unknown;
}

/**
 * Maps error instances to standardized ErrorResult objects
 * Covers: EC-16, EC-17, EC-18, EC-19, EC-20, EC-21, EC-22, EC-23, EC-24, EC-25, EC-26
 *
 * @param error - Unknown error value to format
 * @returns Standardized error result with appropriate error code and fields
 */
export function formatError(error: unknown): ErrorResult {
  let errorResult: ErrorResult;

  if (error instanceof ValidationError) {
    // EC-16: ValidationError -> VALIDATION_ERROR, include path, optionally schema
    errorResult = {
      ok: false,
      error: 'VALIDATION_ERROR',
      path: error.path,
      message: error.message,
    };
    if (error.schema !== undefined) {
      errorResult.schema = error.schema;
    }
  } else if (error instanceof NotFoundError) {
    // EC-17: NotFoundError -> NOT_FOUND, include path
    errorResult = {
      ok: false,
      error: 'NOT_FOUND',
      path: error.path,
      message: error.message,
    };
  } else if (error instanceof SectionNotFoundError) {
    // EC-18: SectionNotFoundError -> SECTION_NOT_FOUND, include path
    errorResult = {
      ok: false,
      error: 'SECTION_NOT_FOUND',
      path: error.path,
      message: error.message,
    };
  } else if (error instanceof StaleTokenError) {
    // EC-19: StaleTokenError -> STALE_TOKEN, include path, current, token
    errorResult = {
      ok: false,
      error: 'STALE_TOKEN',
      path: error.path,
      message: error.message,
      current: error.current,
      token: error.token,
    };
  } else if (error instanceof PatternMismatchError) {
    // EC-20: PatternMismatchError -> PATTERN_MISMATCH, include path, pattern
    errorResult = {
      ok: false,
      error: 'PATTERN_MISMATCH',
      path: error.path,
      pattern: error.pattern,
      message: error.message,
    };
  } else if (error instanceof SchemaNotFoundError) {
    // EC-21: SchemaNotFoundError -> SCHEMA_NOT_FOUND, include schema
    errorResult = {
      ok: false,
      error: 'SCHEMA_NOT_FOUND',
      schema: error.schema,
      message: error.message,
    };
  } else if (error instanceof InvalidSchemaError) {
    // EC-22: InvalidSchemaError -> INVALID_SCHEMA, optionally details
    errorResult = {
      ok: false,
      error: 'INVALID_SCHEMA',
      message: error.message,
    };
    if (error.details !== undefined) {
      errorResult.details = error.details;
    }
  } else if (error instanceof NameNotFoundError) {
    // EC-23: NameNotFoundError -> NAME_NOT_FOUND
    errorResult = {
      ok: false,
      error: 'NAME_NOT_FOUND',
      message: error.message,
    };
  } else if (error instanceof MappingError) {
    // EC-24: MappingError -> MAPPING_ERROR
    errorResult = {
      ok: false,
      error: 'MAPPING_ERROR',
      message: error.message,
    };
  } else if (error instanceof Error) {
    // EC-25: Generic Error -> INTERNAL_ERROR
    errorResult = {
      ok: false,
      error: 'INTERNAL_ERROR',
      message: error.message,
    };
  } else {
    // EC-26: Non-Error value -> INTERNAL_ERROR, message='An unknown error occurred'
    errorResult = {
      ok: false,
      error: 'INTERNAL_ERROR',
      message: 'An unknown error occurred',
    };
  }

  return errorResult;
}
