import React, { useState, useCallback } from 'react';
import { Phone, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { login } from '@/lib/api';
import type { UserInfo } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────

interface LoginProps {
  onLogin: (user: UserInfo) => void;
}

// ── Component ─────────────────────────────────────────────────────────

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!username.trim() || !password) {
        setError('Inserisci username e password');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const response = await login(username.trim(), password);
        onLogin(response.user);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : (err as { message?: string })?.message || 'Credenziali non valide';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [username, password, onLogin],
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      {/* Background subtle pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-zinc-950" />

      <Card className="relative z-10 w-full max-w-sm bg-zinc-900 border-zinc-800 shadow-2xl">
        <CardHeader className="pb-2 pt-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3 mb-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/20 border border-violet-500/30">
              <Phone className="h-7 w-7 text-violet-400" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-zinc-100">AsteriskPanel</h1>
              <p className="text-sm text-zinc-500 mt-1">Accedi al pannello di gestione</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-950/50 border border-red-900/50 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="login-username" className="text-zinc-300">
                Username
              </Label>
              <Input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                autoFocus
                className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:ring-violet-500/20"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="login-password" className="text-zinc-300">
                Password
              </Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:ring-violet-500/20"
              />
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full bg-violet-600 hover:bg-violet-700 text-white font-medium h-10"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Accedi
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
