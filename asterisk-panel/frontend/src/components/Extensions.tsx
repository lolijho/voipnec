import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  RefreshCw,
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
import { useToast } from '@/components/ui/use-toast';
import {
  getExtensions,
  createExtension,
  updateExtension,
  deleteExtension,
  type Extension,
  type CreateExtensionData,
  type ExtensionStatus,
} from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────

interface ExtensionFormData {
  exten: string;
  name: string;
  secret: string;
  context: string;
  transport: string;
  codecs: string;
  mailbox: string;
  enabled: boolean;
}

const emptyForm: ExtensionFormData = {
  exten: '',
  name: '',
  secret: '',
  context: 'from-internal',
  transport: 'udp',
  codecs: 'ulaw,alaw,g729',
  mailbox: '',
  enabled: true,
};

// ── Props ────────────────────────────────────────────────────────────

interface ExtensionsProps {
  extensionStatuses?: Record<string, ExtensionStatus>;
}

// ── Component ────────────────────────────────────────────────────────

export default function Extensions({ extensionStatuses = {} }: ExtensionsProps) {
  const { toast } = useToast();

  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ExtensionFormData>(emptyForm);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingExt, setDeletingExt] = useState<Extension | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────

  const fetchExtensions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getExtensions();
      setExtensions(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Errore nel caricamento';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchExtensions();
  }, [fetchExtensions]);

  // ── Form helpers ───────────────────────────────────────────────────

  function updateField<K extends keyof ExtensionFormData>(key: K, value: ExtensionFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openAddDialog() {
    setForm(emptyForm);
    setEditMode(false);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEditDialog(ext: Extension) {
    setForm({
      exten: ext.exten,
      name: ext.name,
      secret: '',
      context: ext.context,
      transport: ext.transport || 'udp',
      codecs: (ext.codecs || []).join(','),
      mailbox: ext.mailbox || '',
      enabled: ext.enabled,
    });
    setEditMode(true);
    setEditingId(ext.id);
    setDialogOpen(true);
  }

  function openDeleteDialog(ext: Extension) {
    setDeletingExt(ext);
    setDeleteDialogOpen(true);
  }

  // ── CRUD actions ───────────────────────────────────────────────────

  async function handleSave() {
    if (!form.exten || !form.name) {
      toast({ title: 'Errore', description: 'Numero interno e nome sono obbligatori.', variant: 'destructive' });
      return;
    }
    if (!editMode && !form.secret) {
      toast({ title: 'Errore', description: 'La password SIP è obbligatoria per un nuovo interno.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload: CreateExtensionData & { enabled?: boolean } = {
        exten: form.exten,
        name: form.name,
        secret: form.secret,
        context: form.context,
        transport: form.transport,
        codecs: form.codecs.split(',').map((c) => c.trim()).filter(Boolean),
        mailbox: form.mailbox || undefined,
      };

      if (editMode && editingId !== null) {
        const updatePayload: Record<string, unknown> = { ...payload };
        if (!form.secret) {
          delete updatePayload.secret;
        }
        updatePayload.enabled = form.enabled;
        await updateExtension(editingId, updatePayload);
        toast({ title: 'Interno aggiornato', description: `Interno ${form.exten} aggiornato con successo.` });
      } else {
        await createExtension(payload);
        toast({ title: 'Interno creato', description: `Interno ${form.exten} creato con successo.` });
      }

      setDialogOpen(false);
      fetchExtensions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Errore nel salvataggio';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingExt) return;
    try {
      await deleteExtension(deletingExt.id);
      toast({ title: 'Interno eliminato', description: `Interno ${deletingExt.exten} eliminato.` });
      setDeleteDialogOpen(false);
      setDeletingExt(null);
      fetchExtensions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Errore nella cancellazione';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    }
  }

  // ── Status helpers ─────────────────────────────────────────────────

  function getStatusForExten(exten: string): ExtensionStatus['status'] {
    return extensionStatuses[exten]?.status || 'offline';
  }

  function statusDot(status: ExtensionStatus['status']) {
    switch (status) {
      case 'online':
        return <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />;
      case 'ringing':
        return <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-500 animate-pulse" />;
      case 'busy':
        return <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />;
      case 'unavailable':
        return <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" />;
      default:
        return <span className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-500" />;
    }
  }

  function statusLabel(status: ExtensionStatus['status']) {
    switch (status) {
      case 'online': return 'Online';
      case 'ringing': return 'Squilla';
      case 'busy': return 'Occupato';
      case 'unavailable': return 'Non disponibile';
      default: return 'Offline';
    }
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100">Interni</h2>
          <p className="text-sm text-zinc-400">Gestione degli interni SIP</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchExtensions} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Aggiorna
          </Button>
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Aggiungi Interno
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-zinc-900">
              <TableHead className="text-zinc-400">Interno</TableHead>
              <TableHead className="text-zinc-400">Nome</TableHead>
              <TableHead className="text-zinc-400">Contesto</TableHead>
              <TableHead className="text-zinc-400">Trasporto</TableHead>
              <TableHead className="text-zinc-400">Codec</TableHead>
              <TableHead className="text-zinc-400">Stato</TableHead>
              <TableHead className="text-zinc-400">Abilitato</TableHead>
              <TableHead className="text-right text-zinc-400">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-zinc-500" />
                </TableCell>
              </TableRow>
            ) : extensions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-zinc-500">
                  Nessun interno configurato
                </TableCell>
              </TableRow>
            ) : (
              extensions.map((ext) => {
                const status = getStatusForExten(ext.exten);
                return (
                  <TableRow key={ext.id} className="border-zinc-800">
                    <TableCell className="font-medium text-zinc-200">{ext.exten}</TableCell>
                    <TableCell className="text-zinc-300">{ext.name}</TableCell>
                    <TableCell className="text-zinc-400">{ext.context}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-300 uppercase text-xs">
                        {ext.transport || 'udp'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-400 text-xs">
                      {(ext.codecs || []).join(', ')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {statusDot(status)}
                        <span className="text-sm text-zinc-300">{statusLabel(status)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={ext.enabled ? 'default' : 'secondary'}
                        className={ext.enabled ? 'bg-green-600 text-white' : 'bg-zinc-700 text-zinc-400'}
                      >
                        {ext.enabled ? 'Si' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(ext)}>
                          <Pencil className="h-4 w-4 text-zinc-400" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openDeleteDialog(ext)}>
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editMode ? 'Modifica Interno' : 'Nuovo Interno'}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {editMode
                ? 'Modifica le impostazioni dell\'interno SIP.'
                : 'Configura un nuovo interno SIP.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Numero interno */}
            <div className="grid gap-2">
              <Label htmlFor="exten" className="text-zinc-300">Numero interno</Label>
              <Input
                id="exten"
                value={form.exten}
                onChange={(e) => updateField('exten', e.target.value)}
                placeholder="1001"
                disabled={editMode}
                className="bg-zinc-950 border-zinc-700 text-zinc-100"
              />
            </div>

            {/* Nome */}
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-zinc-300">Nome</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Mario Rossi"
                className="bg-zinc-950 border-zinc-700 text-zinc-100"
              />
            </div>

            {/* Password SIP */}
            <div className="grid gap-2">
              <Label htmlFor="secret" className="text-zinc-300">
                Password SIP {editMode && <span className="text-zinc-500">(lascia vuoto per non cambiare)</span>}
              </Label>
              <Input
                id="secret"
                type="password"
                value={form.secret}
                onChange={(e) => updateField('secret', e.target.value)}
                placeholder={editMode ? '********' : 'Password SIP'}
                className="bg-zinc-950 border-zinc-700 text-zinc-100"
              />
            </div>

            {/* Contesto */}
            <div className="grid gap-2">
              <Label htmlFor="context" className="text-zinc-300">Contesto</Label>
              <Input
                id="context"
                value={form.context}
                onChange={(e) => updateField('context', e.target.value)}
                placeholder="from-internal"
                className="bg-zinc-950 border-zinc-700 text-zinc-100"
              />
            </div>

            {/* Trasporto */}
            <div className="grid gap-2">
              <Label className="text-zinc-300">Trasporto</Label>
              <Select value={form.transport} onValueChange={(v) => updateField('transport', v)}>
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

            {/* Codec */}
            <div className="grid gap-2">
              <Label htmlFor="codecs" className="text-zinc-300">Codec (separati da virgola)</Label>
              <Input
                id="codecs"
                value={form.codecs}
                onChange={(e) => updateField('codecs', e.target.value)}
                placeholder="ulaw,alaw,g729"
                className="bg-zinc-950 border-zinc-700 text-zinc-100"
              />
            </div>

            {/* Mailbox */}
            <div className="grid gap-2">
              <Label htmlFor="mailbox" className="text-zinc-300">Mailbox</Label>
              <Input
                id="mailbox"
                value={form.mailbox}
                onChange={(e) => updateField('mailbox', e.target.value)}
                placeholder="1001@default"
                className="bg-zinc-950 border-zinc-700 text-zinc-100"
              />
            </div>

            {/* Abilitato */}
            {editMode && (
              <div className="flex items-center justify-between">
                <Label className="text-zinc-300">Abilitato</Label>
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(v) => updateField('enabled', v)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700 text-zinc-300">
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editMode ? 'Aggiorna' : 'Crea'}
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
              Sei sicuro di voler eliminare l&apos;interno{' '}
              <span className="font-semibold text-zinc-200">{deletingExt?.exten}</span> ({deletingExt?.name})?
              Questa azione non può essere annullata.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="border-zinc-700 text-zinc-300">
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
