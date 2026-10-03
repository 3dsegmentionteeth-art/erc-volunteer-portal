import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import {
  api,
  type AdminAddRequest,
  type AdminEditRequest,
  type AdminOverview,
  type AdminVolunteer,
  type AdminVolunteerDetail,
  type ServiceReport,
} from '../api/client';
import { ApiError } from '../api/error';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/ErrorBanner';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { cn } from '../lib/cn';
import { apiErrorMessage } from '../lib/errorMessage';
import { dateInputValue, formatMinutes, todayInputValue } from '../lib/formatMinutes';
import { verifyUrl } from '../lib/verifyUrl';
import { AdminAuditLog } from './AdminAuditLog';
import { ServiceReportsPanel } from './ServiceReportsPanel';

type AdminTab = 'overview' | 'requests' | 'volunteers' | 'adjustments' | 'audit';
type RequestKind = 'add' | 'edit';
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

/**
 * Phase 5 admin time management: overview stats, review/decision of the
 * pending add + edit queues, volunteer oversight (identity verify, records),
 * and manual signed adjustments. Everything is read from the server — the
 * SPA never computes totals and never trusts its own state for a decision.
 */
export function AdminTimeManagement() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [addRequests, setAddRequests] = useState<AdminAddRequest[]>([]);
  const [editRequests, setEditRequests] = useState<AdminEditRequest[]>([]);
  const [volunteers, setVolunteers] = useState<AdminVolunteer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [ov, adds, edits, vols] = await Promise.all([
        api.adminTimeOverview(),
        api.adminTimeAddRequests(),
        api.adminTimeEditRequests(),
        api.adminTimeVolunteers(),
      ]);
      setOverview(ov);
      setAddRequests(adds);
      setEditRequests(edits);
      setVolunteers(vols);
      setLoadError(null);
    } catch (err) {
      setLoadError(apiErrorMessage(err, t));
    }
  }, [t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const runDecision = async (fn: () => Promise<void>, ok: () => void) => {
    setActionError(null);
    try {
      await fn();
      ok();
      await loadAll();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('errorUnexpected'));
    }
  };

  const onApproveAdd = (id: string) => runDecision(() => api.decideTimeAddRequest(id, 'approve'), () => undefined);
  const onRejectAdd = (id: string) => runDecision(() => api.decideTimeAddRequest(id, 'reject'), () => undefined);
  const onApproveEdit = (id: string) => runDecision(() => api.decideTimeEditRequest(id, 'approve'), () => undefined);
  const onRejectEdit = (id: string) => runDecision(() => api.decideTimeEditRequest(id, 'reject'), () => undefined);
  const onVerify = (id: string) => runDecision(() => api.identityVerifyVolunteer(id), () => undefined);

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'overview', label: t('navOverview') },
    { key: 'requests', label: t('navRequests') },
    { key: 'volunteers', label: t('navVolunteers') },
    { key: 'adjustments', label: t('navAdjustments') },
    { key: 'audit', label: t('navAudit') },
  ];

  return (
    <div className="space-y-6">
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}
      {loadError ? <ErrorBanner>{loadError}</ErrorBanner> : null}

      <nav className="flex flex-wrap gap-1 rounded-xl border border-ink/10 bg-white p-1 shadow-sm" aria-label="Admin sections">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab === key ? 'bg-crimson text-white shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? <OverviewView overview={overview} /> : null}
      {tab === 'requests' ? (
        <RequestsView
          addRequests={addRequests}
          editRequests={editRequests}
          onApproveAdd={onApproveAdd}
          onRejectAdd={onRejectAdd}
          onApproveEdit={onApproveEdit}
          onRejectEdit={onRejectEdit}
        />
      ) : null}
      {tab === 'volunteers' ? <VolunteersView volunteers={volunteers} onVerify={onVerify} /> : null}
      {tab === 'adjustments' ? <AdjustmentsView volunteers={volunteers} onApplied={loadAll} /> : null}
      {tab === 'audit' ? <AdminAuditLog /> : null}
    </div>
  );
}

function OverviewView({ overview }: { overview: AdminOverview | null }) {
  const { t } = useTranslation();
  if (!overview) return null;
  const stats: { label: string; value: string }[] = [
    { label: t('adminStatPendingAdd'), value: String(overview.pendingAddRequests) },
    { label: t('adminStatPendingEdit'), value: String(overview.pendingEditRequests) },
    { label: t('adminStatPendingMinutes'), value: formatMinutes(overview.pendingVolunteerMinutes, t) },
    { label: t('adminStatThisMonth'), value: formatMinutes(overview.approvedThisMonthMinutes, t) },
    { label: t('adminStatVolunteers'), value: String(overview.volunteerCount) },
    { label: t('adminStatServiceDays'), value: String(overview.serviceDays) },
  ];
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
          <div className="text-sm text-muted">{s.label}</div>
          <div className="mt-1 text-2xl font-bold text-ink">{s.value}</div>
        </div>
      ))}
    </section>
  );
}

function RequestsView({
  addRequests,
  editRequests,
  onApproveAdd,
  onRejectAdd,
  onApproveEdit,
  onRejectEdit,
}: {
  addRequests: AdminAddRequest[];
  editRequests: AdminEditRequest[];
  onApproveAdd: (id: string) => void;
  onRejectAdd: (id: string) => void;
  onApproveEdit: (id: string) => void;
  onRejectEdit: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<RequestKind>('add');
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [search, setSearch] = useState('');

  const addRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return addRequests.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (!q) return true;
      return (
        r.volunteer.code.toLowerCase().includes(q) ||
        r.volunteer.englishName.toLowerCase().includes(q) ||
        r.event.toLowerCase().includes(q)
      );
    });
  }, [addRequests, status, search]);

  const editRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return editRequests.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (!q) return true;
      return (
        r.volunteer.code.toLowerCase().includes(q) ||
        r.volunteer.englishName.toLowerCase().includes(q) ||
        r.requestedEvent.toLowerCase().includes(q)
      );
    });
  }, [editRequests, status, search]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-ink/5 p-1" role="tablist" aria-label="Request kind">
          {(['add', 'edit'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium',
                kind === k ? 'bg-white text-crimson shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              {k === 'add' ? t('timeRequestsTitle') : t('timeEditRequestsTitle')}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg bg-ink/5 p-1">
          {(['pending', 'all', 'approved', 'rejected'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium',
                status === s ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              {t(s === 'all' ? 'all' : s)}
            </button>
          ))}
        </div>
        <div className="min-w-52 flex-1 sm:max-w-xs">
          <TextField
            label={t('search')}
            name="adminSearch"
            value={search}
            onChange={setSearch}
            placeholder={t('adminSearchPlaceholder')}
          />
        </div>
      </div>

      {kind === 'add' ? (
        <RequestList
          title={t('adminRequestsTitle')}
          subtitle={t('adminRequestsSubtitle')}
          rows={addRows.map((r) => ({
            id: r.id,
            volunteer: r.volunteer,
            date: dateInputValue(r.date),
            primary: r.event,
            minutes: r.minutes,
            status: r.status,
            hint: null,
          }))}
          onApprove={onApproveAdd}
          onReject={onRejectAdd}
          empty={t('adminNoPending')}
        />
      ) : (
        <RequestList
          title={t('adminEditRequestsTitle')}
          subtitle={t('adminEditRequestsSubtitle')}
          rows={editRows.map((r) => ({
            id: r.id,
            volunteer: r.volunteer,
            date: dateInputValue(r.requestedDate),
            primary: r.requestedEvent,
            minutes: r.requestedMinutes,
            status: r.status,
            hint: `${t('reason')}: ${r.reason}`,
          }))}
          onApprove={onApproveEdit}
          onReject={onRejectEdit}
          empty={t('adminNoPending')}
        />
      )}
    </section>
  );
}

interface RequestRow {
  id: string;
  volunteer: { code: string; englishName: string };
  date: string;
  primary: string;
  minutes: number;
  status: 'pending' | 'approved' | 'rejected';
  hint: string | null;
}

function RequestList({
  title,
  subtitle,
  rows,
  onApprove,
  onReject,
  empty,
}: {
  title: string;
  subtitle: string;
  rows: RequestRow[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  empty: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-muted">
          {empty}
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-ink/10">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="font-medium text-ink">
                  {r.volunteer.englishName} <span className="text-muted">({r.volunteer.code})</span>
                </div>
                <div className="text-sm text-muted">
                  {r.primary} · {r.date} · {formatMinutes(r.minutes, t)}
                </div>
                {r.hint ? <div className="mt-0.5 text-xs text-muted">{r.hint}</div> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={r.status} />
                {r.status === 'pending' ? (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => onApprove(r.id)}>
                      {t('adminApprove')}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => onReject(r.id)}>
                      {t('adminReject')}
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  const { t } = useTranslation();
  const tone =
    status === 'approved'
      ? 'bg-emerald-600/10 text-emerald-700'
      : status === 'rejected'
        ? 'bg-crimson/10 text-crimson-dark'
        : 'bg-amber-500/10 text-amber-700';
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{t(status)}</span>;
}

function VolunteersView({ volunteers, onVerify }: { volunteers: AdminVolunteer[]; onVerify: (id: string) => void }) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminVolunteerDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [report, setReport] = useState<ServiceReport | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const openRecords = async (id: string) => {
    setDetailError(null);
    setReportError(null);
    setReport(null);
    if (openId === id) {
      setDetail(null);
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    try {
      setDetail(await api.adminVolunteerRecords(id));
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : t('errorUnexpected'));
    }
  };

  const generateReport = async (id: string) => {
    setReportError(null);
    setReport(null);
    setReportBusy(true);
    try {
      setReport(await api.generateServiceReport(id));
    } catch (err) {
      setReportError(err instanceof ApiError ? err.message : t('errorUnexpected'));
    } finally {
      setReportBusy(false);
    }
  };

  if (volunteers.length === 0) {
    return (
      <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-ink">{t('adminVolunteersTitle')}</h3>
        <p className="mt-1 text-sm text-muted">{t('adminNoVolunteers')}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-ink">{t('adminVolunteersTitle')}</h3>
      <p className="mt-0.5 text-sm text-muted">{t('adminVolunteerCompletion')}</p>
      <ul className="mt-3 divide-y divide-ink/10">
        {volunteers.map((v) => (
          <li key={v.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-ink">
                  {v.englishName} <span className="text-muted">({v.code})</span>
                </div>
                <div className="text-sm text-muted">{v.organization ?? '–'}</div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                  <span className={v.onboardingComplete ? 'text-emerald-700' : 'text-amber-700'}>
                    {t('adminVolunteerCompletion')}: {v.profileCompletion}% ·{' '}
                    {v.onboardingComplete ? t('adminOnboardingComplete') : t('adminOnboardingIncomplete')}
                  </span>
                  {v.identityVerified ? (
                    <span className="text-emerald-700">{t('adminVerified')}</span>
                  ) : (
                    <span className="text-muted">{t('adminUnverified')}</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!v.identityVerified ? (
                  <Button size="sm" onClick={() => onVerify(v.id)}>
                    {t('adminVerifyIdentity')}
                  </Button>
                ) : null}
                <Button variant="secondary" size="sm" onClick={() => void openRecords(v.id)}>
                  {t('adminViewRecords')}
                </Button>
              </div>
            </div>
{openId === v.id ? (
              <div className="mt-3 rounded-xl bg-canvas p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">{t('adminViewRecords')}</span>
                  <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
                    {t('adminClose')}
                  </Button>
                </div>
                {detailError ? <ErrorBanner>{detailError}</ErrorBanner> : null}
                {detail && detail.records.length === 0 ? (
                  <p className="text-sm text-muted">{t('timeNoRecords')}</p>
                ) : null}
                {detail && detail.records.length > 0 ? (
                  <ul className="divide-y divide-ink/10">
                    {detail.records.map((rec) => (
                      <li key={rec.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium text-ink">{rec.event}</span>
                          <span className="ml-2 text-muted">{dateInputValue(rec.date)}</span>
                        </span>
                        <span className={rec.minutes < 0 ? 'font-semibold text-crimson-dark' : 'font-semibold text-ink'}>
                          {formatMinutes(rec.minutes, t)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-4 border-t border-ink/10 pt-4">
                  {reportError ? (
                    <div className="mb-2">
                      <ErrorBanner>{reportError}</ErrorBanner>
                    </div>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    busy={reportBusy}
                    disabled={report !== null}
                    onClick={() => void generateReport(v.id)}
                  >
                    {t('reportGenerate')}
                  </Button>
                  {report ? <ReportCard report={report} /> : null}
                  <ServiceReportsPanel volunteerId={v.id} />
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AdjustmentsView({ volunteers, onApplied }: { volunteers: AdminVolunteer[]; onApplied: () => Promise<void> }) {
  const { t } = useTranslation();
  const [volunteerId, setVolunteerId] = useState('');
  const [date, setDate] = useState(todayInputValue());
  const [event, setEvent] = useState('');
  const [minutes, setMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const minutesValue = Number(minutes);
    if (!volunteerId || !event.trim() || !reason.trim() || !Number.isInteger(minutesValue) || minutesValue === 0) {
      setError(t('errorValidation'));
      return;
    }
    setBusy(true);
    try {
      await api.createTimeAdjustment({ volunteerId, date, event: event.trim(), minutes: minutesValue, reason: reason.trim() });
      setNotice(t('adminAdjustDone'));
      setEvent('');
      setMinutes('');
      setReason('');
      await onApplied();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errorUnexpected'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-ink">{t('adminAdjustTitle')}</h3>
      <p className="mt-0.5 text-sm text-muted">{t('adminAdjustSubtitle')}</p>
      {notice ? <div className="mt-4"><ErrorBanner tone="notice">{notice}</ErrorBanner></div> : null}
      <form onSubmit={onSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SelectField
            label={t('adminAdjustVolunteer')}
            name="adjustVolunteer"
            value={volunteerId}
            onChange={setVolunteerId}
            placeholder={t('adminAdjustSelectVolunteer')}
            required
            options={volunteers.map((v) => ({ value: v.id, label: `${v.englishName} (${v.code})` }))}
          />
        </div>
        <TextField label={t('adminAdjustDate')} name="adjustDate" type="date" value={date} onChange={setDate} required />
        <TextField label={t('adminAdjustMinutes')} name="adjustMinutes" type="number" value={minutes} onChange={setMinutes} required />
        <div className="sm:col-span-2">
          <TextField label={t('adminAdjustEvent')} name="adjustEvent" value={event} onChange={setEvent} required />
        </div>
        <div className="sm:col-span-2">
          <TextField label={t('adminAdjustReason')} name="adjustReason" value={reason} onChange={setReason} required />
        </div>
        <p className="text-xs text-muted sm:col-span-2">{t('adminAdjustSignedHint')}</p>
        {error ? <div className="sm:col-span-2"><ErrorBanner>{error}</ErrorBanner></div> : null}
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" busy={busy}>
            {t('adminAdjustSubmit')}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ReportCard({ report }: { report: ServiceReport }) {
  const { t } = useTranslation();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = verifyUrl(report.verification.ref);

  useEffect(() => {
    let alive = true;
    setQr(null);
    QRCode.toDataURL(url, { width: 180, margin: 1 })
      .then((dataUrl) => {
        if (alive) setQr(dataUrl);
      })
      .catch(() => {
        if (alive) setQr(null);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const rec = report.report;
  return (
    <section className="mt-4 rounded-xl border border-ink/10 bg-canvas p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-ink">{t('reportTitle')}</h4>
        <span className="text-xs text-muted">{t('reportGeneratedAt')}: {new Date(rec.generatedAt).toLocaleString()}</span>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">{t('volunteer')}</dt>
          <dd className="text-ink">
            {rec.volunteer.englishName}
            {rec.volunteer.arabicName ? <span className="ml-2 text-muted">{rec.volunteer.arabicName}</span> : null}
            <span className="ml-2 text-muted">({rec.volunteer.code})</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">{t('reportBranch')}</dt>
          <dd className="text-ink">
            {rec.branch.nameEn}
            {rec.branch.nameAr ? <span className="ml-2 text-muted">{rec.branch.nameAr}</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">{t('reportTotal')}</dt>
          <dd className="font-semibold text-ink">{formatMinutes(rec.totalMinutes, t)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">{t('reportRecordsCount')}</dt>
          <dd className="text-ink">{rec.recordCount}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {qr ? (
          <img
            src={qr}
            width={112}
            height={112}
            alt={t('reportQrLabel')}
            className="rounded-lg border border-ink/10 bg-white"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted">{t('reportRefLabel')}</div>
          <div dir="ltr" className="mt-0.5 break-all font-mono text-xs text-ink">{report.verification.ref}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void copyLink()}>
              {t('reportCopyLink')}
            </Button>
            <a
              href={`/verify/${report.verification.ref}`}
              className="text-sm font-medium text-crimson hover:text-crimson-dark"
            >
              {t('reportOpenVerify')}
            </a>
            {copied ? <span className="text-xs text-emerald-700">{t('reportLinkCopied')}</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}