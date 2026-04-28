import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiJson, getApiBaseUrl } from "../lib/api";

export function IcsSection(props: {
  token: string;
  householdId: string;
}): ReactElement {
  const [icsToken, setIcsToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<{ icsToken: string | null }>(
        `/calendar/${props.householdId}/ics-token`,
        { token: props.token }
      );
      setIcsToken(data.icsToken);
    } catch {
      // not generated yet
    } finally {
      setLoading(false);
    }
  }, [props.token, props.householdId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate(): Promise<void> {
    setGenerating(true);
    try {
      const data = await apiJson<{ icsToken: string }>(
        `/calendar/${props.householdId}/ics-token`,
        { method: "POST", token: props.token }
      );
      setIcsToken(data.icsToken);
    } catch {
      Alert.alert("Error", "Failed to generate ICS token");
    } finally {
      setGenerating(false);
    }
  }

  const feedUrl = icsToken
    ? `${getApiBaseUrl()}/calendar/${props.householdId}.ics?token=${icsToken}`
    : null;

  function copyUrl(): void {
    if (!feedUrl) return;
    Alert.alert("Calendar URL", feedUrl, [{ text: "OK" }]);
  }

  if (loading) return <View />;

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Calendar Subscribe</Text>
      {feedUrl ? (
        <>
          <Text style={styles.hint}>
            Add this URL to Google Calendar, Apple Calendar, or Outlook.
          </Text>
          <TextInput
            style={styles.urlInput}
            value={feedUrl}
            editable={false}
            selectTextOnFocus
            multiline
          />
          <Pressable style={styles.copyBtn} onPress={() => void copyUrl()}>
            <Text style={styles.copyBtnText}>Copy URL</Text>
          </Pressable>
          <Pressable
            style={styles.regenBtn}
            onPress={() => void generate()}
            disabled={generating}
          >
            <Text style={styles.regenBtnText}>
              {generating ? "Regenerating…" : "Regenerate URL"}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.hint}>
            Generate a secret URL to subscribe to your lessons from any calendar
            app.
          </Text>
          <Pressable
            style={styles.copyBtn}
            onPress={() => void generate()}
            disabled={generating}
          >
            <Text style={styles.copyBtnText}>
              {generating ? "Generating…" : "Generate Calendar URL"}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 10,
    padding: 16,
    marginTop: 20,
  },
  heading: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
  hint: { fontSize: 13, color: "#666", marginBottom: 10 },
  urlInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: "#333",
    backgroundColor: "#fafafa",
    marginBottom: 8,
  },
  copyBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  copyBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  regenBtn: {
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 6,
  },
  regenBtnText: { color: "#666", fontSize: 13 },
});
