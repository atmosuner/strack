import type { ReactElement } from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiJson } from "../lib/api";

type Invitation = {
  id: string;
  email: string;
  status: string;
  role: string;
  createdAt: string;
};

export function InviteScreen(props: {
  token: string;
  householdId: string;
  role: string;
  onBack: () => void;
}): ReactElement {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [acceptToken, setAcceptToken] = useState("");

  const fetchInvitations = useCallback(async () => {
    if (props.role !== "OWNER") return;
    try {
      const data = await apiJson<{ invitations: Invitation[] }>(
        `/invitations?householdId=${props.householdId}`,
        { method: "GET", token: props.token }
      );
      setInvitations(data.invitations);
    } catch {}
  }, [props.token, props.householdId, props.role]);

  useEffect(() => {
    void fetchInvitations();
  }, [fetchInvitations]);

  const handleSend = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await apiJson("/invitations", {
        method: "POST",
        token: props.token,
        body: { householdId: props.householdId, email: email.trim() },
      });
      Alert.alert("Sent", `Invitation sent to ${email.trim()}`);
      setEmail("");
      void fetchInvitations();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to send");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await apiJson(`/invitations/${id}`, {
        method: "DELETE",
        token: props.token,
      });
      void fetchInvitations();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to revoke");
    }
  };

  const handleAccept = async () => {
    if (!acceptToken.trim()) return;
    setLoading(true);
    try {
      const res = await apiJson<{ message: string; householdId: string }>(
        "/invitations/accept",
        {
          method: "POST",
          token: props.token,
          body: { token: acceptToken.trim() },
        }
      );
      Alert.alert("Accepted", res.message);
      setAcceptToken("");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to accept");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={props.onBack}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Family Members</Text>
      </View>

      {/* Accept invitation section — visible to everyone */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Accept an Invitation</Text>
        <TextInput
          style={styles.input}
          placeholder="Paste invitation token…"
          value={acceptToken}
          onChangeText={setAcceptToken}
          autoCapitalize="none"
        />
        <Pressable
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleAccept}
          disabled={loading}
        >
          <Text style={styles.btnText}>Accept</Text>
        </Pressable>
      </View>

      {/* Send invitation section — owner only */}
      {props.role === "OWNER" && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Invite a Family Member</Text>
            <TextInput
              style={styles.input}
              placeholder="Email address"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <Pressable
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleSend}
              disabled={loading}
            >
              <Text style={styles.btnText}>Send Invitation</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Invitations</Text>
          <FlatList
            data={invitations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowEmail}>{item.email}</Text>
                  <Text style={styles.rowStatus}>{item.status}</Text>
                </View>
                {item.status === "PENDING" && (
                  <Pressable onPress={() => handleRevoke(item.id)}>
                    <Text style={styles.revoke}>Revoke</Text>
                  </Pressable>
                )}
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>No invitations sent yet.</Text>
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#fff", padding: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  back: { color: "#2563eb", fontSize: 16 },
  title: { fontSize: 18, fontWeight: "600", flex: 1, textAlign: "center" },
  section: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sectionTitle: { fontWeight: "600", fontSize: 15, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  btn: {
    backgroundColor: "#2563eb",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  rowEmail: { fontSize: 15 },
  rowStatus: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  revoke: { color: "#dc2626", fontSize: 14, fontWeight: "600" },
  empty: { color: "#9ca3af", textAlign: "center", marginTop: 16 },
});
