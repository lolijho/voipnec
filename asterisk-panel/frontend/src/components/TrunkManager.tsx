import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  RefreshCw,
  Plug,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import {
  getTrunks,
  createTrunk,
  updateTrunk,
  deleteTrunk,
  testTrunk,
  type Trunk,
  type CreateTrunkData,
} from '@/lib/api';

// ── Provider tab type ───────────────────────────────────────────────

type ProviderTab = 'messagenet' | 'twilio' | 'generico';

// ── Form data types ─────────────────────────────────────────────────

interface MessageNetFormData {
  username: string;
  password: string;
  did: string;
  codecs: string;
}

interface TwilioFormData {
  accountSid: string;
  authToken: string;
  trunkSid: string;
  number: string;
  region: string;
}

interface GenericoFormData {
  providerName: string;
  sipServer: string;
  sipProxy: string;
  username: string;
  password: string;
  realm: string;
  did: string;
  outboundPrefix: string;
  codecs: string;
  dtmfMode: string;
  nat: string;
  transport: string;
  register: boolean;
}

const emptyMessageNet: MessageNetFormData = {
  username: '',
  password: '',
  did: '',
  codecs: 'alaw,g729',
};

const emptyTwilio: TwilioFormData = {
  accountSid: '',
  authToken: '',
  trunkSid: '',
  number: '',
  region: 'ie1',
};

const emptyGenerico: GenericoFormData = {
  providerName: '',
  sipServer: '',
  sipProxy: '',
  username: '',
  password: '',
  realm: '',
  did: '',
  outboundPrefix: '',
  codecs: 'ulaw,alaw,g729',
  dtmfMode: 'rfc2833',
  nat: 'force_rport',
  transport: 'udp',
  register: true,
};

// ── Helper: build CreateTrunkData from forms ────────────────────────

function buildTrunkFromMessageNet(form: MessageNetFormData): CreateTrunkData {
  return {
    name: `messagenet-${form.username}`,
    type: 'pjsip',
    host: 'sip.messagenet.it',
    port: 5060,
    username: form.username,
    secret: form.password,
    context: 'from-trunk',
    codecs: form.codecs.split(',').map((c) => c.trim()).filter(Boolean),
    outboundCallerId: form.did,
    transport: 'udp',
    qualify: true,
  };
}

function buildTrunkFromTwilio(form: TwilioFormData): CreateTrunkData {
  const regionHost =
    form.region === 'us1'
      ? `${form.trunkSid}.pstn.us1.twilio.com`
      : `${form.trunkSid}.pstn.twilio.com`;
  return {
    name: `twilio-${form.trunkSid.slice(-6)}`,
    type: 'pjsip',
    host: regionHost,
    port: 5060,
    username: form.accountSid,
    secret: form.authToken,
    context: 'from-trunk',
    codecs: ['ulaw', 'alaw'],
    outboundCallerId: form.number,
    transport: 'udp',
    qualify: true,
  };
}

function buildTrunkFromGenerico(form: GenericoFormData): CreateTrunkData {
  return {
    name: form.providerName.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    type: 'pjsip',
    host: form.sipServer,
    port: 5060,
    username: form.username,
    secret: form.password,
    context: 'from-trunk',
    codecs: form.codecs.split(',').map((c) => c.trim()).filter(Boolean),
    outboundCallerId: form.did,
    transport: form.transport,
    qualify: true,
  };
}

// ── Component ───────────────────────────────────────────────────────

export default function TrunkManager() {
  const { toast } = useToast();

  const [trunks, setTrunks] = useState<Trunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ProviderTab>('messagenet');

  // Form state per provider
  const [messageNetForm, setMessageNetForm] = useState<MessageNetFormData>(emptyMessageNet);
  const [twilioForm, setTwilioForm] = useState<TwilioFormData>(emptyTwilio);
  const [genericoForm, setGenericoForm] = useState<GenericoFormData>(emptyGenerico);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTrunk, setDeletingTrunk] = useState<Trunk | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────

  const fetchTrunks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTrunks();
      setTrunks(data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Errore nel caricamento';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTrunks();
  }, [fetchTrunks]);

  // ── Dialog helpers ────────────────────────────────────────────────

  function openAddDialog() {
    setMessageNetForm(emptyMessageNet);
    setTwilioForm(emptyTwilio);
    setGenericoForm(emptyGenerico);
    setActiveTab('messagenet');
    setEditMode(false);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEditDialog(trunk: Trunk) {
    setEditMode(true);
    setEditingId(trunk.id);

    // Try to detect provider from host/name
    if (trunk.host?.includes('messagenet')) {
      setActiveTab('messagenet');
      setMessageNetForm({
        username: trunk.username || '',
        password: '',
        did: trunk.outboundCallerId || '',
        codecs: (trunk.codecs || []).join(','),
      });
    } else if (trunk.host?.includes('twilio')) {
      setActiveTab('twilio');
      setTwilioForm({
        accountSid: trunk.username || '',
        authToken: '',
        trunkSid: '',
        number: trunk.outboundCallerId || '',
        region: trunk.host?.includes('us1') ? 'us1' : 'ie1',
      });
    } else {
      setActiveTab('generico');
      setGenericoForm({
        providerName: trunk.name || '',
        sipServer: trunk.host || '',
        sipProxy: '',
        username: trunk.username || '',
        password: '',
        realm: '',
        did: trunk.outboundCallerId || '',
        outboundPrefix: '',
        codecs: (trunk.codecs || []).join(','),
        dtmfMode: 'rfc2833',
        nat: 'force_rport',
        transport: trunk.transport || 'udp',
        register: true,
      });
    }

    setDialogOpen(true);
  }

  function openDeleteDialog(trunk: Trunk) {
    setDeletingTrunk(trunk);
    setDeleteDialogOpen(true);
  }

  // ── CRUD actions ──────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      let payload: CreateTrunkData;

      switch (activeTab) {
        case 'messagenet':
          if (!messageNetForm.username || !messageNetForm.password) {
            toast({
              title: 'Errore',
              description: 'Username e password sono obbligatori.',
              variant: 'destructive',
            });
            setSaving(false);
            return;
          }
          payload = buildTrunkFromMessageNet(messageNetForm);
          break;

        case 'twilio':
          if (!twilioForm.accountSid || !twilioForm.authToken || !twilioForm.trunkSid) {
            toast({
              title: 'Errore',
              description: 'Account SID, Auth Token e Trunk SID sono obbligatori.',
              variant: 'destructive',
            });
            setSaving(false);
            return;
          }
          payload = buildTrunkFromTwilio(twilioForm);
          break;

        case 'generico':
          if (!genericoForm.providerName || !genericoForm.sipServer || !genericoForm.username) {
            toast({
              title: 'Errore',
              description: 'Nome provider, SIP Server e Username sono obbligatori.',
              variant: 'destructive',
            });
            setSaving(false);
            return;
          }
          payload = buildTrunkFromGenerico(genericoForm);
          break;
      }

      if (editMode && editingId !== null) {
        await updateTrunk(editingId, payload);
        toast({
          title: 'Trunk aggiornato',
          description: `Trunk "${payload.name}" aggiornato con successo.`,
        });
      } else {
        await createTrunk(payload);
        toast({
          title: 'Trunk creato',
          description: `Trunk "${payload.name}" creato con successo.`,
        });
      }

      setDialogOpen(false);
      fetchTrunks();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Errore nel salvataggio';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingTrunk) return;
    try {
      await deleteTrunk(deletingTrunk.id);
      toast({
        title: 'Trunk eliminato',
        description: `Trunk "${deletingTrunk.name}" eliminato.`,
      });
      setDeleteDialogOpen(false);
      setDeletingTrunk(null);
      fetchTrunks();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Errore nella cancellazione';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    }
  }

  async function handleTestConnection(trunkId: number) {
    setTesting(trunkId);
    try {
      const result = await testTrunk(trunkId);
      if (result.success) {
        toast({
          title: 'Connessione riuscita',
          description: result.message + (result.latency ? ` (${result.latency}ms)` : ''),
        });
      } else {
        toast({
          title: 'Connessione fallita',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Errore nel test';
      toast({ title: 'Test fallito', description: msg, variant: 'destructive' });
    } finally {
      setTesting(null);
    }
  }

  async function handleToggleEnabled(trunk: Trunk) {
    try {
      await updateTrunk(trunk.id, { name: trunk.name, type: trunk.type, host: trunk.host, username: trunk.username, secret: '' });
      fetchTrunks();
    } catch {
      // silent
    }
  }

  // ── Status helpers ────────────────────────────────────────────────

  function statusBadge(status?: string) {
    const s = (status || 'unknown').toLowerCase();
    if (s === 'registered') {
      return (
        <Badge className="bg-green-900/50 text-green-400 border-green-800">
          Registrato
        </Badge>
      );
    }
    if (s === 'unregistered') {
      return (
        <Badge className="bg-red-900/50 text-red-400 border-red-800">
          Non registrato
        </Badge>
      );
    }
    if (s === 'rejected') {
      return (
        <Badge className="bg-red-900/50 text-red-400 border-red-800">
          Rifiutato
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-zinc-700 text-zinc-400">
        Sconosciuto
      </Badge>
    );
  }

  function detectProvider(trunk: Trunk): string {
    if (trunk.host?.includes('messagenet')) return 'MessageNet';
    if (trunk.host?.includes('twilio')) return 'Twilio';
    return trunk.host || 'Generico';
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100">Trunk</h2>
          <p className="text-sm text-zinc-400">Gestione dei trunk SIP verso provider</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchTrunks} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Aggiorna
          </Button>
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Aggiungi Trunk
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-zinc-900">
              <TableHead className="text-zinc-400">Nome</TableHead>
              <TableHead className="text-zinc-400">Provider</TableHead>
              <TableHead className="text-zinc-400">Stato</TableHead>
              <TableHead className="text-zinc-400">DID</TableHead>
              <TableHead className="text-zinc-400">Abilitato</TableHead>
              <TableHead className="text-right text-zinc-400">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-zinc-500" />
                </TableCell>
              </TableRow>
            ) : trunks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-zinc-500">
                  Nessun trunk configurato
                </TableCell>
              </TableRow>
            ) : (
              trunks.map((trunk) => (
                <TableRow key={trunk.id} className="border-zinc-800">
                  <TableCell className="font-medium text-zinc-200">{trunk.name}</TableCell>
                  <TableCell className="text-zinc-400">{detectProvider(trunk)}</TableCell>
                  <TableCell>{statusBadge(trunk.status)}</TableCell>
                  <TableCell className="text-zinc-300">{trunk.outboundCallerId || '-'}</TableCell>
                  <TableCell>
                    <Switch
                      checked={trunk.enabled}
                      onCheckedChange={() => handleToggleEnabled(trunk)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTestConnection(trunk.id)}
                        disabled={testing === trunk.id}
                      >
                        {testing === trunk.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                        ) : (
                          <Plug className="h-4 w-4 text-blue-400" />
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(trunk)}>
                        <Pencil className="h-4 w-4 text-zinc-400" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openDeleteDialog(trunk)}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editMode ? 'Modifica Trunk' : 'Nuovo Trunk'}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {editMode
                ? 'Modifica la configurazione del trunk.'
                : 'Seleziona il provider e configura il trunk SIP.'}
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as ProviderTab)}
            className="mt-2"
          >
            <TabsList className="bg-zinc-800 border border-zinc-700">
              <TabsTrigger
                value="messagenet"
                className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 text-zinc-400"
              >
                MessageNet
              </TabsTrigger>
              <TabsTrigger
                value="twilio"
                className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 text-zinc-400"
              >
                Twilio
              </TabsTrigger>
              <TabsTrigger
                value="generico"
                className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 text-zinc-400"
              >
                Generico
              </TabsTrigger>
            </TabsList>

            {/* ── MessageNet Tab ──────────────────────────────────────── */}
            <TabsContent value="messagenet">
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label className="text-zinc-300">Username (numerico)</Label>
                  <Input
                    value={messageNetForm.username}
                    onChange={(e) =>
                      setMessageNetForm((p) => ({ ...p, username: e.target.value }))
                    }
                    placeholder="05xxxxxxxx"
                    className="bg-zinc-950 border-zinc-700 text-zinc-100"
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-zinc-300">Password</Label>
                  <Input
                    type="password"
                    value={messageNetForm.password}
                    onChange={(e) =>
                      setMessageNetForm((p) => ({ ...p, password: e.target.value }))
                    }
                    placeholder={editMode ? '********' : 'Password'}
                    className="bg-zinc-950 border-zinc-700 text-zinc-100"
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-zinc-300">DID assegnato</Label>
                  <Input
                    value={messageNetForm.did}
                    onChange={(e) =>
                      setMessageNetForm((p) => ({ ...p, did: e.target.value }))
                    }
                    placeholder="+39..."
                    className="bg-zinc-950 border-zinc-700 text-zinc-100"
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-zinc-300">Codec (separati da virgola)</Label>
                  <Input
                    value={messageNetForm.codecs}
                    onChange={(e) =>
                      setMessageNetForm((p) => ({ ...p, codecs: e.target.value }))
                    }
                    placeholder="alaw,g729"
                    className="bg-zinc-950 border-zinc-700 text-zinc-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-zinc-400">Server</Label>
                    <Input
                      value="sip.messagenet.it"
                      disabled
                      className="bg-zinc-950 border-zinc-700 text-zinc-500"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-zinc-400">Porta</Label>
                    <Input
                      value="5060"
                      disabled
                      className="bg-zinc-950 border-zinc-700 text-zinc-500"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Twilio Tab ──────────────────────────────────────────── */}
            <TabsContent value="twilio">
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label className="text-zinc-300">Account SID</Label>
                  <Input
                    value={twilioForm.accountSid}
                    onChange={(e) =>
                      setTwilioForm((p) => ({ ...p, accountSid: e.target.value }))
                    }
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="bg-zinc-950 border-zinc-700 text-zinc-100 font-mono text-sm"
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-zinc-300">Auth Token</Label>
                  <Input
                    type="password"
                    value={twilioForm.authToken}
                    onChange={(e) =>
                      setTwilioForm((p) => ({ ...p, authToken: e.target.value }))
                    }
                    placeholder={editMode ? '********' : 'Auth Token'}
                    className="bg-zinc-950 border-zinc-700 text-zinc-100"
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-zinc-300">Trunk SID</Label>
                  <Input
                    value={twilioForm.trunkSid}
                    onChange={(e) =>
                      setTwilioForm((p) => ({ ...p, trunkSid: e.target.value }))
                    }
                    placeholder="TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="bg-zinc-950 border-zinc-700 text-zinc-100 font-mono text-sm"
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-zinc-300">Numero acquistato</Label>
                  <Input
                    value={twilioForm.number}
                    onChange={(e) =>
                      setTwilioForm((p) => ({ ...p, number: e.target.value }))
                    }
                    placeholder="+1..."
                    className="bg-zinc-950 border-zinc-700 text-zinc-100"
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-zinc-300">Regione</Label>
                  <Select
                    value={twilioForm.region}
                    onValueChange={(v) =>
                      setTwilioForm((p) => ({ ...p, region: v }))
                    }
                  >
                    <SelectTrigger className="bg-zinc-950 border-zinc-700 text-zinc-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      <SelectItem value="ie1">Ireland (ie1)</SelectItem>
                      <SelectItem value="us1">US East (us1)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {twilioForm.trunkSid && (
                  <div className="grid gap-2">
                    <Label className="text-zinc-400">SIP Domain (auto)</Label>
                    <Input
                      value={
                        twilioForm.region === 'us1'
                          ? `${twilioForm.trunkSid}.pstn.us1.twilio.com`
                          : `${twilioForm.trunkSid}.pstn.twilio.com`
                      }
                      disabled
                      className="bg-zinc-950 border-zinc-700 text-zinc-500 font-mono text-sm"
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Generico Tab ────────────────────────────────────────── */}
            <TabsContent value="generico">
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label className="text-zinc-300">Nome provider</Label>
                  <Input
                    value={genericoForm.providerName}
                    onChange={(e) =>
                      setGenericoForm((p) => ({ ...p, providerName: e.target.value }))
                    }
                    placeholder="Il mio provider"
                    className="bg-zinc-950 border-zinc-700 text-zinc-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-zinc-300">SIP Server</Label>
                    <Input
                      value={genericoForm.sipServer}
                      onChange={(e) =>
                        setGenericoForm((p) => ({ ...p, sipServer: e.target.value }))
                      }
                      placeholder="sip.provider.com"
                      className="bg-zinc-950 border-zinc-700 text-zinc-100"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-zinc-300">
                      SIP Proxy <span className="text-zinc-500">(opzionale)</span>
                    </Label>
                    <Input
                      value={genericoForm.sipProxy}
                      onChange={(e) =>
                        setGenericoForm((p) => ({ ...p, sipProxy: e.target.value }))
                      }
                      placeholder="proxy.provider.com"
                      className="bg-zinc-950 border-zinc-700 text-zinc-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-zinc-300">Username</Label>
                    <Input
                      value={genericoForm.username}
                      onChange={(e) =>
                        setGenericoForm((p) => ({ ...p, username: e.target.value }))
                      }
                      placeholder="username"
                      className="bg-zinc-950 border-zinc-700 text-zinc-100"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-zinc-300">Password</Label>
                    <Input
                      type="password"
                      value={genericoForm.password}
                      onChange={(e) =>
                        setGenericoForm((p) => ({ ...p, password: e.target.value }))
                      }
                      placeholder={editMode ? '********' : 'Password'}
                      className="bg-zinc-950 border-zinc-700 text-zinc-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-zinc-300">Realm</Label>
                    <Input
                      value={genericoForm.realm}
                      onChange={(e) =>
                        setGenericoForm((p) => ({ ...p, realm: e.target.value }))
                      }
                      placeholder="provider.com"
                      className="bg-zinc-950 border-zinc-700 text-zinc-100"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-zinc-300">Numero DID</Label>
                    <Input
                      value={genericoForm.did}
                      onChange={(e) =>
                        setGenericoForm((p) => ({ ...p, did: e.target.value }))
                      }
                      placeholder="+39..."
                      className="bg-zinc-950 border-zinc-700 text-zinc-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-zinc-300">Prefisso uscita</Label>
                    <Input
                      value={genericoForm.outboundPrefix}
                      onChange={(e) =>
                        setGenericoForm((p) => ({ ...p, outboundPrefix: e.target.value }))
                      }
                      placeholder="0"
                      className="bg-zinc-950 border-zinc-700 text-zinc-100"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-zinc-300">Codec preferiti</Label>
                    <Input
                      value={genericoForm.codecs}
                      onChange={(e) =>
                        setGenericoForm((p) => ({ ...p, codecs: e.target.value }))
                      }
                      placeholder="ulaw,alaw,g729"
                      className="bg-zinc-950 border-zinc-700 text-zinc-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-zinc-300">DTMF Mode</Label>
                    <Select
                      value={genericoForm.dtmfMode}
                      onValueChange={(v) =>
                        setGenericoForm((p) => ({ ...p, dtmfMode: v }))
                      }
                    >
                      <SelectTrigger className="bg-zinc-950 border-zinc-700 text-zinc-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="rfc2833">RFC2833</SelectItem>
                        <SelectItem value="inband">Inband</SelectItem>
                        <SelectItem value="info">INFO</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-zinc-300">NAT Traversal</Label>
                    <Select
                      value={genericoForm.nat}
                      onValueChange={(v) =>
                        setGenericoForm((p) => ({ ...p, nat: v }))
                      }
                    >
                      <SelectTrigger className="bg-zinc-950 border-zinc-700 text-zinc-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="force_rport">Force rport</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-zinc-300">Trasporto</Label>
                    <Select
                      value={genericoForm.transport}
                      onValueChange={(v) =>
                        setGenericoForm((p) => ({ ...p, transport: v }))
                      }
                    >
                      <SelectTrigger className="bg-zinc-950 border-zinc-700 text-zinc-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="udp">UDP</SelectItem>
                        <SelectItem value="tcp">TCP</SelectItem>
                        <SelectItem value="tls">TLS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-zinc-300">Registrazione</Label>
                  <Switch
                    checked={genericoForm.register}
                    onCheckedChange={(v) =>
                      setGenericoForm((p) => ({ ...p, register: v }))
                    }
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2 sm:gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-zinc-700 text-zinc-300"
            >
              Annulla
            </Button>
            {editMode && editingId !== null && (
              <Button
                variant="outline"
                onClick={() => handleTestConnection(editingId)}
                disabled={testing === editingId}
                className="border-blue-800 text-blue-400 hover:bg-blue-900/30"
              >
                {testing === editingId ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plug className="mr-2 h-4 w-4" />
                )}
                Testa Connessione
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conferma Eliminazione</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Sei sicuro di voler eliminare il trunk{' '}
              <span className="font-semibold text-zinc-200">{deletingTrunk?.name}</span>?
              Questa azione non può essere annullata.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="border-zinc-700 text-zinc-300"
            >
              Annulla
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
