import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const ModalContext = createContext({ onClose: () => {} });

const focusableSelectors = [
  'a[href]','area[href]','button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])','textarea:not([disabled])',
  'iframe','object','embed','[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(',');

let scrollLockCount = 0;
let previousHtmlOverflow = '';
let previousBodyOverflow = '';
let previousHtmlPaddingRight = '';
let previousBodyPaddingRight = '';

const getComputedNumeric = (node, property) => {
  if (!node) return 0;
  const value = window.getComputedStyle(node)[property];
  const parsed = parseFloat(value || '0');
  return Number.isFinite(parsed) ? parsed : 0;
};

const lockBodyScroll = () => {
  if (typeof window === 'undefined') return;
  if (scrollLockCount > 0) {
    scrollLockCount += 1;
    return;
  }

  const html = document.documentElement;
  const body = document.body;
  if (!html || !body) return;

  previousHtmlOverflow = html.style.overflow;
  previousBodyOverflow = body.style.overflow;
  previousHtmlPaddingRight = html.style.paddingRight;
  previousBodyPaddingRight = body.style.paddingRight;

  const scrollbarWidth = window.innerWidth - html.clientWidth;
  const bodyPadding = getComputedNumeric(body, 'paddingRight');
  const htmlPadding = getComputedNumeric(html, 'paddingRight');

  html.style.overflow = 'hidden';
  body.style.overflow = 'hidden';

  if (scrollbarWidth > 0) {
    html.style.paddingRight = `${htmlPadding + scrollbarWidth}px`;
    body.style.paddingRight = `${bodyPadding + scrollbarWidth}px`;
  }

  html.classList.add('modal-open');
  body.classList.add('modal-open');

  scrollLockCount = 1;
};

const unlockBodyScroll = () => {
  if (typeof window === 'undefined') return;
  if (scrollLockCount === 0) return;

  scrollLockCount -= 1;
  if (scrollLockCount > 0) return;

  const html = document.documentElement;
  const body = document.body;
  if (!html || !body) return;

  html.style.overflow = previousHtmlOverflow;
  body.style.overflow = previousBodyOverflow;
  html.style.paddingRight = previousHtmlPaddingRight;
  body.style.paddingRight = previousBodyPaddingRight;

  html.classList.remove('modal-open');
  body.classList.remove('modal-open');
};

const getFocusableElements = (root) => {
  if (!root) return [];
  const candidates = Array.from(root.querySelectorAll(focusableSelectors));
  return candidates.filter((node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.hasAttribute('disabled')) return false;
    if (node.getAttribute('aria-hidden') === 'true') return false;
    if (node.tabIndex < 0) return false;
    const rects = node.getClientRects();
    return rects.length > 0;
  });
};

const alignItems = {
  center: 'center',
  top: 'start',
  bottom: 'end',
  stretch: 'stretch',
};

const overlayBasePadding = 'clamp(0.75rem, 3vw, 1.5rem)';
const mobileOverlayPadding = 'clamp(0.5rem, 4vw, 1rem)';

const ModalOverlay = styled.div`
  --modal-overlay-padding: ${({ $padding }) => $padding ?? overlayBasePadding};
  position: fixed;
  inset: 0;
  z-index: ${({ $zIndex }) => $zIndex ?? 1300};
  display: grid;
  justify-items: center;
  align-items: ${({ $align }) => alignItems[$align] ?? alignItems.center};
  padding: var(--modal-overlay-padding);
  background: ${({ $backdrop }) => $backdrop ?? 'rgba(4, 4, 4, 0.75)'};
  backdrop-filter: ${({ $backdropBlur }) => $backdropBlur ?? 'blur(14px)'};
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x pan-y; /* Allow horizontal gestures for browser navigation */

  @media (max-width: ${theme.breakpoints.tablet}) {
    align-items: ${({ $mobileAlign, $align }) => alignItems[$mobileAlign] ?? alignItems[$align] ?? alignItems.center};
    padding: ${({ $mobilePadding }) => $mobilePadding ?? mobileOverlayPadding};
  }
`;

const sizeToMaxWidth = {
  xs: '360px',
  sm: '440px',
  md: '560px',
  lg: '720px',
  xl: '920px',
  full: 'min(1180px, calc(100vw - 2 * var(--modal-overlay-padding)))',
};

const StyledSurface = styled.div`
  --modal-surface-padding: ${({ $padding }) => $padding ?? 'clamp(1.25rem, 4vw, 1.75rem)'};
  --modal-surface-gap: ${({ $gap }) => $gap ?? 'clamp(0.75rem, 3vw, 1.25rem)'};
  position: relative;
  width: min(100%, ${({ $maxWidth, $size }) => $maxWidth ?? sizeToMaxWidth[$size] ?? sizeToMaxWidth.md});
  max-height: ${({ $maxHeight }) => $maxHeight ?? 'calc(100vh - 2 * var(--modal-overlay-padding))'};
  background: ${({ $background }) => $background ?? theme.colors.fpwhite};
  color: ${({ $color }) => $color ?? theme.colors.black};
  border-radius: ${({ $radius }) => $radius ?? '8px'};
  border: ${({ $border }) => $border ?? `${theme.borders.solidThin} rgba(0, 0, 0, 0.35)`};
  box-shadow: ${({ $shadow }) => $shadow ?? '0 32px 80px rgba(0, 0, 0, 0.64)'};
  padding: var(--modal-surface-padding);
  display: flex;
  flex-direction: column;
  gap: var(--modal-surface-gap);
  overflow: hidden;
  pointer-events: auto;
  min-height: ${({ $minHeight }) => $minHeight ?? 'auto'};

  @media (max-width: ${theme.breakpoints.tablet}) {
    width: min(100%, ${({ $mobileWidth }) => $mobileWidth ?? '100%'});
    max-height: ${({ $mobileMaxHeight }) => $mobileMaxHeight ?? `calc(100vh - 2 * ${mobileOverlayPadding})`};
    border-radius: ${({ $mobileRadius, $radius }) => $mobileRadius ?? $radius ?? '18px'};
    padding: ${({ $mobilePadding, $padding }) => $mobilePadding ?? $padding ?? 'clamp(1rem, 5vw, 1.5rem)'};
  }
`;

const composeHandlers = (first, second) => (event) => {
  if (typeof first === 'function') {
    first(event);
  }
  if (!event.defaultPrevented && typeof second === 'function') {
    second(event);
  }
};

const mergeRefs = (refA, refB) => {
  return (node) => {
    if (typeof refA === 'function') {
      refA(node);
    } else if (refA) {
      refA.current = node;
    }
    if (typeof refB === 'function') {
      refB(node);
    } else if (refB) {
      refB.current = node;
    }
  };
};

export const ModalSurface = React.forwardRef(function ModalSurface(
  { children, ...rest },
  forwardedRef
) {
  return (
    <StyledSurface ref={forwardedRef} data-modal-surface {...rest}>
      {children}
    </StyledSurface>
  );
});

export const ModalHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: clamp(0.75rem, 2.5vw, 1.25rem);
  margin-bottom: clamp(0.25rem, 2vw, 1rem);
  border-bottom: 1px dashed black;
  padding: 8px;
`;

export const ModalTitle = styled.h2`
  font-family: ${theme.fonts.mono};
  font-size: clamp(0.5rem, 2.8vw, 1rem);
  color: ${theme.colors.primary};
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.01em;
  line-height: 1;
  margin: 0;
`;

export const ModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  gap: clamp(0.75rem, 2.5vw, 1.25rem);
  min-height: 0;
`;

export const ModalFooter = styled.footer`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: clamp(0.75rem, 2.5vw, 1.25rem);
  margin-top: clamp(0.5rem, 2vw, 1rem);
`;

const CloseButtonBase = styled.button`
  position: absolute;
  top: clamp(0.75rem, 2vw, 1.25rem);
  right: clamp(0.75rem, 2vw, 1.25rem);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: rgba(0, 0, 0, 0.02);
  color: inherit;
  border-radius: 999px;
  cursor: pointer;
  font-size: 20px;
  font-weight: ${theme.fontWeights.bold};
  transition: transform ${theme.transitions.fast}, background ${theme.transitions.fast};

  &:hover {
    transform: scale(1.05);
    background: rgba(0, 0, 0, 0.12);
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.black};
    outline-offset: 2px;
  }
`;

export const ModalCloseButton = React.forwardRef(function ModalCloseButton(
  { children, onClick, 'aria-label': ariaLabel = 'Close modal', ...rest },
  forwardedRef
) {
  const { onClose } = useContext(ModalContext);

  const handleClick = useCallback(
    (event) => {
      if (typeof onClick === 'function') {
        onClick(event);
      }
      if (!event.defaultPrevented && typeof onClose === 'function') {
        onClose();
      }
    },
    [onClick, onClose]
  );

  return (
    <CloseButtonBase
      ref={forwardedRef}
      type="button"
      aria-label={ariaLabel}
      onClick={handleClick}
      {...rest}
    >
      {children ?? <span aria-hidden>×</span>}
    </CloseButtonBase>
  );
});

export function useModalContext() {
  return useContext(ModalContext);
}

export function ModalRoot({
  isOpen,
  onClose,
  children,
  align = 'center',
  mobileAlign,
  labelledBy,
  describedBy,
  closeOnBackdrop = true,
  trapFocus = true,
  restoreFocus = true,
  initialFocusRef,
  initialFocusSelector,
  overlayProps = {},
  zIndex,
}) {
  const dialogRef = useRef(null);
  const overlayRef = useRef(null);
  const pointerDownTarget = useRef(null);
  const previouslyFocused = useRef(null);

  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

  useEffect(() => {
    if (!isOpen || !isBrowser) return undefined;

    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    lockBodyScroll();

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        if (typeof onClose === 'function') {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeydown, true);

    return () => {
      document.removeEventListener('keydown', handleKeydown, true);
      unlockBodyScroll();
      if (restoreFocus && previouslyFocused.current && typeof previouslyFocused.current.focus === 'function') {
        previouslyFocused.current.focus({ preventScroll: true });
      }
    };
  }, [isOpen, isBrowser, onClose, restoreFocus]);

  useEffect(() => {
    if (!isOpen || !isBrowser) return undefined;

    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const focusElement = initialFocusRef?.current
      ?? (initialFocusSelector ? dialog.querySelector(initialFocusSelector) : null);
    const focusables = focusElement ? [] : getFocusableElements(dialog);
    const target = focusElement || focusables[0] || dialog;

    const raf = requestAnimationFrame(() => {
      if (target && typeof target.focus === 'function') {
        target.focus({ preventScroll: true });
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [isOpen, isBrowser, initialFocusRef, initialFocusSelector]);

  const trapFocusHandler = useCallback((event) => {
    if (!trapFocus || event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusables = getFocusableElements(dialog);
    if (focusables.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey) {
      if (active === first || active === dialog) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      event.preventDefault();
      first.focus();
    }
  }, [trapFocus]);

  const handleOverlayPointerDown = useCallback((event) => {
    pointerDownTarget.current = event.target;
  }, []);

  const handleOverlayClick = useCallback((event) => {
    if (!closeOnBackdrop) return;
    if (pointerDownTarget.current !== event.target) return;
    if (event.target !== event.currentTarget) return;
    if (typeof onClose === 'function') {
      onClose();
    }
  }, [closeOnBackdrop, onClose]);

  const overlayEventHandlers = useMemo(() => ({
    onPointerDown: composeHandlers(overlayProps.onPointerDown, handleOverlayPointerDown),
    onMouseDown: composeHandlers(overlayProps.onMouseDown, handleOverlayPointerDown),
    onClick: composeHandlers(overlayProps.onClick, handleOverlayClick),
  }), [overlayProps.onPointerDown, overlayProps.onMouseDown, overlayProps.onClick, handleOverlayPointerDown, handleOverlayClick]);

  if (!isOpen || !isBrowser) {
    return null;
  }

  const child = React.Children.only(children);
  const childRef = mergeRefs(child.ref, dialogRef);

  const childProps = {
    ...child.props,
    ref: childRef,
    tabIndex: child.props.tabIndex ?? -1,
    onKeyDown: composeHandlers(child.props.onKeyDown, trapFocusHandler),
    role: child.props.role ?? 'dialog',
    'aria-modal': child.props['aria-modal'] ?? true,
  };

  if (labelledBy && !('aria-labelledby' in child.props)) {
    childProps['aria-labelledby'] = labelledBy;
  }

  if (describedBy && !('aria-describedby' in child.props)) {
    childProps['aria-describedby'] = describedBy;
  }

  const clonedChild = React.cloneElement(child, childProps);

  return createPortal(
    <ModalOverlay
      ref={overlayRef}
      $align={align}
      $mobileAlign={mobileAlign}
      $zIndex={zIndex}
      {...overlayProps}
      {...overlayEventHandlers}
    >
      <ModalContext.Provider value={{ onClose, labelledBy, describedBy }}>
        {clonedChild}
      </ModalContext.Provider>
    </ModalOverlay>,
    document.body
  );
}

export { ModalOverlay };
