import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Download,
  Upload,
  Phone,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  getPhonebook,
  createContact,
  updateContact,
  deleteContact,
  exportPhonebook,
  importPhonebook,
  type PhonebookContact,
  type CreateContactData,
} from '@/lib/api';

// ── Form data type ──────────────────────────────────────────────────

interface ContactFormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  company: string;
  notes: string;
}

const emptyForm: ContactFormData = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  company: '',
  notes: '',
};

// ── Props ───────────────────────────────────────────────────────────

interface PhonebookProps {
  onClickToCall?: (number: string) => void;
}

// ── Component ───────────────────────────────────────────────────────

export default function Phonebook({ onClickToCall }: PhonebookProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contacts, setContacts] = useState<PhonebookContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ContactFormData>(emptyForm);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingContact, setDeletingContact] = useState<PhonebookContact | null>(null);

  // ── Debounce search ───────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Data fetching ─────────────────────────────────────────────────

  const fetchContacts = useCallback(
    async (pageNum: number, pageLimit: number, search: string) => {
      setLoading(true);
      try {
        const result = await getPhonebook({
          page: pageNum,
          limit: pageLimit,
          search: search || undefined,
        });
        setContacts(result.contacts);
        setTotal(result.total);
        setTotalPages(result.pages);
        setPage(result.page);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : (err as { message?: string })?.message || 'Errore nel caricamento';
        toast({ title: 'Errore', description: msg, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    fetchContacts(1, limit, debouncedSearch);
  }, [debouncedSearch, limit, fetchContacts]);

  // ── Form helpers ──────────────────────────────────────────────────

  function updateField<K extends keyof ContactFormData>(key: K, value: ContactFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openAddDialog() {
    setForm(emptyForm);
    setEditMode(false);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEditDialog(contact: PhonebookContact) {
    setForm({
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      phone: contact.phone || '',
      email: contact.email || '',
      company: contact.company || '',
      notes: contact.notes || '',
    });
    setEditMode(true);
    setEditingId(contact.id);
    setDialogOpen(true);
  }

  function openDeleteDialog(contact: PhonebookContact) {
    setDeletingContact(contact);
    setDeleteDialogOpen(true);
  }

  // ── CRUD actions ──────────────────────────────────────────────────

  async function handleSave() {
    if (!form.firstName || !form.phone) {
      toast({
        title: 'Errore',
        description: 'Nome e numero di telefono sono obbligatori.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const payload: CreateContactData = {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        email: form.email || undefined,
        company: form.company || undefined,
        notes: form.notes || undefined,
      };

      if (editMode && editingId !== null) {
        await updateContact(editingId, payload);
        toast({
          title: 'Contatto aggiornato',
          description: `${form.firstName} ${form.lastName} aggiornato con successo.`,
        });
      } else {
        await createContact(payload);
        toast({
          title: 'Contatto creato',
          description: `${form.firstName} ${form.lastName} creato con successo.`,
        });
      }

      setDialogOpen(false);
      fetchContacts(page, limit, debouncedSearch);
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
    if (!deletingContact) return;
    try {
      await deleteContact(deletingContact.id);
      toast({
        title: 'Contatto eliminato',
        description: `${deletingContact.firstName} ${deletingContact.lastName} eliminato.`,
      });
      setDeleteDialogOpen(false);
      setDeletingContact(null);
      fetchContacts(page, limit, debouncedSearch);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Errore nella cancellazione';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    }
  }

  // ── Import / Export ───────────────────────────────────────────────

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const result = await importPhonebook(file);
      toast({
        title: 'Importazione completata',
        description: `${result.imported} contatti importati.${
          result.errors.length > 0 ? ` ${result.errors.length} errori.` : ''
        }`,
      });
      fetchContacts(1, limit, debouncedSearch);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Errore nell\'importazione';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    } finally {
      setImporting(false);
      // Reset file input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleExportCSV() {
    setExporting(true);
    try {
      const blob = await exportPhonebook();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rubrica.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Errore nell\'esportazione';
      toast({ title: 'Errore', description: msg, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }

  // ── Pagination ────────────────────────────────────────────────────

  function handlePageChange(newPage: number) {
    if (newPage < 1 || newPage > totalPages) return;
    fetchContacts(newPage, limit, debouncedSearch);
  }

  function handleLimitChange(newLimit: string) {
    const l = parseInt(newLimit, 10);
    setLimit(l);
    setPage(1);
    fetchContacts(1, l, debouncedSearch);
  }

  function generatePageNumbers(current: number, totalPg: number): (number | string)[] {
    if (totalPg <= 7) {
      return Array.from({ length: totalPg }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [1];
    if (current > 3) pages.push('...');
    const start = Math.max(2, current - 1);
    const end = Math.min(totalPg - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < totalPg - 2) pages.push('...');
    if (totalPg > 1) pages.push(totalPg);
    return pages;
  }

  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100">Rubrica</h2>
          <p className="text-sm text-zinc-400">Gestione dei contatti</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Hidden file input for CSV import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImportCSV}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Importa CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={exporting || total === 0}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Esporta CSV
          </Button>
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Aggiungi Contatto
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <Input
          placeholder="Cerca per nome, numero, azienda..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-zinc-900">
              <TableHead className="text-zinc-400">Nome</TableHead>
              <TableHead className="text-zinc-400">Numero</TableHead>
              <TableHead className="text-zinc-400">Email</TableHead>
              <TableHead className="text-zinc-400">Azienda</TableHead>
              <TableHead className="text-zinc-400">Note</TableHead>
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
            ) : contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <BookOpen className="mb-3 h-12 w-12 text-zinc-700" />
                    <p className="text-sm font-medium text-zinc-500">
                      {debouncedSearch
                        ? 'Nessun contatto trovato'
                        : 'Nessun contatto in rubrica'}
                    </p>
                    {debouncedSearch && (
                      <p className="mt-1 text-xs text-zinc-600">
                        Prova a modificare la ricerca
                      </p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <TableRow key={contact.id} className="border-zinc-800">
                  <TableCell className="font-medium text-zinc-200">
                    {contact.firstName} {contact.lastName}
                  </TableCell>
                  <TableCell>
                    {onClickToCall ? (
                      <button
                        onClick={() => onClickToCall(contact.phone)}
                        className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors text-sm"
                        title="Clicca per chiamare"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {contact.phone}
                      </button>
                    ) : (
                      <span className="text-zinc-300">{contact.phone}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-400">{contact.email || '-'}</TableCell>
                  <TableCell className="text-zinc-400">{contact.company || '-'}</TableCell>
                  <TableCell className="text-zinc-500 text-xs max-w-[200px] truncate">
                    {contact.notes || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(contact)}>
                        <Pencil className="h-4 w-4 text-zinc-400" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openDeleteDialog(contact)}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3 sm:flex-row">
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
              <span className="text-xs text-zinc-500">
                {startItem}-{endItem} di {total}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                onClick={() => handlePageChange(1)}
                disabled={page <= 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              {generatePageNumbers(page, totalPages).map((p, idx) =>
                p === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-xs text-zinc-600">
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
                className="h-8 w-8 p-0 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                onClick={() => handlePageChange(totalPages)}
                disabled={page >= totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editMode ? 'Modifica Contatto' : 'Nuovo Contatto'}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {editMode
                ? 'Modifica le informazioni del contatto.'
                : 'Inserisci le informazioni del nuovo contatto.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="firstName" className="text-zinc-300">
                  Nome
                </Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => updateField('firstName', e.target.value)}
                  placeholder="Mario"
                  className="bg-zinc-950 border-zinc-700 text-zinc-100"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName" className="text-zinc-300">
                  Cognome
                </Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => updateField('lastName', e.target.value)}
                  placeholder="Rossi"
                  className="bg-zinc-950 border-zinc-700 text-zinc-100"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phone" className="text-zinc-300">
                Numero
              </Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="+39 02 1234567"
                className="bg-zinc-950 border-zinc-700 text-zinc-100"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email" className="text-zinc-300">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="mario@esempio.it"
                className="bg-zinc-950 border-zinc-700 text-zinc-100"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="company" className="text-zinc-300">
                Azienda
              </Label>
              <Input
                id="company"
                value={form.company}
                onChange={(e) => updateField('company', e.target.value)}
                placeholder="Azienda S.r.l."
                className="bg-zinc-950 border-zinc-700 text-zinc-100"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes" className="text-zinc-300">
                Note
              </Label>
              <Input
                id="notes"
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Note aggiuntive..."
                className="bg-zinc-950 border-zinc-700 text-zinc-100"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-zinc-700 text-zinc-300"
            >
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
              Sei sicuro di voler eliminare il contatto{' '}
              <span className="font-semibold text-zinc-200">
                {deletingContact?.firstName} {deletingContact?.lastName}
              </span>
              ? Questa azione non può essere annullata.
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
