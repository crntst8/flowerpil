import styled from 'styled-components';
import { theme, Input } from '@shared/styles/GlobalStyles';

const SearchContainer = styled.div`
  position: relative;
  width: 100%;
`;

const SearchInput = styled(Input)`
  width: 100%;
  padding-left: ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};

  &::placeholder {
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: ${theme.fontSizes.tiny};
  }
`;

const SearchIcon = styled.span`
  position: absolute;
  left: ${theme.spacing.sm};
  top: 50%;
  transform: translateY(-50%);
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  pointer-events: none;
`;

const ClearButton = styled.button`
  position: absolute;
  right: ${theme.spacing.sm};
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  padding: ${theme.spacing.xs};
  cursor: pointer;
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  display: ${props => props.$visible ? 'block' : 'none'};

  &:hover {
    color: ${theme.colors.black};
  }
`;

const SearchFilter = ({ value, onChange, placeholder = 'Search...', showClear = true }) => {
  return (
    <SearchContainer>
      <SearchIcon>⌕</SearchIcon>
      <SearchInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {showClear && (
        <ClearButton
          $visible={value?.length > 0}
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          ×
        </ClearButton>
      )}
    </SearchContainer>
  );
};

export default SearchFilter;
