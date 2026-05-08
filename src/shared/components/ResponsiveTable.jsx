import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const TableContainer = styled.div`
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  border-radius: 4px;
  overflow-x: auto;
`;

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: ${props => props.columns || '1fr'};
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
  grid-template-columns: ${props => props.columns || '1fr'};
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
    display: block;
    padding: ${theme.spacing.lg};
    border: ${theme.borders.dashed} rgba(255, 255, 255, 0.2);
    margin-bottom: ${theme.spacing.md};
    border-radius: 4px;
    
    &:last-child {
      margin-bottom: 0;
      border-bottom: ${theme.borders.dashed} rgba(255, 255, 255, 0.2);
    }
  }
`;

const MobileRowContent = styled.div`
  display: none;
  
  @media (max-width: ${theme.breakpoints.tablet}) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: ${theme.spacing.md};
    margin-top: ${theme.spacing.md};
  }
`;

const MobileField = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  
  .field-label {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    color: ${theme.colors.gray[500]};
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  
  .field-value {
    font-size: ${theme.fontSizes.small};
  }
`;

const LoadingMessage = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.gray[400]};
  font-family: ${theme.fonts.mono};
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.gray[400]};
  font-family: ${theme.fonts.mono};
`;

const ResponsiveTable = ({ 
  columns, 
  headers, 
  data, 
  loading, 
  empty,
  emptyMessage = "No data found",
  loadingMessage = "Loading...",
  renderRow,
  renderMobileFields,
  className
}) => {
  if (loading) {
    return <LoadingMessage>{loadingMessage}</LoadingMessage>;
  }

  if (empty || !data || data.length === 0) {
    return <EmptyMessage>{emptyMessage}</EmptyMessage>;
  }

  return (
    <TableContainer className={className}>
      {headers && (
        <TableHeader columns={columns}>
          {headers.map((header, index) => (
            <div key={index}>{header}</div>
          ))}
        </TableHeader>
      )}
      
      {data.map((item, index) => (
        <TableRow key={item.id || index} columns={columns}>
          {/* Desktop grid content */}
          {renderRow && renderRow(item, index)}
          
          {/* Mobile card content */}
          {renderMobileFields && (
            <MobileRowContent>
              {renderMobileFields(item, index).map((field, fieldIndex) => (
                <MobileField key={fieldIndex}>
                  <div className="field-label">{field.label}</div>
                  <div className="field-value">{field.value}</div>
                </MobileField>
              ))}
            </MobileRowContent>
          )}
        </TableRow>
      ))}
    </TableContainer>
  );
};

export default ResponsiveTable;