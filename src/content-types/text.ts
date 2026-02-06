/**
 * Text content type implementation
 * IC-10: Text content type validates string content
 */

import type { ContentType } from '../types/content-type.js';

/**
 * Text content type for markdown prose
 * Content shape: string
 * No items support
 */
export const textContentType: ContentType = {
  id: 'text',
  description: 'Markdown prose stored as plain string',

  /**
   * Validate content is a string
   * IC-10: Validates string content
   */
  validate(content: unknown): boolean {
    return typeof content === 'string';
  },

  /**
   * Serialize string content to markdown
   * Content is already a string, return as-is
   */
  serialize(content: unknown): string {
    if (typeof content !== 'string') {
      throw new TypeError('Text content must be a string');
    }
    return content;
  },

  /**
   * Deserialize markdown text to string
   * Text is stored as-is, no parsing needed
   */
  deserialize(text: string): string {
    return text;
  },
};

/**
 * Append operation for text content
 * Concatenates string content with newline separator
 */
export function appendTextContent(existing: string, addition: string): string {
  if (typeof existing !== 'string' || typeof addition !== 'string') {
    throw new TypeError('Both existing and addition must be strings');
  }

  if (existing === '') {
    return addition;
  }

  return `${existing}\n${addition}`;
}
