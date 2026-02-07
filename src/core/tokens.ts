/**
 * Token generation and validation for optimistic concurrency control
 * Tokens are salted content hashes that prove caller saw current state
 */

import * as crypto from 'node:crypto';

import {
  TOKEN_PREFIX_NODE,
  TOKEN_PREFIX_SECTION,
} from '../shared/constants.js';

/**
 * Enforcement mode for token validation
 */
export type TokenMode = 'permissive' | 'strict';

/**
 * Generate a node token covering all metadata and sections
 * AC-21: Returns sc_t_node_* prefix, deterministic for same content+salt
 */
export function generateNodeToken(content: unknown, salt: string): string {
  const hash = hashContent(content, salt);
  return `${TOKEN_PREFIX_NODE}${hash}`;
}

/**
 * Generate a section token covering single section content
 * AC-21: Returns sc_t_sec_* prefix, deterministic for same content+salt
 */
export function generateSectionToken(content: unknown, salt: string): string {
  const hash = hashContent(content, salt);
  return `${TOKEN_PREFIX_SECTION}${hash}`;
}

/**
 * Validate a token against current content
 * AC-22: Stale token fails validation
 * AC-23: Permissive mode allows tokenless writes
 * AC-24: Strict mode rejects tokenless writes
 *
 * @param providedToken - Token from caller (may be undefined)
 * @param currentContent - Current content to validate against
 * @param salt - Per-store salt for token generation
 * @param mode - Enforcement mode (permissive or strict)
 * @returns true if token is valid, false if stale or missing in strict mode
 */
export function validateToken(
  providedToken: string | undefined,
  currentContent: unknown,
  salt: string,
  mode: TokenMode
): boolean {
  // Token not provided
  if (providedToken === undefined) {
    // AC-23: Permissive mode allows tokenless writes
    if (mode === 'permissive') {
      return true;
    }
    // AC-24: Strict mode rejects tokenless writes
    return false;
  }

  // Token provided - verify it matches current content
  const currentToken = generateTokenForContent(
    providedToken,
    currentContent,
    salt
  );
  return providedToken === currentToken;
}

/**
 * Generate a random salt for new stores
 * Salts prevent token forgery (only sidechain can produce valid tokens)
 */
export function generateSalt(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate token for content, inferring type from provided token prefix
 * Internal helper that preserves token scope (node vs section)
 */
function generateTokenForContent(
  providedToken: string,
  content: unknown,
  salt: string
): string {
  if (providedToken.startsWith(TOKEN_PREFIX_NODE)) {
    return generateNodeToken(content, salt);
  }
  if (providedToken.startsWith(TOKEN_PREFIX_SECTION)) {
    return generateSectionToken(content, salt);
  }
  // Invalid token prefix - will not match, causing validation failure
  return '';
}

/**
 * Hash content with salt
 * Deterministic: same content+salt produces same hash
 * Salted: prevents token forgery (unpredictable without salt)
 */
function hashContent(content: unknown, salt: string): string {
  const serialized = JSON.stringify(content);
  const salted = `${salt}:${serialized}`;
  return crypto.createHash('sha256').update(salted, 'utf8').digest('hex');
}
