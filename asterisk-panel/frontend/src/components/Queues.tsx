import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Phone,
  Clock,
  PhoneMissed,
  Plus,
  Loader2,
  RefreshCw,
  Pause,
  Play,
  Headphones,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { apiRequest } from '@/lib/api';
import { useSocket, type QueueUpdateEvent } from '@/hooks/useSocket';

// ── Types ───────────────────────────────────────────────────────────

interface QueueMember {
  name: string;
  interface: string;
  stateInterface?: string;
  membership: string;
  penalty: number;
  callsTaken: number;
  lastCall: number;
  lastPause?: number;
  status: 'available' | 'busy' | 'paused' | 'unavailable' | 'ringing' | 'unknown';
  paused: boolean;
  pausedReason?: string;
}

interface QueueStats {
  completed: number;
  abandoned: number;
  calls: number;
  holdtime: number;
  talktime: number;
  weight: number;
  serviceLevel: number;
  serviceLevelPerf: number;
}

interface Queue {
  name: string;
  strategy: string;
  members: QueueMember[];
  stats: QueueStats;
}

// ── API helpers (queue endpoints) ───────────────────────────────────

async function getQueues(): Promise<Queue[]> {
  return apiRequest<Queue[]>('GET', '/api/queues');
}

async function pauseQueueMember(
  queue: string,
  memberInterface: string,
  paused: boolean,
  reason?: string,
): Promise<{ success: boolean }> {
  return apiRequest('POST', '/api/queues/pause', {
    queue,
    interface: memberInterface,
    paused,
    reason,
  });
}

async function addQueueMember(
  queue: string,
  memberInterface: string,
  penalty?: number,
): Promise<{ success: boolean }> {
  return apiRequest('POST', '/api/queues/member', {
    queue,
    interface: memberInterface,
    penalty,
  });
}

async function removeQueueMember(
  queue: string,
  memberInterface: string,
): Promise<{ success: boolean }> {
  return apiRequest('DELETE', `/api/queues/member`, {
    queue,
    interface: memberInterface,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatSeconds(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0s';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatLastCall(timestamp: number): string {
  if (timestamp <= 0) return 'Mai';
  try {
    const d = new Date(timestamp * 1000);
    return d.toLocaleString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '-';
  }
}

function memberStatusBadge(member: QueueMember) {
  if (member.paused) {
    return (
      <Badge className="bg-zinc-700/50 text-zinc-400 border-zinc-600">
        In Pausa
      </Badge>
    );
  }
  switch (member.status) {
    case 'available':
      return (
        <Badge className="bg-green-900/50 text-green-400 border-green-800">
          Disponibile
        </Badge>
      );
    case 'busy':
    case 'ringing':
      return (
        <Badge className="bg-yellow-900/50 text-yellow-400 border-yellow-800">
          {member.status === 'ringing' ? 'Squilla' : 'Occupato'}
        </Badge>
      );
    case 'unavailable':
      return (
        <Badge className="bg-red-900/50 text-red-400 border-red-800">
          Non disponibile
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="border-zinc-700 text-zinc-400">
          Sconosciuto
        </Badge>
      );
  }
}

function strategyLabel(strategy: string): string {
  const map: Record<string, string> = {
    ringall: 'Squilla tutti',
    leastrecent: 'Meno recente',
    fewestcalls: 'Meno chiamate',
    random: 'Casuale',
    rrmemory: 'Round Robin',
    linear: 'Lineare',
    wrandom: 'Casuale pesato',
  };
  return map[strategy] || strategy;
}

// ── Props ───────────────────────────────────────────────────────────

interface QueuesProps {
  socketInstance?: ReturnType<typeof useSocket>;
}

// ── Component ───────────────────────────────────────────────────────

export default function Queues({ socketInstance }: QueuesProps) {
  const { toast } = useToast();
  const internalSocket = useSocket();
  const socket = socketInstance || internalSocket;

  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedQueues, setExpandedQueues] = useState<Set<string>>(new Set());

  // Add member dialog
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberQueue, setAddMemberQueue] = useState('');
  const [addMemberInterface, setAddMemberInterface] = useState('');
  const [addMemberPenalty, setAddMemberPenalty] = useState('0');
  const [addingMember, setAddingMember] = useState(false);

  // ── Data fetching ─────────────────────────────────────────────────

  const fetchQueues = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getQueues();
      setQueues(data);
      // Expand all queues on first load
      if (data.length > 0 && expandedQueues.size === 0) {
        setExpandedQueues(new Set(data.map((q) => q.name)));
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Errore nel caricamento';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchQueues();
  }, [fetchQueues]);

  // ── Socket events for real-time updates ───────────────────────────

  useEffect(() => {
    const handleQueueUpdate = (data: QueueUpdateEvent) => {
      setQueues((prev) =>
        prev.map((q) => {
          if (q.name === data.queue) {
            return {
              ...q,
              stats: {
                ...q.stats,
                calls: data.callers,
                holdtime: data.holdtime,
                completed: data.completed,
                abandoned: data.abandoned,
              },
            };
          }
          return q;
        }),
      );
    };

    socket.on('queue:update', handleQueueUpdate);

    return () => {
      socket.off('queue:update', handleQueueUpdate);
    };
  }, [socket]);

  // ── Toggle expanded ───────────────────────────────────────────────

  function toggleQueue(queueName: string) {
    setExpandedQueues((prev) => {
      const next = new Set(prev);
      if (next.has(queueName)) {
        next.delete(queueName);
      } else {
        next.add(queueName);
      }
      return next;
    });
  }

  // ── Pause / Unpause member ────────────────────────────────────────

  async function handleTogglePause(queue: string, member: QueueMember) {
    try {
      await pauseQueueMember(queue, member.interface, !member.paused);
      toast({
        title: member.paused ? 'Membro ripreso' : 'Membro in pausa',
        description: `${member.name} ${member.paused ? 'ripreso' : 'messo in pausa'} nella coda ${queue}.`,
      });
      fetchQueues();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Errore';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    }
  }

  // ── Add member ────────────────────────────────────────────────────

  function openAddMember(queueName: string) {
    setAddMemberQueue(queueName);
    setAddMemberInterface('');
    setAddMemberPenalty('0');
    setAddMemberOpen(true);
  }

  async function handleAddMember() {
    if (!addMemberInterface.trim()) {
      toast({
        title: 'Errore',
        description: 'L\'interfaccia del membro è obbligatoria.',
        variant: 'destructive',
      });
      return;
    }

    setAddingMember(true);
    try {
      await addQueueMember(
        addMemberQueue,
        addMemberInterface.trim(),
        parseInt(addMemberPenalty, 10) || 0,
      );
      toast({
        title: 'Membro aggiunto',
        description: `${addMemberInterface} aggiunto alla coda ${addMemberQueue}.`,
      });
      setAddMemberOpen(false);
      fetchQueues();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Errore nell\'aggiunta';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    } finally {
      setAddingMember(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100">Code</h2>
          <p className="text-sm text-zinc-400">Gestione delle code di chiamata</p>
        </div>
        <div className="flex items-center gap-2">
          {socket.isConnected && (
            <Badge variant="outline" className="border-green-800 text-green-400">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={fetchQueues} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Aggiorna
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading && queues.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      )}

      {/* Empty state */}
      {!loading && queues.length === 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center">
              <Headphones className="mb-3 h-12 w-12 text-zinc-700" />
              <p className="text-sm font-medium text-zinc-500">
                Nessuna coda configurata
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                Le code appariranno qui una volta configurate in Asterisk
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Queue cards */}
      {queues.map((queue) => {
        const isExpanded = expandedQueues.has(queue.name);
        const availableMembers = queue.members.filter(
          (m) => m.status === 'available' && !m.paused,
        ).length;

        return (
          <Card key={queue.name} className="bg-zinc-900 border-zinc-800">
            {/* Queue header */}
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => toggleQueue(queue.name)}
                  className="flex items-center gap-3 text-left"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-zinc-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-zinc-500" />
                  )}
                  <div>
                    <CardTitle className="text-lg font-semibold text-zinc-100">
                      {queue.name}
                    </CardTitle>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Strategia: {strategyLabel(queue.strategy)}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-4">
                  {/* Stat pills */}
                  <div className="hidden sm:flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Users className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {availableMembers}/{queue.members.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Phone className="h-4 w-4" />
                      <span className="text-sm font-medium">{queue.stats.calls}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {formatSeconds(queue.stats.holdtime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-red-400">
                      <PhoneMissed className="h-4 w-4" />
                      <span className="text-sm font-medium">{queue.stats.abandoned}</span>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openAddMember(queue.name);
                    }}
                    className="border-zinc-700 text-zinc-300"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Membro
                  </Button>
                </div>
              </div>
            </CardHeader>

            {/* Expanded content */}
            {isExpanded && (
              <CardContent className="pt-0">
                {/* Stats row (visible on mobile) */}
                <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <p className="text-xs text-zinc-500">Membri</p>
                    <p className="mt-1 text-xl font-bold text-zinc-200">
                      {availableMembers}
                      <span className="text-sm font-normal text-zinc-500">
                        /{queue.members.length}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <p className="text-xs text-zinc-500">In Coda</p>
                    <p className="mt-1 text-xl font-bold text-zinc-200">
                      {queue.stats.calls}
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <p className="text-xs text-zinc-500">Attesa Media</p>
                    <p className="mt-1 text-xl font-bold text-zinc-200">
                      {formatSeconds(queue.stats.holdtime)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <p className="text-xs text-zinc-500">Abbandonate</p>
                    <p className="mt-1 text-xl font-bold text-red-400">
                      {queue.stats.abandoned}
                    </p>
                  </div>
                </div>

                {/* Members list */}
                {queue.members.length === 0 ? (
                  <p className="py-6 text-center text-sm text-zinc-500">
                    Nessun membro nella coda
                  </p>
                ) : (
                  <div className="space-y-2">
                    {queue.members.map((member) => (
                      <div
                        key={member.interface}
                        className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full ${
                              member.paused
                                ? 'bg-zinc-700'
                                : member.status === 'available'
                                ? 'bg-green-900/50'
                                : member.status === 'busy' || member.status === 'ringing'
                                ? 'bg-yellow-900/50'
                                : 'bg-red-900/50'
                            }`}
                          >
                            <Headphones
                              className={`h-4 w-4 ${
                                member.paused
                                  ? 'text-zinc-400'
                                  : member.status === 'available'
                                  ? 'text-green-400'
                                  : member.status === 'busy' || member.status === 'ringing'
                                  ? 'text-yellow-400'
                                  : 'text-red-400'
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-200 truncate">
                              {member.name}
                            </p>
                            <p className="text-xs text-zinc-500 truncate">
                              {member.interface}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 ml-4">
                          {memberStatusBadge(member)}

                          <div className="hidden md:flex items-center gap-4 text-xs text-zinc-400">
                            <div className="text-center">
                              <p className="text-zinc-500">Chiamate</p>
                              <p className="font-medium text-zinc-300">
                                {member.callsTaken}
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="text-zinc-500">Ultima</p>
                              <p className="font-medium text-zinc-300">
                                {formatLastCall(member.lastCall)}
                              </p>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleTogglePause(queue.name, member)}
                            className={`h-8 w-8 p-0 ${
                              member.paused
                                ? 'text-green-400 hover:bg-green-900/30 hover:text-green-300'
                                : 'text-amber-400 hover:bg-amber-900/30 hover:text-amber-300'
                            }`}
                            title={member.paused ? 'Riprendi' : 'Pausa'}
                          >
                            {member.paused ? (
                              <Play className="h-4 w-4" />
                            ) : (
                              <Pause className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Completed calls info */}
                <div className="mt-3 flex items-center justify-end gap-4 text-xs text-zinc-500">
                  <span>
                    Completate: <span className="text-zinc-300">{queue.stats.completed}</span>
                  </span>
                  <span>
                    Tempo medio conversazione:{' '}
                    <span className="text-zinc-300">{formatSeconds(queue.stats.talktime)}</span>
                  </span>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Add Member Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi Membro alla Coda</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Aggiungi un agente alla coda{' '}
              <span className="font-semibold text-zinc-200">{addMemberQueue}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-zinc-300">Interfaccia</Label>
              <Input
                value={addMemberInterface}
                onChange={(e) => setAddMemberInterface(e.target.value)}
                placeholder="PJSIP/1001 o Local/1001@from-internal"
                className="bg-zinc-950 border-zinc-700 text-zinc-100 font-mono text-sm"
              />
              <p className="text-xs text-zinc-500">
                Formato: PJSIP/interno oppure Local/interno@contesto
              </p>
            </div>

            <div className="grid gap-2">
              <Label className="text-zinc-300">Penalita</Label>
              <Select value={addMemberPenalty} onValueChange={setAddMemberPenalty}>
                <SelectTrigger className="bg-zinc-950 border-zinc-700 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="0">0 (priorita massima)</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10 (priorita minima)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddMemberOpen(false)}
              className="border-zinc-700 text-zinc-300"
            >
              Annulla
            </Button>
            <Button onClick={handleAddMember} disabled={addingMember}>
              {addingMember && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
