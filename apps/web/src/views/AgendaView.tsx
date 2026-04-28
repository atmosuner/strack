import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { apiJson } from "@/lib/api";

type LessonRow = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  recurrenceRule: unknown;
  isOccurrence: boolean;
  occurrenceDate: string | null;
  child: { id: string; name: string };
  provider: { id: string; name: string };
};

type ViewMode = "today" | "week" | "upcoming";

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function startOfWeek(d: Date): Date {
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  return addDays(startOfDay(d), -diff);
}

function rangeFor(mode: ViewMode): { from: string; to: string } {
  const now = new Date();
  const today = startOfDay(now);

  switch (mode) {
    case "today":
      return { from: today.toISOString(), to: addDays(today, 1).toISOString() };
    case "week": {
      const mon = startOfWeek(now);
      return { from: mon.toISOString(), to: addDays(mon, 7).toISOString() };
    }
    case "upcoming":
      return { from: today.toISOString(), to: addDays(today, 30).toISOString() };
  }
}

function groupByDate(lessons: LessonRow[]): Map<string, LessonRow[]> {
  const map = new Map<string, LessonRow[]>();
  for (const l of lessons) {
    const key = l.occurrenceDate ?? l.startAt.slice(0, 10);
    const arr = map.get(key) ?? [];
    arr.push(l);
    map.set(key, arr);
  }
  return map;
}

function fmtDate(iso: string): string {
  const today = startOfDay(new Date()).toISOString().slice(0, 10);
  const tomorrow = addDays(startOfDay(new Date()), 1).toISOString().slice(0, 10);
  if (iso === today) return "Today";
  if (iso === tomorrow) return "Tomorrow";
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const modes: { id: ViewMode; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "upcoming", label: "30 Days" },
];

export function AgendaView() {
  const { session } = useAuth();
  const [mode, setMode] = useState<ViewMode>("today");
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    const { from, to } = rangeFor(mode);
    try {
      const data = await apiJson<{ lessons: LessonRow[] }>(
        `/households/${session.householdId}/lessons?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { token: session.token }
      );
      setLessons(data.lessons);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [session, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          Sign in from the Account tab to see your agenda.
        </CardContent>
      </Card>
    );
  }

  const grouped = groupByDate(lessons);
  const sortedDates = [...grouped.keys()].sort();

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="grid grid-cols-3 gap-2">
        {modes.map((m) => (
          <Button
            key={m.id}
            size="sm"
            variant={mode === m.id ? "default" : "outline"}
            className="text-xs"
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </Button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Loading…
        </p>
      ) : sortedDates.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No lessons in this range.
          </CardContent>
        </Card>
      ) : (
        sortedDates.map((date) => (
          <div key={date}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">
              {fmtDate(date)}
            </h3>
            <div className="space-y-2">
              {grouped.get(date)!.map((l, i) => (
                <div
                  key={`${l.id}-${l.occurrenceDate ?? i}`}
                  className="flex overflow-hidden rounded-lg border border-border"
                >
                  {/* Time strip */}
                  <div className="flex min-w-16 flex-col items-center justify-center bg-primary/5 px-2 py-2">
                    <span className="text-xs font-semibold text-primary">
                      {fmtTime(l.startAt)}
                    </span>
                    <span className="text-[10px] text-primary/50">–</span>
                    <span className="text-xs font-semibold text-primary">
                      {fmtTime(l.endAt)}
                    </span>
                  </div>
                  {/* Content */}
                  <div className="flex-1 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-semibold">
                        {l.title}
                      </span>
                      {l.recurrenceRule ? (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                          recurring
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {l.child.name} with {l.provider.name}
                    </p>
                    {l.location && (
                      <p className="text-xs text-muted-foreground">
                        {l.location}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
