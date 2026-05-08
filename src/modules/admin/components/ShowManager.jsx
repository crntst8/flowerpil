import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import ShowForm from './ShowForm';
import ShowList from './ShowList';

const ShowManagerContainer = styled(DashedBox)`
  margin-bottom: ${theme.spacing.xl};
`;

const ShowManagerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.lg};
  flex-wrap: wrap;
  gap: ${theme.spacing.md};
  
  h2 {
    margin: 0;
    color: ${theme.colors.white};
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
  }
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const CuratorSelector = styled.select`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.7);
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  margin-bottom: ${theme.spacing.lg};
  min-width: 200px;
  
  option {
    background: #000000;
    color: #ffffff;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100%;
    justify-content: stretch;
    
    button {
      flex: 1;
    }
  }
`;

const StatsContainer = styled.div`
  display: flex;
  gap: ${theme.spacing.lg};
  margin-bottom: ${theme.spacing.lg};
  flex-wrap: wrap;
`;

const StatCard = styled.div`
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.3);
  padding: ${theme.spacing.md};
  background: rgba(255, 255, 255, 0.02);
  
  h3 {
    margin: 0 0 ${theme.spacing.xs} 0;
    color: ${theme.colors.white};
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.large};
  }
  
  p {
    margin: 0;
    color: ${theme.colors.white};
    opacity: 0.7;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    text-transform: uppercase;
  }
`;

const ErrorMessage = styled.div`
  background: rgba(255, 62, 62, 0.1);
  border: ${theme.borders.dashed} ${theme.colors.danger};
  padding: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.lg};
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const LoadingMessage = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.white};
  opacity: 0.7;
  font-family: ${theme.fonts.mono};
`;

/**
 * Show Manager component for admin interface
 */
const ShowManager = () => {
  const [curators, setCurators] = useState([]);
  const [selectedCuratorId, setSelectedCuratorId] = useState('');
  const [shows, setShows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingShow, setEditingShow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalShows: 0,
    upcomingShows: 0,
    showsWithTickets: 0
  });

  // Load curators on mount
  useEffect(() => {
    fetchCurators();
  }, []);

  // Load shows when curator selection changes
  useEffect(() => {
    if (selectedCuratorId) {
      fetchShows();
    } else {
      setShows([]);
    }
  }, [selectedCuratorId]);

  const fetchCurators = async () => {
    try {
      const response = await fetch('/api/v1/curators', { credentials: 'include' });
      const data = await response.json();
      
      if (data.success) {
        setCurators(data.data || []);
        if (data.data.length > 0 && !selectedCuratorId) {
          setSelectedCuratorId(data.data[0].id.toString());
        }
      }
    } catch (err) {
      console.error('Failed to fetch curators:', err);
      setError('Failed to load curators');
    }
  };

  const fetchShows = async () => {
    if (!selectedCuratorId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/v1/curators/${selectedCuratorId}/shows`, { credentials: 'include' });
      const data = await response.json();
      
      if (data.success) {
        const showData = data.data || [];
        setShows(showData);
        
        // Calculate stats
        const now = new Date();
        const upcomingCount = showData.filter(s => new Date(s.show_date) > now).length;
        const ticketCount = showData.filter(s => s.ticket_url).length;
        
        setStats({
          totalShows: showData.length,
          upcomingShows: upcomingCount,
          showsWithTickets: ticketCount
        });
      } else {
        setError('Failed to load shows');
      }
    } catch (err) {
      console.error('Failed to fetch shows:', err);
      setError('Failed to load shows');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShow = () => {
    if (!selectedCuratorId) {
      setError('Please select a curator first');
      return;
    }
    
    setEditingShow(null);
    setShowForm(true);
  };

  const handleEditShow = (show) => {
    setEditingShow(show);
    setShowForm(true);
  };

  const handleDeleteShow = async (showId) => {
    if (!window.confirm('Are you sure you want to delete this show?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/v1/shows/${showId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.success) {
        fetchShows(); // Refresh the list
      } else {
        setError('Failed to delete show');
      }
    } catch (err) {
      console.error('Failed to delete show:', err);
      setError('Failed to delete show');
    }
  };

  const handleFormSubmit = async (formData) => {
    try {
      const url = editingShow 
        ? `/api/v1/shows/${editingShow.id}`
        : `/api/v1/curators/${selectedCuratorId}/shows`;
      
      const method = editingShow ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData),
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setShowForm(false);
        setEditingShow(null);
        fetchShows(); // Refresh the list
      } else {
        setError(data.error || 'Failed to save show');
      }
    } catch (err) {
      console.error('Failed to save show:', err);
      setError('Failed to save show');
    }
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingShow(null);
  };

  const selectedCurator = curators.find(c => c.id.toString() === selectedCuratorId);

  return (
    <ShowManagerContainer>
      <ShowManagerHeader>
        <h2>Show Manager</h2>
        <ActionButtons>
          <Button onClick={handleCreateShow} disabled={!selectedCuratorId}>
            Add Show
          </Button>
          <Button onClick={fetchShows} disabled={!selectedCuratorId}>
            Refresh
          </Button>
        </ActionButtons>
      </ShowManagerHeader>

      <CuratorSelector
        value={selectedCuratorId}
        onChange={(e) => setSelectedCuratorId(e.target.value)}
      >
        <option value="">Select a curator...</option>
        {curators.map((curator) => (
          <option key={curator.id} value={curator.id}>
            {curator.name} ({curator.profile_type})
          </option>
        ))}
      </CuratorSelector>

      {error && (
        <ErrorMessage>
          {error}
        </ErrorMessage>
      )}

      {selectedCuratorId && (
        <StatsContainer>
          <StatCard>
            <h3>{stats.totalShows}</h3>
            <p>Total Shows</p>
          </StatCard>
          <StatCard>
            <h3>{stats.upcomingShows}</h3>
            <p>Upcoming</p>
          </StatCard>
          <StatCard>
            <h3>{stats.showsWithTickets}</h3>
            <p>With Tickets</p>
          </StatCard>
        </StatsContainer>
      )}

      {showForm && (
        <ShowForm
          show={editingShow}
          curatorId={selectedCuratorId}
          curatorName={selectedCurator?.name}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
        />
      )}

      {loading ? (
        <LoadingMessage>Loading shows...</LoadingMessage>
      ) : (
        selectedCuratorId && (
          <ShowList
            shows={shows}
            onEdit={handleEditShow}
            onDelete={handleDeleteShow}
          />
        )
      )}
    </ShowManagerContainer>
  );
};

export default ShowManager;
