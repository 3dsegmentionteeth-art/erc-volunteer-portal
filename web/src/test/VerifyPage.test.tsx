import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type VerificationResult } from '../api/client';
import { ApiError } from '../api/error';
import i18n from '../i18n';
import { VerifyPage } from '../pages/VerifyPage';

async function i18nReady(): Promise<void> {
  if (!i18n.isInitialized) {
    await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()));
  }
  await i18n.changeLanguage('en');
}

vi.mock('../api/client', () => ({
  api: {
    verifyRef: vi.fn(),
  },
}));

const apiMock = vi.mocked(api);

const VALID_RESULT: VerificationResult = {
  valid: true,
  reference: { scope: 'service_report', issuedAt: '2026-09-22T10:00:00.000Z' },
  volunteer: { code: 'ERC-1000', englishName: 'Mona Gaber', arabicName: null },
  report: { approvedTotalMinutes: 150, recordCount: 3, serviceDayCount: 2 },
};

function renderPage(ref?: string) {
  const entries = ref ? [`/verify/${ref}`] : ['/verify'];
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/verify/:ref" element={<VerifyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18nReady();
  apiMock.verifyRef.mockResolvedValue(VALID_RESULT);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('VerifyPage', () => {
  it('checks a route ref and renders the verified report (server totals only)', async () => {
    renderPage('a1b2c3');
    expect(await screen.findByText('Reference verified')).toBeInTheDocument();
    expect(screen.getByText('Mona Gaber')).toBeInTheDocument();
    expect(screen.getByText('(ERC-1000)')).toBeInTheDocument();
    // 150 minutes formatted by the shared helper.
    expect(screen.getByText('2h 30m')).toBeInTheDocument();
    expect(apiMock.verifyRef).toHaveBeenCalledWith('a1b2c3');
  });

  it('renders the uniform invalid state for a 404 without distinguishing unknown/revoked', async () => {
    apiMock.verifyRef.mockRejectedValue(new ApiError('not found', 'REF_NOT_FOUND', 404));
    renderPage('bogusref');
    expect(await screen.findByText('Reference not found')).toBeInTheDocument();
    expect(screen.getByText(/does not exist, was revoked, or is malformed/)).toBeInTheDocument();
    expect(screen.queryByText('Mona Gaber')).not.toBeInTheDocument();
  });

  it('surfaces a network error through the shared error banner', async () => {
    apiMock.verifyRef.mockRejectedValue(new ApiError('offline', 'NETWORK_ERROR', 0));
    renderPage('a1b2c3');
    expect(await screen.findByText('Could not reach the server. Check your connection and try again.')).toBeInTheDocument();
  });

  it('lets a visitor type a reference and re-check it', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Reference'), 'f00b4r');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Reference verified')).toBeInTheDocument();
    expect(apiMock.verifyRef).toHaveBeenCalledWith('f00b4r');
    expect(apiMock.verifyRef).toHaveBeenCalledTimes(1);
  });

  it('shows the checking state while the request is pending', async () => {
    let release!: (r: VerificationResult) => void;
    apiMock.verifyRef.mockImplementation(
      () => new Promise<VerificationResult>((resolve) => (release = resolve)),
    );
    renderPage('slowref');
    expect(screen.getByText('Checking reference…')).toBeInTheDocument();
    release(VALID_RESULT);
    expect(await screen.findByText('Reference verified')).toBeInTheDocument();
  });
});