import React from 'react';
import styled, { keyframes, css } from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import PlatformIcon from '@shared/components/PlatformIcon';

export default function FlowDiagramBlock({ block }) {
  const { steps = [], animated = true, description } = block;

  return (
    <FlowContainer $animated={animated}>
      <FlowVisual>
        {steps.map((step, index) => (
          <React.Fragment key={index}>
            <FlowIcon $delay={animated ? `${index * 0.3}s` : '0s'} $animated={animated}>
              {step.icon === 'flowerpil' ? (
                <FlowLogo src="/logo.png" alt="Flowerpil" />
              ) : step.platform ? (
                <PlatformIcon platform={step.platform} size={step.size || 28} />
              ) : step.icon ? (
                <PlatformIcon platform={step.icon} size={step.size || 28} />
              ) : null}
            </FlowIcon>
            {index < steps.length - 1 && (
              <FlowArrow $delay={animated ? `${index * 0.3 + 0.15}s` : '0s'} $animated={animated}>
                {'\u2192'}
              </FlowArrow>
            )}
          </React.Fragment>
        ))}
      </FlowVisual>
      {description && (
        <FlowDescription>
          {description.title && <FlowDescTitle>{description.title}</FlowDescTitle>}
          {description.text && <FlowDescText>{description.text}</FlowDescText>}
        </FlowDescription>
      )}
    </FlowContainer>
  );
}

const fadeInScale = keyframes`
  0% {
    opacity: 0;
    transform: scale(0.5);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
`;

const fadeInSlide = keyframes`
  0% {
    opacity: 0;
    transform: translateX(-10px);
  }
  100% {
    opacity: 0.6;
    transform: translateX(0);
  }
`;

const fadeInUp = keyframes`
  0% {
    opacity: 0;
    transform: translateY(6px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
`;

const FlowContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.02) 0%, rgba(0, 0, 0, 0.04) 100%);
  border: ${theme.borders.solidThin} ${theme.colors.blackAct};
  box-shadow: ${theme.shadows.card};
  text-align: center;

  ${props => props.$animated && css`
    opacity: 0;
    animation: ${fadeInUp} ${theme.transitions.fast} forwards;
  `}

  @media (max-width: ${theme.breakpoints.mobile}) {
    gap: ${theme.spacing.md};
    padding: ${theme.spacing.sm};
  }
`;

const FlowVisual = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const FlowIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: ${props => props.$animated ? 0 : 1};
  animation: ${props => props.$animated ? fadeInScale : 'none'} 0.5s ease-out forwards;
  animation-delay: ${props => props.$delay};
`;

const FlowLogo = styled.img`
  width: 28px;
  height: 28px;
  object-fit: contain;
`;

const FlowArrow = styled.div`
  font-size: 18px;
  color: ${theme.colors.black};
  opacity: ${props => props.$animated ? 0 : 0.6};
  line-height: 1;
  animation: ${props => props.$animated ? fadeInSlide : 'none'} 0.4s ease-out forwards;
  animation-delay: ${props => props.$delay};
`;

const FlowDescription = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  align-items: center;
  text-align: center;
`;

const FlowDescTitle = styled.h4`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
  text-transform: lowercase;
`;

const FlowDescText = styled.p`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  opacity: 0.7;
  line-height: 1.5;
`;
