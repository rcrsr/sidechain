/**
 * Tests for task-list content type
 * Covers: IC-11, AC-15
 */

import { describe, expect, it } from 'vitest';

import {
  addTaskItem,
  removeTaskItem,
  taskListContentType,
  updateTaskItem,
  type TaskListContent,
} from '../../src/content-types/task-list.js';
import type { TaskItem } from '../../src/types/content-type.js';

describe('taskListContentType', () => {
  // IC-11: Task-list content type validates items array
  describe('validate', () => {
    it('returns true for valid task-list content', () => {
      const content: TaskListContent = {
        title: 'My Tasks',
        items: [
          {
            id: '1.1',
            title: 'First task',
            status: 'todo',
          },
        ],
      };

      expect(taskListContentType.validate(content)).toBe(true);
    });

    it('returns true for empty items array', () => {
      const content: TaskListContent = {
        title: 'Empty List',
        items: [],
      };

      expect(taskListContentType.validate(content)).toBe(true);
    });

    it('returns true for task with all optional fields', () => {
      const content: TaskListContent = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'Complete task',
            status: 'done',
            tags: ['backend', 'urgent'],
            refs: ['user-auth/spec'],
            body: 'Task body content',
            notes: 'Important notes',
          },
        ],
      };

      expect(taskListContentType.validate(content)).toBe(true);
    });

    it('returns false for non-object content', () => {
      expect(taskListContentType.validate('string')).toBe(false);
      expect(taskListContentType.validate(123)).toBe(false);
      expect(taskListContentType.validate(null)).toBe(false);
      expect(taskListContentType.validate(undefined)).toBe(false);
      expect(taskListContentType.validate([])).toBe(false);
    });

    it('returns false when title is missing', () => {
      const content = {
        items: [],
      };

      expect(taskListContentType.validate(content)).toBe(false);
    });

    it('returns false when title is not a string', () => {
      const content = {
        title: 123,
        items: [],
      };

      expect(taskListContentType.validate(content)).toBe(false);
    });

    it('returns false when items is not an array', () => {
      const content = {
        title: 'Tasks',
        items: 'not-an-array',
      };

      expect(taskListContentType.validate(content)).toBe(false);
    });

    // IC-11: Task-list rejects malformed items
    it('returns false when item missing id', () => {
      const content = {
        title: 'Tasks',
        items: [
          {
            title: 'Task',
            status: 'todo',
          },
        ],
      };

      expect(taskListContentType.validate(content)).toBe(false);
    });

    it('returns false when item missing title', () => {
      const content = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            status: 'todo',
          },
        ],
      };

      expect(taskListContentType.validate(content)).toBe(false);
    });

    it('returns false when item missing status', () => {
      const content = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'Task',
          },
        ],
      };

      expect(taskListContentType.validate(content)).toBe(false);
    });

    it('returns false when tags is not an array', () => {
      const content = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'Task',
            status: 'todo',
            tags: 'not-array',
          },
        ],
      };

      expect(taskListContentType.validate(content)).toBe(false);
    });

    it('returns false when tags contains non-string', () => {
      const content = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'Task',
            status: 'todo',
            tags: ['valid', 123],
          },
        ],
      };

      expect(taskListContentType.validate(content)).toBe(false);
    });

    it('returns false when refs is not an array', () => {
      const content = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'Task',
            status: 'todo',
            refs: 'not-array',
          },
        ],
      };

      expect(taskListContentType.validate(content)).toBe(false);
    });

    it('returns false when body is not a string', () => {
      const content = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'Task',
            status: 'todo',
            body: 123,
          },
        ],
      };

      expect(taskListContentType.validate(content)).toBe(false);
    });

    it('returns false when notes is not a string', () => {
      const content = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'Task',
            status: 'todo',
            notes: 123,
          },
        ],
      };

      expect(taskListContentType.validate(content)).toBe(false);
    });
  });

  // IC-11: Markdown serialization matches format
  describe('serialize', () => {
    it('serializes task-list with title', () => {
      const content: TaskListContent = {
        title: 'Sprint Tasks',
        items: [
          {
            id: '1.1',
            title: 'Implement feature',
            status: 'todo',
          },
        ],
      };

      const markdown = taskListContentType.serialize(content);

      expect(markdown).toContain('# Sprint Tasks');
      expect(markdown).toContain('[ ] **1.1** Implement feature');
    });

    it('serializes task with done status', () => {
      const content: TaskListContent = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'Complete task',
            status: 'done',
          },
        ],
      };

      const markdown = taskListContentType.serialize(content);

      expect(markdown).toContain('[x] **1.1** Complete task');
    });

    it('serializes task with tags', () => {
      const content: TaskListContent = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'Backend work',
            status: 'todo',
            tags: ['backend', 'api'],
          },
        ],
      };

      const markdown = taskListContentType.serialize(content);

      expect(markdown).toContain(
        '[ ] **1.1** `[backend]` `[api]` Backend work'
      );
    });

    it('serializes task with body', () => {
      const content: TaskListContent = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'Task with body',
            status: 'todo',
            body: 'This is the body\nWith multiple lines',
          },
        ],
      };

      const markdown = taskListContentType.serialize(content);

      expect(markdown).toContain('  This is the body');
      expect(markdown).toContain('  With multiple lines');
    });

    it('serializes task with refs', () => {
      const content: TaskListContent = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'Task with refs',
            status: 'todo',
            refs: ['user-auth/spec', 'payments/plan'],
          },
        ],
      };

      const markdown = taskListContentType.serialize(content);

      expect(markdown).toContain(
        '[ ] **1.1** →[user-auth/spec] →[payments/plan] Task with refs'
      );
    });

    it('serializes task with notes', () => {
      const content: TaskListContent = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'Task with notes',
            status: 'todo',
            notes: 'Important information',
          },
        ],
      };

      const markdown = taskListContentType.serialize(content);

      expect(markdown).toContain('  > Notes: Important information');
    });

    it('serializes task with all fields', () => {
      const content: TaskListContent = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'Complete task',
            status: 'done',
            tags: ['urgent'],
            refs: ['user-auth/spec'],
            body: 'Task details',
            notes: 'Review needed',
          },
        ],
      };

      const markdown = taskListContentType.serialize(content);

      expect(markdown).toContain(
        '[x] **1.1** `[urgent]` →[user-auth/spec] Complete task'
      );
      expect(markdown).toContain('  Task details');
      expect(markdown).toContain('  > Notes: Review needed');
    });

    it('serializes multiple tasks', () => {
      const content: TaskListContent = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'First task',
            status: 'done',
          },
          {
            id: '1.2',
            title: 'Second task',
            status: 'todo',
          },
        ],
      };

      const markdown = taskListContentType.serialize(content);

      expect(markdown).toContain('[x] **1.1** First task');
      expect(markdown).toContain('[ ] **1.2** Second task');
    });

    it('throws TypeError for invalid content', () => {
      expect(() => taskListContentType.serialize('not-valid')).toThrow(
        TypeError
      );
      expect(() => taskListContentType.serialize('not-valid')).toThrow(
        'Task-list content must match TaskListContent shape'
      );
    });

    it('throws TypeError for null', () => {
      expect(() => taskListContentType.serialize(null)).toThrow(TypeError);
    });

    it('throws TypeError for content missing items', () => {
      const content = {
        title: 'Tasks',
      };

      expect(() => taskListContentType.serialize(content)).toThrow(TypeError);
    });
  });

  // IC-11: Markdown deserialization parses format
  describe('deserialize', () => {
    it('parses task-list with title', () => {
      const markdown = `# Sprint Tasks

[ ] **1.1** Implement feature
`;

      const content = taskListContentType.deserialize(
        markdown
      ) as TaskListContent;

      expect(content.title).toBe('Sprint Tasks');
      expect(content.items).toHaveLength(1);
      expect(content.items[0]?.id).toBe('1.1');
      expect(content.items[0]?.title).toBe('Implement feature');
      expect(content.items[0]?.status).toBe('todo');
    });

    it('parses task with done status', () => {
      const markdown = `# Tasks

[x] **1.1** Complete task
`;

      const content = taskListContentType.deserialize(
        markdown
      ) as TaskListContent;

      expect(content.items[0]?.status).toBe('done');
    });

    it('parses task with tags', () => {
      const markdown = `# Tasks

[ ] **1.1** \`[backend]\` \`[api]\` Backend work
`;

      const content = taskListContentType.deserialize(
        markdown
      ) as TaskListContent;

      expect(content.items[0]?.tags).toEqual(['backend', 'api']);
    });

    it('parses task with refs', () => {
      const markdown = `# Tasks

[ ] **1.1** →[user-auth/spec] →[payments/plan] Task with refs
`;

      const content = taskListContentType.deserialize(
        markdown
      ) as TaskListContent;

      expect(content.items[0]?.refs).toEqual([
        'user-auth/spec',
        'payments/plan',
      ]);
    });

    it('parses task with body', () => {
      const markdown = `# Tasks

[ ] **1.1** Task with body
  This is the body
  With multiple lines
`;

      const content = taskListContentType.deserialize(
        markdown
      ) as TaskListContent;

      expect(content.items[0]?.body).toBe(
        'This is the body\nWith multiple lines'
      );
    });

    it('parses task with notes', () => {
      const markdown = `# Tasks

[ ] **1.1** Task with notes
  > Notes: Important information
`;

      const content = taskListContentType.deserialize(
        markdown
      ) as TaskListContent;

      expect(content.items[0]?.notes).toBe('Important information');
    });

    it('parses task with all fields', () => {
      const markdown = `# Tasks

[x] **1.1** \`[urgent]\` Complete task
  Task details
  > Notes: Review needed
`;

      const content = taskListContentType.deserialize(
        markdown
      ) as TaskListContent;

      const item = content.items[0];
      expect(item?.id).toBe('1.1');
      expect(item?.title).toBe('Complete task');
      expect(item?.status).toBe('done');
      expect(item?.tags).toEqual(['urgent']);
      expect(item?.body).toBe('Task details');
      expect(item?.notes).toBe('Review needed');
    });

    it('parses multiple tasks', () => {
      const markdown = `# Tasks

[x] **1.1** First task

[ ] **1.2** Second task
`;

      const content = taskListContentType.deserialize(
        markdown
      ) as TaskListContent;

      expect(content.items).toHaveLength(2);
      expect(content.items[0]?.id).toBe('1.1');
      expect(content.items[1]?.id).toBe('1.2');
    });

    it('parses task-list without title', () => {
      const markdown = `[ ] **1.1** Task
`;

      const content = taskListContentType.deserialize(
        markdown
      ) as TaskListContent;

      expect(content.title).toBe('');
      expect(content.items).toHaveLength(1);
    });

    it('handles empty markdown', () => {
      const content = taskListContentType.deserialize('') as TaskListContent;

      expect(content.title).toBe('');
      expect(content.items).toHaveLength(0);
    });
  });

  describe('round-trip serialization', () => {
    it('preserves content through serialize/deserialize cycle', () => {
      const original: TaskListContent = {
        title: 'Sprint Tasks',
        items: [
          {
            id: '1.1',
            title: 'First task',
            status: 'done',
            tags: ['backend'],
            body: 'Task body',
            notes: 'Notes here',
          },
          {
            id: '1.2',
            title: 'Second task',
            status: 'todo',
          },
        ],
      };

      const markdown = taskListContentType.serialize(original);
      const parsed = taskListContentType.deserialize(
        markdown
      ) as TaskListContent;

      expect(parsed.title).toBe(original.title);
      expect(parsed.items).toHaveLength(original.items.length);
      expect(parsed.items[0]?.id).toBe(original.items[0]?.id);
      expect(parsed.items[0]?.title).toBe(original.items[0]?.title);
      expect(parsed.items[0]?.status).toBe(original.items[0]?.status);
      expect(parsed.items[0]?.tags).toEqual(original.items[0]?.tags);
      expect(parsed.items[0]?.body).toBe(original.items[0]?.body);
      expect(parsed.items[0]?.notes).toBe(original.items[0]?.notes);
    });

    it('preserves refs through serialize/deserialize cycle', () => {
      const original: TaskListContent = {
        title: 'Tasks',
        items: [
          {
            id: '1.1',
            title: 'Task with refs',
            status: 'todo',
            refs: ['user-auth/spec', 'payments/plan'],
          },
        ],
      };

      const markdown = taskListContentType.serialize(original);
      const parsed = taskListContentType.deserialize(
        markdown
      ) as TaskListContent;

      expect(parsed.items[0]?.refs).toEqual(original.items[0]?.refs);
    });
  });

  describe('content type metadata', () => {
    it('has correct id', () => {
      expect(taskListContentType.id).toBe('task-list');
    });

    it('has description', () => {
      expect(taskListContentType.description).toBe(
        'Task list with status tracking and structured items'
      );
    });
  });
});

// AC-15: item.add with valid data succeeds
describe('addTaskItem', () => {
  it('adds item to empty list', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [],
    };

    const newItem: TaskItem = {
      id: '1.1',
      title: 'New task',
      status: 'todo',
    };

    const updated = addTaskItem(content, newItem);

    expect(updated.items).toHaveLength(1);
    expect(updated.items[0]).toEqual(newItem);
  });

  it('adds item to existing list', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [
        {
          id: '1.1',
          title: 'First task',
          status: 'todo',
        },
      ],
    };

    const newItem: TaskItem = {
      id: '1.2',
      title: 'Second task',
      status: 'todo',
    };

    const updated = addTaskItem(content, newItem);

    expect(updated.items).toHaveLength(2);
    expect(updated.items[1]).toEqual(newItem);
  });

  it('adds item with all fields', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [],
    };

    const newItem: TaskItem = {
      id: '1.1',
      title: 'Complete task',
      status: 'done',
      tags: ['backend', 'urgent'],
      refs: ['user-auth/spec'],
      body: 'Task details',
      notes: 'Important notes',
    };

    const updated = addTaskItem(content, newItem);

    expect(updated.items[0]).toEqual(newItem);
  });

  // AC-15: item.add with missing required fields rejects
  it('throws TypeError when id is missing', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [],
    };

    const invalidItem = {
      title: 'Task',
      status: 'todo',
    } as TaskItem;

    expect(() => addTaskItem(content, invalidItem)).toThrow(TypeError);
    expect(() => addTaskItem(content, invalidItem)).toThrow(
      'Task item must have id and title'
    );
  });

  it('throws TypeError when title is missing', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [],
    };

    const invalidItem = {
      id: '1.1',
      status: 'todo',
    } as TaskItem;

    expect(() => addTaskItem(content, invalidItem)).toThrow(TypeError);
    expect(() => addTaskItem(content, invalidItem)).toThrow(
      'Task item must have id and title'
    );
  });

  it('throws TypeError for invalid item structure', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [],
    };

    const invalidItem = {
      id: '1.1',
      title: 'Task',
      status: 'todo',
      tags: 'not-an-array',
    } as unknown as TaskItem;

    expect(() => addTaskItem(content, invalidItem)).toThrow(TypeError);
    expect(() => addTaskItem(content, invalidItem)).toThrow(
      'Invalid task item structure'
    );
  });

  it('throws Error for duplicate id', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [
        {
          id: '1.1',
          title: 'Existing task',
          status: 'todo',
        },
      ],
    };

    const duplicateItem: TaskItem = {
      id: '1.1',
      title: 'Duplicate task',
      status: 'todo',
    };

    expect(() => addTaskItem(content, duplicateItem)).toThrow(Error);
    expect(() => addTaskItem(content, duplicateItem)).toThrow(
      "Task item with id '1.1' already exists"
    );
  });

  it('does not mutate original content', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [
        {
          id: '1.1',
          title: 'First task',
          status: 'todo',
        },
      ],
    };

    const newItem: TaskItem = {
      id: '1.2',
      title: 'Second task',
      status: 'todo',
    };

    addTaskItem(content, newItem);

    expect(content.items).toHaveLength(1);
  });
});

// IC-11: item.update modifies specified fields
describe('updateTaskItem', () => {
  it('updates item title', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [
        {
          id: '1.1',
          title: 'Old title',
          status: 'todo',
        },
      ],
    };

    const updated = updateTaskItem(content, '1.1', {
      title: 'New title',
    });

    expect(updated.items[0]?.title).toBe('New title');
  });

  it('updates item status', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [
        {
          id: '1.1',
          title: 'Task',
          status: 'todo',
        },
      ],
    };

    const updated = updateTaskItem(content, '1.1', {
      status: 'done',
    });

    expect(updated.items[0]?.status).toBe('done');
  });

  it('updates multiple fields', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [
        {
          id: '1.1',
          title: 'Task',
          status: 'todo',
        },
      ],
    };

    const updated = updateTaskItem(content, '1.1', {
      title: 'Updated task',
      status: 'done',
      tags: ['urgent'],
    });

    expect(updated.items[0]?.title).toBe('Updated task');
    expect(updated.items[0]?.status).toBe('done');
    expect(updated.items[0]?.tags).toEqual(['urgent']);
  });

  it('preserves unchanged fields', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [
        {
          id: '1.1',
          title: 'Task',
          status: 'todo',
          tags: ['backend'],
        },
      ],
    };

    const updated = updateTaskItem(content, '1.1', {
      status: 'done',
    });

    expect(updated.items[0]?.title).toBe('Task');
    expect(updated.items[0]?.tags).toEqual(['backend']);
  });

  it('throws Error for non-existent id', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [
        {
          id: '1.1',
          title: 'Task',
          status: 'todo',
        },
      ],
    };

    expect(() => updateTaskItem(content, '1.2', { status: 'done' })).toThrow(
      Error
    );
    expect(() => updateTaskItem(content, '1.2', { status: 'done' })).toThrow(
      "Task item with id '1.2' not found"
    );
  });

  it('throws TypeError for invalid update', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [
        {
          id: '1.1',
          title: 'Task',
          status: 'todo',
        },
      ],
    };

    const invalidUpdate = {
      tags: 'not-an-array',
    } as unknown as Partial<TaskItem>;

    expect(() => updateTaskItem(content, '1.1', invalidUpdate)).toThrow(
      TypeError
    );
    expect(() => updateTaskItem(content, '1.1', invalidUpdate)).toThrow(
      'Invalid task item after update'
    );
  });

  it('does not mutate original content', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [
        {
          id: '1.1',
          title: 'Old title',
          status: 'todo',
        },
      ],
    };

    updateTaskItem(content, '1.1', { title: 'New title' });

    expect(content.items[0]?.title).toBe('Old title');
  });
});

// IC-11: item.remove deletes item by ID
describe('removeTaskItem', () => {
  it('removes item from list', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [
        {
          id: '1.1',
          title: 'Task to remove',
          status: 'todo',
        },
        {
          id: '1.2',
          title: 'Task to keep',
          status: 'todo',
        },
      ],
    };

    const updated = removeTaskItem(content, '1.1');

    expect(updated.items).toHaveLength(1);
    expect(updated.items[0]?.id).toBe('1.2');
  });

  it('removes only item from list', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [
        {
          id: '1.1',
          title: 'Only task',
          status: 'todo',
        },
      ],
    };

    const updated = removeTaskItem(content, '1.1');

    expect(updated.items).toHaveLength(0);
  });

  it('throws Error for non-existent id', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [
        {
          id: '1.1',
          title: 'Task',
          status: 'todo',
        },
      ],
    };

    expect(() => removeTaskItem(content, '1.2')).toThrow(Error);
    expect(() => removeTaskItem(content, '1.2')).toThrow(
      "Task item with id '1.2' not found"
    );
  });

  it('does not mutate original content', () => {
    const content: TaskListContent = {
      title: 'Tasks',
      items: [
        {
          id: '1.1',
          title: 'Task',
          status: 'todo',
        },
      ],
    };

    removeTaskItem(content, '1.1');

    expect(content.items).toHaveLength(1);
  });
});
