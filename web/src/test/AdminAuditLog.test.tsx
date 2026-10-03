import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type AuditLogEntry, type Paged } from '../api/client';
import i18n from '../i18n';
import { AdminAuditLog } from '../pages/AdminAuditLog';

async function i18nReady(): Promise<void> {
  if (!i18n.isInitialized) {
    await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()));
  }
  await i18n.changeLanguage('en');
}

vi.mock('../api/client', () => ({
  api: {
    adminAuditLog: vi.fn(),
  },
}));

const apiMock = vi.mocked(api);

const ENTRY: AuditLogEntry = {
  id: 'a1',
  actorType: 'admin',
  actorId: 'adm1',
  actorName: 'Admin HQ',
  actorRole: 'admin',
  action: 'time.add_request.approved',
  targetType: 'timeAddRequest',
  targetId: 'q1',
  branchId: 'b1',
  metadata: { volunteerId: 'v1', minutes: 120 },
  ipAddress: '127.0.0.1',
  createdAt: '2026-09-22T09:00:00.000Z',
};

function paged(items: AuditLogEntry[], page: number, total: number): Paged<AuditLogEntry> {
  return { items, meta: { page, pageSize: 15, total } };
}

beforeEach(async () => {
  await i18nReady();
  apiMock.adminAuditLog.mockResolvedValue(paged([ENTRY], 1, 1));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AdminAuditLog', () => {
  it('fetches the first page on mount and renders action labels from the server vocabulary', async () => {
    render(<AdminAuditLog />);
    expect(await screen.findByText('Time request approved', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Admin HQ')).toBeInTheDocument();
    expect(screen.getByText('Time request · q1')).toBeInTheDocument();
    expect(screen.getByText('1 rows')).toBeInTheDocument();
    expect(apiMock.adminAuditLog).toHaveBeenCalledWith({ q: '', action: '', targetType: '', from: '', to: '', page: 1, pageSize: 15 });
  });

  it('shows an empty state when no rows match', async () => {
    apiMock.adminAuditLog.mockResolvedValue(paged([], 1, 0));
    render(<AdminAuditLog />);
    expect(await screen.findByText('No matching entries.')).toBeInTheDocument();
  });

  it('applies an action filter and resets to page 1', async () => {
    const user = userEvent.setup();
    render(<AdminAuditLog />);
    await user.selectOptions(screen.getByLabelText('Action filter'), 'report.generated');
    expect(apiMock.adminAuditLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'report.generated', page: 1 }),
    );
  });

  it('applies the target-type filter', async () => {
    const user = userEvent.setup();
    render(<AdminAuditLog />);
    await user.selectOptions(screen.getByLabelText('Target type'), 'volunteer');
    expect(apiMock.adminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({ targetType: 'volunteer' }));
  });

  it('applies a date range and resets to page 1', async () => {
    render(<AdminAuditLog />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-30' } });
    expect(apiMock.adminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-09-01', to: '2026-09-30', page: 1 }));
  });

  it('searches on submit and paginates with stable server totals', async () => {
    const user = userEvent.setup();
    apiMock.adminAuditLog.mockResolvedValue(paged([ENTRY], 1, 30));
    render(<AdminAuditLog />);
    await screen.findByText('Time request approved', { selector: 'span' });

    await user.type(screen.getByLabelText('Search'), 'q1');
    await user.click(screen.getByText('Search', { selector: 'button' }));
    expect(apiMock.adminAuditLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'q1', page: 1 }),
    );

    await screen.findByText('Time request approved', { selector: 'span' });
    const prev = screen.getByRole('button', { name: 'Previous' });
    expect(prev).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(apiMock.adminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    expect(screen.getByText('30 rows')).toBeInTheDocument();
  });
});