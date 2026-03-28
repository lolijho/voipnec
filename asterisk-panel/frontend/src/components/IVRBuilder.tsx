import React, { useState, useCallback } from 'react';
import {
  Phone,
  Play,
  Voicemail,
  ArrowRight,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  Code,
  Save,
  Music,
  Clock,
  PhoneOff,
  GitBranch,
  Loader2,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { apiRequest } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────

type IVRActionType =
  | 'Answer'
  | 'Playback'
  | 'Background'
  | 'WaitExten'
  | 'Goto'
  | 'Dial'
  | 'Voicemail'
  | 'Hangup';

interface IVRStepParams {
  sound?: string;
  timeout?: string;
  context?: string;
  extension?: string;
  priority?: string;
  endpoint?: string;
  dialTimeout?: string;
  dialOptions?: string;
  mailbox?: string;
}

interface IVRStep {
  id: string;
  order: number;
  action: IVRActionType;
  label: string;
  params: IVRStepParams;
}

interface IVRBuilderProps {
  contextName?: string;
  extensionNumber?: string;
}

// ── Action metadata ───────────────────────────────────────────────────

const ACTION_META: Record<
  IVRActionType,
  { icon: React.ReactNode; color: string; description: string }
> = {
  Answer: {
    icon: <Phone className="h-4 w-4" />,
    color: 'text-green-400 bg-green-900/30 border-green-800',
    description: 'Rispondi alla chiamata',
  },
  Playback: {
    icon: <Play className="h-4 w-4" />,
    color: 'text-blue-400 bg-blue-900/30 border-blue-800',
    description: 'Riproduci un file audio',
  },
  Background: {
    icon: <Music className="h-4 w-4" />,
    color: 'text-purple-400 bg-purple-900/30 border-purple-800',
    description: 'Riproduci audio e attendi DTMF',
  },
  WaitExten: {
    icon: <Clock className="h-4 w-4" />,
    color: 'text-amber-400 bg-amber-900/30 border-amber-800',
    description: 'Attendi digitazione estensione',
  },
  Goto: {
    icon: <ArrowRight className="h-4 w-4" />,
    color: 'text-cyan-400 bg-cyan-900/30 border-cyan-800',
    description: 'Vai a contesto/estensione',
  },
  Dial: {
    icon: <Phone className="h-4 w-4" />,
    color: 'text-emerald-400 bg-emerald-900/30 border-emerald-800',
    description: 'Chiama un endpoint',
  },
  Voicemail: {
    icon: <Voicemail className="h-4 w-4" />,
    color: 'text-orange-400 bg-orange-900/30 border-orange-800',
    description: 'Invia a casella vocale',
  },
  Hangup: {
    icon: <PhoneOff className="h-4 w-4" />,
    color: 'text-red-400 bg-red-900/30 border-red-800',
    description: 'Chiudi la chiamata',
  },
};

const ALL_ACTIONS: IVRActionType[] = [
  'Answer',
  'Playback',
  'Background',
  'WaitExten',
  'Goto',
  'Dial',
  'Voicemail',
  'Hangup',
];

// ── Helpers ───────────────────────────────────────────────────────────

let nextId = 1;
function generateId(): string {
  return `ivr_${Date.now()}_${nextId++}`;
}

function defaultLabel(action: IVRActionType): string {
  const labels: Record<IVRActionType, string> = {
    Answer: 'Rispondi',
    Playback: 'Riproduci Audio',
    Background: 'Menu Audio',
    WaitExten: 'Attendi Scelta',
    Goto: 'Vai a',
    Dial: 'Chiama',
    Voicemail: 'Casella Vocale',
    Hangup: 'Riaggancia',
  };
  return labels[action];
}

function stepSummary(step: IVRStep): string {
  const p = step.params;
  switch (step.action) {
    case 'Answer':
      return '';
    case 'Playback':
      return p.sound || '(nessun file)';
    case 'Background':
      return p.sound || '(nessun file)';
    case 'WaitExten':
      return p.timeout ? `${p.timeout}s` : '(default)';
    case 'Goto':
      return [p.context, p.extension, p.priority].filter(Boolean).join(',') || '(non configurato)';
    case 'Dial':
      return p.endpoint || '(nessun endpoint)';
    case 'Voicemail':
      return p.mailbox || '(nessuna mailbox)';
    case 'Hangup':
      return '';
    default:
      return '';
  }
}

function generateDialplan(
  steps: IVRStep[],
  contextName: string,
  extensionNumber: string,
): string {
  const lines: string[] = [];
  lines.push(`[${contextName}]`);

  const sorted = [...steps].sort((a, b) => a.order - b.order);

  sorted.forEach((step, idx) => {
    const prio = idx + 1;
    const prefix = `exten => ${extensionNumber},${prio}`;
    const p = step.params;

    switch (step.action) {
      case 'Answer':
        lines.push(`${prefix},Answer()`);
        break;
      case 'Playback':
        lines.push(`${prefix},Playback(${p.sound || 'hello-world'})`);
        break;
      case 'Background':
        lines.push(`${prefix},Background(${p.sound || 'main-menu'})`);
        break;
      case 'WaitExten':
        lines.push(`${prefix},WaitExten(${p.timeout || '5'})`);
        break;
      case 'Goto':
        lines.push(
          `${prefix},Goto(${p.context || contextName},${p.extension || 's'},${p.priority || '1'})`,
        );
        break;
      case 'Dial': {
        const opts = p.dialOptions ? `,${p.dialOptions}` : '';
        const timeout = p.dialTimeout ? `,${p.dialTimeout}` : '';
        lines.push(`${prefix},Dial(${p.endpoint || 'PJSIP/100'}${timeout}${opts})`);
        break;
      }
      case 'Voicemail':
        lines.push(`${prefix},VoiceMail(${p.mailbox || '100'}@default,u)`);
        break;
      case 'Hangup':
        lines.push(`${prefix},Hangup()`);
        break;
    }
  });

  return lines.join('\n');
}

// ── Component ─────────────────────────────────────────────────────────

export default function IVRBuilder({
  contextName: initialContext = 'ivr-menu',
  extensionNumber: initialExten = 's',
}: IVRBuilderProps) {
  const { toast } = useToast();
  const [steps, setSteps] = useState<IVRStep[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<IVRActionType>('Answer');
  const [newStepLabel, setNewStepLabel] = useState('');
  const [newStepParams, setNewStepParams] = useState<IVRStepParams>({});
  const [contextName, setContextName] = useState(initialContext);
  const [extensionNumber, setExtensionNumber] = useState(initialExten);
  const [dialplanPreview, setDialplanPreview] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetNewStepForm = useCallback(() => {
    setSelectedAction('Answer');
    setNewStepLabel('');
    setNewStepParams({});
  }, []);

  const handleAddStep = useCallback(() => {
    const step: IVRStep = {
      id: generateId(),
      order: steps.length,
      action: selectedAction,
      label: newStepLabel || defaultLabel(selectedAction),
      params: { ...newStepParams },
    };
    setSteps((prev) => [...prev, step]);
    setAddDialogOpen(false);
    resetNewStepForm();
  }, [steps.length, selectedAction, newStepLabel, newStepParams, resetNewStepForm]);

  const handleDeleteStep = useCallback((id: string) => {
    setSteps((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      return filtered.map((s, idx) => ({ ...s, order: idx }));
    });
  }, []);

  const handleMoveUp = useCallback((index: number) => {
    if (index <= 0) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next.map((s, idx) => ({ ...s, order: idx }));
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setSteps((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next.map((s, idx) => ({ ...s, order: idx }));
    });
  }, []);

  const handleGenerateDialplan = useCallback(() => {
    const dp = generateDialplan(steps, contextName, extensionNumber);
    setDialplanPreview(dp);
    setShowPreview(true);
  }, [steps, contextName, extensionNumber]);

  const handleCopyDialplan = useCallback(() => {
    navigator.clipboard.writeText(dialplanPreview);
    toast({ title: 'Copiato', description: 'Dialplan copiato negli appunti' });
  }, [dialplanPreview, toast]);

  const handleApply = useCallback(async () => {
    setSaving(true);
    try {
      const dp = generateDialplan(steps, contextName, extensionNumber);
      await apiRequest('POST', '/api/ivr/apply', {
        context: contextName,
        extension: extensionNumber,
        steps: steps.map((s) => ({
          action: s.action,
          label: s.label,
          params: s.params,
          order: s.order,
        })),
        dialplan: dp,
      });
      toast({ title: 'Salvato', description: 'IVR applicato con successo' });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Errore durante il salvataggio';
      toast({
        title: 'Errore',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [steps, contextName, extensionNumber, toast]);

  // ── Render param fields based on action type ──────────────────────

  function renderParamFields(
    action: IVRActionType,
    params: IVRStepParams,
    onChange: (p: IVRStepParams) => void,
  ) {
    switch (action) {
      case 'Playback':
      case 'Background':
        return (
          <div className="space-y-2">
            <Label className="text-zinc-300">File Audio</Label>
            <Input
              placeholder="es. welcome, main-menu, custom/greeting"
              value={params.sound || ''}
              onChange={(e) => onChange({ ...params, sound: e.target.value })}
              className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
            />
            <p className="text-xs text-zinc-500">
              Nome del file audio senza estensione (dalla cartella sounds di Asterisk)
            </p>
          </div>
        );

      case 'WaitExten':
        return (
          <div className="space-y-2">
            <Label className="text-zinc-300">Timeout (secondi)</Label>
            <Input
              type="number"
              placeholder="5"
              value={params.timeout || ''}
              onChange={(e) => onChange({ ...params, timeout: e.target.value })}
              className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              min={1}
              max={60}
            />
          </div>
        );

      case 'Goto':
        return (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-zinc-300">Contesto</Label>
              <Input
                placeholder="es. from-internal"
                value={params.context || ''}
                onChange={(e) => onChange({ ...params, context: e.target.value })}
                className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Estensione</Label>
              <Input
                placeholder="es. 100, s"
                value={params.extension || ''}
                onChange={(e) => onChange({ ...params, extension: e.target.value })}
                className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Priorita</Label>
              <Input
                placeholder="1"
                value={params.priority || ''}
                onChange={(e) => onChange({ ...params, priority: e.target.value })}
                className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
          </div>
        );

      case 'Dial':
        return (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-zinc-300">Endpoint</Label>
              <Input
                placeholder="PJSIP/100"
                value={params.endpoint || ''}
                onChange={(e) => onChange({ ...params, endpoint: e.target.value })}
                className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
              <p className="text-xs text-zinc-500">
                Formato: PJSIP/interno oppure PJSIP/numero@trunk
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Timeout (secondi)</Label>
              <Input
                type="number"
                placeholder="30"
                value={params.dialTimeout || ''}
                onChange={(e) => onChange({ ...params, dialTimeout: e.target.value })}
                className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
                min={1}
                max={300}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Opzioni Dial</Label>
              <Input
                placeholder="es. tTr"
                value={params.dialOptions || ''}
                onChange={(e) => onChange({ ...params, dialOptions: e.target.value })}
                className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
              <p className="text-xs text-zinc-500">
                t=trasferimento chiamato, T=trasferimento chiamante, r=suoneria
              </p>
            </div>
          </div>
        );

      case 'Voicemail':
        return (
          <div className="space-y-2">
            <Label className="text-zinc-300">Mailbox</Label>
            <Input
              placeholder="es. 100"
              value={params.mailbox || ''}
              onChange={(e) => onChange({ ...params, mailbox: e.target.value })}
              className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
            />
            <p className="text-xs text-zinc-500">
              Numero casella vocale (contesto @default)
            </p>
          </div>
        );

      case 'Answer':
      case 'Hangup':
      default:
        return (
          <p className="text-sm text-zinc-500">
            Nessun parametro richiesto per questa azione.
          </p>
        );
    }
  }

  // ── Sorted steps ──────────────────────────────────────────────────

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-violet-400" />
            IVR Builder
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Costruisci il flusso IVR visualmente
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            onClick={() => {
              setAddDialogOpen(true);
              resetNewStepForm();
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Aggiungi Step
          </Button>
          <Button
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            onClick={handleGenerateDialplan}
            disabled={steps.length === 0}
          >
            <Code className="mr-1.5 h-4 w-4" />
            Genera Dialplan
          </Button>
          <Button
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={handleApply}
            disabled={saving || steps.length === 0}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Applica
          </Button>
        </div>
      </div>

      {/* ── Context / Extension config ──────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-zinc-300">Nome Contesto</Label>
              <Input
                value={contextName}
                onChange={(e) => setContextName(e.target.value)}
                placeholder="ivr-menu"
                className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Estensione</Label>
              <Input
                value={extensionNumber}
                onChange={(e) => setExtensionNumber(e.target.value)}
                placeholder="s"
                className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Steps list ──────────────────────────────────────────────── */}
      {sortedSteps.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12">
            <div className="text-center">
              <GitBranch className="mx-auto h-12 w-12 text-zinc-700" />
              <p className="mt-3 text-sm text-zinc-500">
                Nessuno step configurato. Clicca &quot;Aggiungi Step&quot; per iniziare.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedSteps.map((step, index) => {
            const meta = ACTION_META[step.action];
            return (
              <Card
                key={step.id}
                className={`border ${meta.color} transition-colors`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* Order number */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-zinc-300">
                      {index + 1}
                    </div>

                    {/* Icon */}
                    <div className="shrink-0">{meta.icon}</div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-100">
                          {step.label}
                        </span>
                        <Badge
                          variant="outline"
                          className="border-zinc-700 text-zinc-400 text-xs"
                        >
                          {step.action}
                        </Badge>
                      </div>
                      {stepSummary(step) && (
                        <p className="mt-0.5 text-xs text-zinc-500 truncate">
                          {stepSummary(step)}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-200"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        title="Sposta su"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-200"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === sortedSteps.length - 1}
                        title="Sposta giu"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400"
                        onClick={() => handleDeleteStep(step.id)}
                        title="Elimina"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Dialplan preview ────────────────────────────────────────── */}
      {showPreview && dialplanPreview && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-zinc-200 flex items-center gap-2">
                <Code className="h-4 w-4 text-cyan-400" />
                Anteprima Dialplan
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                onClick={handleCopyDialplan}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copia
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-sm text-green-400 font-mono border border-zinc-800">
              {dialplanPreview}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* ── Add step dialog ─────────────────────────────────────────── */}
      <Dialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) resetNewStepForm();
        }}
      >
        <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Aggiungi Step IVR</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Seleziona il tipo di azione e configura i parametri.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Action type */}
            <div className="space-y-2">
              <Label className="text-zinc-300">Tipo Azione</Label>
              <Select
                value={selectedAction}
                onValueChange={(v) => {
                  setSelectedAction(v as IVRActionType);
                  setNewStepParams({});
                  setNewStepLabel('');
                }}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {ALL_ACTIONS.map((action) => (
                    <SelectItem key={action} value={action}>
                      <div className="flex items-center gap-2">
                        {ACTION_META[action].icon}
                        <span>{action}</span>
                        <span className="text-xs text-zinc-500 ml-1">
                          - {ACTION_META[action].description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Label */}
            <div className="space-y-2">
              <Label className="text-zinc-300">Etichetta</Label>
              <Input
                placeholder={defaultLabel(selectedAction)}
                value={newStepLabel}
                onChange={(e) => setNewStepLabel(e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>

            {/* Parameters */}
            {renderParamFields(selectedAction, newStepParams, setNewStepParams)}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-300"
              onClick={() => {
                setAddDialogOpen(false);
                resetNewStepForm();
              }}
            >
              Annulla
            </Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={handleAddStep}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
