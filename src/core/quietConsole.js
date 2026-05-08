// Silences browser console output by default.
// Set VITE_ENABLE_CONSOLE=true to re-enable logging.

const enableConsole = import.meta?.env?.VITE_ENABLE_CONSOLE === 'true';

if (typeof window !== 'undefined' && typeof window.console !== 'undefined' && !enableConsole) {
  const noop = () => {};
  const methods = [
    'log',
    'info',
    'debug',
    'warn',
    'error',
    'trace',
    'group',
    'groupCollapsed',
    'groupEnd',
    'table',
    'dir',
  ];

  for (const method of methods) {
    try {
      // Some environments freeze console; replace safely where possible
      if (typeof window.console[method] === 'function') {
        window.console[method] = noop;
      } else {
        window.console[method] = noop;
      }
    } catch (_err) {
      // Ignore inability to redefine in certain environments
    }
  }
}

