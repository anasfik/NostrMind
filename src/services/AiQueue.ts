type Task<T> = () => Promise<T>;

/**
 * Serial, rate-limited queue for AI provider calls.
 *
 * - Tasks run one at a time (no parallel AI requests).
 * - A sliding-window token bucket enforces `requestsPerMinute`.
 *   When the limit is reached the next task waits until a slot opens.
 * - Set `requestsPerMinute = 0` to disable rate limiting (unlimited).
 */
export class AiQueue {
  private chain: Promise<void> = Promise.resolve();
  private readonly timestamps: number[] = [];
  private _pending = 0;

  constructor(
    private readonly requestsPerMinute: number,
    private readonly onThrottle?: (waitMs: number) => void,
  ) {}

  /** Number of tasks waiting or currently executing. */
  get pending(): number {
    return this._pending;
  }

  enqueue<T>(task: Task<T>): Promise<T> {
    this._pending++;

    const result: Promise<T> = this.chain.then(async () => {
      try {
        await this.throttle();
        this.timestamps.push(Date.now());
        return await task();
      } finally {
        this._pending--;
      }
    });

    // Advance the chain; swallow errors so a failed task never jams the queue.
    this.chain = result.then(
      () => {},
      () => {},
    );

    return result;
  }

  private async throttle(): Promise<void> {
    if (this.requestsPerMinute <= 0) return; // unlimited

    const windowMs = 60_000;
    const now = Date.now();

    // Evict timestamps that have exited the sliding window.
    while (this.timestamps.length > 0 && now - this.timestamps[0] >= windowMs) {
      this.timestamps.shift();
    }

    if (this.timestamps.length < this.requestsPerMinute) return;

    // Wait until the oldest timestamp exits the window, then re-check.
    const waitMs = windowMs - (now - this.timestamps[0]) + 10;
    this.onThrottle?.(waitMs);
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    return this.throttle();
  }
}
