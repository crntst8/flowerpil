import { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { theme, Button, Input } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost, adminPut, adminDelete } from '../../utils/adminApi';
import { CollapsibleSection, ColorPicker as SharedColorPicker } from '../shared';
import { getCuratorTypeOptions } from '@shared/constants/curatorTypes';

const HelperText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const AddCuratorTypeForm = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr auto auto;
  gap: ${theme.spacing.sm};
  align-items: center;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${theme.colors.black};
  background: ${theme.colors.fpwhite};

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
  }
`;

const ColorPicker = styled.input.attrs({ type: 'color' })`
  width: 48px;
  height: 36px;
  padding: 0;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.3);
  background: transparent;
  cursor: pointer;
`;

const CuratorTypeGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  margin-top: ${theme.spacing.md};
`;

const CuratorTypeSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const CuratorTypeSectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing.xs} 0;
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.1);
`;

const CuratorTypeSectionTitle = styled.h4`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const CuratorTypeSectionMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const CuratorTypeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const CuratorTypeRow = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: ${theme.spacing.sm};
  align-items: center;
  padding: ${theme.spacing.xs};
  border: ${theme.borders.dashed} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
`;

const CuratorTypeBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const CuratorTypeName = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const CuratorTypeId = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const CuratorTypeActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
`;

const GhostButton = styled(Button)`
  background: transparent;
  border-color: rgba(0, 0, 0, 0.25);
  color: ${theme.colors.black};
  font-size: ${theme.fontSizes.tiny};

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.06);
    border-color: ${theme.colors.black};
  }
`;

const InlineInput = styled.input`
  width: 100%;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.25);
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  padding: ${theme.spacing.xs};
  letter-spacing: 0.05em;
  text-transform: uppercase;

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }
`;

const CuratorTypeManager = ({ onStatusChange }) => {
  const [curatorTypes, setCuratorTypes] = useState([]);
  const [curatorTypeColors, setCuratorTypeColors] = useState({});
  const [newCuratorType, setNewCuratorType] = useState({ id: '', label: '', color: '#ffffff' });
  const [editingType, setEditingType] = useState(null);
  const [editingTypeDraft, setEditingTypeDraft] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const customCuratorTypes = useMemo(
    () => (curatorTypes || []).filter(type => type.custom),
    [curatorTypes]
  );

  const curatorTypeOptions = useMemo(
    () => getCuratorTypeOptions(customCuratorTypes),
    [customCuratorTypes]
  );

  const customTypeMap = useMemo(() => {
    return customCuratorTypes.reduce((acc, type) => {
      acc[type.id] = type;
      return acc;
    }, {});
  }, [customCuratorTypes]);

  const curatorTypeSections = useMemo(() => {
    const sections = [];
    let currentSection = null;

    curatorTypeOptions.forEach(option => {
      if (option.isHeader) {
        currentSection = {
          id: option.value,
          label: option.label,
          options: []
        };
        sections.push(currentSection);
      } else if (currentSection) {
        currentSection.options.push(option);
      }
    });

    return sections.filter(section => section.options.length > 0);
  }, [curatorTypeOptions]);

  const formatCategoryLabel = (rawLabel = '') => {
    const match = rawLabel.match(/—\[(.*)\]—/);
    const base = match ? match[1] : rawLabel;
    return base
      .split('-')
      .join(' ')
      .toLowerCase()
      .replace(/(^|\s)([a-z])/g, (_, prefix, char) => `${prefix}${char.toUpperCase()}`);
  };

  useEffect(() => {
    loadCuratorTypes();
  }, []);

  const loadCuratorTypes = async () => {
    try {
      const data = await adminGet('/api/v1/admin/site-admin/curator-types');
      setCuratorTypes(data.types || []);
      setCuratorTypeColors(data.colors || {});
    } catch (error) {
      onStatusChange?.('error', `Failed to load curator types: ${error.message}`);
    }
  };

  const handleAddCuratorType = async () => {
    if (!newCuratorType.id.trim() || !newCuratorType.label.trim()) {
      onStatusChange?.('error', 'Both ID and label are required');
      return;
    }

    try {
      await adminPost('/api/v1/admin/site-admin/curator-types', newCuratorType);
      await loadCuratorTypes();
      setNewCuratorType({ id: '', label: '', color: '#ffffff' });
      onStatusChange?.('success', 'Curator type added');
    } catch (error) {
      onStatusChange?.('error', `Failed to add curator type: ${error.message}`);
    }
  };

  const handleEditCuratorType = async (typeId, updates) => {
    const nextLabel = updates?.label?.trim();
    if (!nextLabel) {
      onStatusChange?.('error', 'Label is required');
      return;
    }

    try {
      await adminPut(`/api/v1/admin/site-admin/curator-types/${typeId}`, { ...updates, label: nextLabel });
      await loadCuratorTypes();
      setEditingType(null);
      setEditingTypeDraft('');
      onStatusChange?.('success', 'Curator type updated');
    } catch (error) {
      onStatusChange?.('error', `Failed to update curator type: ${error.message}`);
    }
  };

  const handleDeleteCuratorType = async (typeId) => {
    if (!confirm(`Are you sure you want to delete the curator type "${typeId}"?`)) {
      return;
    }

    try {
      if (editingType === typeId) {
        setEditingType(null);
        setEditingTypeDraft('');
      }
      await adminDelete(`/api/v1/admin/site-admin/curator-types/${typeId}`);
      await loadCuratorTypes();
      onStatusChange?.('success', 'Curator type deleted');
    } catch (error) {
      onStatusChange?.('error', `Failed to delete curator type: ${error.message}`);
    }
  };

  const handleCuratorTypeColorChange = async (typeId, color) => {
    try {
      await adminPost('/api/v1/admin/site-admin/curator-type-color', { typeId, color });
      setCuratorTypeColors(prev => ({ ...prev, [typeId]: color }));
      onStatusChange?.('success', 'Color updated');
    } catch (error) {
      onStatusChange?.('error', `Failed to update color: ${error.message}`);
    }
  };

  return (
    <CollapsibleSection
      title={`Curator Types (${customCuratorTypes.length} custom)`}
      collapsed={collapsed}
      onToggle={setCollapsed}
    >
      <HelperText>Keep curator segments and their colours aligned across dashboards and automations.</HelperText>

      <AddCuratorTypeForm>
        <Input
          type="text"
          placeholder="Type ID (e.g., 'record-store')"
          value={newCuratorType.id}
          onChange={(e) => setNewCuratorType(prev => ({ ...prev, id: e.target.value }))}
        />
        <Input
          type="text"
          placeholder="Type Label (e.g., 'Record Store')"
          value={newCuratorType.label}
          onChange={(e) => setNewCuratorType(prev => ({ ...prev, label: e.target.value }))}
        />
        <ColorPicker
          value={newCuratorType.color}
          onChange={(e) => setNewCuratorType(prev => ({ ...prev, color: e.target.value }))}
          title="Set color for new curator type"
          aria-label="Set color for new curator type"
        />
        <Button onClick={handleAddCuratorType} size="small">
          Add Type
        </Button>
      </AddCuratorTypeForm>

      <CuratorTypeGrid>
        {curatorTypeSections.map(section => (
          <CuratorTypeSection key={section.id}>
            <CuratorTypeSectionHeader>
              <CuratorTypeSectionTitle>{formatCategoryLabel(section.label)}</CuratorTypeSectionTitle>
              <CuratorTypeSectionMeta>
                {section.options.length} {section.options.length === 1 ? 'type' : 'types'}
              </CuratorTypeSectionMeta>
            </CuratorTypeSectionHeader>
            <CuratorTypeList>
              {section.options.map(option => {
                const assignedColor = curatorTypeColors[option.value] || '#ffffff';
                const isCustom = Boolean(customTypeMap[option.value]);
                const isEditing = editingType === option.value && isCustom;
                const currentLabel = isCustom
                  ? (editingType === option.value ? editingTypeDraft : customTypeMap[option.value]?.label)
                  : option.label;

                return (
                  <CuratorTypeRow key={option.value}>
                    <ColorPicker
                      value={assignedColor}
                      onChange={(e) => handleCuratorTypeColorChange(option.value, e.target.value)}
                      title={`Set color for ${option.label}`}
                      aria-label={`Set color for ${option.label}`}
                    />
                    <CuratorTypeBody>
                      {isEditing && isCustom ? (
                        <InlineInput
                          value={editingTypeDraft}
                          onChange={(e) => setEditingTypeDraft(e.target.value)}
                          placeholder="Type label"
                        />
                      ) : (
                        <>
                          <CuratorTypeName>{currentLabel}</CuratorTypeName>
                          <CuratorTypeId>{option.value}</CuratorTypeId>
                        </>
                      )}
                    </CuratorTypeBody>
                    <CuratorTypeActions>
                      {isCustom && (
                        isEditing ? (
                          <>
                            <Button
                              size="tiny"
                              onClick={() => handleEditCuratorType(option.value, { label: editingTypeDraft })}
                            >
                              Save
                            </Button>
                            <GhostButton
                              type="button"
                              onClick={() => {
                                setEditingType(null);
                                setEditingTypeDraft('');
                              }}
                            >
                              Cancel
                            </GhostButton>
                          </>
                        ) : (
                          <>
                            <GhostButton
                              type="button"
                              onClick={() => {
                                const existingLabel = customTypeMap[option.value]?.label || option.label;
                                setEditingType(option.value);
                                setEditingTypeDraft(existingLabel);
                              }}
                            >
                              Edit
                            </GhostButton>
                            <Button
                              size="tiny"
                              variant="danger"
                              onClick={() => handleDeleteCuratorType(option.value)}
                            >
                              Delete
                            </Button>
                          </>
                        )
                      )}
                    </CuratorTypeActions>
                  </CuratorTypeRow>
                );
              })}
            </CuratorTypeList>
          </CuratorTypeSection>
        ))}
      </CuratorTypeGrid>
    </CollapsibleSection>
  );
};

export default CuratorTypeManager;
