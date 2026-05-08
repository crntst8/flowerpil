import logger from './logger.js';
import { errorReportService } from '../services/errorReportService.js';

// Capture uncaught exceptions before process exits
process.on('uncaughtException', async (error, origin) => {
  try {
    await errorReportService.captureError({
      type: 'UNCAUGHT_EXCEPTION',
      error,
      severity: 'CRITICAL',
      context: { origin, pid: process.pid }
    });
  } catch (e) {
    console.error('Failed to log error:', e);
  }

  // Allow graceful shutdown
  setTimeout(() => process.exit(1), 1000);
});

// Capture unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  try {
    await errorReportService.captureError({
      type: 'UNHANDLED_REJECTION',
      error: reason,
      severity: 'HIGH',
      context: { promise: String(promise) }
    });
  } catch (e) {
    console.error('Failed to log unhandled rejection:', e);
  }
});

// Export for worker error capture
export async function captureWorkerError(workerName, error, context) {
  return errorReportService.captureError({
    type: 'WORKER_FAILURE',
    error,
    severity: 'HIGH',
    context: { workerName, ...context }
  });
}







