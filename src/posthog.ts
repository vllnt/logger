/**
 * @vllnt/logger — PostHog output adapter.
 *
 * Wraps a PostHog-style capture function as a LogOutput.
 * No PostHog SDK dependency — consumer passes their own capture fn.
 */

import type { LogEntry, LogOutput } from "./core.js";

/** PostHog-compatible capture function signature */
export type PostHogCapture = (
  event: string,
  properties?: Record<string, unknown>,
) => unknown;

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Create a LogOutput that forwards entries to PostHog.
 * Swallows errors from the capture function, including rejected promises it
 * returns — logging must not break the app.
 */
export function createPostHogOutput(capture: PostHogCapture): LogOutput {
  return (entry: LogEntry): void => {
    try {
      const { event, ...properties } = entry;
      const result = capture(event, properties);
      if (isThenable(result)) {
        Promise.resolve(result).catch(() => {
          // Swallowed — async capture failures must not become unhandled rejections
        });
      }
    } catch {
      // Swallowed — logging failures must not propagate
    }
  };
}
