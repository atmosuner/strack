import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { apiJson } from "@/lib/api";
import { LessonForm } from "@/components/LessonForm";

type LessonRow = {
  id: string;
  seriesId: string | null;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  notes: string | null;
  recurrenceRule: unknown;
  isOccurrence: boolean;
  occurrenceDate: string | null;
  paymentStatus?: string;
  child: { id: string; name: string };
  provider: { id: string; name: string };
};

export function HomeView() {
  const { session } = useAuth();
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LessonRow | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ lessons: LessonRow[] }>(
        `/households/${session.householdId}/lessons`,
        { token: session.token }
      );
      setLessons(data.lessons);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lessons");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          Sign in from the Account tab to see your lessons.
        </CardContent>
      </Card>
    );
  }

  if (showForm || editing) {
    return (
      <LessonForm
        token={session.token}
        householdId={session.householdId}
        role={session.role}
        existing={editing}
        onCancel={() => {
          setShowForm(false);
          setEditing(null);
        }}
        onSaved={() => {
          setShowForm(false);
          setEditing(null);
          void load();
        }}
      />
    );
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Your lessons
        </h2>
        <Button size="sm" onClick={() => setShowForm(true)}>
          + Add
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Loading…
        </p>
      ) : lessons.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No lessons yet. Add a child and provider in the Family tab, then
            create your first lesson.
          </CardContent>
        </Card>
      ) : (
        lessons.map((l, i) => (
          <Card
            key={`${l.id}-${l.occurrenceDate ?? i}`}
            className="cursor-pointer transition-colors hover:border-primary/40"
            onClick={() => setEditing(l)}
          >
            <CardHeader className="pb-1">
              <div className="flex items-center gap-2">
                <CardTitle className="flex-1 text-base">{l.title}</CardTitle>
                {l.paymentStatus === "PAID" ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    paid
                  </span>
                ) : l.paymentStatus === "UNPAID" ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    unpaid
                  </span>
                ) : null}
                {l.recurrenceRule ? (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                    recurring
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="text-muted-foreground">
                {l.child.name} with {l.provider.name}
              </p>
              <p className="text-primary/80">
                {fmtTime(l.startAt)} – {fmtTime(l.endAt)}
              </p>
              {l.location && (
                <p className="text-muted-foreground">{l.location}</p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
