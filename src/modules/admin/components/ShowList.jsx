import React from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import { formatDateForDisplay } from '../../../utils/curatorValidation';

const ShowListContainer = styled(DashedBox)`
  margin-bottom: ${theme.spacing.xl};
`;

const ShowListHeader = styled.div`
  margin-bottom: ${theme.spacing.lg};
  
  h3 {
    margin: 0;
    color: ${theme.colors.white};
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
  }
`;

const ShowGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const ShowCard = styled.div`
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.3);
  padding: ${theme.spacing.md};
  background: rgba(255, 255, 255, 0.02);
  transition: border-color 0.2s ease;
  
  &:hover {
    border-color: rgba(255, 255, 255, 0.5);
  }
`;

const ShowHeader = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.md};
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    gap: ${theme.spacing.sm};
  }
`;

const DateBox = styled.div`
  width: 60px;
  height: 60px;
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  font-family: ${theme.fonts.mono};
  flex-shrink: 0;
`;

const DateMonth = styled.div`
  font-size: 10px;
  color: ${theme.colors.white};
  opacity: 0.7;
  text-transform: uppercase;
  line-height: 1;
`;

const DateDay = styled.div`
  font-size: ${theme.fontSizes.medium};
  font-weight: 600;
  color: ${theme.colors.white};
  line-height: 1;
  margin-top: 2px;
`;

const ShowInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const ShowLocation = styled.h4`
  margin: 0 0 ${theme.spacing.xs} 0;
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.medium};
  text-transform: uppercase;
  overflow-wrap: anywhere;
  word-break: normal;
`;

const ShowVenue = styled.div`
  color: ${theme.colors.white};
  opacity: 0.8;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  margin-bottom: ${theme.spacing.xs};
`;

const ShowMeta = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
  margin-bottom: ${theme.spacing.xs};
`;

const MetaTag = styled.span`
  padding: 2px ${theme.spacing.xs};
  border: 1px solid rgba(255, 255, 255, 0.3);
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  background: rgba(255, 255, 255, 0.05);
`;

const SaleBadge = styled.span.withConfig({
  shouldForwardProp: (prop) => !['saleIndicator'].includes(prop)
})`
  padding: 2px ${theme.spacing.xs};
  font-size: ${theme.fontSizes.small};
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  
  ${props => {
    switch (props.saleIndicator) {
      case 'ON_SALE':
        return `
          background: rgba(76, 175, 80, 0.2);
          color: #4CAF50;
          border: 1px solid #4CAF50;
        `;
      case 'FIFTY_SOLD':
        return `
          background: rgba(255, 193, 7, 0.2);
          color: #FFD60A;
          border: 1px solid #FFD60A;
        `;
      case 'SOLD_OUT':
        return `
          background: rgba(255, 30, 30, 0.2);
          color: #FF1E1E;
          border: 1px solid #FF1E1E;
        `;
      default:
        return 'display: none;';
    }
  }}
`;

const LinkBadge = styled.span`
  padding: 2px ${theme.spacing.xs};
  background: rgba(76, 175, 80, 0.2);
  color: #4CAF50;
  border: 1px solid #4CAF50;
  font-size: ${theme.fontSizes.small};
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
`;

const GuestList = styled.div`
  margin-top: ${theme.spacing.sm};
`;

const GuestLabel = styled.div`
  color: ${theme.colors.white};
  opacity: 0.6;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  margin-bottom: ${theme.spacing.xs};
`;

const GuestNames = styled.div`
  color: ${theme.colors.white};
  opacity: 0.8;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  line-height: 1.4;
  
  .guest {
    display: inline;
    
    &:not(:last-child):after {
      content: ' • ';
      opacity: 0.5;
    }
  }
`;

const ShowLinks = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  margin-bottom: ${theme.spacing.md};
`;

const ShowActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: flex-end;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    justify-content: stretch;
    
    button {
      flex: 1;
    }
  }
`;

const ActionButton = styled(Button)`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  font-size: ${theme.fontSizes.small};
  min-height: 36px;
`;

const DangerButton = styled(ActionButton)`
  border-color: ${theme.colors.danger};
  
  &:hover {
    background: rgba(255, 62, 62, 0.1);
    border-color: ${theme.colors.danger};
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.white};
  opacity: 0.6;
  font-family: ${theme.fonts.mono};
  
  p {
    margin: 0;
    font-size: ${theme.fontSizes.medium};
  }
`;

const ShowList = ({ shows, onEdit, onDelete }) => {
  const formatShowDate = (dateString) => {
    const date = new Date(dateString);
    const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const day = date.getDate();
    return { month, day };
  };

  const isUpcoming = (dateString) => {
    return new Date(dateString) > new Date();
  };

  const formatSaleBadgeText = (indicator) => {
    switch (indicator) {
      case 'ON_SALE':
        return 'ON SALE';
      case 'FIFTY_SOLD':
        return '50% SOLD';
      case 'SOLD_OUT':
        return 'SOLD OUT';
      default:
        return '';
    }
  };

  const renderShowLinks = (show) => {
    const links = [];
    
    if (show.ticket_url) links.push('Tickets');
    if (show.info_url) links.push('Info');
    
    return links;
  };

  if (shows.length === 0) {
    return (
      <ShowListContainer>
        <ShowListHeader>
          <h3>Shows</h3>
        </ShowListHeader>
        <EmptyState>
          <p>No shows found</p>
        </EmptyState>
      </ShowListContainer>
    );
  }

  return (
    <ShowListContainer>
      <ShowListHeader>
        <h3>Shows ({shows.length})</h3>
      </ShowListHeader>
      
      <ShowGrid>
        {shows.map((show) => {
          const { month, day } = formatShowDate(show.show_date);
          const hasGuests = show.guests && show.guests.length > 0;
          
          return (
            <ShowCard key={show.id}>
              <ShowHeader>
                <DateBox>
                  <DateMonth>{month}</DateMonth>
                  <DateDay>{day}</DateDay>
                </DateBox>
                
                <ShowInfo>
                  <ShowLocation>
                    {show.city}, {show.country}
                  </ShowLocation>
                  <ShowVenue>{show.venue}</ShowVenue>
                  
                  <ShowMeta>
                    {isUpcoming(show.show_date) ? (
                      <MetaTag style={{ background: 'rgba(76, 175, 80, 0.2)', color: '#4CAF50', borderColor: '#4CAF50' }}>
                        UPCOMING
                      </MetaTag>
                    ) : (
                      <MetaTag style={{ background: 'rgba(158, 158, 158, 0.2)', color: '#9E9E9E', borderColor: '#9E9E9E' }}>
                        PAST
                      </MetaTag>
                    )}
                    
                    {show.sale_indicator && (
                      <SaleBadge saleIndicator={show.sale_indicator}>
                        {formatSaleBadgeText(show.sale_indicator)}
                      </SaleBadge>
                    )}
                  </ShowMeta>
                  
                  {hasGuests && (
                    <GuestList>
                      <GuestLabel>With Special Guests</GuestLabel>
                      <GuestNames>
                        {show.guests.map((guest, index) => (
                          <span key={index} className="guest">
                            {guest}
                          </span>
                        ))}
                      </GuestNames>
                    </GuestList>
                  )}
                </ShowInfo>
              </ShowHeader>
              
              <ShowLinks>
                {renderShowLinks(show).map((link, index) => (
                  <LinkBadge key={index}>{link}</LinkBadge>
                ))}
              </ShowLinks>
              
              <ShowActions>
                <ActionButton onClick={() => onEdit(show)}>
                  Edit
                </ActionButton>
                <DangerButton onClick={() => onDelete(show.id)}>
                  Delete
                </DangerButton>
              </ShowActions>
            </ShowCard>
          );
        })}
      </ShowGrid>
    </ShowListContainer>
  );
};

export default ShowList;