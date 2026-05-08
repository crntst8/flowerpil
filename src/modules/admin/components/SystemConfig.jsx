import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import { useAuthenticatedApi } from '../hooks/useAuthenticatedApi';

const SystemConfigContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xl};
`;

const ConfigSection = styled.div`
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

const ConfigTabs = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  margin-bottom: ${theme.spacing.lg};
  border-bottom: ${theme.borders.dashed} rgba(255, 255, 255, 0.3);
  padding-bottom: ${theme.spacing.md};
`;

const TabButton = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== '$active'
})`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: ${theme.borders.dashed} ${props => props.$active ? theme.colors.white : 'rgba(255, 255, 255, 0.4)'};
  background: ${props => props.$active ? 'rgba(255, 255, 255, 0.1)' : 'transparent'};
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  
  &:hover {
    border-color: ${theme.colors.white};
    background: rgba(255, 255, 255, 0.05);
  }
`;

const ConfigGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: ${theme.spacing.lg};
`;

const ConfigCard = styled(DashedBox)`
  padding: ${theme.spacing.lg};
  
  .config-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: ${theme.spacing.md};
    
    .config-info {
      flex: 1;
      
      .config-key {
        font-family: ${theme.fonts.mono};
        font-weight: bold;
        color: ${theme.colors.white};
        margin-bottom: ${theme.spacing.xs};
      }
      
      .config-description {
        font-size: ${theme.fontSizes.small};
        color: ${theme.colors.gray[400]};
        line-height: 1.4;
      }
    }
    
    .config-actions {
      display: flex;
      gap: ${theme.spacing.xs};
      flex-shrink: 0;
    }
  }
  
  .config-content {
    .config-value {
      background: rgba(255, 255, 255, 0.05);
      border: ${theme.borders.dashed} ${theme.colors.gray[300]};
      padding: ${theme.spacing.md};
      font-family: ${theme.fonts.mono};
      font-size: ${theme.fontSizes.small};
      color: ${theme.colors.white};
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 200px;
      overflow-y: auto;
    }
    
    .config-editor {
      textarea {
        width: 100%;
        min-height: 120px;
        background: rgba(255, 255, 255, 0.05);
        border: ${theme.borders.dashed} ${theme.colors.gray[300]};
        color: ${theme.colors.white};
        padding: ${theme.spacing.md};
        font-family: ${theme.fonts.mono};
        font-size: ${theme.fontSizes.small};
        resize: vertical;
        
        &:focus {
          outline: none;
          border-color: ${theme.colors.white};
        }
      }
      
      .editor-actions {
        display: flex;
        gap: ${theme.spacing.sm};
        margin-top: ${theme.spacing.md};
        
        @media (max-width: ${theme.breakpoints.mobile}) {
          flex-direction: column;
        }
      }
    }
  }
  
  .config-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: ${theme.spacing.md};
    padding-top: ${theme.spacing.md};
    border-top: ${theme.borders.dashed} rgba(255, 255, 255, 0.1);
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.gray[500]};
    
    .config-type {
      padding: ${theme.spacing.xs} ${theme.spacing.sm};
      border: ${theme.borders.dashed} ${theme.colors.gray[400]};
      border-radius: 2px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      
      &.system {
        border-color: #3b82f6;
        color: #3b82f6;
      }
      
      &.performance {
        border-color: #f59e0b;
        color: #f59e0b;
      }
      
      &.security {
        border-color: #ef4444;
        color: #ef4444;
      }
      
      &.analytics {
        border-color: #4ade80;
        color: #4ade80;
      }
    }
    
    .config-updated {
      font-family: ${theme.fonts.mono};
    }
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
  
  &.primary {
    border-color: #3b82f6;
    color: #3b82f6;
    
    &:hover:not(:disabled) {
      background: rgba(59, 130, 246, 0.1);
    }
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
  
  &.warning {
    border-color: #f59e0b;
    color: #f59e0b;
    
    &:hover:not(:disabled) {
      background: rgba(245, 158, 11, 0.1);
    }
  }
`;

const ControlBar = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  align-items: center;
  flex-wrap: wrap;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const NewConfigForm = styled(DashedBox)`
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

const SystemConfig = () => {
  const { authenticatedFetch } = useAuthenticatedApi();
  
  const [configurations, setConfigurations] = useState([]);
  const [groupedConfigs, setGroupedConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // UI state
  const [activeTab, setActiveTab] = useState('system');
  const [editingConfig, setEditingConfig] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [showNewConfigForm, setShowNewConfigForm] = useState(false);
  
  // New config form
  const [newConfig, setNewConfig] = useState({
    config_key: '',
    config_value: '{}',
    config_type: 'system',
    description: ''
  });

  // Load system configurations
  const loadConfigurations = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authenticatedFetch('/api/v1/admin/system-config');
      const data = await response.json();
      setConfigurations(data.configurations || []);
      setGroupedConfigs(data.grouped || {});
    } catch (err) {
      setError(`Failed to load configurations: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Update configuration
  const updateConfiguration = async (configKey, configValue, configType, description) => {
    try {
      // Validate JSON format
      if (configValue.trim()) {
        try {
          JSON.parse(configValue);
        } catch (jsonErr) {
          setError('Invalid JSON format in configuration value');
          return;
        }
      }
      
      await authenticatedFetch(`/api/v1/admin/system-config/${configKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_value: JSON.parse(configValue),
          config_type: configType,
          description: description
        })
      });
      
      setEditingConfig(null);
      setEditingValue('');
      await loadConfigurations();
    } catch (err) {
      setError(`Failed to update configuration: ${err.message}`);
    }
  };

  // Delete configuration
  const deleteConfiguration = async (configKey) => {
    if (!window.confirm(`Delete configuration "${configKey}"? This cannot be undone.`)) {
      return;
    }
    
    try {
      await authenticatedFetch(`/api/v1/admin/system-config/${configKey}`, {
        method: 'DELETE'
      });
      
      await loadConfigurations();
    } catch (err) {
      setError(`Failed to delete configuration: ${err.message}`);
    }
  };

  // Reset configurations to defaults
  const resetToDefaults = async () => {
    if (!window.confirm('Reset all configurations to default values? Current custom values will be lost.')) {
      return;
    }
    
    try {
      await authenticatedFetch('/api/v1/admin/system-config/reset-defaults', {
        method: 'POST'
      });
      
      await loadConfigurations();
      setError(null);
    } catch (err) {
      setError(`Failed to reset configurations: ${err.message}`);
    }
  };

  // Create new configuration
  const createConfiguration = async (e) => {
    e.preventDefault();
    
    if (!newConfig.config_key.trim() || !newConfig.config_value.trim()) {
      setError('Configuration key and value are required');
      return;
    }
    
    try {
      // Validate JSON format
      JSON.parse(newConfig.config_value);
      
      await authenticatedFetch(`/api/v1/admin/system-config/${newConfig.config_key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_value: JSON.parse(newConfig.config_value),
          config_type: newConfig.config_type,
          description: newConfig.description
        })
      });
      
      // Reset form
      setNewConfig({
        config_key: '',
        config_value: '{}',
        config_type: 'system',
        description: ''
      });
      setShowNewConfigForm(false);
      await loadConfigurations();
    } catch (err) {
      if (err.message.includes('JSON')) {
        setError('Invalid JSON format in configuration value');
      } else {
        setError(`Failed to create configuration: ${err.message}`);
      }
    }
  };

  // Start editing configuration
  const startEditing = (config) => {
    setEditingConfig(config.config_key);
    setEditingValue(JSON.stringify(config.config_value, null, 2));
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingConfig(null);
    setEditingValue('');
  };

  // Get available config types
  const configTypes = ['system', 'performance', 'security', 'analytics'];
  
  // Get configurations for active tab
  const getActiveConfigs = () => {
    return groupedConfigs[activeTab] || [];
  };

  // Load data on component mount
  useEffect(() => {
    loadConfigurations();
  }, []);

  return (
    <SystemConfigContainer>
      <ConfigSection>
        <div className="section-header">
          <h2>System Configuration</h2>
          <ControlBar>
            <Button onClick={loadConfigurations} disabled={loading} size="small">
              Refresh
            </Button>
            <Button 
              onClick={() => setShowNewConfigForm(!showNewConfigForm)}
              variant="primary"
              size="small"
            >
              {showNewConfigForm ? 'Cancel' : 'New Config'}
            </Button>
            <Button onClick={resetToDefaults} variant="warning" size="small">
              Reset to Defaults
            </Button>
          </ControlBar>
        </div>
        
        {/* Configuration Type Tabs */}
        <ConfigTabs>
          {configTypes.map(type => (
            <TabButton
              key={type}
              $active={activeTab === type}
              onClick={() => setActiveTab(type)}
            >
              {type} ({(groupedConfigs[type] || []).length})
            </TabButton>
          ))}
        </ConfigTabs>
        
        {/* New Configuration Form */}
        {showNewConfigForm && (
          <NewConfigForm as="form" onSubmit={createConfiguration}>
            <div className="form-header">Create New Configuration</div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Configuration Key *</label>
                <input
                  type="text"
                  placeholder="e.g. feature_flags_enabled"
                  value={newConfig.config_key}
                  onChange={(e) => setNewConfig({
                    ...newConfig, 
                    config_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')
                  })}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Configuration Type</label>
                <select
                  value={newConfig.config_type}
                  onChange={(e) => setNewConfig({...newConfig, config_type: e.target.value})}
                >
                  {configTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Configuration Value (JSON) *</label>
                <textarea
                  placeholder='{"enabled": true, "value": 100}'
                  value={newConfig.config_value}
                  onChange={(e) => setNewConfig({...newConfig, config_value: e.target.value})}
                  required
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Description</label>
                <textarea
                  placeholder="Description of what this configuration controls..."
                  value={newConfig.description}
                  onChange={(e) => setNewConfig({...newConfig, description: e.target.value})}
                />
              </div>
            </div>
            
            <div className="form-actions">
              <Button type="submit" variant="success">
                Create Configuration
              </Button>
              <Button type="button" onClick={() => setShowNewConfigForm(false)}>
                Cancel
              </Button>
            </div>
          </NewConfigForm>
        )}
        
        {/* Error Display */}
        {error && (
          <ErrorMessage>{error}</ErrorMessage>
        )}
        
        {/* Configuration Cards */}
        {loading ? (
          <LoadingMessage>Loading system configurations...</LoadingMessage>
        ) : getActiveConfigs().length === 0 ? (
          <LoadingMessage>No {activeTab} configurations found</LoadingMessage>
        ) : (
          <ConfigGrid>
            {getActiveConfigs().map((config) => (
              <ConfigCard key={config.config_key}>
                <div className="config-header">
                  <div className="config-info">
                    <div className="config-key">{config.config_key}</div>
                    <div className="config-description">
                      {config.description || 'No description provided'}
                    </div>
                  </div>
                  
                  <div className="config-actions">
                    {editingConfig === config.config_key ? (
                      <>
                        <ActionButton
                          className="success"
                          onClick={() => updateConfiguration(
                            config.config_key, 
                            editingValue, 
                            config.config_type,
                            config.description
                          )}
                        >
                          Save
                        </ActionButton>
                        <ActionButton onClick={cancelEditing}>
                          Cancel
                        </ActionButton>
                      </>
                    ) : (
                      <>
                        <ActionButton
                          className="primary"
                          onClick={() => startEditing(config)}
                        >
                          Edit
                        </ActionButton>
                        <ActionButton
                          className="danger"
                          onClick={() => deleteConfiguration(config.config_key)}
                        >
                          Delete
                        </ActionButton>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="config-content">
                  {editingConfig === config.config_key ? (
                    <div className="config-editor">
                      <textarea
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        placeholder="Enter valid JSON configuration..."
                      />
                    </div>
                  ) : (
                    <div className="config-value">
                      {JSON.stringify(config.config_value, null, 2)}
                    </div>
                  )}
                </div>
                
                <div className="config-meta">
                  <span className={`config-type ${config.config_type}`}>
                    {config.config_type}
                  </span>
                  <div className="config-updated">
                    {config.updated_at 
                      ? `Updated: ${new Date(config.updated_at).toLocaleDateString()}`
                      : 'Never updated'
                    }
                    {config.updated_by_username && (
                      <span> by {config.updated_by_username}</span>
                    )}
                  </div>
                </div>
              </ConfigCard>
            ))}
          </ConfigGrid>
        )}
      </ConfigSection>
    </SystemConfigContainer>
  );
};

export default SystemConfig;
