import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import { useAuth } from '@shared/contexts/AuthContext';
import CuratorForm from './CuratorForm';
import { cacheService } from '@shared/services/cacheService';
import CuratorList from './CuratorList';
import { DEFAULT_CURATOR_TYPE, getCuratorTypeOptions } from '@shared/constants/curatorTypes';

const CuratorManagerContainer = styled(DashedBox)`
  margin-bottom: ${theme.spacing.xl};
  background: #dadada;
  color: ${theme.colors.black};
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.15),
      0 8px 32px rgba(0, 0, 0, 0.08),
      0 2px 4px rgba(0, 0, 0, 0.2);
  }
`;

const CuratorManagerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.lg};
  flex-wrap: wrap;
  gap: ${theme.spacing.md};
  
  h2 {
    margin: 0;
  }
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    align-items: stretch;
  }
`;
const GhostButton = styled(Button)`
  background: transparent;
  border-color: rgba(0, 0, 0, 0.28);
  color: ${theme.colors.black};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
    border-color: ${theme.colors.black};
  }
`;
const SearchAndFilters = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.lg};
  flex-wrap: wrap;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
  }
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 200px;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};

  &::placeholder {
    color: rgba(0, 0, 0, 0.5);
  }

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }
`;

const FilterSelect = styled.select`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  min-width: 150px;

  option {
    background: ${theme.colors.fpwhite};
    color: ${theme.colors.black};
  }

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
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
`;

const CuratorFormContainer = styled.div`
  margin-top: ${theme.spacing.lg};
  border-top: ${theme.borders.dashed} ${theme.colors.black};
  padding-top: ${theme.spacing.lg};
  background: ${theme.colors.fpwhite};
  padding: ${theme.spacing.lg};
  border-left: 3px solid ${theme.colors.black};
  margin-left: ${theme.spacing.sm};
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  border-radius: 4px;

  @media (max-width: ${theme.breakpoints.mobile}) {
    margin-left: 0;
    padding: ${theme.spacing.md};
  }
`;

const CuratorManager = () => {
  const { authenticatedFetch } = useAuth();
  const [curators, setCurators] = useState([]);
  const [filteredCurators, setFilteredCurators] = useState([]);
  const [currentCurator, setCurrentCurator] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const formRef = useRef(null);
  const curatorTypeOptions = useMemo(() => getCuratorTypeOptions(), []);

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  const fetchCurators = async () => {
    setIsLoading(true);
    try {
      const response = await authenticatedFetch('/api/v1/curators');
      if (!response.ok) throw new Error('Failed to fetch curators');
      const data = await response.json();
      setCurators(data.success ? data.data : []);
    } catch (error) {
      showStatus('error', `Failed to load curators: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCurator = () => {
    setCurrentCurator({
      name: '',
      profile_type: DEFAULT_CURATOR_TYPE,
      bio: '',
      bio_short: '',
      location: '',
      website_url: '',
      contact_email: '',
      social_links: [],
      external_links: [],
      verification_status: 'pending',
      profile_visibility: 'public',
      custom_fields: {}
    });
    setShowForm(true);
    // Scroll to form after a brief delay to allow it to render
    setTimeout(() => {
      if (formRef.current) {
        formRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    }, 100);
  };

  const openFormAndScroll = useCallback(() => {
    setShowForm(true);
    setTimeout(() => {
      if (formRef.current) {
        formRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }, 100);
  }, []);

  const handleEditCurator = (curator) => {
    setCurrentCurator(curator);
    openFormAndScroll();
  };

  const loadCuratorById = useCallback(async (curatorId) => {
    if (!curatorId) return;
    setIsLoading(true);
    try {
      const response = await authenticatedFetch(`/api/v1/curators/${curatorId}`);
      if (!response.ok) {
        throw new Error('Failed to load curator');
      }
      const data = await response.json();
      if (data?.success === false && data?.error) {
        throw new Error(data.error);
      }
      const curatorData = data?.data || data;
      if (curatorData) {
        handleEditCurator(curatorData);
      }
    } catch (err) {
      showStatus('error', err?.message || 'Unable to load curator profile');
    } finally {
      setIsLoading(false);
    }
  }, [openFormAndScroll]);

  const handleCuratorSaved = async (savedCurator) => {
    showStatus('success', 'Curator saved successfully');
    setShowForm(false);
    setCurrentCurator(null);
    try { cacheService.clearPlaylistListings(); } catch {}
    await fetchCurators();
  };

  const handleCancelEdit = () => {
    setShowForm(false);
    setCurrentCurator(null);
  };

  const handleDeleteCurator = async (curatorId, curatorName) => {
    if (!window.confirm(`Are you sure you want to delete curator "${curatorName}"?`)) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await authenticatedFetch(`/api/v1/curators/${curatorId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete curator');
      }

      showStatus('success', `Curator "${curatorName}" deleted successfully`);
      await fetchCurators();
    } catch (error) {
      showStatus('error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter curators based on search and filters
  useEffect(() => {
    let filtered = curators;

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(curator => 
        curator.name.toLowerCase().includes(searchLower) ||
        (curator.bio_short && curator.bio_short.toLowerCase().includes(searchLower)) ||
        (curator.location && curator.location.toLowerCase().includes(searchLower))
      );
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(curator => curator.profile_type === typeFilter);
    }

    // Apply verification filter
    if (verificationFilter !== 'all') {
      filtered = filtered.filter(curator => curator.verification_status === verificationFilter);
    }

    setFilteredCurators(filtered);
  }, [curators, searchTerm, typeFilter, verificationFilter]);

  // Load curators on mount
  useEffect(() => {
    fetchCurators();
  }, []);

  useEffect(() => {
    const handleCreateEvent = () => {
      handleCreateCurator();
    };

    const handleEditEvent = (event) => {
      const curatorId = event?.detail?.curatorId;
      if (curatorId) {
        loadCuratorById(curatorId);
      }
    };

    window.addEventListener('adminCuratorCreate', handleCreateEvent);
    window.addEventListener('adminCuratorEdit', handleEditEvent);

    return () => {
      window.removeEventListener('adminCuratorCreate', handleCreateEvent);
      window.removeEventListener('adminCuratorEdit', handleEditEvent);
    };
  }, [handleCreateCurator, loadCuratorById]);

  return (
    <CuratorManagerContainer>
      <CuratorManagerHeader>
        <div>
          <h2>Curator Management</h2>
          <p style={{ 
            margin: '4px 0 0 0', 
            fontSize: theme.fontSizes.small, 
            color: 'rgba(0, 0, 0, 0.6)' 
          }}>
            {filteredCurators.length} of {curators.length} curators
            {searchTerm && ` matching "${searchTerm}"`}
          </p>
        </div>
        <Button 
          onClick={handleCreateCurator}
          variant="primary"
          disabled={isLoading || showForm}
        >
          Create New Curator
        </Button>
      </CuratorManagerHeader>

      {status.message && (
        <StatusMessage type={status.type}>
          {status.message}
        </StatusMessage>
      )}

      <SearchAndFilters>
        <SearchInput
          type="text"
          placeholder="Search curators by name, bio, or location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        
        <FilterSelect
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All Types</option>
          {curatorTypeOptions.map((option) => (
            option.isHeader ? (
              <option
                key={`header-${option.value}`}
                value={option.value}
                disabled
                className="category-header"
              >
                {option.label}
              </option>
            ) : (
              <option key={option.value} value={option.value}>{option.label}</option>
            )
          ))}
        </FilterSelect>
        
        <FilterSelect
          value={verificationFilter}
          onChange={(e) => setVerificationFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="featured">Featured</option>
        </FilterSelect>
      </SearchAndFilters>

      <CuratorList
        curators={filteredCurators}
        onEdit={handleEditCurator}
        onDelete={handleDeleteCurator}
        isLoading={isLoading}
        editingCuratorId={showForm && currentCurator?.id}
      />

      {showForm && (
        <CuratorFormContainer ref={formRef}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: theme.spacing.md,
            paddingBottom: theme.spacing.sm,
            borderBottom: `${theme.borders.dashed} rgba(0, 0, 0, 0.2)`
          }}>
            <h3 style={{
              margin: 0,
              color: theme.colors.black,
              fontSize: theme.fontSizes.medium
            }}>
              {currentCurator?.id ? `Editing: ${currentCurator.name}` : 'Create New Curator'}
            </h3>
            <Button
              size="small"
              onClick={handleCancelEdit}
              variant="secondary"
            >
              ✕ Close
            </Button>
          </div>
          <CuratorForm
            curator={currentCurator}
            onSave={handleCuratorSaved}
            onCancel={handleCancelEdit}
          />
        </CuratorFormContainer>
      )}
    </CuratorManagerContainer>
  );
};

export default CuratorManager;
