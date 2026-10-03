import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ActivityEntry, type Paged } from '../api/client';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { actionLabel } from '../lib/actionLabel';
import { apiErrorMessage } from '../lib/errorMessage';
import { dateInputValue, formatMinutes } from '../lib/formatMinutes';

const PAGE_SIZE = 15;

/**
 * Phase 6 volunteer activity log. Rows are a curated, server-side projection
 * of the append-only audit trail scoped to the signed-in volunteer; the SPA
 * renders exactly what the server returns and never sees raw JSON metadata.
 */
export function VolunteerActivity() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<ActivityEntry> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .volunteerActivity({ page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((err) => {
        if (alive) setError(apiErrorMessage(err, t));
      });
    return () => {
      alive = false;
    };
  }, [page, t]);

  const meta = data?.meta;
  const pages = meta ? Math.max(1, Math.ceil(meta.total / PAGE_SIZE)) : 1;
  const items = data?.items ?? [];

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-ink">{t('activityTitle')}</h3>
      <p className="mt-0.5 text-sm text-muted">{t('activitySubtitle')}</p>

      {error ? <div className="mt-3"><ErrorBanner>{error}</ErrorBanner></div> : null}

      {items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-muted">
          {t('activityNoRows')}
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-ink/10">
          {items.map((row) => (
            <ActivityRow key={row.id} row={row} />
          ))}
        </ul>
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
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ActivityRow({ row }: { row: ActivityEntry }) {
  const { t } = useTranslation();
  const detail: string[] = [];
  if (row.date) detail.push(dateInputValue(row.date));
  if (row.event) detail.push(row.event);
  if (row.minutes !== undefined) detail.push(formatMinutes(row.minutes, t));
  if (row.reason) detail.push(`${t('reason')}: ${row.reason}`);
  if (row.code) detail.push(row.code);
  if (row.recordId) detail.push(row.recordId);

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium text-ink">{actionLabel(row.action, t)}</span>
          <span className="text-xs text-muted">{new Date(row.createdAt).toLocaleString()}</span>
        </div>
        {detail.length > 0 ? <div className="mt-0.5 text-sm text-muted">{detail.join(' · ')}</div> : null}
      </div>
      {row.actorLabel ? (
        <span className="shrink-0 text-xs text-muted">
          {t('activityBy')} {row.actorLabel}
        </span>
      ) : null}
    </li>
  );
}