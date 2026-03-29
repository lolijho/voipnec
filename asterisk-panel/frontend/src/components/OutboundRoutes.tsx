import { useState, useEffect, useCallback } from 'react';
import { PhoneOutgoing, Plus, Trash2, Pencil, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { apiRequest, getTrunks, type Trunk } from '@/lib/api';

interface OutboundRoute {
  id: string;
  name: string;
  pattern: string;
  trunk_name: string;
  priority: number;
  strip_digits: number;
  prepend: string;
  callerid: string;
  enabled: number | boolean;
}

export default function OutboundRoutes() {
  const { toast } = useToast();
  const [routes, setRoutes] = useState<OutboundRoute[]>([]);
  const [trunks, setTrunks] = useState<Trunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  const [form, setForm] = useState({
    name: '',
    pattern: '_X.',
    trunk_name: '',
    priority: 10,
    strip_digits: 0,
    prepend: '',
    callerid: '',
  });

  const fetchRoutes = useCallback(async () => {
    try {
      const res = await apiRequest<{ routes: OutboundRoute[] }>('GET', '/api/outbound');
      setRoutes(res.routes || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrunks = useCallback(async () => {
    try {
      const t = await getTrunks();
      setTrunks(t);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchRoutes();
    fetchTrunks();
  }, [fetchRoutes, fetchTrunks]);

  function resetForm() {
    setForm({ name: '', pattern: '_X.', trunk_name: '', priority: 10, strip_digits: 0, prepend: '', callerid: '' });
    setEditMode(false);
    setEditingId(null);
  }

  function openEditDialog(route: OutboundRoute) {
    setForm({
      name: route.name,
      pattern: route.pattern,
      trunk_name: route.trunk_name,
      priority: route.priority,
      strip_digits: route.strip_digits,
      prepend: route.prepend,
      callerid: route.callerid,
    });
    setEditMode(true);
    setEditingId(route.id);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.pattern || !form.trunk_name) {
      toast({ title: 'Errore', description: 'Pattern e trunk sono obbligatori', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editMode && editingId) {
        await apiRequest('PUT', `/api/outbound/${editingId}`, form);
        toast({ title: 'Route aggiornata' });
      } else {
        await apiRequest('POST', '/api/outbound', form);
        toast({ title: 'Route creata' });
      }
      setDialogOpen(false);
      resetForm();
      fetchRoutes();
    } catch (err) {
      toast({ title: 'Errore', description: err instanceof Error ? err.message : 'Errore', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiRequest('DELETE', `/api/outbound/${id}`);
      toast({ title: 'Route eliminata' });
      fetchRoutes();
    } catch (err) {
      toast({ title: 'Errore', description: err instanceof Error ? err.message : 'Errore', variant: 'destructive' });
    }
  }

  async function handleApply() {
    setApplying(true);
    try {
      await apiRequest('POST', '/api/outbound/apply');
      toast({ title: 'Route applicate', description: 'Dialplan uscita aggiornato su Asterisk' });
    } catch (err) {
      toast({ title: 'Errore', description: err instanceof Error ? err.message : 'Errore', variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <PhoneOutgoing className="h-6 w-6 text-violet-400" />
            Instradamento in Uscita
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Configura quale trunk usare per le chiamate in uscita in base al pattern
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleApply} disabled={applying} className="border-zinc-700">
            {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Applica su Asterisk
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-violet-600 hover:bg-violet-500">
            <Plus className="mr-2 h-4 w-4" />
            Nuova Route
          </Button>
        </div>
      </div>

      {/* Guida Twilio */}
      <Card className="bg-zinc-900/50 border-blue-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-blue-400">Guida: Collegare Twilio</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400 space-y-1.5">
          <p><strong className="text-zinc-300">1.</strong> Crea un account su <span className="text-blue-400">twilio.com</span> e acquista un numero di telefono</p>
          <p><strong className="text-zinc-300">2.</strong> Vai su <span className="text-blue-400">Elastic SIP Trunking &rarr; Trunks &rarr; Create</span></p>
          <p><strong className="text-zinc-300">3.</strong> In <strong>Origination</strong>, aggiungi URI: <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">sip:IP_ASTERISK:5060</code></p>
          <p><strong className="text-zinc-300">4.</strong> In <strong>Termination</strong>, crea un dominio SIP (es: <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">miodominio.pstn.twilio.com</code>)</p>
          <p><strong className="text-zinc-300">5.</strong> In <strong>Authentication &rarr; Credential Lists</strong>, crea username e password</p>
          <p><strong className="text-zinc-300">6.</strong> In <strong>Numbers</strong>, associa il tuo numero al trunk</p>
          <p><strong className="text-zinc-300">7.</strong> Nell&apos;app, vai su <strong>Trunk &rarr; Aggiungi Trunk &rarr; Twilio</strong> e inserisci Account SID, Auth Token, Trunk SID</p>
          <p><strong className="text-zinc-300">8.</strong> Crea una <strong>Route in Uscita</strong> (sotto) con pattern e trunk Twilio</p>
          <p><strong className="text-zinc-300">9.</strong> Crea una <strong>Route in Entrata</strong> con il DID Twilio per ricevere chiamate</p>
          <p><strong className="text-zinc-300">10.</strong> Clicca <strong>Applica su Asterisk</strong> su entrambe le pagine</p>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-400">Route in uscita</CardTitle>
          <CardDescription>
            Le chiamate vengono instradate al trunk in base al pattern del numero chiamato
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            </div>
          ) : routes.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <PhoneOutgoing className="mx-auto h-10 w-10 mb-3 text-zinc-700" />
              <p>Nessuna route in uscita configurata</p>
              <p className="text-xs mt-1">Esempio: pattern <code className="bg-zinc-800 px-1 rounded">_0.</code> &rarr; trunk MessageNet (strip 1 cifra)</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead>Nome</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Trunk</TableHead>
                  <TableHead>Priorità</TableHead>
                  <TableHead>Strip</TableHead>
                  <TableHead>Prepend</TableHead>
                  <TableHead>CallerID</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((route) => (
                  <TableRow key={route.id} className="border-zinc-800">
                    <TableCell className="text-zinc-200">{route.name}</TableCell>
                    <TableCell className="font-mono text-zinc-300">{route.pattern}</TableCell>
                    <TableCell className="text-zinc-300">{route.trunk_name}</TableCell>
                    <TableCell className="text-zinc-500">{route.priority}</TableCell>
                    <TableCell className="text-zinc-500">{route.strip_digits || '-'}</TableCell>
                    <TableCell className="font-mono text-zinc-500">{route.prepend || '-'}</TableCell>
                    <TableCell className="text-zinc-500">{route.callerid || 'Default'}</TableCell>
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
            <DialogTitle>{editMode ? 'Modifica Route' : 'Nuova Route in Uscita'}</DialogTitle>
            <DialogDescription>Configura il trunk per questo pattern di numerazione</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="es: Nazionali via Twilio" className="bg-zinc-800 border-zinc-700 mt-1" />
              </div>
              <div>
                <Label>Pattern</Label>
                <Input value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder="_0. o _X." className="bg-zinc-800 border-zinc-700 mt-1" />
                <p className="text-xs text-zinc-500 mt-1">_0. = con 0, _X. = tutti</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Trunk</Label>
                <Select value={form.trunk_name} onValueChange={(v) => setForm({ ...form, trunk_name: v })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 mt-1"><SelectValue placeholder="Seleziona trunk" /></SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {trunks.map((t) => (
                      <SelectItem key={t.name || String(t.id)} value={t.name}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priorità</Label>
                <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 10 })} className="bg-zinc-800 border-zinc-700 mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Strip cifre</Label>
                <Input type="number" value={form.strip_digits} onChange={(e) => setForm({ ...form, strip_digits: parseInt(e.target.value) || 0 })} className="bg-zinc-800 border-zinc-700 mt-1" />
                <p className="text-xs text-zinc-500 mt-1">Rimuove N cifre</p>
              </div>
              <div>
                <Label>Prepend</Label>
                <Input value={form.prepend} onChange={(e) => setForm({ ...form, prepend: e.target.value })} placeholder="+39" className="bg-zinc-800 border-zinc-700 mt-1" />
              </div>
              <div>
                <Label>CallerID</Label>
                <Input value={form.callerid} onChange={(e) => setForm({ ...form, callerid: e.target.value })} placeholder="Default" className="bg-zinc-800 border-zinc-700 mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700">Annulla</Button>
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
