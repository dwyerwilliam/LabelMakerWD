export interface HistoryEntry {
  text: string;
  selection: { start: number; end: number };
  timestamp: number;
  actionType: 'type' | 'paste' | 'delete' | 'other';
}

export class EditHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private readonly maxEntries = 200;
  private readonly coalesceMs = 800;

  constructor(initialText = '', initialSelection = { start: 0, end: 0 }) {
    this.undoStack.push({
      text: initialText,
      selection: initialSelection,
      timestamp: Date.now(),
      actionType: 'other',
    });
  }

  push(
    text: string,
    selection = { start: text.length, end: text.length },
    actionType: 'type' | 'paste' | 'delete' | 'other' = 'type'
  ): void {
    const last = this.undoStack[this.undoStack.length - 1];
    const now = Date.now();

    if (
      last &&
      last.actionType === 'type' &&
      actionType === 'type' &&
      now - last.timestamp < this.coalesceMs &&
      Math.abs(text.length - last.text.length) === 1
    ) {
      // Coalesce continuous typing
      last.text = text;
      last.selection = selection;
      last.timestamp = now;
      this.redoStack = [];
      return;
    }

    if (last && last.text === text) {
      // Text did not change
      last.selection = selection;
      return;
    }

    this.undoStack.push({
      text,
      selection,
      timestamp: now,
      actionType,
    });

    if (this.undoStack.length > this.maxEntries) {
      this.undoStack.shift();
    }

    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): HistoryEntry | null {
    if (!this.canUndo()) return null;

    const current = this.undoStack.pop()!;
    this.redoStack.push(current);

    return this.undoStack[this.undoStack.length - 1];
  }

  redo(): HistoryEntry | null {
    if (!this.canRedo()) return null;

    const entry = this.redoStack.pop()!;
    this.undoStack.push(entry);

    return entry;
  }

  reset(text = '', selection = { start: 0, end: 0 }): void {
    this.undoStack = [
      {
        text,
        selection,
        timestamp: Date.now(),
        actionType: 'other',
      },
    ];
    this.redoStack = [];
  }
}
