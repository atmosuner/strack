import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { apiJson } from "../lib/api";

export type LessonRow = {
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

export function LessonListScreen(props: {
  token: string;
  householdId: string;
  onBack: () => void;
  onAdd: () => void;
  onSelect: (lesson: LessonRow) => void;
}): ReactElement {
  const [rows, setRows] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiJson<{ lessons: LessonRow[] }>(
        `/households/${props.householdId}/lessons`,
        { method: "GET", token: props.token }
      );
      setRows(data.lessons);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [props.householdId, props.token]);

  useEffect(() => {
    void load();
  }, [load]);

  function fmtTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={props.onBack} hitSlop={12}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Lessons</Text>
      </View>

      {error !== null ? <Text style={styles.err}>{error}</Text> : null}

      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it, i) => `${it.id}-${it.occurrenceDate ?? i}`}
          ListEmptyComponent={
            <Text style={styles.muted}>No lessons yet. Tap Add.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => props.onSelect(item)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {item.paymentStatus === "PAID" ? (
                  <Text style={styles.paidBadge}>paid</Text>
                ) : item.paymentStatus === "UNPAID" ? (
                  <Text style={styles.unpaidBadge}>unpaid</Text>
                ) : null}
                {item.recurrenceRule ? (
                  <Text style={styles.badge}>recurring</Text>
                ) : null}
              </View>
              <Text style={styles.cardMeta}>
                {item.child.name} with {item.provider.name}
              </Text>
              <Text style={styles.cardTime}>
                {fmtTime(item.startAt)} – {fmtTime(item.endAt)}
              </Text>
              {item.location ? (
                <Text style={styles.cardLoc}>{item.location}</Text>
              ) : null}
            </Pressable>
          )}
        />
      )}

      <Pressable style={styles.primaryBtn} onPress={props.onAdd}>
        <Text style={styles.primaryBtnText}>Add Lesson</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#fff", padding: 16 },
  header: { marginBottom: 12 },
  back: { fontSize: 16, color: "#2563eb", marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "600" },
  err: { color: "#b00020", marginBottom: 8 },
  muted: { color: "#666", marginVertical: 8 },
  card: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "600", flex: 1 },
  badge: {
    fontSize: 11,
    color: "#6d28d9",
    backgroundColor: "#ede9fe",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: "hidden",
    fontWeight: "600",
  },
  paidBadge: {
    fontSize: 11,
    color: "#065f46",
    backgroundColor: "#d1fae5",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: "hidden",
    fontWeight: "600",
  },
  unpaidBadge: {
    fontSize: 11,
    color: "#92400e",
    backgroundColor: "#fef3c7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: "hidden",
    fontWeight: "600",
  },
  cardMeta: { fontSize: 14, color: "#444", marginTop: 2 },
  cardTime: { fontSize: 13, color: "#2563eb", marginTop: 4 },
  cardLoc: { fontSize: 13, color: "#666", marginTop: 2 },
  primaryBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
