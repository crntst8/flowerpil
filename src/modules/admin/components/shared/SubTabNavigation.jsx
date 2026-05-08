import { useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const SubTabContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  width: 100%;
  
`;

const SubTabBar = styled.nav`
  display: flex;
  gap: ${theme.spacing.xs};
  background: rgba(0, 0, 0, 0.13);
  border-bottom: ${theme.borders.solid} rgb(0, 0, 0);
  padding-bottom: ${theme.spacing.xs};
  padding: 0.8em;
  overflow-x: auto;
  scrollbar-width: thin;
        box-shadow: 5px 4px rgba(0, 0, 0, 0.43);
        



  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 2px;
  }
`;

const SubTabButton = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== '$active'
})`
  flex-shrink: 0;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? theme.colors.black : 'black')};
  background: ${({ $active }) => ($active ? 'rgba(255, 255, 255, 0.43)' : 'transparent')};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ $active }) => ($active ? theme.colors.black : theme.colors.black)};
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
        box-shadow: 2px 3px 1px rgba(0, 0, 0, 0.59);

  &:hover {
    background: rgba(0, 0, 0, 0.06);
    color: ${theme.colors.black};
  }

  &:focus {
    outline: 2px solid ${theme.colors.black};
    outline-offset: -2px;
  }
`;

const SubTabPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  animation: fadeIn 0.2s ease-in;

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const SubTabBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: ${theme.spacing.xs};
  padding: 2px 6px;
  border-radius: 999px;
  background: ${({ $active }) => ($active ? theme.colors.black : theme.colors.black)};
  color: ${theme.colors.white};
  font-size: calc(${theme.fontSizes.tiny} * 0.85);
  font-weight: ${theme.fontWeights.bold};
  min-width: 18px;
`;

/**
 * SubTabNavigation - Horizontal sub-tab navigation component
 *
 * @param {Array} tabs - Array of tab objects with { id, label, badge?, content }
 * @param {string} defaultTab - Initial active tab id
 * @param {string} activeTab - Controlled active tab id (optional)
 * @param {function} onTabChange - Callback when tab changes (optional)
 */
const SubTabNavigation = ({ tabs = [], defaultTab, activeTab: controlledActiveTab, onTabChange }) => {
  const [localActiveTab, setLocalActiveTab] = useState(defaultTab || tabs[0]?.id);

  const activeTab = controlledActiveTab !== undefined ? controlledActiveTab : localActiveTab;
  const setActiveTab = onTabChange || setLocalActiveTab;

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
  };

  const activeTabContent = tabs.find(tab => tab.id === activeTab)?.content;

  return (
    <SubTabContainer>
      <SubTabBar role="tablist">
        {tabs.map(tab => (
          <SubTabButton
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`subtab-panel-${tab.id}`}
            $active={activeTab === tab.id}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge !== null && (
              <SubTabBadge $active={activeTab === tab.id}>{tab.badge}</SubTabBadge>
            )}
          </SubTabButton>
        ))}
      </SubTabBar>

      <SubTabPanel
        role="tabpanel"
        id={`subtab-panel-${activeTab}`}
        aria-labelledby={`subtab-${activeTab}`}
      >
        {activeTabContent}
      </SubTabPanel>
    </SubTabContainer>
  );
};

export default SubTabNavigation;
