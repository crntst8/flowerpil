import React from 'react';
import styled from 'styled-components';
import { theme } from '../styles/GlobalStyles';
import { formatDateForDisplay } from '../../utils/curatorValidation';

const ShowContainer = styled.div`
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.3);
  padding: ${theme.spacing.lg};
  background: transparent;
  position: relative;
  transition: border-color 0.2s ease;
  
  @media (min-width: ${theme.breakpoints.desktop}) {
    display: flex;
    flex-direction: column;
  }
  
  &:hover {
    border-color: rgba(255, 255, 255, 0.5);
  }
`;

const ShowHeader = styled.div`
  display: flex;
  gap: ${theme.spacing.lg};
  margin-bottom: ${theme.spacing.md};
  
  @media (min-width: ${theme.breakpoints.desktop}) {
    align-items: flex-start;
    position: relative;
  }
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    gap: ${theme.spacing.md};
  }
`;

const DateBox = styled.div`
  flex-shrink: 0;
  width: 80px;
  height: 80px;
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  font-family: ${theme.fonts.mono};
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    align-self: center;
  }
`;

const DateMonth = styled.div`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
  opacity: 0.7;
  text-transform: uppercase;
  line-height: 1;
`;

const DateDay = styled.div`
  font-size: ${theme.fontSizes.large};
  font-weight: 600;
  color: ${theme.colors.white};
  line-height: 1;
  margin-top: 2px;
`;

const LeftSection = styled.div`
  display: flex;
  gap: ${theme.spacing.lg};
  flex: 1;
  min-width: 0;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    gap: ${theme.spacing.md};
  }
`;

const ShowInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  
  @media (min-width: ${theme.breakpoints.desktop}) {
    flex: 0 0 auto;
    width: 200px;
  }
`;

const GuestSection = styled.div`
  flex: 1;
  min-width: 0;
  
  @media (min-width: ${theme.breakpoints.desktop}) {
    width: 60%;
    padding-left: ${theme.spacing.lg};
  }
`;

const ShowLocation = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.medium};
  font-weight: 600;
  color: ${theme.colors.white};
  text-transform: uppercase;
  margin-bottom: ${theme.spacing.xs};
  overflow-wrap: anywhere; // Never break words mid-word
  word-break: normal;
  line-height: 1.3;
`;

const ShowVenue = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
  opacity: 0.8;
  text-transform: uppercase;
  overflow-wrap: anywhere;
  word-break: normal;
`;

const GuestList = styled.div`
  margin-top: ${theme.spacing.sm};
  
  @media (min-width: ${theme.breakpoints.desktop}) {
    margin-top: 0;
  }
`;

const GuestLabel = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
  opacity: 0.6;
  text-transform: uppercase;
  margin-bottom: ${theme.spacing.xs};
`;

const GuestNames = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
  opacity: 0.8;
  line-height: 1.4;
  
  .guest {
    display: block;
    margin-bottom: 2px;
    overflow-wrap: anywhere;
    word-break: normal;
    
    &:last-child {
      margin-bottom: 0;
    }
  }
`;

const RightSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: ${theme.spacing.sm};
  
  @media (min-width: ${theme.breakpoints.desktop}) {
    position: absolute;
    top: 0;
    right: 0;
    flex-shrink: 0;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  margin-bottom: ${theme.spacing.md};
  
  @media (min-width: ${theme.breakpoints.desktop}) {
    margin-bottom: ${theme.spacing.sm};
    flex-wrap: nowrap;
  }
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    justify-content: center;
  }
`;

const ActionButton = styled.a.withConfig({
  shouldForwardProp: (prop) => !['variant'].includes(prop)
})`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.4);
  background: ${props => {
    switch (props.variant) {
      case 'primary': return 'rgba(255, 255, 255, 0.1)';
      case 'secondary': return 'rgba(255, 255, 255, 0.05)';
      default: return 'transparent';
    }
  }};
  color: ${theme.colors.white};
  text-decoration: none;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.02em;
  transition: all 0.2s ease;
  min-height: 48px; // Touch target compliance
  white-space: nowrap;
  
  @media (min-width: ${theme.breakpoints.desktop}) {
    min-width: 80px;
    flex: 0 0 auto;
  }
  
  &:hover {
    border-color: ${theme.colors.white};
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-1px);
  }
  
  &:active {
    transform: translateY(0);
  }
  
  &:focus {
    outline: 2px dashed ${theme.colors.white};
    outline-offset: 2px;
  }
`;

const InfoButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.4);
  background: transparent;
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 48px;
  white-space: nowrap;
  
  @media (min-width: ${theme.breakpoints.desktop}) {
    width: 48px;
    height: 48px;
    padding: 0;
    flex: 0 0 auto;
  }
  
  &:hover {
    border-color: ${theme.colors.white};
    background: rgba(255, 255, 255, 0.05);
  }
  
  &:focus {
    outline: 2px dashed ${theme.colors.white};
    outline-offset: 2px;
  }
`;

const SaleBadge = styled.div.withConfig({
  shouldForwardProp: (prop) => !['saleIndicator'].includes(prop)
})`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 4px;
  align-self: flex-end;
  
  @media (max-width: calc(${theme.breakpoints.desktop} - 1px)) {
    position: absolute;
    top: ${theme.spacing.md};
    right: ${theme.spacing.md};
  }
  
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

/**
 * Show card component with sale badges and guest lists
 * 
 * @param {Object} props
 * @param {Object} props.show - Show data
 * @param {function} props.onInfoClick - Callback for info button click
 */
const ShowCard = ({ show, onInfoClick }) => {
  const formatShowDate = (dateString) => {
    const date = new Date(dateString);
    const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const day = date.getDate();
    return { month, day };
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

  const handleInfoClick = () => {
    if (onInfoClick) {
      onInfoClick(show);
    }
  };

  const { month, day } = formatShowDate(show.show_date);
  const hasGuests = show.guests && show.guests.length > 0;

  return (
    <ShowContainer>
      <ShowHeader>
        <LeftSection>
          <DateBox>
            <DateMonth>{month}</DateMonth>
            <DateDay>{day}</DateDay>
          </DateBox>
          
          <ShowInfo>
            <ShowLocation>
              {show.city}, {show.country}
            </ShowLocation>
            <ShowVenue>{show.venue}</ShowVenue>
          </ShowInfo>
          
          {hasGuests && (
            <GuestSection>
              <GuestList>
                <GuestLabel>With Special Guests</GuestLabel>
                <GuestNames>
                  {show.guests.map((guest, index) => (
                    <div key={index} className="guest">
                      {guest}
                    </div>
                  ))}
                </GuestNames>
              </GuestList>
            </GuestSection>
          )}
        </LeftSection>

        <RightSection>
          <ActionButtons>
            {show.ticket_url && (
              <ActionButton 
                href={show.ticket_url} 
                target="_blank" 
                rel="noopener noreferrer"
                variant="primary"
              >
                TICKETS
              </ActionButton>
            )}
            
            {show.info_url && (
              <ActionButton 
                href={show.info_url} 
                target="_blank" 
                rel="noopener noreferrer"
                variant="secondary"
              >
                INFO
              </ActionButton>
            )}
            
            <InfoButton onClick={handleInfoClick}>
              ⓘ
            </InfoButton>
          </ActionButtons>
          
          {show.sale_indicator && (
            <SaleBadge saleIndicator={show.sale_indicator}>
              {formatSaleBadgeText(show.sale_indicator)}
            </SaleBadge>
          )}
        </RightSection>
      </ShowHeader>
    </ShowContainer>
  );
};

export default ShowCard;