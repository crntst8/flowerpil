import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import { useAuthenticatedApi } from '../hooks/useAuthenticatedApi';

const SecurityContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xl};
`;

const DashboardSection = styled.div`
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: ${theme.spacing.md};
    
    h2 {
      font-family: ${theme.fonts.mono};
      color: ${theme.colors.white};
      margin: 0;
    }
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.lg};
`;

const StatCard = styled(DashedBox)`
  padding: ${theme.spacing.md};
  text-align: center;
  
  .stat-number {
    font-size: ${theme.fontSizes.large};
    font-family: ${theme.fonts.mono};
    font-weight: bold;
    margin-bottom: ${theme.spacing.xs};
  }
  
  .stat-label {
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.gray[400]};
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  &.critical {
    .stat-number {
      color: #ef4444;
    }
  }
  
  &.warning {
    .stat-number {
      color: #f59e0b;
    }
  }
  
  &.good {
    .stat-number {
      color: #4ade80;
    }
  }
`;

const IncidentsList = styled.div`
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  border-radius: 4px;
  max-height: 400px;
  overflow-y: auto;
`;

const IncidentItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  border-bottom: ${theme.borders.dashed} rgba(255, 255, 255, 0.1);
  
  &:last-child {
    border-bottom: none;
  }
  
  .incident-info {
    flex: 1;
    
    .incident-title {
      font-family: ${theme.fonts.mono};
      font-weight: bold;
      margin-bottom: ${theme.spacing.xs};
      display: flex;
      align-items: center;
      gap: ${theme.spacing.sm};
    }
    
    .incident-details {
      font-size: ${theme.fontSizes.small};
      color: ${theme.colors.gray[400]};
      margin-bottom: ${theme.spacing.xs};
    }
    
    .incident-meta {
      display: flex;
      gap: ${theme.spacing.md};
      font-size: ${theme.fontSizes.tiny};
      color: ${theme.colors.gray[500]};
    }
  }
  
  .incident-actions {
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing.xs};
  }
  
  &.resolved {
    opacity: 0.6;
    
    .incident-title {
      text-decoration: line-through;
    }
  }
  
  &.critical {
    border-left: 3px solid #ef4444;
  }
  
  &.high {
    border-left: 3px solid #f59e0b;
  }
  
  &.medium {
    border-left: 3px solid #3b82f6;
  }
  
  &.low {
    border-left: 3px solid ${theme.colors.gray[400]};
  }
`;

const SeverityBadge = styled.span`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.dashed};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 2px;
  
  &.critical {
    border-color: #ef4444;
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }
  
  &.high {
    border-color: #f59e0b;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.1);
  }
  
  &.medium {
    border-color: #3b82f6;
    color: #3b82f6;
    background: rgba(59, 130, 246, 0.1);
  }
  
  &.low {
    border-color: ${theme.colors.gray[400]};
    color: ${theme.colors.gray[400]};
    background: rgba(255, 255, 255, 0.05);
  }
`;

const ActionButton = styled.button`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${theme.colors.gray[400]};
  background: transparent;
  color: ${theme.colors.gray[400]};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  
  &:hover:not(:disabled) {
    border-color: ${theme.colors.white};
    color: ${theme.colors.white};
    background: rgba(255, 255, 255, 0.05);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &.success {
    border-color: #4ade80;
    color: #4ade80;
    
    &:hover:not(:disabled) {
      background: rgba(74, 222, 128, 0.1);
    }
  }
  
  &.danger {
    border-color: #ef4444;
    color: #ef4444;
    
    &:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.1);
    }
  }
`;

const RestrictionsSection = styled.div`
  .section-header {
    margin-bottom: ${theme.spacing.md};
    
    h3 {
      font-family: ${theme.fonts.mono};
      color: ${theme.colors.white};
      margin: 0;
    }
  }
`;

const RestrictionsTable = styled.div`
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  border-radius: 4px;
  overflow-x: auto;
`;

const RestrictionRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 120px 150px 120px 80px;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  border-bottom: ${theme.borders.dashed} rgba(255, 255, 255, 0.1);
  align-items: center;
  
  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  
  &:last-child {
    border-bottom: none;
  }
  
  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.sm};
  }
`;

const RestrictionInfo = styled.div`
  .user-identifier {
    font-family: ${theme.fonts.mono};
    font-weight: bold;
    color: ${theme.colors.white};
    margin-bottom: ${theme.spacing.xs};
  }
  
  .restriction-reason {
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.gray[400]};
  }
`;

const NewRestrictionForm = styled(DashedBox)`
  padding: ${theme.spacing.lg};
  margin-top: ${theme.spacing.lg};
  
  .form-header {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.medium};
    color: ${theme.colors.white};
    margin-bottom: ${theme.spacing.md};
  }
  
  .form-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: ${theme.spacing.md};
    margin-bottom: ${theme.spacing.md};
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing.xs};
    
    label {
      font-family: ${theme.fonts.mono};
      font-size: ${theme.fontSizes.small};
      color: ${theme.colors.gray[300]};
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    input, select, textarea {
      background: transparent;
      border: ${theme.borders.dashed} ${theme.colors.gray[300]};
      color: ${theme.colors.white};
      padding: ${theme.spacing.sm} ${theme.spacing.md};
      font-family: ${theme.fonts.mono};
      font-size: ${theme.fontSizes.small};
      
      &:focus {
        outline: none;
        border-color: ${theme.colors.white};
      }
      
      &::placeholder {
        color: ${theme.colors.gray[500]};
      }
    }
    
    select {
      cursor: pointer;
      
      option {
        background: ${theme.colors.black};
        color: ${theme.colors.white};
      }
    }
    
    textarea {
      min-height: 60px;
      resize: vertical;
    }
  }
  
  .form-actions {
    display: flex;
    gap: ${theme.spacing.md};
    margin-top: ${theme.spacing.lg};
  }
`;

const FilterBar = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  align-items: center;
  margin-bottom: ${theme.spacing.md};
  flex-wrap: wrap;
  
  select {
    background: transparent;
    border: ${theme.borders.dashed} ${theme.colors.gray[300]};
    color: ${theme.colors.white};
    padding: ${theme.spacing.sm} ${theme.spacing.md};
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    cursor: pointer;
    
    &:focus {
      outline: none;
      border-color: ${theme.colors.white};
    }
    
    option {
      background: ${theme.colors.black};
      color: ${theme.colors.white};
    }
  }
`;

const LoadingMessage = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.gray[400]};
  font-family: ${theme.fonts.mono};
`;

const ErrorMessage = styled.div`
  color: #ef4444;
  padding: ${theme.spacing.md};
  border: ${theme.borders.dashed} #ef4444;
  background: rgba(239, 68, 68, 0.1);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  margin-bottom: ${theme.spacing.md};
`;

const SecurityMonitor = () => {
  const { authenticatedFetch } = useAuthenticatedApi();
  
  const [dashboardData, setDashboardData] = useState({});
  const [incidents, setIncidents] = useState([]);
  const [restrictions, setRestrictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // New restriction form
  const [showRestrictionForm, setShowRestrictionForm] = useState(false);
  const [restrictionForm, setRestrictionForm] = useState({
    user_identifier: '',
    restriction_type: 'temporary_ban',
    reason: '',
    expires_in_hours: 24
  });

  // Load dashboard data
  const loadDashboard = async () => {
    try {
      const response = await authenticatedFetch('/api/v1/admin/security-monitor/dashboard');
      const data = await response.json();
      setDashboardData(data);
      setIncidents(data.recent_incidents || []);
    } catch (err) {
      console.error('Failed to load security dashboard:', err);
    }
  };

  // Load incidents with filters
  const loadIncidents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authenticatedFetch('/api/v1/admin/security-monitor/incidents?' + 
        new URLSearchParams({ severity: severityFilter || '', status: statusFilter || '' }));
      const data = await response.json();
      
      setIncidents(data.incidents || []);
    } catch (err) {
      setError(`Failed to load incidents: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Load user restrictions
  const loadRestrictions = async () => {
    try {
      const response = await authenticatedFetch('/api/v1/admin/security-monitor/user-restrictions');
      const data = await response.json();
      setRestrictions(data.restrictions || []);
    } catch (err) {
      console.error('Failed to load restrictions:', err);
    }
  };

  // Resolve incident
  const resolveIncident = async (incidentId, resolutionNotes = '') => {
    try {
      await authenticatedFetch(`/api/v1/admin/security-monitor/incident/${incidentId}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_notes: resolutionNotes })
      });
      
      await loadIncidents();
    } catch (err) {
      setError(`Failed to resolve incident: ${err.message}`);
    }
  };

  // Update incident severity
  const updateIncidentSeverity = async (incidentId, severity) => {
    try {
      await authenticatedFetch(`/api/v1/admin/security-monitor/incident/${incidentId}/severity`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ severity })
      });
      
      await loadIncidents();
    } catch (err) {
      setError(`Failed to update severity: ${err.message}`);
    }
  };

  // Create user restriction
  const createRestriction = async (e) => {
    e.preventDefault();
    
    if (!restrictionForm.user_identifier.trim()) {
      setError('User identifier is required');
      return;
    }
    
    try {
      await authenticatedFetch('/api/v1/admin/security-monitor/user-restriction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(restrictionForm)
      });
      
      // Reset form and reload data
      setRestrictionForm({
        user_identifier: '',
        restriction_type: 'temporary_ban',
        reason: '',
        expires_in_hours: 24
      });
      setShowRestrictionForm(false);
      await loadRestrictions();
    } catch (err) {
      setError(`Failed to create restriction: ${err.message}`);
    }
  };

  // Remove user restriction
  const removeRestriction = async (restrictionId) => {
    if (!window.confirm('Remove this user restriction?')) {
      return;
    }
    
    try {
      await authenticatedFetch(`/api/v1/admin/security-monitor/user-restriction/${restrictionId}`, {
        method: 'DELETE'
      });
      
      await loadRestrictions();
    } catch (err) {
      setError(`Failed to remove restriction: ${err.message}`);
    }
  };

  // Load all data on component mount
  useEffect(() => {
    loadDashboard();
    loadRestrictions();
    loadIncidents();
  }, []);

  // Reload incidents when filters change
  useEffect(() => {
    loadIncidents();
  }, [severityFilter, statusFilter]);

  const overview = dashboardData.overview || {};

  return (
    <SecurityContainer>
      {/* Security Dashboard */}
      <DashboardSection>
        <div className="section-header">
          <h2>Security Overview</h2>
          <Button onClick={loadDashboard} size="small">
            Refresh Dashboard
          </Button>
        </div>
        
        <StatsGrid>
          <StatCard className={overview.critical_incidents > 0 ? 'critical' : 'good'}>
            <div className="stat-number">{overview.critical_incidents || 0}</div>
            <div className="stat-label">Critical Incidents</div>
          </StatCard>
          
          <StatCard className={overview.unresolved_incidents > 5 ? 'warning' : 'good'}>
            <div className="stat-number">{overview.unresolved_incidents || 0}</div>
            <div className="stat-label">Unresolved</div>
          </StatCard>
          
          <StatCard className={overview.recent_incidents > 10 ? 'warning' : 'good'}>
            <div className="stat-number">{overview.recent_incidents || 0}</div>
            <div className="stat-label">Recent (24h)</div>
          </StatCard>
          
          <StatCard>
            <div className="stat-number">{overview.total_incidents || 0}</div>
            <div className="stat-label">Total Incidents</div>
          </StatCard>
        </StatsGrid>
      </DashboardSection>

      {/* Security Incidents */}
      <DashboardSection>
        <div className="section-header">
          <h2>Security Incidents</h2>
        </div>
        
        <FilterBar>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
          >
            <option value="">All Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="unresolved">Unresolved</option>
            <option value="resolved">Resolved</option>
          </select>
          
          <Button onClick={loadIncidents} disabled={loading} size="small">
            Refresh Incidents
          </Button>
        </FilterBar>
        
        {loading && incidents.length === 0 ? (
          <LoadingMessage>Loading security incidents...</LoadingMessage>
        ) : incidents.length === 0 ? (
          <LoadingMessage>No security incidents found</LoadingMessage>
        ) : (
          <IncidentsList>
            {incidents.map((incident) => (
              <IncidentItem 
                key={incident.id} 
                className={`${incident.severity} ${incident.resolved ? 'resolved' : ''}`}
              >
                <div className="incident-info">
                  <div className="incident-title">
                    <SeverityBadge className={incident.severity}>
                      {incident.severity}
                    </SeverityBadge>
                    {incident.incident_type?.replace(/_/g, ' ').toUpperCase() || 'Security Incident'}
                  </div>
                  
                  <div className="incident-details">
                    {incident.details ? 
                      (typeof incident.details === 'string' ? incident.details : JSON.stringify(incident.details))
                      : 'No additional details'
                    }
                  </div>
                  
                  <div className="incident-meta">
                    {incident.user_identifier && (
                      <span>User: {incident.user_identifier}</span>
                    )}
                    {incident.ip_address && (
                      <span>IP: {incident.ip_address}</span>
                    )}
                    <span>{new Date(incident.timestamp).toLocaleString()}</span>
                  </div>
                  
                  {incident.resolved && incident.resolution_notes && (
                    <div style={{ 
                      marginTop: theme.spacing.xs, 
                      padding: theme.spacing.xs,
                      background: 'rgba(74, 222, 128, 0.1)',
                      border: `1px dashed #4ade80`,
                      fontSize: theme.fontSizes.small,
                      color: '#4ade80'
                    }}>
                      Resolution: {incident.resolution_notes}
                    </div>
                  )}
                </div>
                
                <div className="incident-actions">
                  {!incident.resolved && (
                    <>
                      <ActionButton
                        className="success"
                        onClick={() => resolveIncident(incident.id, `Resolved by admin at ${new Date().toLocaleString()}`)}
                      >
                        Resolve
                      </ActionButton>
                      
                      {incident.severity !== 'critical' && (
                        <ActionButton
                          className="danger"
                          onClick={() => updateIncidentSeverity(incident.id, 'critical')}
                        >
                          Escalate
                        </ActionButton>
                      )}
                    </>
                  )}
                </div>
              </IncidentItem>
            ))}
          </IncidentsList>
        )}
      </DashboardSection>

      {/* User Restrictions */}
      <RestrictionsSection>
        <div className="section-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Active User Restrictions</h3>
            <Button 
              onClick={() => setShowRestrictionForm(!showRestrictionForm)}
              variant="warning"
              size="small"
            >
              {showRestrictionForm ? 'Cancel' : 'New Restriction'}
            </Button>
          </div>
        </div>
        
        <RestrictionsTable>
          {restrictions.length === 0 ? (
            <div style={{ padding: theme.spacing.md, textAlign: 'center', color: theme.colors.gray[400] }}>
              No active user restrictions
            </div>
          ) : (
            restrictions.map((restriction) => (
              <RestrictionRow key={restriction.id}>
                <RestrictionInfo>
                  <div className="user-identifier">{restriction.user_identifier}</div>
                  <div className="restriction-reason">{restriction.reason || 'No reason provided'}</div>
                </RestrictionInfo>
                
                <div>
                  <SeverityBadge className="medium">
                    {restriction.restriction_type?.replace(/_/g, ' ') || 'Restriction'}
                  </SeverityBadge>
                </div>
                
                <div>
                  Applied: {new Date(restriction.applied_at).toLocaleDateString()}
                </div>
                
                <div>
                  {restriction.expires_at 
                    ? `Expires: ${new Date(restriction.expires_at).toLocaleDateString()}`
                    : 'Permanent'
                  }
                </div>
                
                <div>
                  <ActionButton
                    className="danger"
                    onClick={() => removeRestriction(restriction.id)}
                  >
                    Remove
                  </ActionButton>
                </div>
              </RestrictionRow>
            ))
          )}
        </RestrictionsTable>
        
        {/* New Restriction Form */}
        {showRestrictionForm && (
          <NewRestrictionForm as="form" onSubmit={createRestriction}>
            <div className="form-header">Create User Restriction</div>
            
            <div className="form-row">
              <div className="form-group">
                <label>User Identifier *</label>
                <input
                  type="text"
                  placeholder="Email, IP address, or identifier"
                  value={restrictionForm.user_identifier}
                  onChange={(e) => setRestrictionForm({
                    ...restrictionForm, 
                    user_identifier: e.target.value
                  })}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Restriction Type</label>
                <select
                  value={restrictionForm.restriction_type}
                  onChange={(e) => setRestrictionForm({
                    ...restrictionForm, 
                    restriction_type: e.target.value
                  })}
                >
                  <option value="temporary_ban">Temporary Ban</option>
                  <option value="rate_limit">Rate Limit</option>
                  <option value="creation_limit">Creation Limit</option>
                </select>
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Reason</label>
                <textarea
                  placeholder="Reason for restriction..."
                  value={restrictionForm.reason}
                  onChange={(e) => setRestrictionForm({
                    ...restrictionForm, 
                    reason: e.target.value
                  })}
                />
              </div>
              
              <div className="form-group">
                <label>Expires In (Hours)</label>
                <select
                  value={restrictionForm.expires_in_hours}
                  onChange={(e) => setRestrictionForm({
                    ...restrictionForm, 
                    expires_in_hours: Number(e.target.value)
                  })}
                >
                  <option value={1}>1 hour</option>
                  <option value={6}>6 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={72}>3 days</option>
                  <option value={168}>1 week</option>
                  <option value={0}>Permanent</option>
                </select>
              </div>
            </div>
            
            <div className="form-actions">
              <Button type="submit" variant="warning">
                Create Restriction
              </Button>
              <Button type="button" onClick={() => setShowRestrictionForm(false)}>
                Cancel
              </Button>
            </div>
          </NewRestrictionForm>
        )}
      </RestrictionsSection>

      {/* Error Display */}
      {error && (
        <ErrorMessage>{error}</ErrorMessage>
      )}
    </SecurityContainer>
  );
};

export default SecurityMonitor;