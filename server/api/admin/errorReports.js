import express from 'express';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';
import { errorReportService } from '../../services/errorReportService.js';
import { SCRIPTS, executeScript } from '../../services/rectificationScripts.js';
import { getDatabase } from '../../database/db.js';

const router = express.Router();

// List error reports
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const reports = await errorReportService.getUnresolved();
    res.json({ reports });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get error details
router.get('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const db = getDatabase();
    const report = db.prepare('SELECT * FROM error_reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Not found' });

    const script = report.suggested_fix ? SCRIPTS[report.suggested_fix] : null;

    res.json({
      report: {
        ...report,
        context: JSON.parse(report.context_data || '{}'),
        fixResult: report.fix_result ? JSON.parse(report.fix_result) : null
      },
      script: script ? { name: script.name, risk: script.risk } : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute fix script
router.post('/:id/fix', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const db = getDatabase();
    const report = db.prepare('SELECT * FROM error_reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Not found' });
    if (!report.suggested_fix) return res.status(400).json({ error: 'No fix available' });
    if (report.fix_applied) return res.status(400).json({ error: 'Fix already applied' });

    const script = SCRIPTS[report.suggested_fix];
    if (!script) return res.status(400).json({ error: 'Unknown script' });

    if (script.risk === 'MEDIUM' && !req.body.confirmed) {
      return res.status(400).json({
        error: 'Confirmation required',
        requiresConfirmation: true,
        risk: script.risk
      });
    }

    const result = await executeScript(report.suggested_fix, req.user, report.id, req);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark as resolved
router.post('/:id/resolve', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const db = getDatabase();
    db.prepare('UPDATE error_reports SET resolved = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;







