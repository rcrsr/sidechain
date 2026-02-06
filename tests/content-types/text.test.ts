/**
 * Tests for text content type
 * Covers: IC-10, AC-30, EC-9
 */

import { describe, expect, it } from 'vitest';

import {
  appendTextContent,
  textContentType,
} from '../../src/content-types/text.js';

describe('textContentType', () => {
  // IC-10: Text content type validates string content
  describe('validate', () => {
    it('returns true for string content', () => {
      expect(textContentType.validate('Hello world')).toBe(true);
      expect(textContentType.validate('')).toBe(true);
      expect(textContentType.validate('# Markdown\n\nContent')).toBe(true);
    });

    it('returns false for non-string content', () => {
      expect(textContentType.validate(123)).toBe(false);
      expect(textContentType.validate(null)).toBe(false);
      expect(textContentType.validate(undefined)).toBe(false);
      expect(textContentType.validate({})).toBe(false);
      expect(textContentType.validate([])).toBe(false);
      expect(textContentType.validate(true)).toBe(false);
    });

    it('returns false for array of strings', () => {
      expect(textContentType.validate(['line 1', 'line 2'])).toBe(false);
    });

    it('returns false for object with string properties', () => {
      expect(textContentType.validate({ text: 'content' })).toBe(false);
    });
  });

  describe('serialize', () => {
    it('returns string content as-is', () => {
      const content = '# Overview\n\nThis is markdown content.';
      expect(textContentType.serialize(content)).toBe(content);
    });

    it('preserves empty string', () => {
      expect(textContentType.serialize('')).toBe('');
    });

    it('preserves whitespace and newlines', () => {
      const content = '  \n\n  Line with spaces  \n\n';
      expect(textContentType.serialize(content)).toBe(content);
    });

    it('throws TypeError for non-string content', () => {
      expect(() => textContentType.serialize(123)).toThrow(TypeError);
      expect(() => textContentType.serialize(123)).toThrow(
        'Text content must be a string'
      );
    });

    it('throws TypeError for null', () => {
      expect(() => textContentType.serialize(null)).toThrow(TypeError);
    });

    it('throws TypeError for undefined', () => {
      expect(() => textContentType.serialize(undefined)).toThrow(TypeError);
    });

    it('throws TypeError for object', () => {
      expect(() => textContentType.serialize({ text: 'content' })).toThrow(
        TypeError
      );
    });

    it('throws TypeError for array', () => {
      expect(() => textContentType.serialize(['line1', 'line2'])).toThrow(
        TypeError
      );
    });
  });

  describe('deserialize', () => {
    it('returns text as string', () => {
      const text = '# Overview\n\nMarkdown content';
      expect(textContentType.deserialize(text)).toBe(text);
    });

    it('preserves empty string', () => {
      expect(textContentType.deserialize('')).toBe('');
    });

    it('preserves all whitespace', () => {
      const text = '  \n\n  Content  \n\n';
      expect(textContentType.deserialize(text)).toBe(text);
    });

    it('preserves markdown formatting', () => {
      const text = '**bold** _italic_ `code`\n\n- list\n- items';
      expect(textContentType.deserialize(text)).toBe(text);
    });
  });

  describe('content type metadata', () => {
    it('has correct id', () => {
      expect(textContentType.id).toBe('text');
    });

    it('has description', () => {
      expect(textContentType.description).toBe(
        'Markdown prose stored as plain string'
      );
    });
  });
});

describe('appendTextContent', () => {
  // IC-10: appendSection concatenates text
  it('concatenates two strings with newline', () => {
    const existing = 'First paragraph';
    const addition = 'Second paragraph';
    const result = appendTextContent(existing, addition);

    expect(result).toBe('First paragraph\nSecond paragraph');
  });

  it('returns addition when existing is empty', () => {
    const result = appendTextContent('', 'New content');

    expect(result).toBe('New content');
  });

  it('handles empty addition', () => {
    const result = appendTextContent('Existing', '');

    expect(result).toBe('Existing\n');
  });

  it('handles both empty strings', () => {
    const result = appendTextContent('', '');

    expect(result).toBe('');
  });

  it('concatenates multiline strings', () => {
    const existing = 'Line 1\nLine 2';
    const addition = 'Line 3\nLine 4';
    const result = appendTextContent(existing, addition);

    expect(result).toBe('Line 1\nLine 2\nLine 3\nLine 4');
  });

  it('preserves markdown formatting', () => {
    const existing = '# Heading\n\nParagraph';
    const addition = '## Subheading\n\n- Item';
    const result = appendTextContent(existing, addition);

    expect(result).toBe('# Heading\n\nParagraph\n## Subheading\n\n- Item');
  });

  it('throws TypeError when existing is not a string', () => {
    expect(() => appendTextContent(123 as unknown as string, 'text')).toThrow(
      TypeError
    );
    expect(() => appendTextContent(123 as unknown as string, 'text')).toThrow(
      'Both existing and addition must be strings'
    );
  });

  it('throws TypeError when addition is not a string', () => {
    expect(() => appendTextContent('text', 123 as unknown as string)).toThrow(
      TypeError
    );
    expect(() => appendTextContent('text', 123 as unknown as string)).toThrow(
      'Both existing and addition must be strings'
    );
  });

  it('throws TypeError when both are not strings', () => {
    expect(() =>
      appendTextContent(
        null as unknown as string,
        undefined as unknown as string
      )
    ).toThrow(TypeError);
  });
});

// AC-30, EC-9: Item operations on text sections
describe('text content type does not support items', () => {
  it('validates content shape prevents item operations', () => {
    // Text content is a string, not an array
    const textContent = 'This is text content';

    // Attempting to treat text as array would fail type check
    expect(textContentType.validate(textContent)).toBe(true);
    expect(textContentType.validate([])).toBe(false);
  });

  it('serialize expects string not array', () => {
    // Item operations require array content
    // Text content type rejects arrays
    expect(() => textContentType.serialize([])).toThrow(TypeError);
    expect(() =>
      textContentType.serialize([{ id: '1', data: 'test' }])
    ).toThrow(TypeError);
  });

  it('content shape is string not structured items', () => {
    const content = 'Plain text, not items';

    // Text content type operations work with strings only
    expect(textContentType.validate(content)).toBe(true);
    expect(textContentType.serialize(content)).toBe(content);
    expect(textContentType.deserialize(content)).toBe(content);
  });
});
