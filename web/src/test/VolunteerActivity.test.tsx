import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ActivityEntry, type Paged } from '../api/client';
import i18n from '../i18n';
import { VolunteerActivity } from '../pages/VolunteerActivity';

async function i18nReady(): Promise<void> {
  if (!i18n.isInitialized) {
    await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()));
  }
  await i18n.changeLanguage('en');
}

vi.mock('../api/client', () => ({
  api: {
    volunteerActivity: vi.fn(),
  },
}));

const apiMock = vi.mocked(api);

const ACTIVITY: ActivityEntry = {
  id: 'x1',
  action: 'time.add_request.approved',
  actorType: 'admin',
  actorLabel: 'Admin Alice',
  createdAt: '2026-09-22T08:00:00.000Z',
  date: '2026-09-20T00:00:00.000Z',
  event: 'Blood Drive',
  minutes: 120,
  reason: 'Verified logs',
  recordId: 'r1',
  code: 'ERC-1000',
};

function paged(items: ActivityEntry[], page: number, total: number): Paged<ActivityEntry> {
  return { items, meta: { page, pageSize: 15, total } };
}

beforeEach(async () => {
  await i18nReady();
  apiMock.volunteerActivity.mockResolvedValue(paged([ACTIVITY], 1, 1));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('VolunteerActivity', () => {
  it('renders the curated projection without raw metadata', async () => {
    render(<VolunteerActivity />);
    expect(await screen.findByText('Time request approved')).toBeInTheDocument();
    expect(screen.getByText(/2026-09-20 · Blood Drive · 2h · Reason: Verified logs/)).toBeInTheDocument();
    expect(screen.getByText('By Admin Alice')).toBeInTheDocument();
    expect(apiMock.volunteerActivity).toHaveBeenCalledWith({ page: 1, pageSize: 15 });
  });

  it('shows an empty state when there is no activity', async () => {
    apiMock.volunteerActivity.mockResolvedValue(paged([], 1, 0));
    render(<VolunteerActivity />);
    expect(await screen.findByText('No activity yet.')).toBeInTheDocument();
  });

  it('paginates through the activity stream', async () => {
    const user = userEvent.setup();
    apiMock.volunteerActivity.mockResolvedValue(paged([ACTIVITY], 1, 30));
    render(<VolunteerActivity />);

    await screen.findByText('Time request approved');
    const prev = screen.getByRole('button', { name: 'Previous' });
    expect(prev).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Time request approved');
    expect(apiMock.volunteerActivity).toHaveBeenLastCalledWith({ page: 2, pageSize: 15 });
  });
});