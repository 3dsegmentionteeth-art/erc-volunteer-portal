import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/Button';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { cn } from '../lib/cn';
import { AdminTimeManagement } from './AdminTimeManagement';
import { VolunteerActivity } from './VolunteerActivity';
import { VolunteerDashboard } from './VolunteerDashboard';
import { VolunteerProfile } from './VolunteerProfile';

const VOLUNTEER_TABS = ['time', 'profile', 'activity'] as const;
type VolunteerTab = (typeof VOLUNTEER_TABS)[number];

/**
 * Authenticated shell. Volunteers switch between the Phase 4 time dashboard and
 * the Phase 5 profile editor; admins land straight in the time-management
 * module (overview / requests / volunteers / adjustments).
 */
export function DashboardShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [volunteerTab, setVolunteerTab] = useState<VolunteerTab>('time');

  const onLogout = async () => {
    setLoggingOut(true);
    await logout();
    navigate('/login', { replace: true });
  };

  if (!user) return null;

  const displayName = user.displayName ?? t(user.role === 'admin' ? 'role_admin' : 'role_volunteer');
  const volunteerTabs: { key: VolunteerTab; label: string }[] = [
    { key: 'time', label: t('navTime') },
    { key: 'profile', label: t('navProfile') },
    { key: 'activity', label: t('navActivity') },
  ];

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-10 border-b border-ink/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <BrandMark className="size-9" />
            <div className="leading-tight">
              <div className="font-semibold text-ink">ERC</div>
              <div className="text-xs text-muted">{t('portal')}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-crimson/10 px-3 py-1 text-xs font-medium text-crimson sm:inline-block">
              {t(user.role === 'admin' ? 'role_admin' : 'role_volunteer')}
            </span>
            <LanguageSwitch />
            <Button variant="ghost" size="sm" busy={loggingOut} onClick={onLogout}>
              {t('logout')}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <section>
          <h1 className="text-2xl font-bold text-ink">
            {t('shellWelcome')}, {displayName}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {user.isHq ? t('shellScopeHq') : t('shellScopeBranch')}
            {!user.isHq && user.branchId ? <span className="text-muted/70"> · #{user.branchId}</span> : null}
          </p>
          <p className="mt-3 inline-block rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink">
            {t('shellMadeOfficialNotice')}
          </p>
        </section>

        {user.role === 'volunteer' ? (
          <>
            <nav className="flex gap-1 rounded-xl border border-ink/10 bg-white p-1 shadow-sm" aria-label="Volunteer sections">
              {volunteerTabs.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setVolunteerTab(key)}
                  aria-pressed={volunteerTab === key}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    volunteerTab === key ? 'bg-crimson text-white shadow-sm' : 'text-muted hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </nav>
            {volunteerTab === 'time' ? <VolunteerDashboard /> : null}
            {volunteerTab === 'profile' ? <VolunteerProfile /> : null}
            {volunteerTab === 'activity' ? <VolunteerActivity /> : null}
          </>
        ) : (
          <AdminTimeManagement />
        )}
      </main>
    </div>
  );
}