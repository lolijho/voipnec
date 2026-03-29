import { useState, useEffect, useCallback } from 'react';
import { Phone, Plus, Trash2, Pencil, Loader2, ArrowDownToLine, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { apiRequest } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────

interface InboundRoute {
  id: string;
  did: string;
  trunk_name: string;
  destination_type: string;
  destination: string;
  priority: number;
  description: string;
  enabled: number | boolean;
}

// ── Component ─────────────────────────────────────────────────────────

export default function InboundRoutes() {
  const { toast } = useToast();
  const [routes, setRoutes] = useState<InboundRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  const [form, setForm] = useState({
    did: '',
    trunk_name: '',
    destination_type: 'extension',
    destination: '',
    priority: 10,
    description: '',
  });

  const fetchRoutes = useCallback(async () => {
    try {
      const res = await apiRequest<{ routes: InboundRoute[] }>('GET', '/api/inbound');
      setRoutes(res.routes || []);
    } catch (err) {
      console.error('Failed to fetch inbound routes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  function resetForm() {
    setForm({ did: '', trunk_name: '', destination_type: 'extension', destination: '', priority: 10, description: '' });
    setEditMode(false);
    setEditingId(null);
  }

  function openAddDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(route: InboundRoute) {
    setForm({
      did: route.did,
      trunk_name: route.trunk_name,
      destination_type: route.destination_type,
      destination: route.destination,
      priority: route.priority,
      description: route.description,
    });
    setEditMode(true);
    setEditingId(route.id);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.did || !form.destination) {
      toast({ title: 'Errore', description: 'DID e destinazione sono obbligatori', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (editMode && editingId) {
        await apiRequest('PUT', `/api/inbound/${editingId}`, form);
        toast({ title: 'Route aggiornata', description: `DID ${form.did} → ${form.destination}` });
      } else {
        await apiRequest('POST', '/api/inbound', form);
        toast({ title: 'Route creata', description: `DID ${form.did} → ${form.destination}` });
      }
      setDialogOpen(false);
      resetForm();
      fetchRoutes();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiRequest('DELETE', `/api/inbound/${id}`);
      toast({ title: 'Route eliminata' });
      fetchRoutes();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    }
  }

  async function handleApply() {
    setApplying(true);
    try {
      await apiRequest('POST', '/api/inbound/apply');
      toast({ title: 'Route applicate', description: 'Dialplan aggiornato su Asterisk' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  }

  const destTypeLabels: Record<string, string> = {
    extension: 'Interno',
    ring_group: 'Gruppo',
    queue: 'Coda',
    voicemail: 'Segreteria',
    ivr: 'IVR',
  };

  const destTypeColors: Record<string, string> = {
    extension: 'text-green-400 border-green-800',
    ring_group: 'text-blue-400 border-blue-800',
    queue: 'text-yellow-400 border-yellow-800',
    voicemail: 'text-purple-400 border-purple-800',
    ivr: 'text-cyan-400 border-cyan-800',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <ArrowDownToLine className="h-6 w-6 text-violet-400" />
            Instradamento in Entrata
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Configura dove instradare le chiamate in arrivo per ogni DID/numero
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleApply}
            disabled={applying}
            className="border-zinc-700"
          >
            {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Applica su Asterisk
          </Button>
          <Button size="sm" onClick={openAddDialog} className="bg-violet-600 hover:bg-violet-500">
            <Plus className="mr-2 h-4 w-4" />
            Nuova Route
          </Button>
        </div>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-400">Route in entrata</CardTitle>
          <CardDescription>
            Ogni chiamata in arrivo viene instradata in base al DID (numero chiamato)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            </div>
          ) : routes.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <Phone className="mx-auto h-10 w-10 mb-3 text-zinc-700" />
              <p>Nessuna route configurata</p>
              <p className="text-xs mt-1">Crea una route per instradare le chiamate in arrivo</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead>DID</TableHead>
                  <TableHead>Trunk</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Destinazione</TableHead>
                  <TableHead>Priorità</TableHead>
                  <TableHead>Descrizione</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((route) => (
                  <TableRow key={route.id} className="border-zinc-800">
                    <TableCell className="font-mono text-zinc-200">{route.did}</TableCell>
                    <TableCell className="text-zinc-400">{route.trunk_name || 'Tutti'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={destTypeColors[route.destination_type] || 'text-zinc-400 border-zinc-700'}>
                        {destTypeLabels[route.destination_type] || route.destination_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-zinc-200">{route.destination}</TableCell>
                    <TableCell className="text-zinc-500">{route.priority}</TableCell>
                    <TableCell className="text-zinc-400 text-sm">{route.description}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(route)}>
                          <Pencil className="h-4 w-4 text-zinc-400" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(route.id)}>
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Add/Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editMode ? 'Modifica Route' : 'Nuova Route in Entrata'}</DialogTitle>
            <DialogDescription>
              Configura dove instradare le chiamate per questo DID
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>DID (numero chiamato)</Label>
                <Input
                  value={form.did}
                  onChange={(e) => setForm({ ...form, did: e.target.value })}
                  placeholder="_X. (tutti) o 0686356254"
                  className="bg-zinc-800 border-zinc-700 mt-1"
                />
                <p className="text-xs text-zinc-500 mt-1">Usa _X. per tutte le chiamate</p>
              </div>
              <div>
                <Label>Trunk (opzionale)</Label>
                <Input
                  value={form.trunk_name}
                  onChange={(e) => setForm({ ...form, trunk_name: e.target.value })}
                  placeholder="Tutti i trunk"
                  className="bg-zinc-800 border-zinc-700 mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo destinazione</Label>
                <Select value={form.destination_type} onValueChange={(v) => setForm({ ...form, destination_type: v })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="extension">Interno</SelectItem>
                    <SelectItem value="ring_group">Gruppo di squillo</SelectItem>
                    <SelectItem value="queue">Coda</SelectItem>
                    <SelectItem value="voicemail">Segreteria</SelectItem>
                    <SelectItem value="ivr">IVR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Destinazione</Label>
                <Input
                  value={form.destination}
                  onChange={(e) => setForm({ ...form, destination: e.target.value })}
                  placeholder={form.destination_type === 'extension' ? '101' : form.destination_type === 'ring_group' ? '101,102,103' : 'nome'}
                  className="bg-zinc-800 border-zinc-700 mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Priorità</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 10 })}
                  className="bg-zinc-800 border-zinc-700 mt-1"
                />
              </div>
              <div>
                <Label>Descrizione</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="es: Linea principale"
                  className="bg-zinc-800 border-zinc-700 mt-1"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700">
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-500">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
