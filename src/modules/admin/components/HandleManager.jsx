import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import { useAuthenticatedApi } from '../hooks/useAuthenticatedApi';

const HandleManagerContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xl};
`;

const ControlsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const ActionBar = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  align-items: center;
  flex-wrap: wrap;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const SearchInput = styled.input`
  background: transparent;
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  color: ${theme.colors.white};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  min-width: 250px;
  
  &:focus {
    outline: none;
    border-color: ${theme.colors.white};
  }
  
  &::placeholder {
    color: ${theme.colors.gray[500]};
  }
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    min-width: unset;
    width: 100%;
  }
`;

const FilterSelect = styled.select`
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
    color: ${theme.colors.primary || theme.colors.white};
  }
  
  .stat-label {
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.gray[400]};
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

const ReservationForm = styled(DashedBox)`
  padding: ${theme.spacing.lg};
  margin-bottom: ${theme.spacing.lg};
  
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
    
    &:last-child {
      margin-bottom: 0;
    }
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
    
    input, textarea, select {
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
    
    textarea {
      min-height: 80px;
      resize: vertical;
    }
    
    select {
      cursor: pointer;
      
      option {
        background: ${theme.colors.black};
        color: ${theme.colors.white};
      }
    }
  }
  
  .form-actions {
    display: flex;
    gap: ${theme.spacing.md};
    margin-top: ${theme.spacing.lg};
    
    @media (max-width: ${theme.breakpoints.mobile}) {
      flex-direction: column;
    }
  }
`;

const ReservationsTable = styled.div`
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  border-radius: 4px;
  overflow-x: auto;
`;

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: 1fr 150px 120px 120px 100px 100px;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: rgba(255, 255, 255, 0.1);
  border-bottom: ${theme.borders.dashed} ${theme.colors.gray[300]};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: bold;
  color: ${theme.colors.gray[300]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  
  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const TableRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 150px 120px 120px 100px 100px;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  border-bottom: ${theme.borders.dashed} rgba(255, 255, 255, 0.1);
  align-items: center;
  transition: background-color 0.2s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  
  &:last-child {
    border-bottom: none;
  }
  
  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.sm};
    padding: ${theme.spacing.lg} ${theme.spacing.md};
  }
`;

const HandleInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  
  .handle {
    font-family: ${theme.fonts.mono};
    font-weight: bold;
    color: ${theme.colors.white};
  }
  
  .reserved-for {
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.gray[400]};
  }
  
  .reason {
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.gray[500]};
    font-style: italic;
  }
  
  @media (max-width: ${theme.breakpoints.tablet}) {
    .handle::before {
      content: 'Handle: ';
      color: ${theme.colors.gray[500]};
    }
    
    .reserved-for::before {
      content: 'Reserved for: ';
      color: ${theme.colors.gray[500]};
    }
    
    .reason::before {
      content: 'Reason: ';
      color: ${theme.colors.gray[500]};
    }
  }
`;

const StatusBadge = styled.span`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.dashed};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 2px;
  
  &.reserved {
    border-color: #f59e0b;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.1);
  }
  
  &.assigned {
    border-color: #4ade80;
    color: #4ade80;
    background: rgba(74, 222, 128, 0.1);
  }
  
  &.released {
    border-color: ${theme.colors.gray[400]};
    color: ${theme.colors.gray[400]};
    background: rgba(255, 255, 255, 0.05);
  }
  
  &.expired {
    border-color: #ef4444;
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }
`;

const ActionsCell = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  
  @media (max-width: ${theme.breakpoints.tablet}) {
    justify-content: center;
    margin-top: ${theme.spacing.md};
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
  
  &.danger {
    border-color: #ef4444;
    color: #ef4444;
    
    &:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.1);
    }
  }
  
  &.success {
    border-color: #4ade80;
    color: #4ade80;
    
    &:hover:not(:disabled) {
      background: rgba(74, 222, 128, 0.1);
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

const HandleManager = () => {
  const { authenticatedFetch } = useAuthenticatedApi();
  
  const [reservations, setReservations] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // New reservation form
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    handle: '',
    reserved_for: '',
    reason: '',
    expires_in_days: 30,
    notes: ''
  });
  const [formLoading, setFormLoading] = useState(false);

  // Load handle reservations
  const loadReservations = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authenticatedFetch('/api/v1/admin/handle-manager/reservations?' + 
        new URLSearchParams({ status: statusFilter || '' }));
      const data = await response.json();
      
      let filteredReservations = data.reservations || [];
      
      // Apply search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredReservations = filteredReservations.filter(res =>
          res.handle.toLowerCase().includes(query) ||
          (res.reserved_for && res.reserved_for.toLowerCase().includes(query)) ||
          (res.reason && res.reason.toLowerCase().includes(query))
        );
      }
      
      setReservations(filteredReservations);
      setStats(response.stats || {});
    } catch (err) {
      setError(`Failed to load reservations: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Load statistics
  const loadStats = async () => {
    try {
      const response = await authenticatedFetch('/api/v1/admin/handle-manager/stats');
      const data = await response.json();
      setStats({...stats, ...data});
    } catch (err) {
      console.error('Failed to load handle stats:', err);
    }
  };

  // Create new reservation
  const createReservation = async (e) => {
    e.preventDefault();
    
    if (!formData.handle.trim() || !formData.reserved_for.trim()) {
      setError('Handle and reserved_for are required');
      return;
    }
    
    try {
      setFormLoading(true);
      setError(null);
      
      const response = await authenticatedFetch('/api/v1/admin/handle-manager/reserve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      
      // Reset form and reload data
      setFormData({
        handle: '',
        reserved_for: '',
        reason: '',
        expires_in_days: 30,
        notes: ''
      });
      setShowForm(false);
      await loadReservations();
    } catch (err) {
      setError(`Failed to create reservation: ${err.message}`);
    } finally {
      setFormLoading(false);
    }
  };

  // Update reservation
  const updateReservation = async (reservationId, updates) => {
    try {
      const response = await authenticatedFetch(`/api/v1/admin/handle-manager/reservation/${reservationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      await loadReservations();
    } catch (err) {
      setError(`Failed to update reservation: ${err.message}`);
    }
  };

  // Delete reservation
  const deleteReservation = async (reservationId) => {
    if (!window.confirm('Delete this reservation? This cannot be undone.')) {
      return;
    }
    
    try {
      const response = await authenticatedFetch(`/api/v1/admin/handle-manager/reservation/${reservationId}`, {
        method: 'DELETE'
      });
      
      await loadReservations();
    } catch (err) {
      setError(`Failed to delete reservation: ${err.message}`);
    }
  };

  // Clean up expired reservations
  const cleanupExpired = async () => {
    if (!window.confirm('Clean up all expired reservations? This will release them permanently.')) {
      return;
    }
    
    try {
      const response = await authenticatedFetch('/api/v1/admin/handle-manager/cleanup-expired', {
        method: 'POST'
      });
      
      await loadReservations();
      setError(null);
    } catch (err) {
      setError(`Failed to cleanup expired reservations: ${err.message}`);
    }
  };

  // Check if reservation is expired
  const isExpired = (expiresAt) => {
    return expiresAt && new Date(expiresAt) < new Date();
  };

  // Get reservation status with expiry check
  const getReservationStatus = (reservation) => {
    if (isExpired(reservation.expires_at)) {
      return 'expired';
    }
    return reservation.status;
  };

  // Load data on component mount and filter changes
  useEffect(() => {
    loadReservations();
    loadStats();
  }, [statusFilter]);

  // Apply search filter with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== '') {
        loadReservations();
      }
    }, 500);
    
    if (searchQuery === '') {
      loadReservations();
    }
    
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <HandleManagerContainer>
      <ControlsSection>
        <ActionBar>
          <SearchInput
            type="text"
            placeholder="Search handles, emails, or reasons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="reserved">Reserved</option>
            <option value="assigned">Assigned</option>
            <option value="released">Released</option>
          </FilterSelect>
          
          <Button 
            onClick={() => setShowForm(!showForm)}
            variant="primary"
            size="small"
          >
            {showForm ? 'Cancel' : 'New Reservation'}
          </Button>
          
          <Button 
            onClick={cleanupExpired}
            variant="warning"
            size="small"
          >
            Cleanup Expired
          </Button>
          
          <Button 
            onClick={loadReservations} 
            disabled={loading}
            size="small"
          >
            Refresh
          </Button>
        </ActionBar>
      </ControlsSection>

      {/* Statistics */}
      <StatsGrid>
        <StatCard>
          <div className="stat-number">{stats.total_reservations || 0}</div>
          <div className="stat-label">Total Reservations</div>
        </StatCard>
        <StatCard>
          <div className="stat-number">{stats.active_reservations || 0}</div>
          <div className="stat-label">Active</div>
        </StatCard>
        <StatCard>
          <div className="stat-number">{stats.assigned_reservations || 0}</div>
          <div className="stat-label">Assigned</div>
        </StatCard>
        <StatCard>
          <div className="stat-number">{stats.expired_reservations || 0}</div>
          <div className="stat-label">Expired</div>
        </StatCard>
      </StatsGrid>

      {/* New Reservation Form */}
      {showForm && (
        <ReservationForm as="form" onSubmit={createReservation}>
          <div className="form-header">Create New Handle Reservation</div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Handle *</label>
              <input
                type="text"
                placeholder="e.g. artist-name"
                value={formData.handle}
                onChange={(e) => setFormData({...formData, handle: e.target.value.toLowerCase()})}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Reserved For *</label>
              <input
                type="email"
                placeholder="user@example.com"
                value={formData.reserved_for}
                onChange={(e) => setFormData({...formData, reserved_for: e.target.value})}
                required
              />
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Reason</label>
              <input
                type="text"
                placeholder="Reason for reservation"
                value={formData.reason}
                onChange={(e) => setFormData({...formData, reason: e.target.value})}
              />
            </div>
            
            <div className="form-group">
              <label>Expires In (Days)</label>
              <select
                value={formData.expires_in_days}
                onChange={(e) => setFormData({...formData, expires_in_days: Number(e.target.value)})}
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
                <option value={0}>No expiry</option>
              </select>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Notes</label>
              <textarea
                placeholder="Additional notes..."
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
              />
            </div>
          </div>
          
          <div className="form-actions">
            <Button type="submit" disabled={formLoading} variant="success">
              Create Reservation
            </Button>
            <Button type="button" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </ReservationForm>
      )}

      {/* Error Display */}
      {error && (
        <ErrorMessage>{error}</ErrorMessage>
      )}

      {/* Reservations Table */}
      {loading ? (
        <LoadingMessage>Loading handle reservations...</LoadingMessage>
      ) : reservations.length === 0 ? (
        <LoadingMessage>No handle reservations found</LoadingMessage>
      ) : (
        <ReservationsTable>
          <TableHeader>
            <div>Handle & Details</div>
            <div>Reserved By</div>
            <div>Status</div>
            <div>Reserved Date</div>
            <div>Expires</div>
            <div>Actions</div>
          </TableHeader>
          
          {reservations.map((reservation) => {
            const actualStatus = getReservationStatus(reservation);
            
            return (
              <TableRow key={reservation.id}>
                <HandleInfo>
                  <div className="handle">{reservation.handle}</div>
                  <div className="reserved-for">{reservation.reserved_for}</div>
                  {reservation.reason && (
                    <div className="reason">{reservation.reason}</div>
                  )}
                </HandleInfo>
                
                <div>
                  {reservation.reserved_by_username || 'Unknown Admin'}
                </div>
                
                <div>
                  <StatusBadge className={actualStatus}>
                    {actualStatus}
                  </StatusBadge>
                </div>
                
                <div title={reservation.reserved_at}>
                  {new Date(reservation.reserved_at).toLocaleDateString()}
                </div>
                
                <div title={reservation.expires_at}>
                  {reservation.expires_at 
                    ? new Date(reservation.expires_at).toLocaleDateString()
                    : 'Never'
                  }
                </div>
                
                <ActionsCell>
                  {reservation.status === 'reserved' && !isExpired(reservation.expires_at) && (
                    <ActionButton
                      className="success"
                      onClick={() => updateReservation(reservation.id, { status: 'assigned' })}
                      title="Mark as assigned"
                    >
                      Assign
                    </ActionButton>
                  )}
                  
                  <ActionButton
                    className="danger"
                    onClick={() => deleteReservation(reservation.id)}
                    title="Delete reservation"
                  >
                    Delete
                  </ActionButton>
                </ActionsCell>
              </TableRow>
            );
          })}
        </ReservationsTable>
      )}
    </HandleManagerContainer>
  );
};

export default HandleManager;