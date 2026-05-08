import { getQueries } from '../database/db.js';
import { startTransfer } from './playlistTransferRunner.js';
import logger from '../utils/logger.js';

const queries = getQueries();

/**
 * Recovery service for stuck transfer jobs
 * Runs on server startup to resume or reset stuck transfers
 */

export function recoverStuckTransfers() {
  try {
    // Find all transfer jobs stuck in processing, fetching, or pending status
    const stuckJobs = queries.listTransferJobsByStatus
      ? queries.listTransferJobsByStatus.all('processing', 100, 0)
      : [];

    const fetchingJobs = queries.listTransferJobsByStatus
      ? queries.listTransferJobsByStatus.all('fetching', 100, 0)
      : [];

    const pendingJobs = queries.listTransferJobsByStatus
      ? queries.listTransferJobsByStatus.all('pending', 100, 0)
      : [];

    const allStuckJobs = [...stuckJobs, ...fetchingJobs, ...pendingJobs];

    if (allStuckJobs.length === 0) {
      logger.info('TRANSFER_RECOVERY', 'No stuck transfer jobs found');
      return;
    }

    logger.info('TRANSFER_RECOVERY', `Found ${allStuckJobs.length} stuck transfer jobs, attempting recovery`);

    for (const job of allStuckJobs) {
      try {
        const jobId = job.id;
        const updatedAt = new Date(job.updated_at);
        const now = new Date();
        const hoursSinceUpdate = (now - updatedAt) / (1000 * 60 * 60);

        logger.info('TRANSFER_RECOVERY', `Analyzing job ${jobId}`, {
          status: job.status,
          tracksProcessed: job.tracks_processed,
          totalTracks: job.total_tracks,
          hoursSinceUpdate: hoursSinceUpdate.toFixed(2)
        });

        // If job is pending, just restart it (it was likely reset manually or from previous recovery)
        if (job.status === 'pending') {
          logger.info('TRANSFER_RECOVERY', `Starting pending transfer job ${jobId}`);
          setTimeout(() => {
            startTransfer(jobId);
          }, 1000);
        }
        // If job hasn't been updated in over 10 minutes, it's likely stuck
        else if (hoursSinceUpdate > 0.16) {
          // Reset to pending and restart
          logger.info('TRANSFER_RECOVERY', `Resetting and restarting job ${jobId}`);

          queries.updateTransferJobStatus.run('pending', 'pending', 'pending', jobId);

          // Small delay to ensure database write completes
          setTimeout(() => {
            logger.info('TRANSFER_RECOVERY', `Starting transfer job ${jobId}`);
            startTransfer(jobId);
          }, 1000);
        }
      } catch (jobError) {
        logger.error('TRANSFER_RECOVERY', `Failed to recover job ${job.id}`, {
          error: jobError.message
        });
      }
    }
  } catch (error) {
    logger.error('TRANSFER_RECOVERY', 'Transfer recovery failed', {
      error: error.message
    });
  }
}

export default {
  recoverStuckTransfers
};
