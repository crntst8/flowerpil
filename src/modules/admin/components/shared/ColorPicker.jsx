import styled from 'styled-components';
import { theme, Input } from '@shared/styles/GlobalStyles';

const ColorPickerContainer = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  width: 100%;
`;

const ColorSwatch = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  background: ${props => props.$color || '#ffffff'};

  &:hover {
    border-color: ${theme.colors.black};
  }
`;

const ColorInput = styled(Input).attrs({ type: 'color' })`
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
`;

const ColorValue = styled(Input)`
  flex: 1;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
`;

const ColorPicker = ({ value, onChange, label, placeholder = '#000000' }) => {
  return (
    <ColorPickerContainer>
      <ColorSwatch $color={value}>
        <ColorInput
          value={value || '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label || 'Pick a color'}
        />
      </ColorSwatch>
      <ColorValue
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label || 'Color value'}
      />
    </ColorPickerContainer>
  );
};

export default ColorPicker;
