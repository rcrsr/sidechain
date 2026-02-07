/**
 * Token validation helper for optimistic concurrency control
 * Covers: IR-3, IC-3, EC-4, EC-5, EC-6, AC-3, AC-28, AC-35
 */

import {
  TOKEN_PREFIX_NODE,
  TOKEN_PREFIX_SECTION,
} from '../../shared/constants.js';
import type { RawNode } from '../../types/backend.js';
import type { TokenOpts } from '../../types/metadata.js';
import { StaleTokenError } from '../errors.js';
import { generateNodeToken, generateSectionToken } from '../tokens.js';

/**
 * Validate write token against current node state
 *
 * When opts?.token is undefined: no-op (permissive mode behavior)
 * When token starts with sc_t_sec_: validate against section content
 * When token starts with sc_t_node_: validate against full node
 *
 * @param rawNode - Current node state from backend
 * @param opts - Token options (may be undefined or contain undefined token)
 * @param path - Logical path for error reporting
 * @param tokenSalt - Per-store salt for token generation
 * @param sectionId - Section ID when validating section token
 * @throws StaleTokenError when token validation fails
 */
export function validateWriteToken(
  rawNode: RawNode,
  opts: TokenOpts | undefined,
  path: string,
  tokenSalt: string,
  sectionId?: string
): void {
  // AC-28: No-op when token is undefined (permissive mode)
  if (opts?.token === undefined) {
    return;
  }

  // AC-35: Empty string token (not undefined) triggers validation
  const providedToken = opts.token;

  // Check token type and validate accordingly
  if (providedToken.startsWith(TOKEN_PREFIX_SECTION)) {
    // Section token validation - EC-4
    if (sectionId === undefined) {
      // Section token provided but no section ID - should not happen in practice
      // but we need to handle it defensively
      return;
    }

    const currentSectionToken = generateSectionToken(
      rawNode.sections[sectionId],
      tokenSalt
    );

    if (providedToken !== currentSectionToken) {
      // Section content changed since token was issued
      throw new StaleTokenError(
        `${path}/${sectionId}`,
        'Section content has changed since token was issued',
        {
          metadata: rawNode.metadata,
          sections: Object.entries(rawNode.sections).map(
            ([id, sectionContent]) => ({
              id,
              content: sectionContent,
            })
          ),
        },
        currentSectionToken
      );
    }
  } else if (providedToken.startsWith(TOKEN_PREFIX_NODE)) {
    // Node token validation - EC-5
    const currentNodeContent = {
      metadata: rawNode.metadata,
      sections: rawNode.sections,
    };

    const currentNodeToken = generateNodeToken(currentNodeContent, tokenSalt);

    if (providedToken !== currentNodeToken) {
      // Node content changed since token was issued
      throw new StaleTokenError(
        path,
        'Content has changed since token was issued',
        {
          metadata: rawNode.metadata,
          sections: Object.entries(rawNode.sections).map(
            ([id, sectionContent]) => ({
              id,
              content: sectionContent,
            })
          ),
        },
        currentNodeToken
      );
    }
  } else {
    // Unrecognized token prefix - validate against node token
    const currentNodeContent = {
      metadata: rawNode.metadata,
      sections: rawNode.sections,
    };

    const currentNodeToken = generateNodeToken(currentNodeContent, tokenSalt);

    if (providedToken !== currentNodeToken) {
      // Token is invalid
      throw new StaleTokenError(
        path,
        'Content has changed since token was issued',
        {
          metadata: rawNode.metadata,
          sections: Object.entries(rawNode.sections).map(
            ([id, sectionContent]) => ({
              id,
              content: sectionContent,
            })
          ),
        },
        currentNodeToken
      );
    }
  }
}
