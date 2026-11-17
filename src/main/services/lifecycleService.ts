/**
 * Small piece of renderer-reported state that main needs for lifecycle
 * decisions. Label text itself never leaves the renderer; main only learns
 * whether there is anything worth confirming before the window closes.
 */
export class LifecycleService {
  private hasLabelText = false;

  setLabelHasText(hasText: boolean): void {
    this.hasLabelText = hasText;
  }

  labelHasText(): boolean {
    return this.hasLabelText;
  }
}
