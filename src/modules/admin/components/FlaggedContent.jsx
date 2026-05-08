import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import { adminGet, adminPut, adminDelete } from '../utils/adminApi';

const FlaggedContentContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  
`;

const SectionHeader = styled.h3`
  margin: 0 0 ${theme.spacing.md} 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.h3};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;

const FilterBar = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
  flex-wrap: wrap;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  }
`;

const FilterButton = styled.button`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${props => props.active ? theme.colors.white : theme.colors.black[400]};
  background: ${props => props.active ? 'rgba(255, 255, 255, 0.1)' : 'transparent'};
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  
  &:hover {
    border-color: ${theme.colors.white};
    background: rgba(255, 255, 255, 0.05);
  }
`;

const FlagsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const FlagItem = styled(DashedBox)`
  padding: ${theme.spacing.md};
  background: rgba(255, 255, 255, 0.02);
  
  ${props => props.resolved && `
    opacity: 0.6;
    border-color: ${theme.colors.black[600]};
  `}
`;

const FlagHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: ${theme.spacing.sm};
  gap: ${theme.spacing.md};
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    align-items: stretch;
    gap: ${theme.spacing.sm};
  }
`;

const FlagInfo = styled.div`
  flex: 1;
`;

const TrackInfo = styled.div`
  margin-bottom: ${theme.spacing.xs};
`;

const TrackTitle = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.white};
  font-weight: 600;
  margin-bottom: ${theme.spacing.xs};
`;

const TrackMeta = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black[400]};
`;

const IssueInfo = styled.div`
  margin-bottom: ${theme.spacing.sm};
`;

const IssueType = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: ${theme.spacing.xs};
  
  &::before {
    content: '⚠ ';
    color: ${theme.colors.warning};
  }
`;

const IssueDescription = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black[400]};
`;

const FlagMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[500]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const MetaItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
`;

const FlagActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-shrink: 0;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100%;
    justify-content: stretch;
    
    button {
      flex: 1;
    }
  }
`;

const StatusMessage = styled.div`
  padding: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
  border: ${theme.borders.dashed} ${props => 
    props.type === 'error' ? theme.colors.danger : 
    props.type === 'success' ? theme.colors.success : 
    theme.colors.primary
  };
  background: ${props => 
    props.type === 'error' ? 'rgba(229, 62, 62, 0.1)' : 
    props.type === 'success' ? 'rgba(76, 175, 80, 0.1)' : 
    'rgba(49, 130, 206, 0.1)'
  };
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.xl};
  text-align: center;
  border: ${theme.borders.dashed} ${theme.colors.black[600]};
  background: rgba(255, 255, 255, 0.02);
`;

const EmptyStateText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black[400]};
`;

const StatsBar = styled.div`
  display: flex;
  gap: ${theme.spacing.lg};
  margin-bottom: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const StatItem = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black[400]};
  
  .value {
    color: ${theme.colors.white};
    font-weight: 600;
  }
`;

const FlaggedContent = () => {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [filter, setFilter] = useState('all'); // 'all', 'unresolved', 'resolved'
  const [stats, setStats] = useState({ total: 0, unresolved: 0, resolved: 0 });

  const issueTypeLabels = {
    wrong_dsp_url: {
      title: 'Wrong DSP URL',
      description: 'Incorrect Spotify, Apple Music, or Tidal link'
    },
    wrong_preview: {
      title: 'Wrong Deezer Preview',
      description: 'Preview audio doesn\'t match this track'
    },
    broken_link: {
      title: 'Broken Link',
      description: 'Link doesn\'t work or goes to wrong page'
    },
    other: {
      title: 'Other Issue',
      description: 'Something else needs attention'
    }
  };

  useEffect(() => {
    loadFlags();
  }, [filter]);

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  const loadFlags = async () => {
    setLoading(true);
    try {
      const url = filter === 'all' 
        ? '/api/v1/admin/flags'
        : `/api/v1/admin/flags?status=${filter}`;
      
      const response = await adminGet(url);
      setFlags(response.flags || []);
      
      // Calculate stats
      const total = response.flags.length;
      const unresolved = response.flags.filter(flag => flag.status === 'unresolved').length;
      const resolved = response.flags.filter(flag => flag.status === 'resolved').length;
      setStats({ total, unresolved, resolved });
    } catch (error) {
      console.error('Error loading flags:', error);
      showStatus('error', `Failed to load flags: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveFlag = async (flagId) => {
    try {
      await adminPut(`/api/v1/admin/flags/${flagId}/resolve`);
      showStatus('success', 'Flag resolved successfully');
      loadFlags(); // Reload the list
    } catch (error) {
      console.error('Error resolving flag:', error);
      showStatus('error', `Failed to resolve flag: ${error.message}`);
    }
  };

  const handleDeleteFlag = async (flagId) => {
    if (!confirm('Are you sure you want to delete this flag? This action cannot be undone.')) {
      return;
    }

    try {
      await adminDelete(`/api/v1/admin/flags/${flagId}`);
      showStatus('success', 'Flag deleted successfully');
      loadFlags(); // Reload the list
    } catch (error) {
      console.error('Error deleting flag:', error);
      showStatus('error', `Failed to delete flag: ${error.message}`);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <FlaggedContentContainer>
        <SectionHeader>Flagged Content</SectionHeader>
        <EmptyState>
          <EmptyStateText>Loading flags...</EmptyStateText>
        </EmptyState>
      </FlaggedContentContainer>
    );
  }

  return (
    <FlaggedContentContainer>
      {status.message && (
        <StatusMessage type={status.type}>
          {status.message}
        </StatusMessage>
      )}

      <SectionHeader>Flagged Content</SectionHeader>

      <StatsBar>
        <StatItem>
          Total: <span className="value">{stats.total}</span>
        </StatItem>
        <StatItem>
          Unresolved: <span className="value">{stats.unresolved}</span>
        </StatItem>
        <StatItem>
          Resolved: <span className="value">{stats.resolved}</span>
        </StatItem>
      </StatsBar>

      <FilterBar>
        <FilterButton 
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          All ({stats.total})
        </FilterButton>
        <FilterButton 
          active={filter === 'unresolved'}
          onClick={() => setFilter('unresolved')}
        >
          Unresolved ({stats.unresolved})
        </FilterButton>
        <FilterButton 
          active={filter === 'resolved'}
          onClick={() => setFilter('resolved')}
        >
          Resolved ({stats.resolved})
        </FilterButton>
      </FilterBar>

      <FlagsList>
        {flags.length === 0 ? (
          <EmptyState>
            <EmptyStateText>
              {filter === 'all' 
                ? 'No flags have been submitted yet'
                : `No ${filter} flags found`
              }
            </EmptyStateText>
          </EmptyState>
        ) : (
          flags.map(flag => (
            <FlagItem key={flag.id} resolved={flag.status === 'resolved'}>
              <FlagHeader>
                <FlagInfo>
                  <TrackInfo>
                    <TrackTitle>
                      {flag.track_artist && flag.track_title 
                        ? `${flag.track_artist} - ${flag.track_title}`
                        : flag.track_title || `Track ID: ${flag.track_id}`
                      }
                    </TrackTitle>
                    <TrackMeta>
                      Track ID: {flag.track_id}
                      {flag.playlist_id && ` • Playlist ID: ${flag.playlist_id}`}
                    </TrackMeta>
                  </TrackInfo>

                  <IssueInfo>
                    <IssueType>
                      {issueTypeLabels[flag.issue_type]?.title || flag.issue_type}
                    </IssueType>
                    <IssueDescription>
                      {issueTypeLabels[flag.issue_type]?.description || 'No description available'}
                    </IssueDescription>
                  </IssueInfo>

                  <FlagMeta>
                    <MetaItem>
                      <span>Reported:</span>
                      <span>{formatDate(flag.created_at)}</span>
                    </MetaItem>
                    <MetaItem>
                      <span>Status:</span>
                      <span>{flag.status}</span>
                    </MetaItem>
                    {flag.status === 'resolved' && (
                      <>
                        <MetaItem>
                          <span>Resolved:</span>
                          <span>{formatDate(flag.resolved_at)}</span>
                        </MetaItem>
                        {flag.resolved_by && (
                          <MetaItem>
                            <span>By:</span>
                            <span>{flag.resolved_by}</span>
                          </MetaItem>
                        )}
                      </>
                    )}
                  </FlagMeta>
                </FlagInfo>

                <FlagActions>
                  {flag.status === 'unresolved' && (
                    <Button
                      size="small"
                      variant="success"
                      onClick={() => handleResolveFlag(flag.id)}
                    >
                      Resolve
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="danger"
                    onClick={() => handleDeleteFlag(flag.id)}
                  >
                    Delete
                  </Button>
                </FlagActions>
              </FlagHeader>
            </FlagItem>
          ))
        )}
      </FlagsList>
    </FlaggedContentContainer>
  );
};

export default FlaggedContent;