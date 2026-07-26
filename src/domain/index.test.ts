import { describe, it, expect } from 'vitest';
import { BACKLOG_STATUSES, PRIORITIES, ITEM_TYPES } from './index.js';

describe('Domain constants', () => {
  it('should have valid backlog statuses', () => {
    expect(BACKLOG_STATUSES).toContain('todo');
    expect(BACKLOG_STATUSES).toContain('ready');
    expect(BACKLOG_STATUSES).toContain('in_progress');
    expect(BACKLOG_STATUSES).toContain('blocked');
    expect(BACKLOG_STATUSES).toContain('done');
    expect(BACKLOG_STATUSES).toContain('cancelled');
    expect(BACKLOG_STATUSES).toHaveLength(6);
  });

  it('should have valid priorities', () => {
    expect(PRIORITIES).toContain('critical');
    expect(PRIORITIES).toContain('high');
    expect(PRIORITIES).toContain('medium');
    expect(PRIORITIES).toContain('low');
    expect(PRIORITIES).toHaveLength(4);
  });

  it('should have valid item types', () => {
    expect(ITEM_TYPES).toContain('feature');
    expect(ITEM_TYPES).toContain('bug');
    expect(ITEM_TYPES).toContain('improvement');
    expect(ITEM_TYPES).toContain('documentation');
    expect(ITEM_TYPES).toHaveLength(4);
  });
});
