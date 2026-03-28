import React, { useState, useCallback } from 'react';
import {
  PhoneOff,
  Pause,
  Play,
  ArrowRightLeft,
  ParkingSquare,
  Disc,
  Hash,
  Activity,
  PhoneCall,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ── Types ─────────────────────────────────────────────────────────────

interface ActiveCallEntry {
  channel: string;
  callerIdNum: string;
  callerIdName?: string;
  connectedLineNum?: string;
  connectedLineName?: string;
  state: string;
  duration: number;
  trunk?: string;
  uniqueId?: string;
  bridgeId?: string;
}

interface ActiveCallsProps {
  activeCalls: ActiveCallEntry[];
  onHangup: (channel: string) => void;
  onHold: (channel: string) => void;
  onUnhold: (channel: string) => void;
  onTransfer: (channel: string, target: string, mode: 'blind' | 'attended') => void;
  onPark: (channel: string) => void;
  onRecord?: (channel: string) => void;
  onSendDtmf?: (channel: string, digit: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function stateBadge(state: string) {
  const s = state.toLowerCase();
  if (s === 'ring' || s === 'ringing') {
    return (
      <Badge className="bg-yellow-900/50 text-yellow-400 border-yellow-800">
        Ring
      </Badge>
    );
  }
  if (s === 'up' || s === 'answered') {
    return (
      <Badge className="bg-green-900/50 text-green-400 border-green-800">
        Up
      </Badge>
    );
  }
  if (s === 'busy') {
    return (
      <Badge className="bg-red-900/50 text-red-400 border-red-800">
        Busy
      </Badge>
    );
  }
  if (s === 'hold') {
    return (
      <Badge className="bg-amber-900/50 text-amber-400 border-amber-800">
        Hold
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-zinc-700 text-zinc-400">
      {state}
    </Badge>
  );
}

// ── Component ─────────────────────────────────────────────────────────

export default function ActiveCalls({
  activeCalls,
  onHangup,
  onHold,
  onUnhold,
  onTransfer,
  onPark,
  onRecord,
  onSendDtmf,
}: ActiveCallsProps) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferChannel, setTransferChannel] = useState('');
  const [transferTarget, setTransferTarget] = useState('');
  const [dtmfOpen, setDtmfOpen] = useState(false);
  const [dtmfChannel, setDtmfChannel] = useState('');
  const [dtmfDigit, setDtmfDigit] = useState('');

  const openTransfer = useCallback((channel: string) => {
    setTransferChannel(channel);
    setTransferTarget('');
    setTransferOpen(true);
  }, []);

  const handleBlindTransfer = useCallback(() => {
    if (!transferTarget.trim()) return;
    onTransfer(transferChannel, transferTarget.trim(), 'blind');
    setTransferOpen(false);
    setTransferTarget('');
  }, [transferChannel, transferTarget, onTransfer]);

  const handleAttendedTransfer = useCallback(() => {
    if (!transferTarget.trim()) return;
    onTransfer(transferChannel, transferTarget.trim(), 'attended');
    setTransferOpen(false);
    setTransferTarget('');
  }, [transferChannel, transferTarget, onTransfer]);

  const openDtmf = useCallback((channel: string) => {
    setDtmfChannel(channel);
    setDtmfDigit('');
    setDtmfOpen(true);
  }, []);

  const handleSendDtmf = useCallback(() => {
    if (!dtmfDigit.trim() || !onSendDtmf) return;
    onSendDtmf(dtmfChannel, dtmfDigit.trim());
    setDtmfDigit('');
  }, [dtmfChannel, dtmfDigit, onSendDtmf]);

  const isOnHold = (state: string) => state.toLowerCase() === 'hold';

  return (
    <div className="space-y-4">
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg font-semibold text-zinc-100">
                Chiamate Attive
              </CardTitle>
              <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                {activeCalls.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
              </span>
              <span className="text-xs text-zinc-500">Auto-refresh</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeCalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <PhoneCall className="mb-3 h-12 w-12 text-zinc-700" />
              <p className="text-sm font-medium text-zinc-500">
                Nessuna chiamata attiva
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                Le chiamate in corso appariranno qui in tempo reale
              </p>
            </div>
          ) : (
            <TooltipProvider delayDuration={200}>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Canale</TableHead>
                    <TableHead className="text-zinc-400">Da</TableHead>
                    <TableHead className="text-zinc-400">A</TableHead>
                    <TableHead className="text-zinc-400">Stato</TableHead>
                    <TableHead className="text-zinc-400">Durata</TableHead>
                    <TableHead className="text-zinc-400">Trunk</TableHead>
                    <TableHead className="text-right text-zinc-400">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeCalls.map((call) => (
                    <TableRow
                      key={call.channel}
                      className="border-zinc-800 hover:bg-zinc-800/50"
                    >
                      <TableCell className="font-mono text-xs text-zinc-300">
                        {call.channel}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-zinc-200">
                            {call.callerIdNum || '-'}
                          </p>
                          {call.callerIdName && call.callerIdName !== call.callerIdNum && (
                            <p className="text-xs text-zinc-500">{call.callerIdName}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-zinc-200">
                            {call.connectedLineNum || '-'}
                          </p>
                          {call.connectedLineName &&
                            call.connectedLineName !== call.connectedLineNum && (
                              <p className="text-xs text-zinc-500">
                                {call.connectedLineName}
                              </p>
                            )}
                        </div>
                      </TableCell>
                      <TableCell>{stateBadge(call.state)}</TableCell>
                      <TableCell className="tabular-nums text-sm text-zinc-300">
                        {formatDuration(call.duration)}
                      </TableCell>
                      <TableCell>
                        {call.trunk ? (
                          <Badge
                            variant="secondary"
                            className="bg-zinc-800 text-zinc-300 text-xs"
                          >
                            {call.trunk}
                          </Badge>
                        ) : (
                          <span className="text-xs text-zinc-600">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Hangup */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-400 hover:bg-red-900/30 hover:text-red-300"
                                onClick={() => onHangup(call.channel)}
                              >
                                <PhoneOff className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-zinc-800 text-zinc-200 border-zinc-700">
                              Riaggancia
                            </TooltipContent>
                          </Tooltip>

                          {/* Hold / Unhold */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-8 w-8 p-0 ${
                                  isOnHold(call.state)
                                    ? 'text-amber-400 hover:bg-amber-900/30 hover:text-amber-300'
                                    : 'text-blue-400 hover:bg-blue-900/30 hover:text-blue-300'
                                }`}
                                onClick={() =>
                                  isOnHold(call.state)
                                    ? onUnhold(call.channel)
                                    : onHold(call.channel)
                                }
                              >
                                {isOnHold(call.state) ? (
                                  <Play className="h-4 w-4" />
                                ) : (
                                  <Pause className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-zinc-800 text-zinc-200 border-zinc-700">
                              {isOnHold(call.state) ? 'Riprendi' : 'Attesa'}
                            </TooltipContent>
                          </Tooltip>

                          {/* Transfer */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-purple-400 hover:bg-purple-900/30 hover:text-purple-300"
                                onClick={() => openTransfer(call.channel)}
                              >
                                <ArrowRightLeft className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-zinc-800 text-zinc-200 border-zinc-700">
                              Trasferisci
                            </TooltipContent>
                          </Tooltip>

                          {/* Park */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-cyan-400 hover:bg-cyan-900/30 hover:text-cyan-300"
                                onClick={() => onPark(call.channel)}
                              >
                                <ParkingSquare className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-zinc-800 text-zinc-200 border-zinc-700">
                              Parcheggia
                            </TooltipContent>
                          </Tooltip>

                          {/* Record */}
                          {onRecord && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-rose-400 hover:bg-rose-900/30 hover:text-rose-300"
                                  onClick={() => onRecord(call.channel)}
                                >
                                  <Disc className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-zinc-800 text-zinc-200 border-zinc-700">
                                Registra
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {/* DTMF */}
                          {onSendDtmf && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-300"
                                  onClick={() => openDtmf(call.channel)}
                                >
                                  <Hash className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-zinc-800 text-zinc-200 border-zinc-700">
                                DTMF
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      {/* ── Transfer Dialog ──────────────────────────────────────────── */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Trasferisci chiamata</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Inserisci il numero di destinazione per il trasferimento.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Canale: <span className="font-mono text-zinc-500">{transferChannel}</span>
            </label>
            <Input
              type="tel"
              placeholder="Numero destinazione..."
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleBlindTransfer();
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleBlindTransfer}
              disabled={!transferTarget.trim()}
            >
              Blind Transfer
            </Button>
            <Button
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleAttendedTransfer}
              disabled={!transferTarget.trim()}
            >
              Attended Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DTMF Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dtmfOpen} onOpenChange={setDtmfOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Invia DTMF</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Inserisci le cifre DTMF da inviare al canale.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Canale: <span className="font-mono text-zinc-500">{dtmfChannel}</span>
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Es. 1234#"
                value={dtmfDigit}
                onChange={(e) => setDtmfDigit(e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 font-mono"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendDtmf();
                }}
              />
              <Button
                className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
                onClick={handleSendDtmf}
                disabled={!dtmfDigit.trim()}
              >
                Invia
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
