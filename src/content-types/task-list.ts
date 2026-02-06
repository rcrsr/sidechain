/**
 * Task-list content type implementation
 * IC-11: Task-list content type validates items array
 * AC-15: item.add dispatches by content type and validates data
 */

import type { ContentType, TaskItem } from '../types/content-type.js';

/**
 * Task-list content structure
 * Content shape: { title: string, items: TaskItem[] }
 */
export interface TaskListContent {
  title: string;
  items: TaskItem[];
}

/**
 * Task-list content type for task tracking
 * Item fields: id, title, status, tags, refs, body, notes
 * Markdown format: [x] **ID** `[TAG]` →[ref] Title + indented body + > Notes:
 */
export const taskListContentType: ContentType = {
  id: 'task-list',
  description: 'Task list with status tracking and structured items',

  /**
   * Validate content matches task-list shape
   * IC-11: Validates items array structure
   */
  validate(content: unknown): boolean {
    if (typeof content !== 'object' || content === null) {
      return false;
    }

    const obj = content as Record<string, unknown>;

    // Check title field
    if (typeof obj['title'] !== 'string') {
      return false;
    }

    // Check items is an array
    if (!Array.isArray(obj['items'])) {
      return false;
    }

    // Validate each item
    for (const item of obj['items']) {
      if (!isValidTaskItem(item)) {
        return false;
      }
    }

    return true;
  },

  /**
   * Serialize task-list content to markdown
   * Format: [x] **ID** `[TAG]` →[ref] Title + indented body + > Notes:
   */
  serialize(content: unknown): string {
    if (!this.validate(content)) {
      throw new TypeError('Task-list content must match TaskListContent shape');
    }

    const taskList = content as TaskListContent;
    const lines: string[] = [];

    // Add title if present
    if (taskList.title) {
      lines.push(`# ${taskList.title}`);
      lines.push('');
    }

    // Serialize each item
    for (const item of taskList.items) {
      lines.push(...serializeTaskItem(item));
    }

    return lines.join('\n');
  },

  /**
   * Deserialize markdown text to task-list content
   * Parses markdown format into structured TaskListContent
   */
  deserialize(text: string): TaskListContent {
    const lines = text.split('\n');
    const items: TaskItem[] = [];
    let title = '';
    let i = 0;

    // Parse title if present
    const firstLine = lines[i];
    if (firstLine?.startsWith('# ')) {
      title = firstLine.slice(2).trim();
      i++;
      // Skip blank line after title
      if (lines[i] === '') {
        i++;
      }
    }

    // Parse items
    while (i < lines.length) {
      const line = lines[i];

      if (line && /^\[[ x]\] \*\*/.test(line)) {
        const { item, nextIndex } = parseTaskItem(lines, i);
        items.push(item);
        i = nextIndex;
      } else {
        i++;
      }
    }

    return { title, items };
  },
};

/**
 * Validate TaskItem structure
 * IC-11: Validates required fields and types
 */
function isValidTaskItem(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;

  // Required fields
  if (typeof item['id'] !== 'string' || typeof item['title'] !== 'string') {
    return false;
  }

  if (typeof item['status'] !== 'string') {
    return false;
  }

  // Optional fields type checks
  if (item['tags'] !== undefined && !Array.isArray(item['tags'])) {
    return false;
  }

  if (item['tags'] !== undefined) {
    for (const tag of item['tags']) {
      if (typeof tag !== 'string') {
        return false;
      }
    }
  }

  if (item['refs'] !== undefined && !Array.isArray(item['refs'])) {
    return false;
  }

  if (item['refs'] !== undefined) {
    for (const ref of item['refs']) {
      if (typeof ref !== 'string') {
        return false;
      }
    }
  }

  if (item['body'] !== undefined && typeof item['body'] !== 'string') {
    return false;
  }

  if (item['notes'] !== undefined && typeof item['notes'] !== 'string') {
    return false;
  }

  return true;
}

/**
 * Serialize single task item to markdown lines
 * Format: [x] **ID** `[TAG]` →[ref] Title
 *         Body indented
 *         > Notes: content
 */
function serializeTaskItem(item: TaskItem): string[] {
  const lines: string[] = [];

  // Status checkbox
  const checkbox = item.status === 'done' ? '[x]' : '[ ]';

  // Tags
  const tags =
    item.tags && item.tags.length > 0
      ? item.tags.map((t) => `\`[${t}]\``).join(' ') + ' '
      : '';

  // Refs
  const refs =
    item.refs && item.refs.length > 0
      ? item.refs.map((r) => `→[${r}]`).join(' ') + ' '
      : '';

  // Main line
  lines.push(`${checkbox} **${item.id}** ${tags}${refs}${item.title}`);

  // Body (indented)
  if (item.body) {
    const bodyLines = item.body.split('\n');
    for (const bodyLine of bodyLines) {
      lines.push(`  ${bodyLine}`);
    }
  }

  // Notes
  if (item.notes) {
    lines.push(`  > Notes: ${item.notes}`);
  }

  // Blank line after item
  lines.push('');

  return lines;
}

/**
 * Parse task item from markdown lines
 * Returns parsed item and index of next line to process
 */
function parseTaskItem(
  lines: readonly string[],
  startIndex: number
): { item: TaskItem; nextIndex: number } {
  const firstLine = lines[startIndex];

  if (!firstLine) {
    throw new Error(`No line at index ${startIndex}`);
  }

  // Parse first line: [x] **ID** `[TAG]` →[ref] Title
  const pattern =
    /^\[([x ])\] \*\*([^*]+)\*\*\s*((?:`\[[^\]]+\]`\s*)*)((?:→\[[^\]]+\]\s*)*)(.*)/;
  const match = pattern.exec(firstLine);

  if (!match) {
    throw new Error(`Failed to parse task item at line ${startIndex}`);
  }

  const statusChar = match[1];
  const id = match[2];
  const tagsStr = match[3];
  const refsStr = match[4];
  const title = match[5];

  if (!statusChar || !id || !title) {
    throw new Error(`Invalid task item format at line ${startIndex}`);
  }

  const status = statusChar === 'x' ? 'done' : 'todo';

  // Parse tags
  const tags: string[] = [];
  if (tagsStr) {
    const tagMatches = tagsStr.matchAll(/`\[([^\]]+)\]`/g);
    for (const tagMatch of tagMatches) {
      const tagValue = tagMatch[1];
      if (tagValue) {
        tags.push(tagValue);
      }
    }
  }

  // Parse refs
  const refs: string[] = [];
  if (refsStr) {
    const refMatches = refsStr.matchAll(/→\[([^\]]+)\]/g);
    for (const refMatch of refMatches) {
      const refValue = refMatch[1];
      if (refValue) {
        refs.push(refValue);
      }
    }
  }

  // Parse body and notes
  let i = startIndex + 1;
  const bodyLines: string[] = [];
  let notes: string | undefined;

  while (i < lines.length) {
    const line = lines[i];

    // Check if we've reached the next item or end
    if (!line || /^\[[ x]\] \*\*/.test(line)) {
      break;
    }

    // Parse notes
    const notesPattern = /^\s*> Notes: (.+)/;
    const notesMatch = notesPattern.exec(line);
    if (notesMatch) {
      notes = notesMatch[1];
      i++;
      continue;
    }

    // Parse body (indented lines)
    if (line.startsWith('  ')) {
      bodyLines.push(line.slice(2));
    }

    i++;
  }

  // Build item with required fields
  const item: TaskItem = {
    id,
    title,
    status,
  };

  // Add optional fields only if present
  if (tags.length > 0) {
    item.tags = tags;
  }
  if (refs.length > 0) {
    item.refs = refs;
  }
  if (bodyLines.length > 0) {
    item.body = bodyLines.join('\n');
  }
  if (notes !== undefined) {
    item.notes = notes;
  }

  return { item, nextIndex: i };
}

/**
 * Add item to task-list content
 * AC-15: Validates required fields (id, title)
 */
export function addTaskItem(
  content: TaskListContent,
  item: TaskItem
): TaskListContent {
  // Validate required fields
  if (!item.id || !item.title) {
    throw new TypeError('Task item must have id and title');
  }

  // Validate item structure
  if (!isValidTaskItem(item)) {
    throw new TypeError('Invalid task item structure');
  }

  // Check for duplicate ID
  if (content.items.some((i) => i.id === item.id)) {
    throw new Error(`Task item with id '${item.id}' already exists`);
  }

  return {
    ...content,
    items: [...content.items, item],
  };
}

/**
 * Update item in task-list content
 * IC-11: Validates field types during update
 */
export function updateTaskItem(
  content: TaskListContent,
  id: string,
  updates: Partial<TaskItem>
): TaskListContent {
  const index = content.items.findIndex((i) => i.id === id);

  if (index === -1) {
    throw new Error(`Task item with id '${id}' not found`);
  }

  const existingItem = content.items[index];
  if (!existingItem) {
    throw new Error(`Task item at index ${index} is undefined`);
  }

  const updatedItem = { ...existingItem, ...updates } as TaskItem;

  // Validate updated item
  if (!isValidTaskItem(updatedItem)) {
    throw new TypeError('Invalid task item after update');
  }

  const newItems = [...content.items];
  newItems[index] = updatedItem;

  return {
    ...content,
    items: newItems,
  };
}

/**
 * Remove item from task-list content
 * IC-11: Removes item by ID
 */
export function removeTaskItem(
  content: TaskListContent,
  id: string
): TaskListContent {
  const index = content.items.findIndex((i) => i.id === id);

  if (index === -1) {
    throw new Error(`Task item with id '${id}' not found`);
  }

  return {
    ...content,
    items: content.items.filter((i) => i.id !== id),
  };
}
