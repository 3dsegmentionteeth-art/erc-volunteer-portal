import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type Branch } from '../api/client';
import { ApiError } from '../api/error';
import { AuthProvider } from '../auth/AuthContext';
import { RegisterPage } from '../pages/RegisterPage';

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

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const HEADQUARTERS: Branch = { id: 'b1', code: 'ERC-HQ', nameEn: 'Headquarters', nameAr: 'المقر الرئيسي' };

beforeEach(() => {
  apiMock.me.mockRejectedValue(new ApiError('no session', 'UNAUTHENTICATED', 401));
  apiMock.branches.mockResolvedValue([HEADQUARTERS]);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function selectBranch(user: ReturnType<typeof userEvent.setup>) {
  const option = await screen.findByRole('option', { name: 'Headquarters (ERC-HQ)' });
  await user.selectOptions(screen.getByLabelText(/^Branch/), option);
}

describe('RegisterPage', () => {
  it('collects organization and application answers and submits them', async () => {
    apiMock.registerVolunteer.mockResolvedValue({ registration: { id: 'r1' } });
    const user = userEvent.setup();
    renderPage();

    await selectBranch(user);
    await user.type(screen.getByLabelText(/^English name/), 'Mona Gaber');
    await user.type(screen.getByLabelText(/^Phone/), '+201000000001');
    await user.type(screen.getByLabelText(/^Email/), 'mona@example.com');
    await user.type(screen.getByLabelText(/^Organization/), 'Teba Hospital');
    await user.type(screen.getByLabelText(/Why do you want to volunteer/), 'To serve my community');
    await user.type(screen.getByLabelText(/What do you hope to gain/), 'Skills and purpose');
    await user.type(screen.getByLabelText(/^Password/), 'supersecret');
    await user.type(screen.getByLabelText(/^Confirm password/), 'supersecret');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(apiMock.registerVolunteer).toHaveBeenCalledTimes(1);
    expect(apiMock.registerVolunteer).toHaveBeenCalledWith({
      branchId: 'b1',
      englishName: 'Mona Gaber',
      arabicName: undefined,
      phone: '+201000000001',
      email: 'mona@example.com',
      password: 'supersecret',
      organization: 'Teba Hospital',
      applicationAnswers: [
        { key: 'why', answer: 'To serve my community' },
        { key: 'benefit', answer: 'Skills and purpose' },
      ],
    });
    expect(await screen.findByText('Registration submitted')).toBeInTheDocument();
  });

  it('omits empty organization and empty application answers', async () => {
    apiMock.registerVolunteer.mockResolvedValue({ registration: { id: 'r1' } });
    const user = userEvent.setup();
    renderPage();

    await selectBranch(user);
    await user.type(screen.getByLabelText(/^English name/), 'Sara Adel');
    await user.type(screen.getByLabelText(/^Phone/), '+201000000002');
    await user.type(screen.getByLabelText(/^Email/), 'sara@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'supersecret');
    await user.type(screen.getByLabelText(/^Confirm password/), 'supersecret');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(apiMock.registerVolunteer).toHaveBeenCalledTimes(1);
    expect(apiMock.registerVolunteer).toHaveBeenCalledWith(
      expect.objectContaining({
        organization: undefined,
        applicationAnswers: undefined,
      }),
    );
  });

  it('rejects a mismatch between the password and its confirmation', async () => {
    const user = userEvent.setup();
    renderPage();

    await selectBranch(user);
    await user.type(screen.getByLabelText(/^English name/), 'Omar Ali');
    await user.type(screen.getByLabelText(/^Phone/), '+201000000003');
    await user.type(screen.getByLabelText(/^Email/), 'omar@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'supersecret');
    await user.type(screen.getByLabelText(/^Confirm password/), 'different');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(apiMock.registerVolunteer).not.toHaveBeenCalled();
  });
});