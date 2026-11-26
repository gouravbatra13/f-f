import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth-provider';
import { apiFetch, setAccessToken, restoreSession } from '@/lib/api';

const mockApiFetch = vi.mocked(apiFetch);
const mockSetAccessToken = vi.mocked(setAccessToken);
const mockRestoreSession = vi.mocked(restoreSession);

function TestComponent() {
  const { user, loading, login, register, logout, sessionError } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);

  const handleLogin = async () => {
    setActionError(null);
    try {
      await login('test@example.com', 'password123');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Login failed');
    }
  };

  const handleRegister = async () => {
    setActionError(null);
    try {
      await register('New User', 'new@example.com', 'StrongPassword123!');
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Registration failed',
      );
    }
  };

  const handleLogout = async () => {
    setActionError(null);
    try {
      await logout();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Logout failed');
    }
  };

  return (
    <div>
      {loading ? <span data-testid="loading">Loading…</span> : null}
      {user ? (
        <div data-testid="user">
          <span data-testid="user-email">{user.email}</span>
          <button onClick={() => void handleLogout()}>Logout</button>
        </div>
      ) : (
        <div>
          <button
            data-testid="login-button"
            onClick={() => void handleLogin()}
          >
            Login
          </button>
          <button
            data-testid="register-button"
            onClick={() => void handleRegister()}
          >
            Register
          </button>
        </div>
      )}
      {sessionError ? (
        <span data-testid="session-error">{sessionError}</span>
      ) : null}
      {actionError ? (
        <span data-testid="action-error">{actionError}</span>
      ) : null}
    </div>
  );
}

function renderWithAuth(ui: React.ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSetAccessToken.mockClear();
  mockRestoreSession.mockClear();
  mockApiFetch.mockClear();

  // Default: restoreSession returns null (no session)
  mockRestoreSession.mockResolvedValue(null);

  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AuthProvider', () => {
  describe('login', () => {
    it('authenticates user and stores access token on success', async () => {
      mockApiFetch.mockResolvedValue({
        accessToken: 'test-access-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'developer' },
      });

      renderWithAuth(<TestComponent />);

      const loginButton = screen.getByTestId('login-button');
      fireEvent.click(loginButton);

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
        });
      });

      await waitFor(() => {
        expect(mockSetAccessToken).toHaveBeenCalledWith('test-access-token');
      });

      expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
      expect(screen.queryByTestId('login-button')).not.toBeInTheDocument();
    });

    it('handles login error and keeps user null', async () => {
      mockApiFetch.mockRejectedValue(new Error('Invalid credentials'));

      renderWithAuth(<TestComponent />);

      const loginButton = screen.getByTestId('login-button');
      fireEvent.click(loginButton);

      await waitFor(() => {
        expect(screen.getByTestId('action-error')).toHaveTextContent('Invalid credentials');
      });

      expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();
    });
  });

  describe('register', () => {
    it('registers user and stores access token on success', async () => {
      mockApiFetch.mockResolvedValue({
        accessToken: 'register-access-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: '2', email: 'new@example.com', name: 'New User', role: 'developer' },
      });

      renderWithAuth(<TestComponent />);

      fireEvent.click(screen.getByTestId('register-button'));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: 'New User',
            email: 'new@example.com',
            password: 'StrongPassword123!',
          }),
        });
      });

      await waitFor(() => {
        expect(mockSetAccessToken).toHaveBeenCalledWith('register-access-token');
      });

      expect(screen.getByTestId('user-email')).toHaveTextContent('new@example.com');
    });

    it('handles registration error and keeps user null', async () => {
      mockApiFetch.mockRejectedValue(new Error('Email already exists'));

      renderWithAuth(<TestComponent />);

      fireEvent.click(screen.getByTestId('register-button'));

      await waitFor(() => {
        expect(screen.getByTestId('action-error')).toHaveTextContent('Email already exists');
      });

      expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();
    });
  });

  describe('logout', () => {
    it('clears access token and user on successful logout', async () => {
      mockRestoreSession.mockResolvedValue({
        accessToken: 'existing-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'developer' },
      });
      mockApiFetch.mockResolvedValue(undefined);

      renderWithAuth(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
      });

      const logoutButton = screen.getByRole('button', { name: 'Logout' });
      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(mockSetAccessToken).toHaveBeenCalledWith(null);
      });

      expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();
    });

    it('clears token even when logout API fails', async () => {
      mockRestoreSession.mockResolvedValue({
        accessToken: 'existing-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'developer' },
      });
      mockApiFetch.mockRejectedValue(new Error('Logout failed'));

      renderWithAuth(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
      });

      const logoutButton = screen.getByRole('button', { name: 'Logout' });
      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(mockSetAccessToken).toHaveBeenCalledWith(null);
      });

      await waitFor(() => {
        expect(screen.getByTestId('action-error')).toHaveTextContent('Logout failed');
      });
      expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();
    });
  });

  describe('session restore', () => {
    it('restores session from refresh cookie on mount', async () => {
      mockRestoreSession.mockResolvedValue({
        accessToken: 'restored-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: '3', email: 'restored@example.com', name: 'Restored User', role: 'developer' },
      });

      renderWithAuth(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('user-email')).toHaveTextContent('restored@example.com');
      });

      expect(mockRestoreSession).toHaveBeenCalledTimes(1);
    });

    it('sets loading to false after session restore', async () => {
      mockRestoreSession.mockResolvedValue({
        accessToken: 'restored-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: '3', email: 'restored@example.com', name: 'Restored User', role: 'developer' },
      });

      renderWithAuth(<TestComponent />);

      expect(screen.getByTestId('loading')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });
    });

    it('handles session restore failure gracefully', async () => {
      mockRestoreSession.mockRejectedValue(new Error('Session expired'));

      renderWithAuth(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('session-error')).toHaveTextContent('Session expired');
      });

      expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    });
  });

  describe('auth-expired event', () => {
    it('clears user when fixflow:auth-expired event is dispatched', async () => {
      mockRestoreSession.mockResolvedValue({
        accessToken: 'existing-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'developer' },
      });

      renderWithAuth(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
      });

      act(() => {
        window.dispatchEvent(new Event('fixflow:auth-expired'));
      });

      await waitFor(() => {
        expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();
      });
    });
  });
});