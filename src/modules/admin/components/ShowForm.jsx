import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import { 
  validateShowData, 
  SALE_INDICATORS,
  formatDateForInput 
} from '../../../utils/curatorValidation';

const FormContainer = styled(DashedBox)`
  margin-bottom: ${theme.spacing.xl};
  background: rgba(255, 255, 255, 0.02);
`;

const FormHeader = styled.div`
  margin-bottom: ${theme.spacing.lg};
  
  h3 {
    margin: 0;
    color: ${theme.colors.white};
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
  }
  
  p {
    margin: ${theme.spacing.xs} 0 0 0;
    color: ${theme.colors.white};
    opacity: 0.7;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
  }
`;

const FormGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  grid-template-columns: 1fr 1fr;
  margin-bottom: ${theme.spacing.lg};
  
  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const FormSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const FullWidthSection = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const Label = styled.label`
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const Input = styled.input`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.7);
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  
  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }
  
  &:focus {
    outline: none;
    border-color: ${theme.colors.white};
    background: rgba(0, 0, 0, 0.9);
  }
`;

const Select = styled.select`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.7);
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  
  option {
    background: #000000;
    color: #ffffff;
  }
  
  &:focus {
    outline: none;
    border-color: ${theme.colors.white};
  }
`;

const GuestSection = styled.div`
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.2);
  padding: ${theme.spacing.md};
  background: rgba(255, 255, 255, 0.02);
`;

const GuestList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const GuestItem = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;
`;

const GuestInput = styled(Input)`
  flex: 1;
`;

const RemoveGuestButton = styled(Button)`
  padding: ${theme.spacing.xs};
  min-width: auto;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 62, 62, 0.1);
  border-color: ${theme.colors.danger};
  color: ${theme.colors.white};
  
  &:hover {
    background: rgba(255, 62, 62, 0.2);
  }
`;

const AddGuestButton = styled(Button)`
  width: 100%;
  margin-top: ${theme.spacing.sm};
`;

const ErrorList = styled.div`
  background: rgba(255, 62, 62, 0.1);
  border: ${theme.borders.dashed} ${theme.colors.danger};
  padding: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.lg};
  
  h4 {
    margin: 0 0 ${theme.spacing.sm} 0;
    color: ${theme.colors.white};
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
  }
  
  ul {
    margin: 0;
    padding-left: ${theme.spacing.lg};
    
    li {
      color: ${theme.colors.white};
      font-family: ${theme.fonts.mono};
      font-size: ${theme.fontSizes.small};
      margin-bottom: ${theme.spacing.xs};
    }
  }
`;

const FormActions = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  justify-content: flex-end;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
  }
`;

const ShowForm = ({ show, curatorId, curatorName, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    showDate: '',
    city: '',
    country: '',
    venue: '',
    ticketUrl: '',
    infoUrl: '',
    saleIndicator: ''
  });
  const [guests, setGuests] = useState(['']);
  const [errors, setErrors] = useState([]);

  // Initialize form data
  useEffect(() => {
    if (show) {
      setFormData({
        showDate: formatDateForInput(show.show_date) || '',
        city: show.city || '',
        country: show.country || '',
        venue: show.venue || '',
        ticketUrl: show.ticket_url || '',
        infoUrl: show.info_url || '',
        saleIndicator: show.sale_indicator || ''
      });
      
      if (show.guests && show.guests.length > 0) {
        setGuests([...show.guests, '']); // Add empty field for new guest
      }
    }
  }, [show]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear errors when user starts typing
    setErrors([]);
  };

  const handleGuestChange = (index, value) => {
    const newGuests = [...guests];
    newGuests[index] = value;
    setGuests(newGuests);
  };

  const addGuest = () => {
    if (guests.length < 10) { // Maximum 10 guests
      setGuests([...guests, '']);
    }
  };

  const removeGuest = (index) => {
    if (guests.length > 1) {
      const newGuests = guests.filter((_, i) => i !== index);
      setGuests(newGuests);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Prepare data for validation
    const submitData = {
      ...formData,
      guests: guests.filter(guest => guest.trim() !== '')
    };
    
    // Validate form data
    const validation = validateShowData(submitData);
    
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }
    
    onSubmit(submitData);
  };

  const isEditing = !!show;

  return (
    <FormContainer>
      <FormHeader>
        <h3>{isEditing ? 'Edit Show' : 'Create Show'}</h3>
        <p>Curator: {curatorName}</p>
      </FormHeader>

      {errors.length > 0 && (
        <ErrorList>
          <h4>Please fix the following errors:</h4>
          <ul>
            {errors.map((error, index) => (
              <li key={index}>{error.message}</li>
            ))}
          </ul>
        </ErrorList>
      )}

      <form onSubmit={handleSubmit}>
        <FormGrid>
          <FormSection>
            <FormField>
              <Label htmlFor="showDate">Show Date *</Label>
              <Input
                id="showDate"
                name="showDate"
                type="date"
                value={formData.showDate}
                onChange={handleInputChange}
                required
              />
            </FormField>

            <FormField>
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                name="city"
                type="text"
                value={formData.city}
                onChange={handleInputChange}
                placeholder="Enter city"
                required
              />
            </FormField>

            <FormField>
              <Label htmlFor="country">Country *</Label>
              <Input
                id="country"
                name="country"
                type="text"
                value={formData.country}
                onChange={handleInputChange}
                placeholder="Enter country"
                required
              />
            </FormField>
          </FormSection>

          <FormSection>
            <FormField>
              <Label htmlFor="venue">Venue *</Label>
              <Input
                id="venue"
                name="venue"
                type="text"
                value={formData.venue}
                onChange={handleInputChange}
                placeholder="Enter venue name"
                required
              />
            </FormField>

            <FormField>
              <Label htmlFor="saleIndicator">Ticket Sale Status</Label>
              <Select
                id="saleIndicator"
                name="saleIndicator"
                value={formData.saleIndicator}
                onChange={handleInputChange}
              >
                <option value="">No status</option>
                {SALE_INDICATORS.map(status => (
                  <option key={status} value={status}>
                    {status.replace('_', ' ')}
                  </option>
                ))}
              </Select>
            </FormField>
          </FormSection>

          <FullWidthSection>
            <FormField>
              <Label htmlFor="ticketUrl">Ticket URL</Label>
              <Input
                id="ticketUrl"
                name="ticketUrl"
                type="url"
                value={formData.ticketUrl}
                onChange={handleInputChange}
                placeholder="https://..."
              />
            </FormField>

            <FormField>
              <Label htmlFor="infoUrl">Info URL</Label>
              <Input
                id="infoUrl"
                name="infoUrl"
                type="url"
                value={formData.infoUrl}
                onChange={handleInputChange}
                placeholder="https://..."
              />
            </FormField>
          </FullWidthSection>

          <FullWidthSection>
            <GuestSection>
              <Label>Supporting Acts / Special Guests</Label>
              <GuestList>
                {guests.map((guest, index) => (
                  <GuestItem key={index}>
                    <GuestInput
                      type="text"
                      value={guest}
                      onChange={(e) => handleGuestChange(index, e.target.value)}
                      placeholder={`Guest ${index + 1} name`}
                    />
                    {guests.length > 1 && (
                      <RemoveGuestButton
                        type="button"
                        onClick={() => removeGuest(index)}
                      >
                        ×
                      </RemoveGuestButton>
                    )}
                  </GuestItem>
                ))}
              </GuestList>
              {guests.length < 10 && (
                <AddGuestButton type="button" onClick={addGuest}>
                  Add Guest
                </AddGuestButton>
              )}
            </GuestSection>
          </FullWidthSection>
        </FormGrid>

        <FormActions>
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">
            {isEditing ? 'Update Show' : 'Create Show'}
          </Button>
        </FormActions>
      </form>
    </FormContainer>
  );
};

export default ShowForm;