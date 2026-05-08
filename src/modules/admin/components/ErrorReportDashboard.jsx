import React, { useState, useEffect } from 'react';
import { useAuthenticatedApi } from '../hooks/useAuthenticatedApi.js';
import { adminFetch, handleJsonResponse } from '../utils/adminApi.js';

function ErrorReportDashboard() {
  const { authenticatedFetch } = useAuthenticatedApi();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    try {
      setLoading(true);
      setError(null);
      const response = await authenticatedFetch('/api/v1/admin/error-reports');
      const data = await handleJsonResponse(response);
      setReports(data.reports || []);
    } catch (err) {
      setError(err.message || 'Failed to load error reports');
      console.error('Failed to load error reports:', err);
    } finally {
      setLoading(false);
    }
  }

  async function applyFix(reportId, requiresConfirm) {
    if (requiresConfirm && !confirm('This fix requires confirmation. Continue?')) {
      return;
    }

    try {
      const response = await adminFetch(`/api/v1/admin/error-reports/${reportId}/fix`, {
        method: 'POST',
        body: JSON.stringify({ confirmed: true })
      });

      const result = await handleJsonResponse(response);
      if (result.success) {
        alert(result.result.message || 'Fix applied successfully');
        loadReports();
      } else {
        alert(result.error || 'Failed to apply fix');
      }
    } catch (err) {
      alert(err.message || 'Failed to apply fix');
      console.error('Failed to apply fix:', err);
    }
  }

  async function markResolved(reportId) {
    try {
      const response = await adminFetch(`/api/v1/admin/error-reports/${reportId}/resolve`, {
        method: 'POST'
      });

      const result = await handleJsonResponse(response);
      if (result.success) {
        loadReports();
      }
    } catch (err) {
      alert(err.message || 'Failed to mark as resolved');
      console.error('Failed to mark as resolved:', err);
    }
  }

  const severityColors = {
    CRITICAL: '#dc3545',
    HIGH: '#fd7e14',
    MEDIUM: '#ffc107',
    LOW: '#6c757d'
  };

  if (loading) {
    return <div>Loading error reports...</div>;
  }

  if (error) {
    return <div style={{ color: 'red' }}>Error: {error}</div>;
  }

  return (
    <div>
      {reports.length === 0 ? (
        <p>No unresolved errors</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '10px', textAlign: 'left' }}>Severity</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Classification</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Message</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Occurrences</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Last Seen</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={String(r.id || Math.random())} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px' }}>
                  <span style={{ color: severityColors[r.severity] || '#6c757d', fontWeight: 'bold' }}>
                    {String(r.severity || 'UNKNOWN')}
                  </span>
                </td>
                <td style={{ padding: '10px' }}>{String(r.classification || 'UNKNOWN')}</td>
                <td style={{ padding: '10px' }}>
                  {r.error_message ? String(r.error_message).substring(0, 80) : 'No message'}
                  {r.error_message && r.error_message.length > 80 ? '...' : ''}
                </td>
                <td style={{ padding: '10px' }}>{String(r.occurrences || 0)}</td>
                <td style={{ padding: '10px' }}>
                  {r.last_seen_at ? new Date(r.last_seen_at).toLocaleString() : 'Unknown'}
                </td>
                <td style={{ padding: '10px' }}>
                  {r.suggested_fix && !r.fix_applied && (
                    <button
                      onClick={() => applyFix(r.id, false)}
                      style={{
                        padding: '5px 10px',
                        marginRight: '5px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      Apply Fix
                    </button>
                  )}
                  {r.fix_applied && (
                    <span style={{ color: 'green', marginRight: '10px' }}>Fixed</span>
                  )}
                  <a
                    href={`/admin/errors/${r.id}`}
                    style={{ marginRight: '10px' }}
                  >
                    Details
                  </a>
                  <button
                    onClick={() => markResolved(r.id)}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    Resolve
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default ErrorReportDashboard;

