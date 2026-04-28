import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { apiJson } from "@/lib/api";
import { ReminderSettings } from "@/components/ReminderSettings";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

function IcsSection({ token, householdId }: { token: string; householdId: string }) {
  const [icsToken, setIcsToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<{ icsToken: string | null }>(
        `/calendar/${householdId}/ics-token`,
        { token }
      );
      setIcsToken(data.icsToken);
    } catch {
      // ignore — token not generated yet
    } finally {
      setLoading(false);
    }
  }, [token, householdId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    try {
      const data = await apiJson<{ icsToken: string }>(
        `/calendar/${householdId}/ics-token`,
        { method: "POST", token }
      );
      setIcsToken(data.icsToken);
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  }

  const feedUrl = icsToken
    ? `${API_BASE}/calendar/${householdId}.ics?token=${icsToken}`
    : null;

  async function copyUrl() {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Calendar Subscribe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {feedUrl ? (
          <>
            <p className="text-xs text-muted-foreground">
              Add this URL to Google Calendar, Apple Calendar, or Outlook to see
              your lessons automatically.
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={feedUrl}
                className="text-xs"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button size="sm" variant="outline" onClick={() => void copyUrl()}>
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-muted-foreground"
              onClick={() => void generate()}
              disabled={generating}
            >
              {generating ? "Regenerating…" : "Regenerate URL (invalidates old link)"}
            </Button>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Generate a secret URL to subscribe to your lessons from any
              calendar app.
            </p>
            <Button
              size="sm"
              onClick={() => void generate()}
              disabled={generating}
            >
              {generating ? "Generating…" : "Generate Calendar URL"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AccountView() {
  const { session, loading, login, register, logout } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }

  if (session) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm">
              Signed in as <span className="font-medium">{session.email}</span>
            </p>
            <Button className="w-full" variant="outline" onClick={logout}>
              Sign out
            </Button>
          </CardContent>
        </Card>
        <IcsSection token={session.token} householdId={session.householdId} />
        <ReminderSettings />
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "register") {
        await register(email, password, householdName || "My Home");
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {mode === "login" ? "Sign in" : "Create account"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="household">Household name</Label>
                <Input
                  id="household"
                  placeholder="My Home"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                />
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button className="w-full" type="submit" disabled={submitting}>
              {submitting
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Register"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground underline underline-offset-2"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError(null);
              }}
            >
              {mode === "login"
                ? "Don't have an account? Register"
                : "Already have an account? Sign in"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
