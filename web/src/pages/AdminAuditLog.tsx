import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type AuditLogEntry, type Paged } from '../api/client';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { actionLabel, targetLabel } from '../lib/actionLabel';
import { apiErrorMessage } from '../lib/errorMessage';

const PAGE_SIZE = 15;

const ACTION_OPTIONS = [
  'auth.login',
  'auth.logout',
  'auth.login_failed',
  'auth.email_verified',
  'auth.email_verification_resent',
  'registration.created',
  'registration.approved',
  'registration.rejected',
  'document.uploaded',
  'document.deleted',
  'document.approved',
  'document.rejected',
  'time.add_request_created',
  'time.add_request.approved',
  'time.add_request.rejected',
  'time.edit_request_created',
  'time.edit_request.approved',
  'time.edit_request.rejected',
  'time.adjustment.created',
  'volunteer.identity_verified',
  'volunteer.profile_updated',
  'report.generated',
  'service_report.revoked',
];

const TARGET_OPTIONS = [
  'volunteer',
  'timeAddRequest',
  'timeEditRequest',
  'serviceTimeRecord',
  'registration',
  'document',
];

interface Filters {
  q: string;
  action: string;
  targetType: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { q: '', action: '', targetType: '', from: '', to: '' };

function whenLabel(createdAt: string): string {
  return new Date(createdAt).toLocaleString();
}

/**
 * Phase 6 admin audit log. Append-only rows are fetched server-side and filter
 * controls map one-to-one onto the API contract; the SPA never re-derives rows
 * from local state.
 */
export function AdminAuditLog() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [draftQ, setDraftQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<AuditLogEntry> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .adminAuditLog({ ...filters, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((err) => {
        if (alive) setError(apiErrorMessage(err, t));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [filters, page, t]);

  const applyFilters = (next: Filters) => {
    setFilters(next);
    setPage(1);
  };

  const applySearch = (e: FormEvent) => {
    e.preventDefault();
    applyFilters({ ...filters, q: draftQ.trim() });
  };

  const toggleAction = (action: string) => applyFilters({ ...filters, action, q: draftQ.trim() });
  const toggleTarget = (targetType: string) => applyFilters({ ...filters, targetType, q: draftQ.trim() });
  const setRange = (patch: Partial<Pick<Filters, 'from' | 'to'>>) =>
    applyFilters({ ...filters, ...patch, q: draftQ.trim() });

  const resetFilters = () => {
    setDraftQ('');
    applyFilters(EMPTY_FILTERS);
  };

  const meta = data?.meta;
  const pages = meta ? Math.max(1, Math.ceil(meta.total / PAGE_SIZE)) : 1;
  const items = data?.items ?? [];

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-ink">{t('auditTitle')}</h3>
      <p className="mt-0.5 text-sm text-muted">{t('auditSubtitle')}</p>

      <form onSubmit={applySearch} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="sm:col-span-2">
          <TextField
            label={t('search')}
            name="auditQ"
            value={draftQ}
            onChange={setDraftQ}
            placeholder={t('adminSearchPlaceholder')}
          />
        </div>
        <div>
          <SelectField
            label={t('auditFilterAction')}
            name="auditAction"
            value={filters.action}
            onChange={toggleAction}
            options={
              [{ value: '', label: t('all') }, ...ACTION_OPTIONS.map((a) => ({ value: a, label: actionLabel(a, t) }))]
            }
          />
        </div>
        <div>
          <SelectField
            label={t('auditFilterTarget')}
            name="auditTarget"
            value={filters.targetType}
            onChange={toggleTarget}
            options={
              [{ value: '', label: t('all') }, ...TARGET_OPTIONS.map((k) => ({ value: k, label: targetLabel(k, t) }))]
            }
          />
        </div>
        <TextField type="date" label={t('auditFrom')} name="auditFrom" value={filters.from} onChange={(v) => setRange({ from: v })} />
        <TextField type="date" label={t('auditTo')} name="auditTo" value={filters.to} onChange={(v) => setRange({ to: v })} />
        <div className="flex items-end">
          <Button type="submit" variant="secondary">
            {t('search')}
          </Button>
        </div>
      </form>

      {error ? <div className="mt-3"><ErrorBanner>{error}</ErrorBanner></div> : null}
      {loading && !data ? <p className="mt-4 text-sm text-muted">{t('auditNoRows')}</p> : null}

      {items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-muted">
          {t('auditNoRows')}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <ul className="divide-y divide-ink/10">
            <li className="hidden py-2 text-xs uppercase tracking-wide text-muted sm:grid sm:grid-cols-[10rem_11rem_10rem_1fr] sm:gap-3">
              <span>{t('auditWhen')}</span>
              <span>{t('auditActor')}</span>
              <span>{t('auditAction')}</span>
              <span>{t('auditTarget')}</span>
            </li>
            {items.map((row) => (
              <li key={row.id} className="grid gap-1 py-3 sm:grid-cols-[10rem_11rem_10rem_1fr] sm:gap-3">
                <span className="text-sm text-muted">{whenLabel(row.createdAt)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{row.actorName ?? t('role_admin')}</span>
                  <span className="text-xs text-muted">{t(row.actorRole === 'admin' ? 'role_admin' : 'role_volunteer')}</span>
                </span>
                <span className="text-sm text-ink">{actionLabel(row.action, t)}</span>
                <span className="text-sm text-muted">
                  {row.targetType ? `${targetLabel(row.targetType, t)} · ${row.targetId}` : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {meta ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-4 text-sm text-muted">
          <span>{t('rowsCount', { count: meta.total })}</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t('pagePrev')}
            </Button>
            <span>{t('pageStatus', { page, pages })}</span>
            <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
              {t('pageNext')}
            </Button>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}