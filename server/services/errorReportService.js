import logger from '../utils/logger.js';
import { getDatabase } from '../database/db.js';
import { errorAlertService } from './errorAlertService.js';

class ErrorReportService {
  constructor() {
    this.db = getDatabase();
  }

  async captureError({ type, error, severity, context = {} }) {
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack || '';

    // Classify error using pattern matching
    const classification = this.classifyError(errorMessage, context);

    // Check for duplicate in last 5 minutes
    const existing = await this.findRecentDuplicate(classification.name, errorMessage);

    if (existing) {
      await this.incrementOccurrences(existing.id);
      return existing;
    }

    // Create new error report
    const report = await this.createReport({
      type,
      classification: classification.name,
      severity,
      errorMessage,
      errorStack,
      context,
      suggestedFix: classification.suggestedFix
    });

    // Log to error.log
    logger.error('Error captured', { errorReportId: report.id, classification: classification.name });

    // Send Slack alert for HIGH/CRITICAL
    if (severity === 'HIGH' || severity === 'CRITICAL') {
      await errorAlertService.sendAlert(report).catch(err => {
        logger.error('Failed to send error alert', { error: err });
      });
    }

    return report;
  }

  classifyError(message, context) {
    // Pattern matching for known issues
    if (message.includes('import') && message.includes('lock')) {
      return { name: 'STALE_IMPORT_LOCK', suggestedFix: 'RELEASE_IMPORT_LOCKS' };
    }
    if (message.includes('token') && (message.includes('expired') || message.includes('401'))) {
      return { name: 'TOKEN_EXPIRED', suggestedFix: 'REFRESH_TOKENS' };
    }
    if (message.includes('export') && message.includes('stuck')) {
      return { name: 'STALLED_EXPORT', suggestedFix: 'RESET_EXPORTS' };
    }
    if (context.workerName && message.includes('timeout')) {
      return { name: 'WORKER_TIMEOUT', suggestedFix: 'CHECK_WORKER_HEALTH' };
    }
    if (message.includes('SQLITE') || message.includes('database')) {
      return { name: 'DATABASE_ERROR', suggestedFix: 'CHECK_DATABASE' };
    }

    return { name: 'UNKNOWN', suggestedFix: null };
  }

  async createReport(data) {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO error_reports (
        error_type, classification, severity,
        error_message, error_stack, context_data,
        suggested_fix, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.type,
      data.classification,
      data.severity,
      data.errorMessage,
      data.errorStack,
      JSON.stringify(data.context),
      data.suggestedFix,
      now,
      now
    );

    return { id: result.lastInsertRowid, ...data, occurrences: 1 };
  }

  async findRecentDuplicate(classification, message) {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    return this.db.prepare(`
      SELECT * FROM error_reports
      WHERE classification = ? AND error_message = ? AND last_seen_at > ?
      LIMIT 1
    `).get(classification, message, cutoff);
  }

  async incrementOccurrences(id) {
    this.db.prepare(`
      UPDATE error_reports
      SET occurrences = occurrences + 1, last_seen_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id);
  }

  async getUnresolved(limit = 50) {
    return this.db.prepare(`
      SELECT * FROM error_reports
      WHERE resolved = 0
      ORDER BY
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          ELSE 4
        END,
        last_seen_at DESC
      LIMIT ?
    `).all(limit);
  }
}

export const errorReportService = new ErrorReportService();

