/**
 * Section type resolution helper
 * IR-2: Consolidate section type resolution logic
 */

import type { NodeSchema } from '../../types/schema.js';
import { matchDynamicPattern } from '../schema.js';

/**
 * Resolve section type from node schema
 * IR-2: Section type resolution helper
 * AC-2: Section type resolution helper exists and all call sites delegate to it
 * AC-34: Section type resolution returns 'text' when nodeSchema.sections is undefined
 *
 * @param nodeSchema - Node schema containing section definitions
 * @param sectionId - Section ID to resolve type for
 * @returns Content type ID for the section (defaults to 'text')
 *
 * Resolution order:
 * 1. Check required sections
 * 2. Check optional sections
 * 3. Check dynamic section patterns
 * 4. Default to 'text'
 *
 * Never throws; always returns a valid content type string.
 */
export function resolveSectionType(
  nodeSchema: NodeSchema,
  sectionId: string
): string {
  // AC-34: Return 'text' when nodeSchema.sections is undefined
  if (nodeSchema.sections === undefined) {
    return 'text';
  }

  // Check required sections first
  const requiredSection = nodeSchema.sections.required?.find(
    (s) => s.id === sectionId
  );
  if (requiredSection !== undefined) {
    return requiredSection.type;
  }

  // Check optional sections
  const optionalSection = nodeSchema.sections.optional?.find(
    (s) => s.id === sectionId
  );
  if (optionalSection !== undefined) {
    return optionalSection.type;
  }

  // Check dynamic section patterns
  if (nodeSchema.sections.dynamic !== undefined) {
    for (const dynamicDef of nodeSchema.sections.dynamic) {
      if (matchDynamicPattern(sectionId, dynamicDef['id-pattern'])) {
        return dynamicDef.type;
      }
    }
  }

  // Default to 'text' when no schema declaration matches
  return 'text';
}
