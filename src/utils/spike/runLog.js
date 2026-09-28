/**
 * SPIKE Prime run-lifecycle logging, shared by the REPL (SPIKEEditor) and
 * Hub OS (useSpikeHub) paths so every run — whichever mode started it —
 * is logged as one start event followed by one end event in `interactions`.
 * DATA_COLLECTION.md documents these values; keep the two in sync.
 */

export const SPIKE_RUN = {
  // Start
  STARTED_REPL: 'spike_run_started_repl', // editor code sent to the USB REPL
  STARTED_APP: 'spike_run_started_app', // slot program started by "Download and Run"
  STARTED_HUB: 'spike_run_started_hub', // slot program started with the hub's own button
  // End
  ENDED: 'spike_run_ended', // finished on its own (or, in slot mode, the hub's button)
  ERROR: 'spike_run_error', // ended with an uncaught exception (traceback)
  STOPPED: 'spike_run_stopped', // stopped from the app (Stop, Reset, re-run, new download, mode switch)
};

// Output kept per run for error detection; tracebacks print at the end, so
// the tail is what matters.
export const RUN_OUTPUT_LIMIT = 20000;

/**
 * True when `output` contains a MicroPython traceback for a real error.
 * KeyboardInterrupt (how Stop / Ctrl-C unwinds a program) doesn't count.
 * REPL paste echoes ("=== ...") never start a line with an exception name.
 */
export function endedWithError(output) {
  if (!output || !output.includes('Traceback (most recent call last)')) return false;
  return /^[A-Za-z_][\w.]*(Error|Exception)\b/m.test(output);
}

export const runEndEvent = ({ stopped, output }) => {
  if (stopped) return SPIKE_RUN.STOPPED;
  return endedWithError(output) ? SPIKE_RUN.ERROR : SPIKE_RUN.ENDED;
};
