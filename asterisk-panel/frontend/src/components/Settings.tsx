import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings as SettingsIcon,
  Server,
  User,
  Phone,
  Bell,
  Palette,
  RefreshCw,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { changePassword, reloadTrunks } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────

interface SettingsProps {
  isConnected: boolean;
  asteriskStatus: 'connected' | 'disconnected';
  asteriskVersion?: string;
  asteriskUptime?: number;
  amiHost?: string;
  amiPort?: number;
  ariHost?: string;
  ariPort?: number;
}

interface SoftphoneConfig {
  extension: string;
  sipPassword: string;
  wsUrl: string;
}

interface NotificationPrefs {
  browserCalls: boolean;
  ringtone: boolean;
  ringtoneFile: string;
  toastEvents: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────

const SOFTPHONE_KEY = 'asterisk_panel_softphone';
const NOTIF_KEY = 'asterisk_panel_notifications';

function loadSoftphoneConfig(): SoftphoneConfig {
  try {
    const raw = localStorage.getItem(SOFTPHONE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { extension: '101', sipPassword: 'Maddy210521', wsUrl: '' };
}

function saveSoftphoneConfig(config: SoftphoneConfig): void {
  localStorage.setItem(SOFTPHONE_KEY, JSON.stringify(config));
}

function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {
    browserCalls: true,
    ringtone: true,
    ringtoneFile: 'default',
    toastEvents: true,
  };
}

function saveNotificationPrefs(prefs: NotificationPrefs): void {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(prefs));
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}g`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

// ── Component ─────────────────────────────────────────────────────────

export default function Settings({
  isConnected,
  asteriskStatus,
  asteriskVersion,
  asteriskUptime,
  amiHost: amiHostProp = '127.0.0.1',
  amiPort: amiPortProp = 5038,
  ariHost: ariHostProp = '127.0.0.1',
  ariPort: ariPortProp = 8088,
}: SettingsProps) {
  const { toast } = useToast();

  // ── Fetch real AMI/ARI status from backend ────────────────────────
  const [amiHost, setAmiHost] = useState(amiHostProp);
  const [amiPort, setAmiPort] = useState(amiPortProp);
  const [ariUrl, setAriUrl] = useState(`${ariHostProp}:${ariPortProp}`);
  const [ariConnected, setAriConnected] = useState(false);

  useEffect(() => {
    fetch('/api/asterisk/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.ami) {
          setAmiHost(data.ami.host);
          setAmiPort(data.ami.port);
        }
        if (data.ari) {
          setAriUrl(data.ari.url);
          setAriConnected(data.ari.connected);
        }
      })
      .catch(() => {
        // keep defaults
      });
  }, []);

  // ── Password form ─────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // ── Softphone config ──────────────────────────────────────────────
  const [softphone, setSoftphone] = useState<SoftphoneConfig>(loadSoftphoneConfig);

  // ── Notification prefs ────────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(loadNotificationPrefs);

  // ── System ────────────────────────────────────────────────────────
  const [reloading, setReloading] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword || !newPassword) {
      toast({ title: 'Errore', description: 'Compila tutti i campi', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Errore',
        description: 'Le password non corrispondono',
        variant: 'destructive',
      });
      return;
    }
    if (newPassword.length < 6) {
      toast({
        title: 'Errore',
        description: 'La password deve essere di almeno 6 caratteri',
        variant: 'destructive',
      });
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast({ title: 'Fatto', description: 'Password aggiornata con successo' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Errore durante il cambio password';
      toast({ title: 'Errore', description: message, variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword, toast]);

  const handleSaveSoftphone = useCallback(() => {
    saveSoftphoneConfig(softphone);
    toast({ title: 'Salvato', description: 'Configurazione softphone salvata' });
  }, [softphone, toast]);

  const handleNotifChange = useCallback(
    (key: keyof NotificationPrefs, value: boolean | string) => {
      setNotifPrefs((prev) => {
        const next = { ...prev, [key]: value };
        saveNotificationPrefs(next);
        return next;
      });
    },
    [],
  );

  const handleReload = useCallback(async () => {
    setReloading(true);
    try {
      await reloadTrunks();
      toast({ title: 'Fatto', description: 'Configurazione Asterisk ricaricata' });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Errore durante il reload';
      toast({ title: 'Errore', description: message, variant: 'destructive' });
    } finally {
      setReloading(false);
    }
  }, [toast]);

  return (
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <SettingsIcon className="h-5 w-5 text-zinc-400" />
          Impostazioni
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Configurazione applicazione e connessione
        </p>
      </div>

      {/* ── Connessione Asterisk ─────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-zinc-200 flex items-center gap-2">
            <Server className="h-4 w-4 text-blue-400" />
            Connessione Asterisk
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* AMI */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-zinc-300">AMI (Manager)</span>
                {isConnected ? (
                  <Badge className="bg-green-900/50 text-green-400 border-green-800 text-xs">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Connesso
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    <XCircle className="mr-1 h-3 w-3" />
                    Disconnesso
                  </Badge>
                )}
              </div>
              <div className="space-y-1 text-xs text-zinc-500">
                <p>Host: <span className="text-zinc-400">{amiHost}</span></p>
                <p>Porta: <span className="text-zinc-400">{amiPort}</span></p>
              </div>
            </div>

            {/* ARI */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-zinc-300">ARI (REST)</span>
                {ariConnected ? (
                  <Badge className="bg-green-900/50 text-green-400 border-green-800 text-xs">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Connesso
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    <XCircle className="mr-1 h-3 w-3" />
                    Disconnesso
                  </Badge>
                )}
              </div>
              <div className="space-y-1 text-xs text-zinc-500">
                <p>URL: <span className="text-zinc-400">{ariUrl}</span></p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Account Utente ──────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-zinc-200 flex items-center gap-2">
            <User className="h-4 w-4 text-amber-400" />
            Account Utente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md space-y-3">
            <div className="space-y-2">
              <Label className="text-zinc-300">Password attuale</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Password corrente"
                className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Nuova password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nuova password"
                className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Conferma password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ripeti nuova password"
                className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleChangePassword();
                }}
              />
            </div>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleChangePassword}
              disabled={changingPassword}
            >
              {changingPassword ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              Cambia Password
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Softphone ───────────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-zinc-200 flex items-center gap-2">
            <Phone className="h-4 w-4 text-emerald-400" />
            Softphone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md space-y-3">
            <div className="space-y-2">
              <Label className="text-zinc-300">Numero Interno</Label>
              <Input
                value={softphone.extension}
                onChange={(e) =>
                  setSoftphone((prev) => ({ ...prev, extension: e.target.value }))
                }
                placeholder="es. 100"
                className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Password SIP</Label>
              <Input
                type="password"
                value={softphone.sipPassword}
                onChange={(e) =>
                  setSoftphone((prev) => ({ ...prev, sipPassword: e.target.value }))
                }
                placeholder="Password SIP"
                className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">WebSocket Server URL</Label>
              <Input
                value={softphone.wsUrl}
                onChange={(e) =>
                  setSoftphone((prev) => ({ ...prev, wsUrl: e.target.value }))
                }
                placeholder="wss://pbx.example.com:8089/ws"
                className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSaveSoftphone}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Salva configurazione
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Notifiche ───────────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-zinc-200 flex items-center gap-2">
            <Bell className="h-4 w-4 text-purple-400" />
            Notifiche
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md space-y-4">
            {/* Browser call notifications */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-300">
                  Notifiche browser chiamate in arrivo
                </p>
                <p className="text-xs text-zinc-500">
                  Mostra notifiche del browser quando arriva una chiamata
                </p>
              </div>
              <Switch
                checked={notifPrefs.browserCalls}
                onCheckedChange={(checked) => handleNotifChange('browserCalls', checked)}
              />
            </div>

            <Separator className="bg-zinc-800" />

            {/* Ringtone */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-300">Suoneria</p>
                <p className="text-xs text-zinc-500">
                  Riproduci suoneria alla ricezione di una chiamata
                </p>
              </div>
              <Switch
                checked={notifPrefs.ringtone}
                onCheckedChange={(checked) => handleNotifChange('ringtone', checked)}
              />
            </div>

            {notifPrefs.ringtone && (
              <div className="ml-0 space-y-2">
                <Label className="text-zinc-400 text-xs">File suoneria</Label>
                <Select
                  value={notifPrefs.ringtoneFile}
                  onValueChange={(v) => handleNotifChange('ringtoneFile', v)}
                >
                  <SelectTrigger className="bg-zinc-950 border-zinc-700 text-zinc-300 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="default">Predefinita</SelectItem>
                    <SelectItem value="classic">Classica</SelectItem>
                    <SelectItem value="modern">Moderna</SelectItem>
                    <SelectItem value="soft">Soft</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Separator className="bg-zinc-800" />

            {/* Toast events */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-300">Notifiche toast eventi</p>
                <p className="text-xs text-zinc-500">
                  Mostra notifiche toast per eventi del sistema
                </p>
              </div>
              <Switch
                checked={notifPrefs.toastEvents}
                onCheckedChange={(checked) => handleNotifChange('toastEvents', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Aspetto ─────────────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-zinc-200 flex items-center gap-2">
            <Palette className="h-4 w-4 text-pink-400" />
            Aspetto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-md space-y-2">
            <Label className="text-zinc-300">Tema</Label>
            <Select defaultValue="dark">
              <SelectTrigger className="bg-zinc-950 border-zinc-700 text-zinc-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="dark">Scuro (predefinito)</SelectItem>
                <SelectItem value="light">Chiaro</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-500">
              Il tema scuro e selezionato come predefinito.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Sistema ─────────────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-zinc-200 flex items-center gap-2">
            <Info className="h-4 w-4 text-cyan-400" />
            Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs text-zinc-500 mb-1">Versione Asterisk</p>
              <p className="text-sm font-semibold text-zinc-200">
                {asteriskVersion || 'N/D'}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs text-zinc-500 mb-1">Uptime</p>
              <p className="text-sm font-semibold text-zinc-200">
                {asteriskUptime != null ? formatUptime(asteriskUptime) : 'N/D'}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs text-zinc-500 mb-1">Stato</p>
              <p className="text-sm font-semibold">
                {asteriskStatus === 'connected' ? (
                  <span className="text-green-400">Attivo</span>
                ) : (
                  <span className="text-red-400">Non raggiungibile</span>
                )}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            onClick={handleReload}
            disabled={reloading}
          >
            {reloading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Ricarica Configurazione Asterisk
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
