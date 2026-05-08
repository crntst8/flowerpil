import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import { useAuthenticatedApi } from '../hooks/useAuthenticatedApi';
import { adminGet, adminPost } from '../utils/adminApi';

const BioPageAdminContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xl};
`;

const ControlsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const FilterRow = styled.div`
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
  min-width: 300px;
  
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

const BulkActionsBar = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;
  padding: ${theme.spacing.md};
  background: rgba(255, 255, 255, 0.05);
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  border-radius: 4px;
  
  .bulk-info {
    color: ${theme.colors.gray[400]};
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    margin-right: auto;
  }
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    align-items: stretch;
    gap: ${theme.spacing.md};
    
    .bulk-info {
      margin-right: 0;
      text-align: center;
    }
  }
`;

const BioPagesTable = styled.div`
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  border-radius: 4px;
  overflow-x: auto;
`;

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: auto 1fr 120px 100px 100px 120px 120px;
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
  grid-template-columns: auto 1fr 120px 100px 100px 120px 120px;
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

const SelectCheckbox = styled.input.attrs({ type: 'checkbox' })`
  width: 16px;
  height: 16px;
  cursor: pointer;
`;

const BioInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  
  .handle {
    font-family: ${theme.fonts.mono};
    font-weight: bold;
    color: ${theme.colors.white};
  }
  
  .curator {
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.gray[400]};
  }
  
  @media (max-width: ${theme.breakpoints.tablet}) {
    .handle::before {
      content: 'Handle: ';
      color: ${theme.colors.gray[500]};
    }
    
    .curator::before {
      content: 'Curator: ';
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
  
  &.published {
    border-color: #4ade80;
    color: #4ade80;
    background: rgba(74, 222, 128, 0.1);
  }
  
  &.draft {
    border-color: ${theme.colors.gray[400]};
    color: ${theme.colors.gray[400]};
    background: rgba(255, 255, 255, 0.05);
  }
  
  &.locked {
    border-color: #f59e0b;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.1);
  }
`;

const OptimizationBadge = styled.span`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.dashed};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 2px;
  
  &.optimized {
    border-color: #4ade80;
    color: #4ade80;
    background: rgba(74, 222, 128, 0.1);
  }
  
  &.pending {
    border-color: ${theme.colors.gray[400]};
    color: ${theme.colors.gray[400]};
    background: rgba(255, 255, 255, 0.05);
  }
  
  &.needs_attention {
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
`;

const BioPageAdmin = () => {
  console.log('BioPageAdmin component mounted');
  const { callAdminApi } = useAuthenticatedApi();
  console.log('callAdminApi function:', typeof callAdminApi, callAdminApi);
  
  const [bioPages, setBioPages] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [optimizationFilter, setOptimizationFilter] = useState('');
  const [featuredFilter, setFeaturedFilter] = useState('');
  
  // Bulk operations
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Load bio pages data
  const loadBioPages = async () => {
    console.log('loadBioPages called with filters:', { statusFilter, optimizationFilter, searchQuery, featuredFilter });
    try {
      setLoading(true);
      setError(null);
      
      console.log('Making API call to /api/v1/admin/bio-pages');
      
      // Build URL with query parameters
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (optimizationFilter) params.append('optimization', optimizationFilter);
      if (searchQuery) params.append('search', searchQuery);
      if (featuredFilter) params.append('featured', featuredFilter);
      
      const url = `/api/v1/admin/bio-pages${params.toString() ? '?' + params.toString() : ''}`;
      const response = await callAdminApi(adminGet, url);
      
      console.log('API response:', response);
      setBioPages(response.data?.bio_pages || []);
      setStats(response.data?.stats || {});
    } catch (err) {
      console.error('Bio pages API error:', err);
      setError(`Failed to load bio pages: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Bulk operations
  const performBulkOperation = async (operation, options = {}) => {
    if (selectedPages.size === 0) {
      setError('No pages selected for bulk operation');
      return;
    }

    try {
      setBulkLoading(true);
      setError(null);
      
      const requestData = {
        operation,
        bio_page_ids: Array.from(selectedPages),
        options
      };
      
      const response = await callAdminApi(adminPost, '/api/v1/admin/bio-pages/bulk-operation', requestData);
      
      // Refresh data and clear selection
      await loadBioPages();
      setSelectedPages(new Set());
      
      const successCount = response.successful_operations || 0;
      setError(null);
    } catch (err) {
      setError(`Bulk ${operation} failed: ${err.message}`);
    } finally {
      setBulkLoading(false);
    }
  };

  // Individual page operations
  const togglePageLock = async (bioId, isLocked) => {
    try {
      const endpoint = isLocked 
        ? `/api/v1/admin/bio-pages/${bioId}/unlock`
        : `/api/v1/admin/bio-pages/${bioId}/lock`;
      
      const requestData = isLocked ? {} : { reason: 'Admin lock' };
      await callAdminApi(adminPost, endpoint, requestData);
      
      await loadBioPages();
    } catch (err) {
      setError(`Failed to ${isLocked ? 'unlock' : 'lock'} page: ${err.message}`);
    }
  };

  // Selection management
  const toggleSelectAll = () => {
    if (selectedPages.size === bioPages.length) {
      setSelectedPages(new Set());
    } else {
      setSelectedPages(new Set((bioPages || []).map(page => page.id)));
    }
  };

  const toggleSelectPage = (pageId) => {
    const newSelected = new Set(selectedPages);
    if (newSelected.has(pageId)) {
      newSelected.delete(pageId);
    } else {
      newSelected.add(pageId);
    }
    setSelectedPages(newSelected);
  };

  // Load data on component mount and filter changes
  useEffect(() => {
    loadBioPages();
  }, [searchQuery, statusFilter, optimizationFilter, featuredFilter]);

  return (
    <BioPageAdminContainer>
      <ControlsSection>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search bio pages by handle or curator..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="locked">Locked</option>
          </FilterSelect>
          
          <FilterSelect
            value={optimizationFilter}
            onChange={(e) => setOptimizationFilter(e.target.value)}
          >
            <option value="">All Optimization</option>
            <option value="optimized">Optimized</option>
            <option value="pending">Pending</option>
            <option value="needs_attention">Needs Attention</option>
          </FilterSelect>
          
          <FilterSelect
            value={featuredFilter}
            onChange={(e) => setFeaturedFilter(e.target.value)}
          >
            <option value="">All Pages</option>
            <option value="true">Featured Only</option>
          </FilterSelect>
          
          <Button 
            onClick={loadBioPages} 
            disabled={loading}
            size="small"
          >
            Refresh
          </Button>
        </FilterRow>
      </ControlsSection>

      {/* Statistics */}
      <StatsGrid>
        <StatCard>
          <div className="stat-number">{stats.total_bio_pages || 0}</div>
          <div className="stat-label">Total Pages</div>
        </StatCard>
        <StatCard>
          <div className="stat-number">{stats.published_pages || 0}</div>
          <div className="stat-label">Published</div>
        </StatCard>
        <StatCard>
          <div className="stat-number">{stats.draft_pages || 0}</div>
          <div className="stat-label">Drafts</div>
        </StatCard>
        <StatCard>
          <div className="stat-number">{stats.locked_pages || 0}</div>
          <div className="stat-label">Locked</div>
        </StatCard>
      </StatsGrid>

      {/* Bulk Actions */}
      {selectedPages.size > 0 && (
        <BulkActionsBar>
          <div className="bulk-info">
            {selectedPages.size} page{selectedPages.size !== 1 ? 's' : ''} selected
          </div>
          
          <Button
            onClick={() => performBulkOperation('publish')}
            disabled={bulkLoading}
            size="small"
            variant="success"
          >
            Publish
          </Button>
          
          <Button
            onClick={() => performBulkOperation('unpublish')}
            disabled={bulkLoading}
            size="small"
          >
            Unpublish
          </Button>
          
          <Button
            onClick={() => performBulkOperation('lock', { reason: 'Bulk admin lock' })}
            disabled={bulkLoading}
            size="small"
            variant="warning"
          >
            Lock
          </Button>
          
          <Button
            onClick={() => performBulkOperation('unlock')}
            disabled={bulkLoading}
            size="small"
          >
            Unlock
          </Button>
          
          <Button
            onClick={() => {
              if (window.confirm(`Delete ${selectedPages.size} selected pages? This cannot be undone.`)) {
                performBulkOperation('delete');
              }
            }}
            disabled={bulkLoading}
            size="small"
            variant="danger"
          >
            Delete
          </Button>
        </BulkActionsBar>
      )}

      {/* Error Display */}
      {error && (
        <ErrorMessage>{error}</ErrorMessage>
      )}

      {/* Bio Pages Table */}
      {loading ? (
        <LoadingMessage>Loading bio pages...</LoadingMessage>
      ) : bioPages.length === 0 ? (
        <LoadingMessage>No bio pages found</LoadingMessage>
      ) : (
        <BioPagesTable>
          <TableHeader>
            <div>
              <SelectCheckbox
                checked={selectedPages.size === bioPages.length && bioPages.length > 0}
                onChange={toggleSelectAll}
              />
            </div>
            <div>Bio Page</div>
            <div>Status</div>
            <div>Created</div>
            <div>Updated</div>
            <div>Optimization</div>
            <div>Actions</div>
          </TableHeader>
          
          {(bioPages || []).map((page) => (
            <TableRow key={page.id}>
              <div>
                <SelectCheckbox
                  checked={selectedPages.has(page.id)}
                  onChange={() => toggleSelectPage(page.id)}
                />
              </div>
              
              <BioInfo>
                <div className="handle">{page.handle}</div>
                <div className="curator">{page.curator_name || 'No curator'}</div>
              </BioInfo>
              
              <div>
                <StatusBadge className={page.locked ? 'locked' : page.is_published ? 'published' : 'draft'}>
                  {page.locked ? 'Locked' : page.is_published ? 'Published' : 'Draft'}
                </StatusBadge>
              </div>
              
              <div title={page.created_at}>
                {new Date(page.created_at).toLocaleDateString()}
              </div>
              
              <div title={page.updated_at}>
                {new Date(page.updated_at).toLocaleDateString()}
              </div>
              
              <div>
                <OptimizationBadge className={page.optimization_status || 'pending'}>
                  {page.optimization_status || 'Pending'}
                </OptimizationBadge>
              </div>
              
              <ActionsCell>
                <ActionButton
                  onClick={() => {
                    const bioUrl = 'https://127.0.0.1:3000/api/v1/bio/' + page.handle;
                    window.open(bioUrl, '_blank');
                  }}
                  title="View published bio page"
                >
                  View
                </ActionButton>
                
                <ActionButton
                  onClick={() => {
                    // Smooth transition to bio editor without page reload
                    const url = new URL(window.location);
                    url.searchParams.set('tab', 'bio');
                    url.searchParams.set('handle', page.handle);
                    window.history.pushState({}, '', url.toString());
                    // Trigger a custom event that AdminPage can listen to
                    window.dispatchEvent(new CustomEvent('adminTabChange', { 
                      detail: { tab: 'bio', handle: page.handle } 
                    }));
                  }}
                  title="Edit bio page"
                  className="success"
                >
                  Edit
                </ActionButton>
                
                <ActionButton
                  className={page.locked ? 'success' : 'danger'}
                  onClick={() => togglePageLock(page.id, page.locked)}
                  title={page.locked ? 'Unlock page' : 'Lock page'}
                >
                  {page.locked ? 'Unlock' : 'Lock'}
                </ActionButton>
              </ActionsCell>
            </TableRow>
          ))}
        </BioPagesTable>
      )}
    </BioPageAdminContainer>
  );
};

export default BioPageAdmin;