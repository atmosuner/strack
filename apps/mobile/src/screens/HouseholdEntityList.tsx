import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiJson } from "../lib/api";

export type HouseholdEntity = "children" | "providers";

export type HouseholdEntityRow = {
  id: string;
  name: string;
  notes: string | null;
  archived: boolean;
};

type ListPayload = { children?: HouseholdEntityRow[]; providers?: HouseholdEntityRow[] };

export function HouseholdEntityList(props: {
  token: string;
  householdId: string;
  entity: HouseholdEntity;
  title: string;
  onBack: () => void;
}): ReactElement {
  const [rows, setRows] = useState<HouseholdEntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const basePath = `/households/${props.householdId}/${props.entity}`;
  const listKey = props.entity === "children" ? "children" : "providers";

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const q = includeArchived ? "?includeArchived=true" : "";
      const data = await apiJson<ListPayload>(`${basePath}${q}`, {
        method: "GET",
        token: props.token,
      });
      const list = data[listKey];
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [basePath, includeArchived, listKey, props.token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitCreate(): Promise<void> {
    const name = newName.trim();
    if (!name) {
      return;
    }
    setSaving(true);
    try {
      await apiJson(`${basePath}`, {
        method: "POST",
        token: props.token,
        body: JSON.stringify({
          name,
          notes: newNotes.trim() || null,
        }),
      });
      setModalOpen(false);
      setNewName("");
      setNewNotes("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function setArchived(item: HouseholdEntityRow, archived: boolean): Promise<void> {
    try {
      const segment =
        props.entity === "children"
          ? `/households/${props.householdId}/children/${item.id}`
          : `/households/${props.householdId}/providers/${item.id}`;
      await apiJson(segment, {
        method: "PATCH",
        token: props.token,
        body: JSON.stringify({ archived }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={props.onBack} hitSlop={12}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>{props.title}</Text>
      </View>
      {error !== null ? <Text style={styles.err}>{error}</Text> : null}
      <View style={styles.row}>
        <Text style={styles.switchLabel}>Show archived</Text>
        <Switch
          value={includeArchived}
          onValueChange={(v) => setIncludeArchived(v)}
        />
      </View>
      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => it.id}
          ListEmptyComponent={
            <Text style={styles.muted}>No items yet. Tap Add.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              {item.notes ? (
                <Text style={styles.cardNotes}>{item.notes}</Text>
              ) : null}
              {item.archived ? (
                <Text style={styles.archivedTag}>Archived</Text>
              ) : null}
              <Pressable
                style={styles.secondaryBtn}
                onPress={() =>
                  void setArchived(item, !item.archived)
                }
              >
                <Text style={styles.secondaryBtnText}>
                  {item.archived ? "Restore" : "Archive"}
                </Text>
              </Pressable>
            </View>
          )}
        />
      )}
      <Pressable style={styles.primaryBtn} onPress={() => setModalOpen(true)}>
        <Text style={styles.primaryBtnText}>Add</Text>
      </Pressable>

      <Modal visible={modalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New entry</Text>
            <TextInput
              style={styles.input}
              placeholder="Name"
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Notes (optional)"
              value={newNotes}
              onChangeText={setNewNotes}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModalOpen(false)}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.primaryBtnSm}
                onPress={() => void submitCreate()}
                disabled={saving}
              >
                <Text style={styles.primaryBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#fff", padding: 16 },
  header: { marginBottom: 12 },
  back: { fontSize: 16, color: "#2563eb", marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "600" },
  err: { color: "#b00020", marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  switchLabel: { fontSize: 15 },
  muted: { color: "#666", marginVertical: 8 },
  card: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardNotes: { fontSize: 14, color: "#444", marginTop: 4 },
  archivedTag: {
    fontSize: 12,
    color: "#888",
    marginTop: 6,
    fontStyle: "italic",
  },
  secondaryBtn: { marginTop: 8, alignSelf: "flex-start" },
  secondaryBtnText: { color: "#2563eb", fontSize: 14 },
  primaryBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#0008",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "600", marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: "top" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    marginTop: 8,
    alignItems: "center",
  },
  cancel: { fontSize: 16, color: "#666" },
  primaryBtnSm: {
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
});
