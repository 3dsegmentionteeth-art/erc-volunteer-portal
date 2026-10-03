import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ServiceReportRow } from '../api/client';
import { ApiError } from '../api/error';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { TextField } from '../components/TextField';
import { apiErrorMessage } from '../lib/errorMessage';
import { formatMinutes } from '../lib/formatMinutes';

const PAGE_SIZE = 100;

function revokeTone(revoked: boolean): string {
  return revoked ? 'bg-crimson/10 text-crimson-dark' : 'bg-emerald-600/10 text-emerald-700';
}

/**
 * Phase 6.1 admin credential shelf for one volunteer: every service report
 * they were issued, pairing the FROZEN snapshot (what the paper/QR says) with
 * the volunteer's CURRENT live totals — so "this report said 120, they're now
 * at 135" is visible at a glance. Only admins see the live comparison. Each row
 * can be revoked (per-report, audited server-side); revoked reports keep their
 * frozen numbers here but fail public verification with the same 404 as unknown
 * references.
 */
export function ServiceReportsPanel({ volunteerId }: { volunteerId: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ServiceReportRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ServiceReportRow | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.adminServiceReports(volunteerId, { pageSize: PAGE_SIZE });
      setRows(res.items);
      setLoaded(true);
    } catch (err) {
      setError(apiErrorMessage(err, t));
    }
  }, [volunteerId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmRevoke = async (e: FormEvent) => {
    e.preventDefault();
    if (!revokeTarget) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.revokeServiceReport(revokeTarget.ref, reason);
      setNotice(t('reportRevokeDone'));
      setRevokeTarget(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errorUnexpected'));
    } finally {
      setBusy(false);
    }
  };

  const active = rows.filter((r) => !r.revokedAt);

  return (
    <div className="mt-4 border-t border-ink/10 pt-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <h5 className="text-sm font-semibold text-ink">{t('reportShelfTitle')}</h5>
        <span className="text-xs text-muted">{t('rowsCount', { count: rows.length })}</span>
      </div>

      {error ? <div className="mt-3"><ErrorBanner>{error}</ErrorBanner></div> : null}
      {notice ? <div className="mt-3"><ErrorBanner tone="notice">{notice}</ErrorBanner></div> : null}

      {!loaded && rows.length === 0 ? <p className="mt-3 text-sm text-muted">{t('auditNoRows')}</p> : null}

      {loaded && rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-ink/15 px-4 py-6 text-center text-sm text-muted">
          {t('reportNoReports')}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-ink/10 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                    <span className="font-mono text-xs text-ink/70" dir="ltr">{row.ref.slice(0, 12)}…</span>
                    <span>{new Date(row.issuedAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span>
                      <span className="text-xs uppercase tracking-wide text-muted">{t('reportFrozenTotal')}:</span>{' '}
                      <span className="font-semibold text-ink">{formatMinutes(row.approvedMinutes, t)}</span>
                    </span>
                    <span>
                      <span className="text-xs uppercase tracking-wide text-muted">{t('reportCurrentTotal')}:</span>{' '}
                      <span className="font-medium text-ink">{formatMinutes(row.currentApprovedMinutes, t)}</span>
                    </span>
                    <span className="text-xs text-muted">
                      {t('reportRecordsCount')}: {row.recordCount} · {t('reportServiceDays')}: {row.serviceDayCount}
                    </span>
                  </div>
                  {row.revokedAt ? (
                    <p className="mt-1 text-xs text-crimson-dark">
                      {t('reportRevoked')} · {t('reportRevokedBy')}: {row.revokedBy ?? '—'}
                      {row.revocationReason ? ` · ${t('reason')}: ${row.revocationReason}` : ''}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${revokeTone(Boolean(row.revokedAt))}`}>
                    {row.revokedAt ? t('reportRevoked') : t('reportActive')}
                  </span>
                  {row.revokedAt ? null : (
                    <Button variant="secondary" size="sm" onClick={() => { setRevokeTarget(row); setReason(''); setNotice(null); }}>
                      {t('reportRevoke')}
                    </Button>
                  )}
                </div>
              </div>

              {revokeTarget?.id === row.id ? (
                <form onSubmit={confirmRevoke} className="mt-3 rounded-lg bg-canvas p-3">
                  <p className="text-xs text-muted">{t('reportRevokeHint')}</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <TextField
                        label={t('reportRevokeReasonLabel')}
                        name={`revokeReason-${row.id}`}
                        value={reason}
                        onChange={setReason}
                        placeholder={t('reportRevokeReasonPlaceholder')}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="submit" busy={busy}>
                        {t('reportRevokeConfirm')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setRevokeTarget(null)}>
                        {t('cancel')}
                      </Button>
                    </div>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {active.length === 0 && rows.length > 0 ? (
        <p className="mt-3 text-xs text-muted">{t('reportAllRevoked')}</p>
      ) : null}
    </div>
  );
}