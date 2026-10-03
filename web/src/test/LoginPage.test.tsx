import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '../api/client';
import { api } from '../api/client';
import { ApiError } from '../api/error';
import { AuthProvider } from '../auth/AuthContext';
import { LoginPage } from '../pages/LoginPage';

vi.mock('../api/client', () => ({
  api: {
    me: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    registerVolunteer: vi.fn(),
    branches: vi.fn(),
  },
}));

const apiMock = vi.mocked(api);

const ACTOR: Actor = {
  role: 'admin',
  userId: 'u1',
  adminId: 'a1',
  branchId: null,
  isHq: true,
  displayName: 'Dr. Ahmed',
  loginId: 'admin',
};

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  apiMock.me.mockRejectedValue(new ApiError('no session', 'UNAUTHENTICATED', 401));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  it('submits volunteer mode credentials and swaps to the dashboard', async () => {
    apiMock.login.mockResolvedValue(ACTOR);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/Registered number/), 'ERC-1001');
    await user.type(screen.getByLabelText(/Password/), 'supersecret');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(apiMock.login).toHaveBeenCalledTimes(1);
    expect(apiMock.login).toHaveBeenCalledWith('ERC-1001', 'supersecret');
  });

  it('switches to administrator mode and uses the username label', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Administrator' }));
    expect(screen.getByLabelText(/Username/)).toBeInTheDocument();
    expect(screen.getByText('Administrator access is restricted to authorized ERC staff.')).toBeInTheDocument();
  });

  it('shows a generic error on 401', async () => {
    apiMock.login.mockRejectedValue(new ApiError('Invalid identifier or password.', '', 401));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/Registered number/), 'ERC-1001');
    await user.type(screen.getByLabelText(/Password/), 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect identifier or password.');
  });

  it('shows a rate-limit warning instead of the generic message', async () => {
    apiMock.login.mockRejectedValue(new ApiError('slow down', 'LOGIN_RATE_LIMITED', 429));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/Registered number/), 'ERC-1001');
    await user.type(screen.getByLabelText(/Password/), 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Please wait a few minutes and try again.',
    );
  });
});