import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ProfileCheckKey, type ProfileCompletion, type ServiceTimeRecord, type TimeAddRequest, type TimeEditRequest } from '../api/client';
import { ApiError } from '../api/error';
import i18n from '../i18n';
import { VolunteerDashboard } from '../pages/VolunteerDashboard';

// This page renders no LanguageSwitch (unlike Login/Register), so the i18n
// singleton is only booted here — wait for it before every assertion, otherwise
// t() falls back to raw key names on first render.
async function i18nReady(): Promise<void> {
  if (!i18n.isInitialized) {
    await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()));
  }
  await i18n.changeLanguage('en');
}

vi.mock('../api/client', () => ({
  api: {
    volunteerTimeSummary: vi.fn(),
    volunteerTimeRecords: vi.fn(),
    volunteerTimeAdmins: vi.fn(),
    volunteerTimeRequests: vi.fn(),
    volunteerEditTimeRequests: vi.fn(),
    createTimeAddRequest: vi.fn(),
    createTimeEditRequest: vi.fn(),
    volunteerProfile: vi.fn(),
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

function completion(percent: number, passed: number, checks: Partial<Record<ProfileCheckKey, boolean>> = {}): ProfileCompletion {
  return { percent, passed, total: 10, checks: { ...ALL_CHECKS, ...checks } };
}

const RECORD: ServiceTimeRecord = {
  id: 'rec-1',
  date: '2026-09-22T00:00:00.000Z',
  event: 'Blood Drive',
  minutes: 120,
  source: 'add_request',
  reason: null,
  createdAt: '2026-09-22T00:00:00.000Z',
};

const PENDING_ADD: TimeAddRequest = {
  id: 'q1',
  date: '2026-09-21T00:00:00.000Z',
  event: 'First Aid Training',
  minutes: 60,
  status: 'pending',
  assignedAdminId: null,
  createdAt: '2026-09-21T00:00:00.000Z',
  assignedAdmin: null,
};

beforeEach(async () => {
  await i18nReady();
  apiMock.volunteerTimeSummary.mockResolvedValue({
    totalMinutes: 120,
    serviceDays: 1,
    pendingMinutes: 60,
    pendingRequests: 1,
  });
  apiMock.volunteerTimeRecords.mockResolvedValue([RECORD]);
  apiMock.volunteerTimeAdmins.mockResolvedValue([{ id: 'a1', fullNameEn: 'Mona Gaber', username: 'mona' }]);
  apiMock.volunteerTimeRequests.mockResolvedValue([PENDING_ADD]);
  apiMock.volunteerEditTimeRequests.mockResolvedValue([]);
  apiMock.createTimeAddRequest.mockResolvedValue({ id: 'q2', status: 'pending' } as TimeAddRequest);
  apiMock.createTimeEditRequest.mockResolvedValue({ id: 'e2', status: 'pending' } as TimeEditRequest);
  apiMock.volunteerProfile.mockResolvedValue({
    profile: {
      id: 'vol-1',
      branchId: 'b1',
      code: 'ERC-1000',
      englishName: 'Mona Gaber',
      arabicName: null,
      email: 'mona@example.com',
      emailVerified: true,
      identityVerified: true,
      phone: null,
      organization: null,
      educationInfo: null,
      skills: null,
      certifications: null,
      idNumber: null,
      applicationAnswers: null,
      createdAt: '2026-09-22T00:00:00.000Z',
    },
    completion: completion(100, 10),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('VolunteerDashboard', () => {
  it('renders server-computed totals, records, and pending requests', async () => {
    render(<VolunteerDashboard />);
    expect(await screen.findByText('Blood Drive')).toBeInTheDocument();

    // Totals render inside their labeled stat cards ('2h' also appears on the
    // record row, so scope by label).
    expect(screen.getByText('Approved hours').parentElement).toHaveTextContent('2h');
    expect(screen.getByText('Waiting for approval').parentElement).toHaveTextContent('1h');
    expect(screen.getByText('Waiting for approval').parentElement).toHaveTextContent('Pending requests: 1');
    expect(screen.getByText('Service days').parentElement).toHaveTextContent('1');
    expect(screen.getByText('2026-09-22')).toBeInTheDocument();
    expect(screen.getByText('First Aid Training')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();

    expect(apiMock.volunteerTimeSummary).toHaveBeenCalledTimes(1);
    expect(apiMock.volunteerTimeRecords).toHaveBeenCalledTimes(1);
    expect(apiMock.volunteerEditTimeRequests).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when there are no records yet', async () => {
    apiMock.volunteerTimeRecords.mockResolvedValue([]);
    apiMock.volunteerTimeRequests.mockResolvedValue([]);
    apiMock.volunteerTimeSummary.mockResolvedValue({ totalMinutes: 0, serviceDays: 0, pendingMinutes: 0, pendingRequests: 0 });
    render(<VolunteerDashboard />);

    expect(await screen.findByText('No records yet')).toBeInTheDocument();
    // Both the add- and edit-request cards are empty.
    expect(screen.getAllByText('No requests yet')).toHaveLength(2);
  });

  it('submits an add-time request with hours/minutes and an assigned supervisor', async () => {
    const user = userEvent.setup();
    render(<VolunteerDashboard />);

    await user.click(await screen.findByRole('button', { name: /Request time/ }));
    await user.type(screen.getByLabelText(/^Event/), 'Shelter Support');
    await user.clear(screen.getByLabelText(/^Hours/));
    await user.type(screen.getByLabelText(/^Hours/), '1');
    await user.clear(screen.getByLabelText(/^Minutes/));
    await user.type(screen.getByLabelText(/^Minutes/), '30');
    await user.selectOptions(screen.getByLabelText(/^Assign to/), 'a1');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText(/Request submitted/)).toBeInTheDocument();
    expect(apiMock.createTimeAddRequest).toHaveBeenCalledWith({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      event: 'Shelter Support',
      minutes: 90,
      assignedAdminId: 'a1',
    });
  });

  it('omits the assigned supervisor when the placeholder choice is kept', async () => {
    const user = userEvent.setup();
    render(<VolunteerDashboard />);

    await user.click(await screen.findByRole('button', { name: /Request time/ }));
    await user.type(screen.getByLabelText(/^Event/), 'Kitchen Duty');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText(/Request submitted/)).toBeInTheDocument();
    expect(apiMock.createTimeAddRequest).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'Kitchen Duty', minutes: 60, assignedAdminId: undefined }),
    );
  });

  it('submits an edit request pre-filled from the record plus a reason', async () => {
    const user = userEvent.setup();
    render(<VolunteerDashboard />);

    await user.click(await screen.findByRole('button', { name: 'Request a change' }));
    expect(screen.getByLabelText(/^Event/)).toHaveValue('Blood Drive');
    expect(screen.getByLabelText(/^Date/)).toHaveValue('2026-09-22');
    await user.clear(screen.getByLabelText(/^Hours/));
    await user.type(screen.getByLabelText(/^Hours/), '2');
    await user.type(screen.getByLabelText(/^Reason/), 'We logged the wrong duration');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText(/Request submitted/)).toBeInTheDocument();
    expect(apiMock.createTimeEditRequest).toHaveBeenCalledWith({
      recordId: 'rec-1',
      date: '2026-09-22',
      event: 'Blood Drive',
      minutes: 120,
      reason: 'We logged the wrong duration',
      assignedAdminId: undefined,
    });
  });

  it('refuses to submit an edit request with a whitespace-only reason', async () => {
    const user = userEvent.setup();
    render(<VolunteerDashboard />);

    await user.click(await screen.findByRole('button', { name: 'Request a change' }));
    // Whitespace passes the native `required` check, so our client-side
    // validation is what must catch it.
    await user.type(screen.getByLabelText(/^Reason/), '   ');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText('Please review the highlighted fields and try again.')).toBeInTheDocument();
    expect(apiMock.createTimeEditRequest).not.toHaveBeenCalled();
  });

  it('surfaces a load failure in the error banner', async () => {
    apiMock.volunteerTimeSummary.mockRejectedValue(new ApiError('temporarily unavailable', 'TIME_SERVICE_UNAVAILABLE', 503));
    render(<VolunteerDashboard />);

    expect(await screen.findByText('temporarily unavailable')).toBeInTheDocument();
  });

  it('shows the lock notice and disables requests until the profile is complete', async () => {
    apiMock.volunteerProfile.mockResolvedValue({
      profile: {} as never,
      completion: completion(80, 8, { identityVerified: false }),
    });
    render(<VolunteerDashboard />);

    expect(await screen.findByText('Time requests are locked until your profile is complete (100%).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Request time/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Request a change' })).toBeDisabled();
  });

  it('shows no lock notice at 100% completion', async () => {
    render(<VolunteerDashboard />);
    expect(await screen.findByText('Blood Drive')).toBeInTheDocument();
    expect(screen.queryByText(/Time requests are locked/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Request time/ })).toBeEnabled();
  });
});