import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { apiJson } from "../lib/api";

const OFFSET_LABELS: Record<number, string> = {
  5: "5 min",
  10: "10 min",
  15: "15 min",
  30: "30 min",
  60: "1 hour",
  120: "2 hours",
};

type Prefs = { enabled: boolean; minutesBefore: number };

export function ReminderSettings(props: {
  token: string;
}): ReactElement {
  const [prefs, setPrefs] = useState<Prefs>({ enabled: true, minutesBefore: 30 });
  const [allowedOffsets, setAllowedOffsets] = useState<number[]>([30]);
  const [pushRegistered, setPushRegistered] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchPrefs = useCallback(async () => {
    try {
      const data = await apiJson<{ preferences: Prefs; allowedOffsets: number[] }>(
        "/reminders/preferences",
        { method: "GET", token: props.token }
      );
      setPrefs(data.preferences);
      setAllowedOffsets(data.allowedOffsets);
    } catch {}
  }, [props.token]);

  useEffect(() => {
    void fetchPrefs();
  }, [fetchPrefs]);

  useEffect(() => {
    void registerPushToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function registerPushToken() {
    if (Platform.OS === "web") return;

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        return;
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const pushToken = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      await apiJson("/reminders/push-tokens", {
        method: "POST",
        token: props.token,
        body: JSON.stringify({ token: pushToken.data, platform: "expo" }),
      });
      setPushRegistered(true);
    } catch {
      // Silently fail — push is best-effort
    }
  }

  async function updatePref(patch: Partial<Prefs>) {
    setSaving(true);
    try {
      const data = await apiJson<{ preferences: Prefs }>(
        "/reminders/preferences",
        {
          method: "PATCH",
          token: props.token,
          body: JSON.stringify(patch),
        }
      );
      setPrefs(data.preferences);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Lesson Reminders</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Reminders enabled</Text>
        <Switch
          value={prefs.enabled}
          onValueChange={(v) => void updatePref({ enabled: v })}
          disabled={saving}
        />
      </View>

      {prefs.enabled && (
        <>
          <Text style={styles.subLabel}>Notify me before class</Text>
          <View style={styles.chipRow}>
            {allowedOffsets.map((mins) => (
              <Pressable
                key={mins}
                style={[
                  styles.chip,
                  prefs.minutesBefore === mins && styles.chipActive,
                ]}
                onPress={() => void updatePref({ minutesBefore: mins })}
                disabled={saving}
              >
                <Text
                  style={[
                    styles.chipText,
                    prefs.minutesBefore === mins && styles.chipTextActive,
                  ]}
                >
                  {OFFSET_LABELS[mins] ?? `${mins} min`}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Text style={styles.meta}>
        Push notifications: {pushRegistered ? "registered" : Platform.OS === "web" ? "not available on web" : "not registered"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 4 },
  heading: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  label: { fontSize: 15 },
  subLabel: { fontSize: 14, color: "#6b7280", marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  chipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  chipText: { fontSize: 14, color: "#444" },
  chipTextActive: { color: "#fff" },
  meta: { fontSize: 12, color: "#9ca3af", marginTop: 8 },
});
