import React from 'react';
import {
  Phone,
  BarChart3,
  Clock,
  PhoneMissed,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────

interface ActiveCallEntry {
  channel: string;
  callerIdNum: string;
  state: string;
  duration: number;
  trunk?: string;
}

interface CallStatsData {
  totalToday: number;
  answered: number;
  missed: number;
  avgDuration: number;
  byHour: Array<{ hour: number; count: number; answered: number; missed: number }>;
}

interface TrunkInfo {
  name: string;
  provider?: string;
  status: string;
}

interface DashboardProps {
  activeCalls: ActiveCallEntry[];
  callStats: CallStatsData;
  trunkStatuses: Record<string, string>;
  trunks: TrunkInfo[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatAvgDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function stateColor(state: string): string {
  const s = state.toLowerCase();
  if (s === 'up' || s === 'answered') return 'text-green-400';
  if (s === 'ring' || s === 'ringing') return 'text-yellow-400';
  if (s === 'busy') return 'text-red-400';
  return 'text-zinc-400';
}

function trunkStatusDot(status: string): string {
  const s = status.toLowerCase();
  if (s === 'registered' || s === 'online') return 'bg-green-500';
  if (s === 'lagged') return 'bg-yellow-500';
  return 'bg-red-500';
}

// ── Stat card ─────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg: string;
  subtitle?: string;
}

function StatCard({ title, value, icon, iconBg, subtitle }: StatCardProps) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-400">{title}</p>
            <p className="mt-1 text-3xl font-bold text-zinc-50">{value}</p>
            {subtitle && (
              <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
            )}
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${iconBg}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Chart tooltip ─────────────────────────────────────────────────────

interface ChartTooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayloadEntry[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 shadow-xl">
      <p className="mb-1 text-sm font-medium text-zinc-300">{label}:00</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

// ── Dashboard component ───────────────────────────────────────────────

export default function Dashboard({
  activeCalls,
  callStats,
  trunkStatuses,
  trunks,
}: DashboardProps) {
  const chartData = callStats.byHour.map((h) => ({
    hour: String(h.hour).padStart(2, '0'),
    Risposte: h.answered,
    Perse: h.missed,
  }));

  return (
    <div className="space-y-6">
      {/* ── Stat cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Chiamate Attive"
          value={activeCalls.length}
          icon={<Phone className="h-6 w-6 text-blue-400" />}
          iconBg="bg-blue-500/20"
        />
        <StatCard
          title="Totale Oggi"
          value={callStats.totalToday}
          subtitle={`${callStats.answered} risposte`}
          icon={<BarChart3 className="h-6 w-6 text-emerald-400" />}
          iconBg="bg-emerald-500/20"
        />
        <StatCard
          title="Durata Media"
          value={formatAvgDuration(callStats.avgDuration)}
          icon={<Clock className="h-6 w-6 text-amber-400" />}
          iconBg="bg-amber-500/20"
        />
        <StatCard
          title="Perse"
          value={callStats.missed}
          subtitle={
            callStats.totalToday > 0
              ? `${Math.round((callStats.missed / callStats.totalToday) * 100)}%`
              : '0%'
          }
          icon={<PhoneMissed className="h-6 w-6 text-red-400" />}
          iconBg="bg-red-500/20"
        />
      </div>

      {/* ── Chart ──────────────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-zinc-200">
            Chiamate ultime 24 ore
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAnswered" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorMissed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="hour"
                stroke="#71717a"
                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#71717a"
                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: 12 }}
                iconType="circle"
                formatter={(value: string) => (
                  <span className="text-sm text-zinc-400">{value}</span>
                )}
              />
              <Area
                type="monotone"
                dataKey="Risposte"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorAnswered)"
              />
              <Area
                type="monotone"
                dataKey="Perse"
                stroke="#ef4444"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorMissed)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Bottom row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Active channels */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-zinc-200">
                Canali Attivi
              </CardTitle>
              <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                <Activity className="mr-1 h-3 w-3" />
                Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {activeCalls.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">
                Nessuna chiamata attiva
              </p>
            ) : (
              <div className="space-y-2">
                {activeCalls.map((call) => (
                  <div
                    key={call.channel}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-200">
                        {call.callerIdNum || call.channel}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {call.channel}
                      </p>
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      <span className={`text-xs font-medium ${stateColor(call.state)}`}>
                        {call.state}
                      </span>
                      <span className="text-xs tabular-nums text-zinc-400">
                        {formatDuration(call.duration)}
                      </span>
                      {call.trunk && (
                        <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 text-xs">
                          {call.trunk}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trunk statuses */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-zinc-200">
              Stato Trunk
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trunks.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">
                Nessun trunk configurato
              </p>
            ) : (
              <div className="space-y-2">
                {trunks.map((trunk) => {
                  const status = trunkStatuses[trunk.name] || trunk.status || 'unknown';
                  return (
                    <div
                      key={trunk.name}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${trunkStatusDot(status)}`}
                        />
                        <div>
                          <p className="text-sm font-medium text-zinc-200">
                            {trunk.name}
                          </p>
                          {trunk.provider && (
                            <p className="text-xs text-zinc-500">
                              {trunk.provider}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          status === 'registered' || status === 'online'
                            ? 'border-green-800 text-green-400'
                            : status === 'lagged'
                            ? 'border-yellow-800 text-yellow-400'
                            : 'border-red-800 text-red-400'
                        }
                      >
                        {status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
