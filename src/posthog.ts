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
) => void;

/**
 * Create a LogOutput that forwards entries to PostHog.
 * Swallows errors from the capture function — logging must not break the app.
 */
export function createPostHogOutput(capture: PostHogCapture): LogOutput {
  return (entry: LogEntry): void => {
    try {
      const { event, ...properties } = entry;
      capture(event, properties);
    } catch {
      // Swallowed — logging failures must not propagate
    }
  };
}
