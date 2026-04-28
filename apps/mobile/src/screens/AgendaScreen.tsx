import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { apiJson } from "../lib/api";

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
      return {
        from: today.toISOString(),
        to: addDays(today, 1).toISOString(),
      };
    case "week": {
      const mon = startOfWeek(now);
      return {
        from: mon.toISOString(),
        to: addDays(mon, 7).toISOString(),
      };
    }
    case "upcoming":
      return {
        from: today.toISOString(),
        to: addDays(today, 30).toISOString(),
      };
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
  const d = new Date(iso + "T00:00:00Z");
  const today = startOfDay(new Date()).toISOString().slice(0, 10);
  const tomorrow = addDays(startOfDay(new Date()), 1).toISOString().slice(0, 10);
  if (iso === today) return "Today";
  if (iso === tomorrow) return "Tomorrow";
  return d.toLocaleDateString(undefined, {
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

export function AgendaScreen(props: {
  token: string;
  householdId: string;
  onBack: () => void;
}): ReactElement {
  const [mode, setMode] = useState<ViewMode>("today");
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      const { from, to } = rangeFor(mode);
      try {
        const data = await apiJson<{ lessons: LessonRow[] }>(
          `/households/${props.householdId}/lessons?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { method: "GET", token: props.token }
        );
        setLessons(data.lessons);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [mode, props.householdId, props.token]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = groupByDate(lessons);
  const sortedDates = [...grouped.keys()].sort();

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={props.onBack} hitSlop={12}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Agenda</Text>
      </View>

      <View style={styles.tabs}>
        {(["today", "week", "upcoming"] as const).map((m) => (
          <Pressable
            key={m}
            style={[styles.tab, mode === m && styles.tabActive]}
            onPress={() => setMode(m)}
          >
            <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
              {m === "today" ? "Today" : m === "week" ? "This Week" : "30 Days"}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.err}>{error}</Text> : null}

      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
          />
        }
      >
        {loading ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : sortedDates.length === 0 ? (
          <Text style={styles.muted}>No lessons in this range.</Text>
        ) : (
          sortedDates.map((date) => (
            <View key={date} style={styles.dateGroup}>
              <Text style={styles.dateLabel}>{fmtDate(date)}</Text>
              {grouped.get(date)!.map((l, i) => (
                <View
                  key={`${l.id}-${l.occurrenceDate ?? i}`}
                  style={styles.card}
                >
                  <View style={styles.timeStrip}>
                    <Text style={styles.timeText}>
                      {fmtTime(l.startAt)}
                    </Text>
                    <Text style={styles.timeSep}>–</Text>
                    <Text style={styles.timeText}>
                      {fmtTime(l.endAt)}
                    </Text>
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.cardRow}>
                      <Text style={styles.cardTitle}>{l.title}</Text>
                      {l.recurrenceRule ? (
                        <Text style={styles.badge}>recurring</Text>
                      ) : null}
                    </View>
                    <Text style={styles.cardMeta}>
                      {l.child.name} with {l.provider.name}
                    </Text>
                    {l.location ? (
                      <Text style={styles.cardLoc}>{l.location}</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#fff", padding: 16 },
  header: { marginBottom: 12 },
  back: { fontSize: 16, color: "#2563eb", marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "600" },
  tabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  tabText: { fontSize: 13, fontWeight: "600", color: "#666" },
  tabTextActive: { color: "#fff" },
  err: { color: "#b00020", marginBottom: 8 },
  scroll: { flex: 1 },
  muted: { color: "#666", marginVertical: 16, textAlign: "center" },
  dateGroup: { marginBottom: 16 },
  dateLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563eb",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    marginBottom: 8,
    overflow: "hidden",
  },
  timeStrip: {
    backgroundColor: "#eff6ff",
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 64,
  },
  timeText: { fontSize: 12, fontWeight: "600", color: "#1d4ed8" },
  timeSep: { fontSize: 10, color: "#93c5fd" },
  cardBody: { flex: 1, padding: 10 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: "600", flex: 1 },
  badge: {
    fontSize: 10,
    color: "#6d28d9",
    backgroundColor: "#ede9fe",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: "hidden",
    fontWeight: "600",
  },
  cardMeta: { fontSize: 13, color: "#444", marginTop: 2 },
  cardLoc: { fontSize: 12, color: "#666", marginTop: 2 },
});
