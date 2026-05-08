import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import CuratorLogin from '../CuratorLogin';
import * as AuthContext from '@shared/contexts/AuthContext';
import React from 'react';

// Mock the AuthContext
const mockUseAuth = vi.fn();
const makeAuthMock = (overrides = {}) => ({
  login: vi.fn(),
  requestPasswordReset: vi.fn().mockResolvedValue({ success: true }),
  isLoading: false,
  error: null,
  clearError: vi.fn(),
  isAuthenticated: false,
  user: null,
  ...overrides
});
vi.spyOn(AuthContext, 'useAuth').mockImplementation(() => mockUseAuth());

// Mock react-router-dom Navigate component
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to, replace }) => {
      mockNavigate(to, replace);
      return null;
    }
  };
});

// Helper to render with router
const renderWithRouter = (component) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('CuratorLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();

    // Default mock auth state
    mockUseAuth.mockReturnValue(makeAuthMock());
  });

  describe('Form rendering', () => {
    it('should render login form with all fields', () => {
      renderWithRouter(<CuratorLogin />);

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('should render logo image', () => {
      renderWithRouter(<CuratorLogin />);

      const logo = screen.getByAltText('Flowerpil');
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute('src', '/logo.png');
    });

    it('should render signup link', () => {
      renderWithRouter(<CuratorLogin />);

      expect(screen.getByText(/got a referal code/i)).toBeInTheDocument();
      expect(screen.getByText(/create account/i)).toBeInTheDocument();
    });

    it('should have username field ready for input', () => {
      renderWithRouter(<CuratorLogin />);

      const usernameInput = screen.getByLabelText(/email/i);
      // Verify the field exists and can receive input
      expect(usernameInput).toBeInTheDocument();
      expect(usernameInput).not.toBeDisabled();
    });

    it('should have proper input types and autocomplete', () => {
      renderWithRouter(<CuratorLogin />);

      const usernameInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      expect(usernameInput).toHaveAttribute('type', 'email');
      expect(usernameInput).toHaveAttribute('autocomplete', 'username');
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    });
  });

  describe('Form validation', () => {
    it('should validate empty username field', async () => {
      const mockLogin = vi.fn();
      mockUseAuth.mockReturnValue(makeAuthMock({ login: mockLogin }));

      renderWithRouter(<CuratorLogin />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      const passwordInput = screen.getByLabelText(/password/i);

      // Fill only password
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      // Login should not be called because username is empty
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should validate empty password field', async () => {
      const mockLogin = vi.fn();
      mockUseAuth.mockReturnValue(makeAuthMock({ login: mockLogin }));

      renderWithRouter(<CuratorLogin />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      const usernameInput = screen.getByLabelText(/email/i);

      // Fill only username
      fireEvent.change(usernameInput, { target: { value: 'test@example.com' } });
      fireEvent.click(submitButton);

      // Login should not be called because password is empty
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should validate both fields are empty', async () => {
      const mockLogin = vi.fn();
      mockUseAuth.mockReturnValue(makeAuthMock({ login: mockLogin }));

      renderWithRouter(<CuratorLogin />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      // Login should not be called because both fields are empty
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should disable submit button when fields are empty', () => {
      renderWithRouter(<CuratorLogin />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when both fields have values', () => {
      renderWithRouter(<CuratorLogin />);

      const usernameInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(usernameInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });

      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Form submission', () => {
    it('should call login function on valid form submission', async () => {
      const mockLogin = vi.fn().mockResolvedValue({ success: true });
      mockUseAuth.mockReturnValue(makeAuthMock({ login: mockLogin }));

      renderWithRouter(<CuratorLogin />);

      const usernameInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(usernameInput, { target: { value: 'curator@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('curator@example.com', 'SecurePass123!');
      });
    });

    it('should not call login if validation fails', async () => {
      const mockLogin = vi.fn();
      mockUseAuth.mockReturnValue(makeAuthMock({ login: mockLogin }));

      renderWithRouter(<CuratorLogin />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      // Login should not be called when form is invalid
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  describe('Loading state', () => {
    it('should disable submit button during loading', () => {
      mockUseAuth.mockReturnValue(makeAuthMock({ isLoading: true }));

      renderWithRouter(<CuratorLogin />);

      const usernameInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      fireEvent.change(usernameInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });

      const submitButton = screen.getByRole('button', { name: /signing in/i });
      expect(submitButton).toBeDisabled();
    });

    it('should show loading spinner', () => {
      mockUseAuth.mockReturnValue(makeAuthMock({ isLoading: true }));

      renderWithRouter(<CuratorLogin />);

      expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    });

    it('should disable input fields during loading', () => {
      mockUseAuth.mockReturnValue(makeAuthMock({ isLoading: true }));

      renderWithRouter(<CuratorLogin />);

      const usernameInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      expect(usernameInput).toBeDisabled();
      expect(passwordInput).toBeDisabled();
    });
  });

  describe('Error handling', () => {
    it('should display error message on login failure', () => {
      mockUseAuth.mockReturnValue(makeAuthMock({ error: 'Invalid username or password' }));

      renderWithRouter(<CuratorLogin />);

      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument();
    });

    it('should display network error message', () => {
      mockUseAuth.mockReturnValue(makeAuthMock({ error: 'Network error during login' }));

      renderWithRouter(<CuratorLogin />);

      expect(screen.getByText(/network error during login/i)).toBeInTheDocument();
    });

    it('should clear errors when form data changes', () => {
      const mockClearError = vi.fn();
      mockUseAuth.mockReturnValue(makeAuthMock({ error: 'Invalid credentials', clearError: mockClearError }));

      renderWithRouter(<CuratorLogin />);

      const usernameInput = screen.getByLabelText(/email/i);
      fireEvent.change(usernameInput, { target: { value: 't' } });

      // clearError should be called when input changes
      expect(mockClearError).toHaveBeenCalled();
    });
  });

  describe('Redirect behavior', () => {
    it('should redirect authenticated curator to /curator-admin', () => {
      mockUseAuth.mockReturnValue(makeAuthMock({
        isAuthenticated: true,
        user: { id: 1, username: 'curator', role: 'curator' }
      }));

      renderWithRouter(<CuratorLogin />);

      expect(mockNavigate).toHaveBeenCalledWith('/curator-admin', true);
    });

    it('should redirect authenticated admin to /curator-admin', () => {
      mockUseAuth.mockReturnValue(makeAuthMock({
        isAuthenticated: true,
        user: { id: 1, username: 'admin', role: 'admin' }
      }));

      renderWithRouter(<CuratorLogin />);

      expect(mockNavigate).toHaveBeenCalledWith('/curator-admin', true);
    });

    it('should not redirect unauthenticated user', () => {
      mockUseAuth.mockReturnValue(makeAuthMock());

      renderWithRouter(<CuratorLogin />);

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
  });

  describe('Input field behavior', () => {
    it('should update username field on change', () => {
      renderWithRouter(<CuratorLogin />);

      const usernameInput = screen.getByLabelText(/email/i);
      fireEvent.change(usernameInput, { target: { value: 'test@example.com' } });

      expect(usernameInput.value).toBe('test@example.com');
    });

    it('should update password field on change', () => {
      renderWithRouter(<CuratorLogin />);

      const passwordInput = screen.getByLabelText(/password/i);
      fireEvent.change(passwordInput, { target: { value: 'MyPassword123' } });

      expect(passwordInput.value).toBe('MyPassword123');
    });

    it('should allow form submission after typing in fields', async () => {
      const mockLogin = vi.fn().mockResolvedValue({ success: true });
      mockUseAuth.mockReturnValue(makeAuthMock({ login: mockLogin }));

      renderWithRouter(<CuratorLogin />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      const usernameInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      // First, submit with empty fields - should not call login
      fireEvent.click(submitButton);
      expect(mockLogin).not.toHaveBeenCalled();

      // Now fill in the fields
      fireEvent.change(usernameInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });

      // Submit again - should now call login
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });
  });
});
