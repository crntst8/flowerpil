const hasWindow = typeof window !== 'undefined';

/**
 * Schedule a callback to run when the browser is idle (with a timeout fallback).
 * Returns the handle that can be cancelled via cancelIdleTask.
 */
export function scheduleIdleTask(callback, { timeout = 500 } = {}) {
  if (!callback) return null;

  if (hasWindow && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(
      (deadline) => {
        try {
          callback(deadline);
        } catch (error) {
          console.error('Idle task error:', error);
        }
      },
      { timeout }
    );
  }

  // Fallback to setTimeout on environments without requestIdleCallback
  return setTimeout(() => {
    try {
      callback();
    } catch (error) {
      console.error('Idle task error:', error);
    }
  }, timeout);
}

/**
 * Cancel a scheduled idle task created via scheduleIdleTask.
 */
export function cancelIdleTask(handle) {
  if (handle == null) return;

  if (hasWindow && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(handle);
  } else {
    clearTimeout(handle);
  }
}
