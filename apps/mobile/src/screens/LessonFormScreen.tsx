import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiJson } from "../lib/api";

type PickerItem = { id: string; name: string };

type LessonPayload = {
  id?: string;
  seriesId?: string | null;
  childId: string;
  providerId: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  notes: string | null;
  recurrenceRule?: unknown;
  isOccurrence?: boolean;
  occurrenceDate?: string | null;
  paymentStatus?: string;
};

export function LessonFormScreen(props: {
  token: string;
  householdId: string;
  role?: string;
  existing?: LessonPayload | null;
  onBack: () => void;
  onSaved: () => void;
}): ReactElement {
  const isEdit = Boolean(props.existing?.id);
  const isOccurrence = Boolean(props.existing?.isOccurrence);
  const parentId = props.existing?.seriesId ?? props.existing?.id;

  const [children, setChildren] = useState<PickerItem[]>([]);
  const [providers, setProviders] = useState<PickerItem[]>([]);

  const [childId, setChildId] = useState(props.existing?.childId ?? "");
  const [providerId, setProviderId] = useState(props.existing?.providerId ?? "");
  const [title, setTitle] = useState(props.existing?.title ?? "");
  const [date, setDate] = useState(
    props.existing
      ? (props.existing.occurrenceDate ?? props.existing.startAt.slice(0, 10))
      : new Date().toISOString().slice(0, 10)
  );
  const [startTime, setStartTime] = useState(
    props.existing ? props.existing.startAt.slice(11, 16) : "10:00"
  );
  const [endTime, setEndTime] = useState(
    props.existing ? props.existing.endAt.slice(11, 16) : "11:00"
  );
  const [location, setLocation] = useState(props.existing?.location ?? "");
  const [notes, setNotes] = useState(props.existing?.notes ?? "");

  const isOwner = props.role === "OWNER";
  const [paymentStatus, setPaymentStatus] = useState(
    props.existing?.paymentStatus ?? "UNPAID"
  );

  const [recurring, setRecurring] = useState(false);
  const [interval, setInterval] = useState("1");
  const [repeatCount, setRepeatCount] = useState("12");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPickers = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        apiJson<{ children: PickerItem[] }>(
          `/households/${props.householdId}/children`,
          { method: "GET", token: props.token }
        ),
        apiJson<{ providers: PickerItem[] }>(
          `/households/${props.householdId}/providers`,
          { method: "GET", token: props.token }
        ),
      ]);
      setChildren(c.children);
      setProviders(p.providers);
      if (!childId && c.children.length > 0) setChildId(c.children[0].id);
      if (!providerId && p.providers.length > 0) setProviderId(p.providers[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load options");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.householdId, props.token]);

  useEffect(() => {
    void loadPickers();
  }, [loadPickers]);

  async function submit(): Promise<void> {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!childId || !providerId) {
      setError("Select a child and a provider");
      return;
    }

    const startAt = `${date}T${startTime}:00Z`;
    const endAt = `${date}T${endTime}:00Z`;

    if (new Date(endAt) <= new Date(startAt)) {
      setError("End time must be after start time");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isOccurrence && parentId && props.existing?.occurrenceDate) {
        await apiJson(
          `/households/${props.householdId}/lessons/${parentId}/exceptions`,
          {
            method: "POST",
            token: props.token,
            body: JSON.stringify({
              date: props.existing.occurrenceDate,
              action: "edit",
              childId,
              providerId,
              title: title.trim(),
              startAt,
              endAt,
              location: location.trim() || null,
              notes: notes.trim() || null,
            }),
          }
        );
      } else if (isEdit && props.existing?.id) {
        const patchPayload: Record<string, unknown> = {
          childId,
          providerId,
          title: title.trim(),
          startAt,
          endAt,
          location: location.trim() || null,
          notes: notes.trim() || null,
        };
        if (isOwner) patchPayload.paymentStatus = paymentStatus;
        await apiJson(
          `/households/${props.householdId}/lessons/${props.existing.id}`,
          {
            method: "PATCH",
            token: props.token,
            body: JSON.stringify(patchPayload),
          }
        );
      } else {
        const payload: Record<string, unknown> = {
          childId,
          providerId,
          title: title.trim(),
          startAt,
          endAt,
          location: location.trim() || null,
          notes: notes.trim() || null,
        };
        if (recurring) {
          payload.recurrenceRule = {
            freq: "weekly",
            interval: Math.max(1, parseInt(interval, 10) || 1),
            count: Math.max(1, parseInt(repeatCount, 10) || 12),
          };
        }
        await apiJson(`/households/${props.householdId}/lessons`, {
          method: "POST",
          token: props.token,
          body: JSON.stringify(payload),
        });
      }
      props.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip(): Promise<void> {
    if (!parentId || !props.existing?.occurrenceDate) return;

    const confirmed =
      Platform.OS === "web"
        ? confirm("Skip this occurrence?")
        : await new Promise<boolean>((resolve) =>
            Alert.alert("Skip this class?", "You can undo by deleting the exception.", [
              { text: "Cancel", onPress: () => resolve(false) },
              { text: "Skip", style: "destructive", onPress: () => resolve(true) },
            ])
          );
    if (!confirmed) return;

    setSaving(true);
    try {
      await apiJson(
        `/households/${props.householdId}/lessons/${parentId}/exceptions`,
        {
          method: "POST",
          token: props.token,
          body: JSON.stringify({
            date: props.existing.occurrenceDate,
            action: "skip",
          }),
        }
      );
      props.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Skip failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!props.existing?.id) return;

    const label = props.existing.recurrenceRule
      ? "Delete entire series?"
      : "Delete this lesson?";

    const confirmed =
      Platform.OS === "web"
        ? confirm(label)
        : await new Promise<boolean>((resolve) =>
            Alert.alert(label, "This cannot be undone.", [
              { text: "Cancel", onPress: () => resolve(false) },
              { text: "Delete", style: "destructive", onPress: () => resolve(true) },
            ])
          );
    if (!confirmed) return;

    setSaving(true);
    try {
      await apiJson(
        `/households/${props.householdId}/lessons/${props.existing.id}`,
        { method: "DELETE", token: props.token }
      );
      props.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={props.onBack} hitSlop={12}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>
          {isOccurrence
            ? "Edit Occurrence"
            : isEdit
              ? "Edit Lesson"
              : "New Lesson"}
        </Text>
      </View>

      {error ? <Text style={styles.err}>{error}</Text> : null}

      <ScrollView style={styles.form}>
        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} placeholder="e.g. Piano Lesson" value={title} onChangeText={setTitle} />

        <Text style={styles.label}>Child</Text>
        <View style={styles.pickerRow}>
          {children.map((c) => (
            <Pressable key={c.id} style={[styles.chip, childId === c.id && styles.chipActive]} onPress={() => setChildId(c.id)}>
              <Text style={[styles.chipText, childId === c.id && styles.chipTextActive]}>{c.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Provider</Text>
        <View style={styles.pickerRow}>
          {providers.map((p) => (
            <Pressable key={p.id} style={[styles.chip, providerId === p.id && styles.chipActive]} onPress={() => setProviderId(p.id)}>
              <Text style={[styles.chipText, providerId === p.id && styles.chipTextActive]}>{p.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} placeholder="2026-05-01" value={date} onChangeText={setDate} />

        <View style={styles.timeRow}>
          <View style={styles.timeCol}>
            <Text style={styles.label}>Start (HH:MM)</Text>
            <TextInput style={styles.input} placeholder="10:00" value={startTime} onChangeText={setStartTime} />
          </View>
          <View style={styles.timeCol}>
            <Text style={styles.label}>End (HH:MM)</Text>
            <TextInput style={styles.input} placeholder="11:00" value={endTime} onChangeText={setEndTime} />
          </View>
        </View>

        <Text style={styles.label}>Location (optional)</Text>
        <TextInput style={styles.input} placeholder="e.g. Studio A" value={location} onChangeText={setLocation} />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput style={[styles.input, styles.inputMulti]} placeholder="Any notes…" value={notes} onChangeText={setNotes} multiline />

        {!isEdit && (
          <>
            <View style={[styles.row, { marginTop: 16 }]}>
              <Text style={styles.label}>Repeat weekly</Text>
              <Switch value={recurring} onValueChange={setRecurring} />
            </View>
            {recurring && (
              <View style={styles.timeRow}>
                <View style={styles.timeCol}>
                  <Text style={styles.label}>Every N weeks</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={interval} onChangeText={setInterval} />
                </View>
                <View style={styles.timeCol}>
                  <Text style={styles.label}>Occurrences</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={repeatCount} onChangeText={setRepeatCount} />
                </View>
              </View>
            )}
          </>
        )}

        {isOwner && isEdit && (
          <View style={[styles.row, { marginTop: 16 }]}>
            <Text style={styles.label}>Payment status</Text>
            <View style={styles.pickerRow}>
              <Pressable
                style={[styles.chip, paymentStatus === "UNPAID" && styles.chipUnpaid]}
                onPress={() => setPaymentStatus("UNPAID")}
              >
                <Text style={[styles.chipText, paymentStatus === "UNPAID" && styles.chipTextActive]}>Unpaid</Text>
              </Pressable>
              <Pressable
                style={[styles.chip, paymentStatus === "PAID" && styles.chipPaid]}
                onPress={() => setPaymentStatus("PAID")}
              >
                <Text style={[styles.chipText, paymentStatus === "PAID" && styles.chipTextActive]}>Paid</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Pressable style={[styles.primaryBtn, saving && styles.btnDisabled]} onPress={() => void submit()} disabled={saving}>
          <Text style={styles.primaryBtnText}>
            {saving ? "Saving…" : isOccurrence ? "Save This Occurrence" : isEdit ? "Update Lesson" : "Create Lesson"}
          </Text>
        </Pressable>

        {isOccurrence && (
          <Pressable style={styles.skipBtn} onPress={() => void handleSkip()} disabled={saving}>
            <Text style={styles.skipBtnText}>Skip This Occurrence</Text>
          </Pressable>
        )}

        {isEdit && !isOccurrence ? (
          <Pressable style={styles.deleteBtn} onPress={() => void handleDelete()} disabled={saving}>
            <Text style={styles.deleteBtnText}>
              {props.existing?.recurrenceRule ? "Delete Entire Series" : "Delete Lesson"}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#fff", padding: 16 },
  header: { marginBottom: 12 },
  back: { fontSize: 16, color: "#2563eb", marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "600" },
  err: { color: "#b00020", marginBottom: 8 },
  form: { flex: 1 },
  label: { fontSize: 14, fontWeight: "600", color: "#444", marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  inputMulti: { minHeight: 72, textAlignVertical: "top" },
  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 },
  chipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  chipUnpaid: { backgroundColor: "#fef3c7", borderColor: "#f59e0b" },
  chipPaid: { backgroundColor: "#d1fae5", borderColor: "#10b981" },
  chipText: { fontSize: 14, color: "#444" },
  chipTextActive: { color: "#fff" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timeRow: { flexDirection: "row", gap: 12 },
  timeCol: { flex: 1 },
  primaryBtn: { backgroundColor: "#2563eb", paddingVertical: 14, borderRadius: 8, alignItems: "center", marginTop: 20 },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  skipBtn: { paddingVertical: 14, borderRadius: 8, alignItems: "center", marginTop: 12, backgroundColor: "#fef3c7" },
  skipBtnText: { color: "#92400e", fontWeight: "600", fontSize: 16 },
  deleteBtn: { paddingVertical: 14, borderRadius: 8, alignItems: "center", marginTop: 12, marginBottom: 40 },
  deleteBtnText: { color: "#dc2626", fontWeight: "600", fontSize: 16 },
});
