import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type AdminAddRequest, type AdminEditRequest, type AdminOverview, type AdminVolunteer } from '../api/client';
import { ApiError } from '../api/error';
import i18n from '../i18n';
import { AdminTimeManagement } from '../pages/AdminTimeManagement';

async function i18nReady(): Promise<void> {
  if (!i18n.isInitialized) {
    await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()));
  }
  await i18n.changeLanguage('en');
}

vi.mock('../api/client', () => ({
  api: {
    adminTimeOverview: vi.fn(),
    adminTimeAddRequests: vi.fn(),
    adminTimeEditRequests: vi.fn(),
    adminTimeVolunteers: vi.fn(),
    decideTimeAddRequest: vi.fn(),
    decideTimeEditRequest: vi.fn(),
    createTimeAdjustment: vi.fn(),
    identityVerifyVolunteer: vi.fn(),
    adminVolunteerRecords: vi.fn(),
    adminServiceReports: vi.fn(),
    revokeServiceReport: vi.fn(),
  },
}));

const apiMock = vi.mocked(api);

const OVERVIEW: AdminOverview = {
  pendingAddRequests: 1,
  pendingEditRequests: 1,
  pendingVolunteerMinutes: 60,
  approvedMinutes: 240,
  approvedThisMonthMinutes: 240,
  volunteerCount: 42,
  serviceDays: 12,
};

const VOLUNTEER: AdminVolunteer = {
  id: 'vol-1',
  code: 'ERC-1000',
  englishName: 'Mona Gaber',
  arabicName: null,
  email: 'mona@example.com',
  phone: null,
  organization: 'Cairo University',
  emailVerified: true,
  identityVerified: false,
  status: 'active',
  profileCompletion: 80,
  onboardingComplete: false,
};

const ADD_REQUEST: AdminAddRequest = {
  id: 'q-add-1',
  date: '2026-09-21T00:00:00.000Z',
  event: 'Blood Drive',
  minutes: 90,
  status: 'pending',
  assignedAdminId: null,
  createdAt: '2026-09-21T00:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
  volunteer: { id: 'vol-1', code: 'ERC-1000', englishName: 'Mona Gaber', arabicName: null },
  branch: { id: 'b1', nameEn: 'Cairo' },
};

const EDIT_REQUEST: AdminEditRequest = {
  id: 'q-edit-1',
  record: { id: 'rec-1' },
  requestedDate: '2026-09-20T00:00:00.000Z',
  requestedEvent: 'Shelter Support',
  requestedMinutes: 30,
  reason: 'Typo on date',
  status: 'pending',
  assignedAdminId: null,
  createdAt: '2026-09-22T00:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
  volunteer: { id: 'vol-1', code: 'ERC-1000', englishName: 'Mona Gaber', arabicName: null },
  branch: { id: 'b1', nameEn: 'Cairo' },
  originalDate: '2026-09-20T00:00:00.000Z',
  originalEvent: 'Shelter Support',
  originalMinutes: 60,
};

beforeEach(async () => {
  await i18nReady();
  apiMock.adminTimeOverview.mockResolvedValue(OVERVIEW);
  apiMock.adminTimeAddRequests.mockResolvedValue([ADD_REQUEST]);
  apiMock.adminTimeEditRequests.mockResolvedValue([EDIT_REQUEST]);
  apiMock.adminTimeVolunteers.mockResolvedValue([VOLUNTEER]);
  apiMock.decideTimeAddRequest.mockResolvedValue(undefined);
  apiMock.decideTimeEditRequest.mockResolvedValue(undefined);
  apiMock.createTimeAdjustment.mockResolvedValue({ id: 'adj-1', status: 'approved' } as never);
  apiMock.identityVerifyVolunteer.mockResolvedValue({} as never);
  apiMock.adminVolunteerRecords.mockResolvedValue({ volunteer: VOLUNTEER, records: [] } as never);
  apiMock.adminServiceReports.mockResolvedValue({ items: [], meta: { page: 1, pageSize: 100, total: 0 } } as never);
  apiMock.revokeServiceReport.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AdminTimeManagement', () => {
  it('renders overview stats exactly as the server reports them', async () => {
    render(<AdminTimeManagement />);

    expect(await screen.findByText('1h')).toBeInTheDocument();
    expect(screen.getByText('4h')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(apiMock.adminTimeOverview).toHaveBeenCalledTimes(1);
  });

  it('approves an add request from the requests tab', async () => {
    const user = userEvent.setup();
    render(<AdminTimeManagement />);

    await user.click(await screen.findByRole('button', { name: 'Requests' }));
    expect(await screen.findByText(/Blood Drive/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await vi.waitFor(() => {
      expect(apiMock.decideTimeAddRequest).toHaveBeenCalledWith('q-add-1', 'approve');
    });
    // The decision triggers a fresh overview refresh.
    await vi.waitFor(() => {
      expect(apiMock.adminTimeOverview.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('rejects an edit request without mutating service records', async () => {
    const user = userEvent.setup();
    render(<AdminTimeManagement />);

    await user.click(await screen.findByRole('button', { name: 'Requests' }));
    await user.click(await screen.findByRole('tab', { name: 'Edit requests' }));
    expect(await screen.findByText(/Shelter Support/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reject' }));

    await vi.waitFor(() => {
      expect(apiMock.decideTimeEditRequest).toHaveBeenCalledWith('q-edit-1', 'reject');
    });
    expect(apiMock.decideTimeAddRequest).not.toHaveBeenCalled();
  });

  it('submits a signed adjustment with the required reason', async () => {
    const user = userEvent.setup();
    render(<AdminTimeManagement />);

    await user.click(await screen.findByRole('button', { name: 'Adjustments' }));
    await user.selectOptions(screen.getByLabelText(/^Volunteer/), 'vol-1');
    await user.type(screen.getByLabelText(/^Event/), 'Correction');
    await user.clear(screen.getByLabelText(/^Minutes/));
    await user.type(screen.getByLabelText(/^Minutes/), '-30');
    await user.type(screen.getByLabelText(/^Reason/), 'Missed session');
    await user.click(screen.getByRole('button', { name: 'Apply adjustment' }));

    expect(await screen.findByText('Adjustment applied.')).toBeInTheDocument();
    expect(apiMock.createTimeAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        volunteerId: 'vol-1',
        event: 'Correction',
        minutes: -30,
        reason: 'Missed session',
      }),
    );
  });

  it('keeps the search field focused while typing and filtering', async () => {
    const user = userEvent.setup();
    render(<AdminTimeManagement />);

    await user.click(await screen.findByRole('button', { name: 'Requests' }));
    const search = await screen.findByLabelText(/^Search/);
    await user.type(search, 'Blood');

    // Typing re-renders the filtered row list; the input must never drop focus
    // (if it were re-mounted mid-keystroke the value would lose characters).
    expect(search).toHaveValue('Blood');
    expect(document.activeElement).toBe(search);
    expect(await screen.findByText(/Blood Drive/)).toBeInTheDocument();

    // Filter chips cause another re-render; the controlled input survives it
    // as the same mounted node and keeps accepting keystrokes.
    await user.click(screen.getByRole('button', { name: 'Rejected' }));
    expect(screen.getByLabelText(/^Search/)).toHaveValue('Blood');
    expect(search).toBe(screen.getByLabelText(/^Search/));
    await user.type(screen.getByLabelText(/^Search/), ' Drive');
    expect(screen.getByLabelText(/^Search/)).toHaveValue('Blood Drive');
    expect(document.activeElement).toBe(screen.getByLabelText(/^Search/));
  });

  it('verifies a volunteer identity and reflects it in the list', async () => {
    const user = userEvent.setup();
    render(<AdminTimeManagement />);

    await user.click(await screen.findByRole('button', { name: 'Volunteers' }));
    expect(await screen.findByText('Mona Gaber')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Verify identity' }));

    await vi.waitFor(() => {
      expect(apiMock.identityVerifyVolunteer).toHaveBeenCalledWith('vol-1');
    });
  });

  it('scopes decision errors to the page without hiding the board', async () => {
    apiMock.decideTimeAddRequest.mockRejectedValue(new ApiError('Decision conflict', 'TIME_REQUEST_ALREADY_DECIDED', 409));
    const user = userEvent.setup();
    render(<AdminTimeManagement />);

    await user.click(await screen.findByRole('button', { name: 'Requests' }));
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Decision conflict')).toBeInTheDocument();
    expect(screen.getByText(/Blood Drive/)).toBeInTheDocument();
  });
});