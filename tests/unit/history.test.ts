import { describe, it, expect } from 'vitest';
import { EditHistory } from '@renderer/editor/history';

describe('Edit History and Undo/Redo', () => {
  it('records edits and supports undo and redo', () => {
    const history = new EditHistory('Initial');
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    history.push('Hello', { start: 5, end: 5 }, 'paste');
    expect(history.canUndo()).toBe(true);

    const undone = history.undo();
    expect(undone?.text).toBe('Initial');
    expect(history.canRedo()).toBe(true);

    const redone = history.redo();
    expect(redone?.text).toBe('Hello');
  });

  it('coalesces continuous single-character typing within threshold', () => {
    const history = new EditHistory('');
    history.push('a', { start: 1, end: 1 }, 'type');
    history.push('ab', { start: 2, end: 2 }, 'type');
    history.push('abc', { start: 3, end: 3 }, 'type');

    // Should be coalesced into 1 change from initial ''
    const undone = history.undo();
    expect(undone?.text).toBe('');
  });
});
