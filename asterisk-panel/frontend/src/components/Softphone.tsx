import React, { useState, useCallback } from 'react';
import {
  Phone,
  PhoneOff,
  PhoneIncoming,
  MicOff,
  Mic,
  Pause,
  Play,
  ArrowRightLeft,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Types ─────────────────────────────────────────────────────────────

type CallDirection = 'in' | 'out' | null;

interface TrunkOption {
  name: string;
  label?: string;
}

interface SoftphoneProps {
  // State from useSoftphone
  registered: boolean;
  inCall: boolean;
  callDirection: CallDirection;
  remoteNumber: string;
  callDuration: number;
  isMuted: boolean;
  isOnHold: boolean;
  isRinging: boolean;

  // Action callbacks
  onCall: (number: string, trunk?: string) => void;
  onAnswer: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleHold: () => void;
  onSendDtmf: (digit: string) => void;
  onBlindTransfer: (target: string) => void;
  onAttendedTransfer: (target: string) => void;

  // Trunk selector
  trunks?: TrunkOption[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// DTMF tone frequencies
const DTMF_FREQS: Record<string, [number, number]> = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
};

let audioCtx: AudioContext | null = null;

function playDtmfTone(digit: string): void {
  const freqs = DTMF_FREQS[digit];
  if (!freqs) return;

  if (!audioCtx) {
    audioCtx = new AudioContext();
  }

  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc1.frequency.value = freqs[0];
  osc2.frequency.value = freqs[1];
  gain.gain.value = 0.1;

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.15);
  osc2.stop(now + 0.15);
}

// ── DTMF key ──────────────────────────────────────────────────────────

const DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

const DTMF_LABELS: Record<string, string> = {
  '1': '',
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
  '*': '',
  '0': '+',
  '#': '',
};

// ── Component ─────────────────────────────────────────────────────────

export default function Softphone({
  registered,
  inCall,
  callDirection,
  remoteNumber,
  callDuration,
  isMuted,
  isOnHold,
  isRinging,
  onCall,
  onAnswer,
  onHangup,
  onToggleMute,
  onToggleHold,
  onSendDtmf,
  onBlindTransfer,
  onAttendedTransfer,
  trunks = [],
}: SoftphoneProps) {
  const [expanded, setExpanded] = useState(true);
  const [numberInput, setNumberInput] = useState('');
  const [selectedTrunk, setSelectedTrunk] = useState<string>('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');

  const handleDtmfPress = useCallback(
    (digit: string) => {
      playDtmfTone(digit);
      if (inCall) {
        onSendDtmf(digit);
      } else {
        setNumberInput((prev) => prev + digit);
      }
    },
    [inCall, onSendDtmf],
  );

  const handleCall = useCallback(() => {
    if (!numberInput.trim()) return;
    onCall(numberInput.trim(), selectedTrunk || undefined);
  }, [numberInput, selectedTrunk, onCall]);

  const handleBlindTransfer = useCallback(() => {
    if (!transferTarget.trim()) return;
    onBlindTransfer(transferTarget.trim());
    setTransferOpen(false);
    setTransferTarget('');
  }, [transferTarget, onBlindTransfer]);

  const handleAttendedTransfer = useCallback(() => {
    if (!transferTarget.trim()) return;
    onAttendedTransfer(transferTarget.trim());
    setTransferOpen(false);
    setTransferTarget('');
  }, [transferTarget, onAttendedTransfer]);

  const isIncoming = isRinging && callDirection === 'in' && !inCall;

  return (
    <div className="w-full max-w-sm mx-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
      {/* ── Incoming call banner ──────────────────────────────────── */}
      {isIncoming && (
        <div className="flex items-center justify-between rounded-t-xl border-b border-zinc-800 bg-green-950/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <PhoneIncoming className="h-5 w-5 animate-pulse text-green-400" />
            <div>
              <p className="text-xs font-medium text-green-300">Chiamata in arrivo</p>
              <p className="text-base font-semibold text-zinc-100">{remoteNumber || 'Sconosciuto'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-10 px-4 bg-green-600 hover:bg-green-700 text-white text-sm"
              onClick={onAnswer}
            >
              <Phone className="mr-1.5 h-4 w-4" />
              Rispondi
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-10 w-10 p-0"
              onClick={onHangup}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Header / collapsed view ──────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">Softphone</span>
          {registered ? (
            <Badge className="bg-green-900/50 text-green-400 border-green-800 text-[10px] px-1.5 py-0">
              Registrato
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              Offline
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {inCall && (
            <Badge className="bg-blue-900/50 text-blue-400 border-blue-800 text-[10px] px-1.5 py-0">
              {formatDuration(callDuration)}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* ── Expanded panel ───────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 pb-4 pt-3">
          {/* In-call display */}
          {inCall && (
            <div className="mb-3 rounded-lg bg-zinc-900 px-3 py-2 text-center">
              <p className="text-xs text-zinc-500">
                {callDirection === 'in' ? 'In arrivo da' : 'In uscita verso'}
              </p>
              <p className="text-lg font-semibold tabular-nums text-zinc-100">
                {remoteNumber || 'Sconosciuto'}
              </p>
              <p className="text-xl font-bold tabular-nums text-blue-400">
                {formatDuration(callDuration)}
              </p>
            </div>
          )}

          {/* Number input */}
          <div className="mb-3">
            <Input
              type="tel"
              placeholder="Numero..."
              value={inCall ? remoteNumber : numberInput}
              onChange={(e) => setNumberInput(e.target.value)}
              readOnly={inCall}
              style={{ fontSize: '18px' }}
              className="h-12 bg-zinc-900 border-zinc-700 text-center font-semibold tabular-nums text-zinc-100 placeholder:text-zinc-600"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !inCall) handleCall();
              }}
            />
          </div>

          {/* Trunk selector */}
          {!inCall && trunks.length > 0 && (
            <div className="mb-3">
              <Select value={selectedTrunk} onValueChange={setSelectedTrunk}>
                <SelectTrigger className="h-8 bg-zinc-900 border-zinc-700 text-sm text-zinc-300">
                  <SelectValue placeholder="Trunk (auto)" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="auto">Automatico</SelectItem>
                  {trunks.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.label || t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* DTMF keypad */}
          <div className="mb-3 grid grid-cols-3 gap-2">
            {DTMF_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleDtmfPress(key)}
                className="flex h-14 flex-col items-center justify-center rounded-xl bg-zinc-800 text-zinc-100 transition-colors hover:bg-zinc-700 active:bg-zinc-600 select-none touch-manipulation"
              >
                <span className="text-xl font-semibold leading-none">{key}</span>
                {DTMF_LABELS[key] && (
                  <span className="mt-0.5 text-[10px] tracking-widest text-zinc-500">
                    {DTMF_LABELS[key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="mb-3 flex justify-center gap-2">
            {!inCall ? (
              <>
                <Button
                  className="flex-1 h-12 text-base bg-green-600 hover:bg-green-700 text-white rounded-xl touch-manipulation"
                  onClick={handleCall}
                  disabled={!registered || !numberInput.trim()}
                >
                  <Phone className="mr-2 h-5 w-5" />
                  Chiama
                </Button>
                {numberInput && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-12 w-12 p-0 text-zinc-400 hover:text-zinc-200 touch-manipulation"
                    onClick={() => setNumberInput('')}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                )}
              </>
            ) : (
              <Button
                variant="destructive"
                className="flex-1 h-12 text-base rounded-xl touch-manipulation"
                onClick={onHangup}
              >
                <PhoneOff className="mr-2 h-5 w-5" />
                Riaggancia
              </Button>
            )}
          </div>

          {/* In-call controls */}
          {inCall && (
            <div className="flex justify-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className={`h-9 w-9 p-0 border-zinc-700 ${
                  isMuted
                    ? 'bg-red-900/50 text-red-400 border-red-800'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                onClick={onToggleMute}
                title={isMuted ? 'Riattiva microfono' : 'Muto'}
              >
                {isMuted ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={`h-9 w-9 p-0 border-zinc-700 ${
                  isOnHold
                    ? 'bg-amber-900/50 text-amber-400 border-amber-800'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                onClick={onToggleHold}
                title={isOnHold ? 'Riprendi' : 'Attesa'}
              >
                {isOnHold ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                onClick={() => setTransferOpen(true)}
                title="Trasferisci"
              >
                <ArrowRightLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Transfer dialog ──────────────────────────────────────── */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Trasferisci chiamata</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Inserisci il numero di destinazione per il trasferimento.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
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
    </div>
  );
}
