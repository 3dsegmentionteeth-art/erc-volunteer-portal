import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ProfileCheckKey, type VolunteerProfile } from '../api/client';
import i18n from '../i18n';
import { VolunteerProfile as VolunteerProfilePage } from '../pages/VolunteerProfile';

async function i18nReady(): Promise<void> {
  if (!i18n.isInitialized) {
    await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()));
  }
  await i18n.changeLanguage('en');
}

vi.mock('../api/client', () => ({
  api: {
    volunteerProfile: vi.fn(),
    updateVolunteerProfile: vi.fn(),
  },
}));

const apiMock = vi.mocked(api);

const ALL_CHECKS: Record<ProfileCheckKey, boolean> = {
  englishName: true,
  arabicName: true,
  idNumber: true,
  organization: true,
  skills: true,
  certifications: true,
  educationInfo: true,
  applicationAnswers: true,
  emailVerified: true,
  identityVerified: true,
};

const PROFILE: VolunteerProfile = {
  id: 'vol-1',
  branchId: 'b1',
  code: 'ERC-1000',
  englishName: 'Mona Gaber',
  arabicName: 'منى جابر',
  email: 'mona@example.com',
  emailVerified: true,
  identityVerified: true,
  phone: '+20 100 000 0000',
  organization: 'Cairo University',
  educationInfo: 'BSc Nursing',
  skills: ['First Aid', 'CPR'],
  certifications: ['BLS'],
  idNumber: '12345678901234',
  applicationAnswers: [{ key: 'why', answer: 'Help my community.' }],
  createdAt: '2026-09-22T00:00:00.000Z',
};

beforeEach(async () => {
  await i18nReady();
  apiMock.volunteerProfile.mockResolvedValue({
    profile: PROFILE,
    completion: { percent: 100, passed: 10, total: 10, checks: ALL_CHECKS },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('VolunteerProfile', () => {
  it('renders the read-only profile and status verdicts only from the server', async () => {
    render(<VolunteerProfilePage />);

    expect(await screen.findByText('Cairo University')).toBeInTheDocument();
    expect(screen.getByText('mona@example.com')).toBeInTheDocument();
    // Email + identity verdicts, both server-rendered read-only.
    expect(screen.getAllByText('Verified')).toHaveLength(2);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    // No lock notice at 100%.
    expect(screen.queryByText(/Time requests are locked/)).not.toBeInTheDocument();
  });

  it('shows the lock notice when the profile is not complete', async () => {
    apiMock.volunteerProfile.mockResolvedValue({
      profile: PROFILE,
      completion: { percent: 80, passed: 8, total: 10, checks: { ...ALL_CHECKS, identityVerified: false, arabicName: false } },
    });
    render(<VolunteerProfilePage />);

    expect(await screen.findByText('Time requests are locked until your profile is complete (100%).')).toBeInTheDocument();
  });

  it('edits owned fields and sends parsed skills/certifications; empty list clears', async () => {
    apiMock.updateVolunteerProfile.mockResolvedValue({
      profile: PROFILE,
      completion: { percent: 100, passed: 10, total: 10, checks: ALL_CHECKS },
    });
    const user = userEvent.setup();
    render(<VolunteerProfilePage />);

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    expect(screen.getByLabelText(/^Skills/)).toHaveValue('First Aid\nCPR');
    expect(screen.getByLabelText(/^Certifications/)).toHaveValue('BLS');

    await user.clear(screen.getByLabelText(/^Skills/));
    await user.type(screen.getByLabelText(/^Skills/), 'First Aid');
    await user.clear(screen.getByLabelText(/^Certifications/));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(apiMock.updateVolunteerProfile).toHaveBeenCalledWith(
      expect.objectContaining({ skills: ['First Aid'], certifications: [] }),
    );
  });

  it('never exposes the application answers, email, or identity fields to editing', async () => {
    const user = userEvent.setup();
    render(<VolunteerProfilePage />);

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    expect(screen.queryByLabelText(/Email verification/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Identity verification/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Why do you want to volunteer/)).not.toBeInTheDocument();
  });
});