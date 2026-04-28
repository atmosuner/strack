import { StatusBar } from "expo-status-bar";
import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from "./src/lib/authToken";
import { AuthScreen } from "./src/screens/AuthScreen";
import { HomeScreen } from "./src/screens/HomeScreen";

export default function App(): ReactElement {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  const refreshSession = useCallback(async () => {
    const t = await getStoredToken();
    setToken(t);
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  async function handleSignedIn(next: string): Promise<void> {
    await setStoredToken(next);
    setToken(next);
  }

  async function handleSignOut(): Promise<void> {
    await clearStoredToken();
    setToken(null);
  }

  if (token === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.sub}>Loading session…</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {token === null ? (
        <AuthScreen onSignedIn={(t) => void handleSignedIn(t)} />
      ) : (
        <HomeScreen token={token} onSignOut={() => void handleSignOut()} />
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#fff" },
  center: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  sub: { fontSize: 14, color: "#666" },
});
