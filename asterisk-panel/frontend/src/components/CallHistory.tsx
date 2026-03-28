import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RotateCcw,
  Download,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getCallHistory,
  exportCallsCSV,
  type CallHistoryEntry,
  type CallHistoryFilters,
} from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────

interface TrunkOption {
  name: string;
  label?: string;
}

interface CallHistoryProps {
  trunks?: TrunkOption[];
  onPlayRecording?: (filename: string) => void;
}

interface Filters {
  startDate: string;
  endDate: string;
  from: string;
  to: string;
  trunk: string;
  disposition: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0s';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }
  if (m > 0) {
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
  return `${s}s`;
}

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function dispositionBadge(disposition: string) {
  const d = disposition.toUpperCase();
  if (d === 'ANSWERED') {
    return (
      <Badge className="bg-green-900/50 text-green-400 border-green-800">
        Risposta
      </Badge>
    );
  }
  if (d === 'NO ANSWER') {
    return (
      <Badge className="bg-yellow-900/50 text-yellow-400 border-yellow-800">
        Nessuna Risposta
      </Badge>
    );
  }
  if (d === 'BUSY') {
    return (
      <Badge className="bg-orange-900/50 text-orange-400 border-orange-800">
        Occupato
      </Badge>
    );
  }
  if (d === 'FAILED') {
    return (
      <Badge className="bg-red-900/50 text-red-400 border-red-800">
        Fallita
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-zinc-700 text-zinc-400">
      {disposition}
    </Badge>
  );
}

function todayString(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// ── Component ─────────────────────────────────────────────────────────

export default function CallHistory({ trunks = [], onPlayRecording }: CallHistoryProps) {
  const [filters, setFilters] = useState<Filters>({
    startDate: todayString(),
    endDate: todayString(),
    from: '',
    to: '',
    trunk: '',
    disposition: '',
  });

  const [calls, setCalls] = useState<CallHistoryEntry[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const buildApiFilters = useCallback(
    (pageNum: number, pageLimit: number): CallHistoryFilters => {
      const apiFilters: CallHistoryFilters = {
        page: pageNum,
        limit: pageLimit,
      };
      if (filters.startDate) apiFilters.startDate = filters.startDate;
      if (filters.endDate) apiFilters.endDate = filters.endDate;
      if (filters.from.trim()) apiFilters.from = filters.from.trim();
      if (filters.to.trim()) apiFilters.to = filters.to.trim();
      if (filters.disposition) apiFilters.disposition = filters.disposition;
      if (filters.trunk) apiFilters.search = filters.trunk;
      return apiFilters;
    },
    [filters],
  );

  const fetchCalls = useCallback(
    async (pageNum: number, pageLimit: number) => {
      setLoading(true);
      try {
        const apiFilters = buildApiFilters(pageNum, pageLimit);
        const result = await getCallHistory(apiFilters);
        setCalls(result.calls);
        setTotal(result.total);
        setTotalPages(result.pages);
        setPage(result.page);
      } catch (err) {
        console.error('Error fetching call history:', err);
      } finally {
        setLoading(false);
      }
    },
    [buildApiFilters],
  );

  useEffect(() => {
    fetchCalls(1, limit);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback(() => {
    setPage(1);
    fetchCalls(1, limit);
  }, [fetchCalls, limit]);

  const handleReset = useCallback(() => {
    const resetFilters: Filters = {
      startDate: todayString(),
      endDate: todayString(),
      from: '',
      to: '',
      trunk: '',
      disposition: '',
    };
    setFilters(resetFilters);
    setPage(1);
    // Fetch with reset filters on next tick
    setTimeout(() => fetchCalls(1, limit), 0);
  }, [fetchCalls, limit]);

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage < 1 || newPage > totalPages) return;
      fetchCalls(newPage, limit);
    },
    [fetchCalls, limit, totalPages],
  );

  const handleLimitChange = useCallback(
    (newLimit: string) => {
      const l = parseInt(newLimit, 10);
      setLimit(l);
      setPage(1);
      fetchCalls(1, l);
    },
    [fetchCalls],
  );

  const handleExportCSV = useCallback(async () => {
    setExporting(true);
    try {
      const apiFilters = buildApiFilters(1, total || 10000);
      const blob = await exportCallsCSV(apiFilters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chiamate_${filters.startDate}_${filters.endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting CSV:', err);
    } finally {
      setExporting(false);
    }
  }, [buildApiFilters, filters.startDate, filters.endDate, total]);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div className="space-y-4">
      {/* ── Filter Bar ───────────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {/* Date from */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Data da
              </label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => updateFilter('startDate', e.target.value)}
                className="h-9 bg-zinc-950 border-zinc-700 text-zinc-200 text-sm"
              />
            </div>

            {/* Date to */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Data a
              </label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => updateFilter('endDate', e.target.value)}
                className="h-9 bg-zinc-950 border-zinc-700 text-zinc-200 text-sm"
              />
            </div>

            {/* Caller number */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Da (numero)
              </label>
              <Input
                type="text"
                placeholder="Chiamante..."
                value={filters.from}
                onChange={(e) => updateFilter('from', e.target.value)}
                className="h-9 bg-zinc-950 border-zinc-700 text-zinc-200 text-sm placeholder:text-zinc-600"
              />
            </div>

            {/* Called number */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                A (numero)
              </label>
              <Input
                type="text"
                placeholder="Chiamato..."
                value={filters.to}
                onChange={(e) => updateFilter('to', e.target.value)}
                className="h-9 bg-zinc-950 border-zinc-700 text-zinc-200 text-sm placeholder:text-zinc-600"
              />
            </div>

            {/* Trunk */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Trunk
              </label>
              <Select
                value={filters.trunk}
                onValueChange={(v) => updateFilter('trunk', v === 'all' ? '' : v)}
              >
                <SelectTrigger className="h-9 bg-zinc-950 border-zinc-700 text-zinc-200 text-sm">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="all">Tutti</SelectItem>
                  {trunks.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.label || t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Disposition */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Esito
              </label>
              <Select
                value={filters.disposition}
                onValueChange={(v) => updateFilter('disposition', v === 'all' ? '' : v)}
              >
                <SelectTrigger className="h-9 bg-zinc-950 border-zinc-700 text-zinc-200 text-sm">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="ANSWERED">Risposta</SelectItem>
                  <SelectItem value="NO ANSWER">Nessuna Risposta</SelectItem>
                  <SelectItem value="BUSY">Occupato</SelectItem>
                  <SelectItem value="FAILED">Fallita</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-3 flex items-center gap-2">
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleSearch}
              disabled={loading}
            >
              <Search className="mr-1.5 h-4 w-4" />
              Cerca
            </Button>
            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              onClick={handleReset}
              disabled={loading}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reset
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              onClick={handleExportCSV}
              disabled={exporting || total === 0}
            >
              <Download className="mr-1.5 h-4 w-4" />
              {exporting ? 'Esportazione...' : 'Esporta CSV'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Results Table ────────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-zinc-200">
              Storico Chiamate
            </CardTitle>
            {total > 0 && (
              <span className="text-xs text-zinc-500">
                {startItem}-{endItem} di {total} risultati
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
            </div>
          ) : calls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <History className="mb-3 h-12 w-12 text-zinc-700" />
              <p className="text-sm font-medium text-zinc-500">
                Nessuna chiamata trovata
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                Prova a modificare i filtri di ricerca
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Data/Ora</TableHead>
                    <TableHead className="text-zinc-400">Da</TableHead>
                    <TableHead className="text-zinc-400">A</TableHead>
                    <TableHead className="text-zinc-400">Durata</TableHead>
                    <TableHead className="text-zinc-400">Trunk</TableHead>
                    <TableHead className="text-zinc-400">Esito</TableHead>
                    <TableHead className="text-right text-zinc-400">Reg.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calls.map((call) => (
                    <TableRow
                      key={call.uniqueid || call.id}
                      className="border-zinc-800 hover:bg-zinc-800/50"
                    >
                      <TableCell className="text-xs text-zinc-300 whitespace-nowrap">
                        {formatDateTime(call.calldate)}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-200">
                        {call.src || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-200">
                        {call.dst || '-'}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm text-zinc-300">
                        {formatDuration(call.billsec || call.duration)}
                      </TableCell>
                      <TableCell>
                        {call.dstchannel ? (
                          <span className="text-xs text-zinc-400">
                            {call.dstchannel.split('/')[0]?.replace('SIP', '').replace('PJSIP', '').replace('-', '') || call.dstchannel}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-600">-</span>
                        )}
                      </TableCell>
                      <TableCell>{dispositionBadge(call.disposition)}</TableCell>
                      <TableCell className="text-right">
                        {call.recordingfile ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-blue-400 hover:bg-blue-900/30 hover:text-blue-300"
                            onClick={() => onPlayRecording?.(call.recordingfile!)}
                            title="Riproduci registrazione"
                          >
                            <PlayCircle className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-zinc-700">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* ── Pagination ──────────────────────────────────────── */}
              <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
                {/* Items per page */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">Righe per pagina:</span>
                  <Select value={String(limit)} onValueChange={handleLimitChange}>
                    <SelectTrigger className="h-8 w-20 bg-zinc-950 border-zinc-700 text-zinc-300 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Page info and navigation */}
                <div className="flex items-center gap-1">
                  <span className="mr-2 text-xs text-zinc-500">
                    Pagina {page} di {totalPages || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    onClick={() => handlePageChange(1)}
                    disabled={page <= 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  {/* Page number buttons */}
                  {generatePageNumbers(page, totalPages).map((p, idx) =>
                    p === '...' ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-1 text-xs text-zinc-600"
                      >
                        ...
                      </span>
                    ) : (
                      <Button
                        key={p}
                        variant="outline"
                        size="sm"
                        className={`h-8 w-8 p-0 border-zinc-700 text-xs ${
                          p === page
                            ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                        }`}
                        onClick={() => handlePageChange(p as number)}
                      >
                        {p}
                      </Button>
                    ),
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={page >= totalPages}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Page number generation ────────────────────────────────────────────

function generatePageNumbers(
  current: number,
  total: number,
): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | string)[] = [];

  // Always show first page
  pages.push(1);

  if (current > 3) {
    pages.push('...');
  }

  // Show pages around current
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push('...');
  }

  // Always show last page
  if (total > 1) {
    pages.push(total);
  }

  return pages;
}
