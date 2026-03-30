import { useState, useEffect, useCallback, Component, type ErrorInfo, type ReactNode } from 'react';
import {
  LayoutDashboard,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  History,
  Users,
  Network,
  BookOpen,
  GitBranch,
  ListOrdered,
  Settings as SettingsIcon,
  LogOut,
  Phone,
  Menu,
  X,
} from 'lucide-react';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import { useAsterisk } from '@/hooks/useAsterisk';
import { useSoftphone } from '@/hooks/useSoftphone';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import Login from '@/components/Login';
import Dashboard from '@/components/Dashboard';
import ActiveCalls from '@/components/ActiveCalls';
import CallHistory from '@/components/CallHistory';
import Extensions from '@/components/Extensions';
import TrunkManager from '@/components/TrunkManager';
import Phonebook from '@/components/Phonebook';
import IVRBuilder from '@/components/IVRBuilder';
import InboundRoutes from '@/components/InboundRoutes';
import OutboundRoutes from '@/components/OutboundRoutes';
import SettingsPage from '@/components/Settings';
import Softphone from '@/components/Softphone';

// ── Types ─────────────────────────────────────────────────────────────

type Page =
  | 'dashboard'
  | 'active-calls'
  | 'history'
  | 'extensions'
  | 'trunks'
  | 'phonebook'
  | 'ivr'
  | 'inbound'
  | 'outbound'
  | 'queues'
  | 'settings';

interface NavItem {
  id: Page;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

// ── Nav config ────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'active-calls', label: 'Chiamate Attive', icon: PhoneCall },
  { id: 'history', label: 'Storico', icon: History },
  { id: 'extensions', label: 'Interni', icon: Users },
  { id: 'trunks', label: 'Trunk', icon: Network },
  { id: 'inbound', label: 'In Entrata', icon: PhoneIncoming },
  { id: 'outbound', label: 'In Uscita', icon: PhoneOutgoing },
  { id: 'phonebook', label: 'Rubrica', icon: BookOpen },
  { id: 'ivr', label: 'IVR', icon: GitBranch },
  { id: 'queues', label: 'Code', icon: ListOrdered },
  { id: 'settings', label: 'Impostazioni', icon: SettingsIcon },
];

const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'Dashboard',
  'active-calls': 'Chiamate Attive',
  history: 'Storico Chiamate',
  extensions: 'Interni',
  trunks: 'Trunk',
  inbound: 'Instradamento in Entrata',
  outbound: 'Instradamento in Uscita',
  phonebook: 'Rubrica',
  ivr: 'IVR Builder',
  queues: 'Code',
  settings: 'Impostazioni',
};

// ── Softphone config from localStorage ────────────────────────────────

function loadSoftphoneConfig(): { extension: string; sipPassword: string; wsUrl: string } {
  try {
    const raw = localStorage.getItem('asterisk_panel_softphone');
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { extension: '101', sipPassword: 'Maddy210521', wsUrl: '' };
}

// ── Error Boundary ────────────────────────────────────────────────────

class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-100">
            <div className="text-center space-y-4 p-8">
              <p className="text-red-400 text-lg font-semibold">Errore nell&apos;applicazione</p>
              <p className="text-zinc-400 text-sm max-w-md">{this.state.error?.message}</p>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="px-4 py-2 bg-violet-600 rounded-lg text-sm hover:bg-violet-500"
              >
                Ricarica
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

// ── Authenticated Shell ───────────────────────────────────────────────

function AuthenticatedShell({ onLogout }: { onLogout: () => void }) {
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sipConfig, setSipConfig] = useState<{ wsUrl: string; domain: string } | null>(null);

  // On mobile, default to showing softphone (dialer)
  const [mobileShowDialer, setMobileShowDialer] = useState(true);
  // On desktop, softphone is a floating panel
  const [showSoftphone, setShowSoftphone] = useState(false);

  // Detect mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ── Fetch SIP config on mount ──────────────────────────────────────
  useEffect(() => {
    fetch('/api/asterisk/sip-config')
      .then((r) => r.json())
      .then((data) => {
        console.log('[App] SIP config loaded:', data);
        setSipConfig(data);
      })
      .catch((err) => {
        console.error('[App] Failed to load SIP config:', err);
      });
  }, []);

  // ── Hooks ───────────────────────────────────────────────────────────
  const asterisk = useAsterisk();
  const { isConnected, asteriskStatus } = asterisk;

  const spConfig = loadSoftphoneConfig();
  const wsUrl = spConfig.wsUrl || sipConfig?.wsUrl || '';
  const sipDomain = sipConfig?.domain || 'ast.all-cloud-x.com';
  const softphone = useSoftphone(spConfig.extension, spConfig.sipPassword, wsUrl, sipDomain);

  // Auto-show softphone on incoming call
  useEffect(() => {
    if (softphone.callDirection === 'in' && !softphone.inCall) {
      setShowSoftphone(true);
    }
  }, [softphone.callDirection, softphone.inCall]);

  // ── Close mobile menu on page change ────────────────────────────────
  const handlePageChange = useCallback((page: Page) => {
    setCurrentPage(page);
    setMobileMenuOpen(false);
    if (isMobile) setMobileShowDialer(false);
  }, [isMobile]);

  // ── Trunk status summary (safe) ─────────────────────────────────────
  const trunks = asterisk.trunks || [];
  const trunkStatuses = asterisk.trunkStatuses || new Map();
  const extensionStatuses = asterisk.extensionStatuses || new Map();

  const registeredTrunks = trunks.filter((t) => {
    const s = trunkStatuses.get(t.name);
    const sStatus = (s?.status || '').toLowerCase();
    const tStatus = (t.status || '').toLowerCase();
    return sStatus === 'registered' || tStatus === 'registered';
  }).length;
  const totalTrunks = trunks.length;

  // ── Extension statuses as record for Extensions component ───────────
  const extStatusRecord: Record<string, api.ExtensionStatus> = {};
  extensionStatuses.forEach((status: api.ExtensionStatus, key: string) => {
    extStatusRecord[key] = status;
  });

  // ── Trunk status record for Dashboard ───────────────────────────────
  const trunkStatusRecord: Record<string, string> = {};
  trunkStatuses.forEach((status: { status: string }, key: string) => {
    trunkStatusRecord[key] = status.status;
  });

  // ── Render current page ─────────────────────────────────────────────
  function renderPage() {
    switch (currentPage) {
      case 'dashboard':
        return (
          <Dashboard
            activeCalls={asterisk.activeCalls.map((c) => ({
              channel: c.channel,
              callerIdNum: c.callerIdNum,
              state: c.state,
              duration: c.duration,
            }))}
            callStats={{
              totalToday: asterisk.callStats?.totalCalls ?? 0,
              answered: asterisk.callStats?.answeredCalls ?? 0,
              missed: asterisk.callStats?.missedCalls ?? 0,
              avgDuration: asterisk.callStats?.averageDuration ?? 0,
              byHour: (asterisk.callStats?.callsByHour ?? []).map((h) => ({
                hour: h.hour,
                count: h.count,
                answered: h.count,
                missed: 0,
              })),
            }}
            trunkStatuses={trunkStatusRecord}
            trunks={asterisk.trunks.map((t) => ({
              name: t.name,
              status: asterisk.trunkStatuses.get(t.name)?.status || t.status || 'unknown',
            }))}
          />
        );

      case 'active-calls':
        return (
          <ActiveCalls
            activeCalls={asterisk.activeCalls.map((c) => ({
              channel: c.channel,
              callerIdNum: c.callerIdNum,
              callerIdName: c.callerIdName,
              connectedLineNum: c.connectedLineNum,
              connectedLineName: c.connectedLineName,
              state: c.state,
              duration: c.duration,
              uniqueId: c.uniqueId,
              bridgeId: c.bridgeId,
            }))}
            onHangup={asterisk.hangup}
            onHold={asterisk.hold}
            onUnhold={asterisk.unhold}
            onTransfer={(channel, target, mode) => {
              if (mode === 'blind') {
                asterisk.transfer(channel, target);
              } else {
                asterisk.attendedXfer(channel, target);
              }
            }}
            onPark={(channel) => {
              asterisk.park(channel);
            }}
            onSendDtmf={asterisk.dtmf}
          />
        );

      case 'history':
        return (
          <CallHistory
            trunks={asterisk.trunks.map((t) => ({ name: t.name }))}
          />
        );

      case 'extensions':
        return <Extensions extensionStatuses={extStatusRecord} />;

      case 'trunks':
        return <TrunkManager />;

      case 'inbound':
        return <InboundRoutes />;

      case 'outbound':
        return <OutboundRoutes />;

      case 'phonebook':
        return (
          <Phonebook
            onClickToCall={(number: string) => {
              if (spConfig.extension) {
                asterisk.originate(spConfig.extension, number);
              }
            }}
          />
        );

      case 'ivr':
        return <IVRBuilder />;

      case 'queues':
        return (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <ListOrdered className="mx-auto h-12 w-12 text-zinc-700" />
              <p className="mt-3 text-sm text-zinc-500">
                Gestione code in fase di sviluppo
              </p>
            </div>
          </div>
        );

      case 'settings':
        return (
          <SettingsPage
            isConnected={isConnected}
            asteriskStatus={asteriskStatus}
          />
        );

      default:
        return null;
    }
  }

  // Softphone props (shared between mobile and desktop)
  const softphoneProps = {
    registered: softphone.registered,
    inCall: softphone.inCall,
    callDirection: softphone.callDirection,
    remoteNumber: softphone.remoteNumber,
    callDuration: softphone.callDuration,
    isMuted: softphone.isMuted,
    isOnHold: softphone.isOnHold,
    isRinging: softphone.callDirection === 'in' && !softphone.inCall,
    onCall: (number: string, trunk?: string) => softphone.call(number, trunk),
    onAnswer: softphone.answer,
    onHangup: softphone.hangup,
    onToggleMute: softphone.toggleMute,
    onToggleHold: softphone.toggleHold,
    onSendDtmf: softphone.sendDtmf,
    onBlindTransfer: softphone.blindTransfer,
    onAttendedTransfer: softphone.attendedTransfer,
    trunks: asterisk.trunks.map((t) => ({ name: t.name })),
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* ── Mobile overlay ────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-zinc-800 bg-zinc-900 transition-all duration-200
          lg:static lg:translate-x-0
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${sidebarCollapsed ? 'w-[4.5rem]' : 'w-64'}
        `}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-3 border-b border-zinc-800 px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/20">
            <Phone className="h-5 w-5 text-violet-400" />
          </div>
          {!sidebarCollapsed && (
            <span className="text-lg font-bold text-zinc-100 truncate">
              AsteriskPanel
            </span>
          )}
          <button
            type="button"
            className="ml-auto lg:hidden text-zinc-400 hover:text-zinc-200"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile: Softphone nav item */}
        <div className="lg:hidden px-3 pt-3">
          <button
            type="button"
            onClick={() => { setMobileShowDialer(true); setMobileMenuOpen(false); }}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              mobileShowDialer
                ? 'bg-green-600/20 text-green-300 border border-green-500/30'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <Phone className="h-5 w-5 shrink-0" />
            <span>Telefono</span>
            {softphone.registered && (
              <span className="ml-auto h-2 w-2 rounded-full bg-green-500" />
            )}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id && !mobileShowDialer;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handlePageChange(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                } ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom: collapse toggle + logout */}
        <div className="border-t border-zinc-800 px-3 py-3 space-y-1">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="hidden lg:flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
            title={sidebarCollapsed ? 'Espandi' : 'Comprimi'}
          >
            <Menu className="h-5 w-5 shrink-0" />
            {!sidebarCollapsed && <span>Comprimi</span>}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-red-900/30 hover:text-red-400 transition-colors ${
              sidebarCollapsed ? 'justify-center' : ''
            }`}
            title="Logout"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!sidebarCollapsed && <span>Esci</span>}
          </button>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* ── Mobile header (compact) ──────────────────────────────── */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 lg:px-6">
          {/* Left: hamburger menu */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="lg:hidden text-zinc-400 hover:text-zinc-200"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            {/* Title: show page name or "Telefono" on mobile dialer */}
            <h1 className="text-base lg:text-lg font-semibold text-zinc-100">
              {isMobile && mobileShowDialer ? '' : PAGE_TITLES[currentPage]}
            </h1>
          </div>

          {/* Right: status indicators */}
          <div className="flex items-center gap-2 lg:gap-4">
            {/* Connection dot */}
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isConnected && asteriskStatus === 'connected'
                  ? 'bg-green-500'
                  : 'bg-red-500'
              }`}
            />
            <span className="hidden lg:inline text-xs text-zinc-400">
              {isConnected && asteriskStatus === 'connected' ? 'Connesso' : 'Disconnesso'}
            </span>

            {/* Trunk summary - desktop only */}
            {totalTrunks > 0 && (
              <Badge
                variant="outline"
                className={`hidden lg:inline-flex border-zinc-700 text-xs ${
                  registeredTrunks === totalTrunks
                    ? 'text-green-400 border-green-800'
                    : registeredTrunks > 0
                    ? 'text-yellow-400 border-yellow-800'
                    : 'text-red-400 border-red-800'
                }`}
              >
                <Network className="mr-1 h-3 w-3" />
                {registeredTrunks}/{totalTrunks} trunk
              </Badge>
            )}

            {/* Desktop: softphone toggle */}
            <Button
              size="sm"
              variant="outline"
              className={`hidden lg:flex h-8 relative border-zinc-700 ${
                softphone.inCall
                  ? 'border-blue-700 text-blue-400'
                  : softphone.registered
                  ? 'border-green-800 text-green-400'
                  : 'text-zinc-500'
              }`}
              onClick={() => setShowSoftphone(!showSoftphone)}
            >
              <Phone className="h-4 w-4 mr-1" />
              {softphone.inCall ? (
                <span className="text-xs tabular-nums">
                  {String(Math.floor(softphone.callDuration / 60)).padStart(2, '0')}:
                  {String(softphone.callDuration % 60).padStart(2, '0')}
                </span>
              ) : (
                <span className="text-xs">Telefono</span>
              )}
              {softphone.registered && !softphone.inCall && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500" />
              )}
            </Button>

            {/* Mobile: softphone button (go back to dialer) */}
            <button
              type="button"
              className={`lg:hidden p-2 rounded-lg ${
                mobileShowDialer
                  ? 'bg-green-600/20 text-green-400'
                  : softphone.inCall
                  ? 'bg-blue-600/20 text-blue-400'
                  : softphone.registered
                  ? 'text-green-400'
                  : 'text-zinc-500'
              }`}
              onClick={() => setMobileShowDialer(true)}
            >
              <Phone className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* ── Content area ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative">
          {/* Mobile: full-screen softphone when dialer is active */}
          {isMobile && mobileShowDialer ? (
            <div className="h-full flex items-center justify-center p-4">
              <Softphone {...softphoneProps} />
            </div>
          ) : (
            <>
              <main className="h-full overflow-y-auto p-4 lg:p-6">
                {renderPage()}
              </main>

              {/* Desktop: floating softphone panel */}
              {!isMobile && showSoftphone && (
                <div className="absolute top-2 right-2 z-50 shadow-2xl">
                  <Softphone {...softphoneProps} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Toaster />
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Check existing token on mount
  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      setAuthChecked(true);
      return;
    }

    api.getMe()
      .then(() => {
        setAuthenticated(true);
      })
      .catch(() => {
        api.clearToken();
        setAuthenticated(false);
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, []);

  const handleLogin = useCallback((user: api.UserInfo) => {
    setAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    api.clearToken();
    setAuthenticated(false);
  }, []);

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600/20">
            <Phone className="h-6 w-6 text-violet-400 animate-pulse" />
          </div>
          <p className="text-sm text-zinc-500">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <>
        <Login onLogin={handleLogin} />
        <Toaster />
      </>
    );
  }

  return (
    <ErrorBoundary>
      <AuthenticatedShell onLogout={handleLogout} />
    </ErrorBoundary>
  );
}

export default App;
