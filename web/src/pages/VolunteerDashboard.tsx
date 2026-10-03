import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  type ProfileCompletion,
  type ServiceTimeRecord,
  type TimeAddRequest,
  type TimeAdmin,
  type TimeEditRequest,
  type TimeSummary,
} from '../api/client';
import { ApiError } from '../api/error';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { apiErrorMessage } from '../lib/errorMessage';
import { dateInputValue, formatMinutes, todayInputValue } from '../lib/formatMinutes';

type ModalState = { kind: 'add' } | { kind: 'edit'; record: ServiceTimeRecord } | null;

export interface RequestPayload {
  date: string;
  event: string;
  minutes: number;
  reason?: string;
  assignedAdminId?: string;
}

/**
 * Phase 4 volunteer time dashboard: approved-only records with server-computed
 * totals, add/edit time requests (optional supervisor assignment), and status
 * tracking. All numbers come verbatim from the server.
 */
export function VolunteerDashboard() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<TimeSummary | null>(null);
  const [records, setRecords] = useState<ServiceTimeRecord[]>([]);
  const [addRequests, setAddRequests] = useState<TimeAddRequest[]>([]);
  const [editRequests, setEditRequests] = useState<TimeEditRequest[]>([]);
  const [admins, setAdmins] = useState<TimeAdmin[]>([]);
  const [completion, setCompletion] = useState<ProfileCompletion | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, r, ar, er, a, p] = await Promise.all([
        api.volunteerTimeSummary(),
        api.volunteerTimeRecords(),
        api.volunteerTimeRequests(),
        api.volunteerEditTimeRequests(),
        api.volunteerTimeAdmins(),
        api.volunteerProfile(),
      ]);
      setSummary(s);
      setRecords(r);
      setAddRequests(ar);
      setEditRequests(er);
      setAdmins(a);
      setCompletion(p.completion);
      setLoadError(null);
    } catch (err) {
      setLoadError(apiErrorMessage(err, t));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Mirrors the server gate: requests are refused below 100% completion. */
  const locked = completion !== null && completion.percent < 100;

  const onSubmitRequest = async (payload: RequestPayload): Promise<void> => {
    if (modal?.kind === 'edit') {
      await api.createTimeEditRequest({
        recordId: modal.record.id,
        date: payload.date,
        event: payload.event,
        minutes: payload.minutes,
        reason: payload.reason ?? '',
        assignedAdminId: payload.assignedAdminId,
      });
    } else {
      await api.createTimeAddRequest({
        date: payload.date,
        event: payload.event,
        minutes: payload.minutes,
        assignedAdminId: payload.assignedAdminId,
      });
    }
    setModal(null);
    setNotice(t('timeSubmitted'));
    await load();
  };

  return (
    <div className="space-y-6">
      {notice ? (
        <ErrorBanner tone="notice">{notice}</ErrorBanner>
      ) : null}
      {loadError ? <ErrorBanner>{loadError}</ErrorBanner> : null}
      {completion && completion.percent < 100 ? (
        <ErrorBanner tone="notice">{t('timeLockedNotice')}</ErrorBanner>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('timeApprovedHours')} value={summary ? formatMinutes(summary.totalMinutes, t) : '–'} />
        <StatCard
          label={t('timePending')}
          value={summary ? formatMinutes(summary.pendingMinutes, t) : '–'}
          hint={summary ? `${t('timePendingRequests')}: ${summary.pendingRequests}` : undefined}
        />
        <StatCard label={t('timeServiceDays')} value={summary ? String(summary.serviceDays) : '–'} />
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">{t('timeRecordsTitle')}</h2>
            <p className="mt-0.5 text-sm text-muted">{t('timeRecordsSubtitle')}</p>
          </div>
          <Button size="sm" disabled={locked} onClick={() => setModal({ kind: 'add' })}>
            + {t('timeAddTime')}
          </Button>
        </div>

        {records.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-muted">
            {t('timeNoRecords')}
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-ink/10">
            {records.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-ink">{r.event}</div>
                  <div className="text-sm text-muted">{dateInputValue(r.date)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={r.minutes < 0 ? 'font-semibold text-crimson-dark' : 'font-semibold text-ink'}>
                    {formatMinutes(r.minutes, t)}
                  </span>
                  <Button variant="secondary" size="sm" disabled={locked} onClick={() => setModal({ kind: 'edit', record: r })}>
                    {t('timeEditRecord')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <RequestListCard
          title={t('timeRequestsTitle')}
          subtitle={t('timeRequestsSubtitle')}
          empty={t('timeNoRequests')}
          rows={addRequests.map((r) => ({
            id: r.id,
            date: dateInputValue(r.date),
            primary: r.event,
            minutes: r.minutes,
            status: r.status,
          }))}
        />
        <RequestListCard
          title={t('timeEditRequestsTitle')}
          subtitle={t('timeEditRequestsSubtitle')}
          empty={t('timeNoRequests')}
          rows={editRequests.map((r) => ({
            id: r.id,
            date: dateInputValue(r.requestedDate),
            primary: r.requestedEvent,
            minutes: r.requestedMinutes,
            status: r.status,
          }))}
        />
      </section>

      {modal ? (
        <TimeRequestModal
          kind={modal.kind}
          record={modal.kind === 'edit' ? modal.record : undefined}
          admins={admins}
          onClose={() => setModal(null)}
          onSubmit={onSubmitRequest}
        />
      ) : null}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-ink">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

interface RequestRow {
  id: string;
  date: string;
  primary: string;
  minutes: number;
  status: TimeAddRequest['status'];
}

function RequestListCard({
  title,
  subtitle,
  empty,
  rows,
}: {
  title: string;
  subtitle: string;
  empty: string;
  rows: RequestRow[];
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-ink/15 px-4 py-6 text-center text-sm text-muted">
          {empty}
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-ink/10">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="font-medium text-ink">{r.primary}</div>
                <div className="text-sm text-muted">{r.date}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-semibold text-ink">{formatMinutes(r.minutes, t)}</span>
                <StatusBadge status={r.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: TimeAddRequest['status'] }) {
  const { t } = useTranslation();
  const tone =
    status === 'approved'
      ? 'bg-emerald-600/10 text-emerald-700'
      : status === 'rejected'
        ? 'bg-crimson/10 text-crimson-dark'
        : 'bg-amber-500/10 text-amber-700';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{t(status)}</span>
  );
}

function TimeRequestModal({
  kind,
  record,
  admins,
  onClose,
  onSubmit,
}: {
  kind: 'add' | 'edit';
  record?: ServiceTimeRecord;
  admins: TimeAdmin[];
  onClose: () => void;
  onSubmit: (payload: RequestPayload) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(kind === 'edit' && record ? dateInputValue(record.date) : todayInputValue());
  const [event, setEvent] = useState(kind === 'edit' && record ? record.event : '');
  const [hours, setHours] = useState(kind === 'edit' && record ? String(Math.floor(Math.abs(record.minutes) / 60)) : '1');
  const [minutes, setMinutes] = useState(kind === 'edit' && record ? String(Math.abs(record.minutes) % 60) : '0');
  const [reason, setReason] = useState('');
  const [assignedAdminId, setAssignedAdminId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title = kind === 'edit' ? t('timeRequestEditTitle') : t('timeRequestAddTitle');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const h = Number(hours);
    const m = Number(minutes);
    if (!event.trim()) {
      setError(t('errorValidation'));
      return;
    }
    if (!Number.isInteger(h) || h < 0 || !Number.isInteger(m) || m < 0 || m > 59) {
      setError(t('errorValidation'));
      return;
    }
    const total = h * 60 + m;
    if (total <= 0) {
      setError(t('errorValidation'));
      return;
    }
    if (kind === 'edit' && !reason.trim()) {
      setError(t('errorValidation'));
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        date,
        event: event.trim(),
        minutes: total,
        reason: kind === 'edit' ? reason.trim() : undefined,
        assignedAdminId: assignedAdminId || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errorUnexpected'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-ink/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>

        {kind === 'edit' && record ? (
          <p className="mt-1 rounded-lg bg-canvas px-3 py-2 text-sm text-muted">
            {t('timeOriginal')}: {record.event} · {dateInputValue(record.date)} · {formatMinutes(record.minutes, t)}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">{t('timeRequestsSubtitle')}</p>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField label={t('timeDate')} name="timeDate" type="date" value={date} onChange={setDate} required />
          <div className="sm:col-span-2">
            <TextField label={t('timeEvent')} name="timeEvent" value={event} onChange={setEvent} required />
          </div>
          <TextField label={t('timeHours')} name="timeHours" type="number" value={hours} onChange={setHours} required />
          <TextField label={t('timeMinutes')} name="timeMinutes" type="number" value={minutes} onChange={setMinutes} required />
          <div className="sm:col-span-2">
            <SelectField
              label={t('timeAssignTo')}
              name="assignedAdminId"
              value={assignedAdminId}
              onChange={setAssignedAdminId}
              placeholder={t('timeAssignToOptional')}
              options={admins.map((a) => ({ value: a.id, label: a.fullNameEn }))}
            />
          </div>
          {kind === 'edit' ? (
            <div className="sm:col-span-2">
              <TextField label={t('timeReason')} name="timeReason" value={reason} onChange={setReason} required />
            </div>
          ) : null}
          {kind === 'edit' ? (
            <p className="text-xs text-muted sm:col-span-2">{t('timeEditWindowHint')}</p>
          ) : null}
        </div>

        {error ? <div className="mt-4"><ErrorBanner>{error}</ErrorBanner></div> : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" busy={busy}>
            {t('timeSubmitRequest')}
          </Button>
        </div>
      </form>
    </div>
  );
}