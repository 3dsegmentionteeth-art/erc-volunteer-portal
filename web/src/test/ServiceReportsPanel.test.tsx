import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/error';
import { api, type ServiceReportRow } from '../api/client';
import i18n from '../i18n';
import { ServiceReportsPanel } from '../pages/ServiceReportsPanel';

async function i18nReady(): Promise<void> {
  if (!i18n.isInitialized) {
    await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()));
  }
  await i18n.changeLanguage('en');
}

vi.mock('../api/client', () => ({
  api: {
    adminServiceReports: vi.fn(),
    revokeServiceReport: vi.fn(),
  },
}));

const apiMock = vi.mocked(api);

const ACTIVE: ServiceReportRow = {
  id: 'sr-1',
  ref: 'a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e',
  issuedAt: '2026-09-20T09:00:00.000Z',
  approvedMinutes: 150,
  recordCount: 3,
  serviceDayCount: 2,
  revokedAt: null,
  revokedBy: null,
  revocationReason: null,
  currentApprovedMinutes: 195,
  currentRecordCount: 4,
  currentServiceDayCount: 3,
};

const REVOKED: ServiceReportRow = {
  ...ACTIVE,
  id: 'sr-2',
  ref: 'ffeeddccbbaa99887766554433221100aabbccdd',
  issuedAt: '2026-09-19T09:00:00.000Z',
  approvedMinutes: 120,
  recordCount: 2,
  serviceDayCount: 2,
  currentApprovedMinutes: 120,
  currentRecordCount: 2,
  currentServiceDayCount: 2,
  revokedAt: '2026-09-22T11:00:00.000Z',
  revokedBy: 'Mona Gaber',
  revocationReason: 'Issued to the wrong volunteer.',
};

function paged(rows: ServiceReportRow[]) {
  return { items: rows, meta: { page: 1, pageSize: 100, total: rows.length } };
}

beforeEach(async () => {
  await i18nReady();
  apiMock.adminServiceReports.mockResolvedValue(paged([ACTIVE, REVOKED]));
  apiMock.revokeServiceReport.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ServiceReportsPanel', () => {
  it('shows frozen and live totals side by side, with status and revocation details', async () => {
    render(<ServiceReportsPanel volunteerId="vol-1" />);

    expect(await screen.findByText('Service report shelf')).toBeInTheDocument();

    const activeCard = screen.getByText('2h' + ' 30m').closest('li');
    expect(activeCard).not.toBeNull();
    expect(within(activeCard as HTMLElement).getByText('Active')).toBeInTheDocument();

    const cards = screen.getAllByRole('listitem');
    const revokedCard = cards.find((c) => c.textContent?.includes('Issued to the wrong volunteer.'));
    expect(revokedCard).toBeDefined();
    expect(within(revokedCard as HTMLElement).getByText('Revoked')).toBeInTheDocument();
    expect(revokedCard?.textContent).toContain('Mona Gaber');
    expect(within(revokedCard as HTMLElement).queryByRole('button', { name: 'Revoke reference' })).toBeNull();
  });

  it('revokes a report with its reason and reloads the shelf', async () => {
    const user = userEvent.setup();
    apiMock.adminServiceReports
      .mockResolvedValueOnce(paged([ACTIVE, REVOKED]))
      .mockResolvedValueOnce(paged([{ ...ACTIVE, revokedAt: '2026-09-23T10:00:00.000Z', revokedBy: 'Mona Gaber' }, REVOKED]));
    render(<ServiceReportsPanel volunteerId="vol-1" />);

    await screen.findByText('Service report shelf');
    await user.click(screen.getByRole('button', { name: 'Revoke reference' }));
    await user.type(screen.getByLabelText('Reason (optional)'), 'Double-issued');
    await user.click(screen.getByRole('button', { name: 'Confirm revocation' }));

    expect(await screen.findByText('Report revoked.')).toBeInTheDocument();
    expect(apiMock.revokeServiceReport).toHaveBeenCalledWith(ACTIVE.ref, 'Double-issued');
    expect(apiMock.adminServiceReports).toHaveBeenCalledTimes(2);
  });

  it('keeps the row and shows the server error when revocation fails', async () => {
    const user = userEvent.setup();
    apiMock.revokeServiceReport.mockRejectedValue(new ApiError('Already revoked.', 'SERVICE_REPORT_ALREADY_REVOKED', 409));
    render(<ServiceReportsPanel volunteerId="vol-1" />);

    await screen.findByText('Service report shelf');
    await user.click(screen.getByRole('button', { name: 'Revoke reference' }));
    await user.click(screen.getByRole('button', { name: 'Confirm revocation' }));

    expect(await screen.findByText('Already revoked.')).toBeInTheDocument();
    expect(apiMock.revokeServiceReport).toHaveBeenCalledTimes(1);
    const cards = screen.getAllByRole('listitem');
    expect(cards.some((c) => c.textContent?.includes('Active'))).toBe(true);
  });

  it('shows the empty state when no reports were issued', async () => {
    apiMock.adminServiceReports.mockResolvedValue(paged([]));
    render(<ServiceReportsPanel volunteerId="vol-1" />);

    expect(await screen.findByText('No service reports issued yet.')).toBeInTheDocument();
  });
});