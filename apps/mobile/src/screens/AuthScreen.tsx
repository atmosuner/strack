import type { ReactElement } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  type LoginResponse,
  type RegisterResponse,
  apiJson,
} from "../lib/api";

type Mode = "login" | "register";

export function AuthScreen(props: {
  onSignedIn: (token: string) => void;
}): ReactElement {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        const res = await apiJson<RegisterResponse>("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email: email.trim(),
            password,
            householdName: householdName.trim() || "Home",
          }),
        });
        props.onSignedIn(res.token);
      } else {
        const res = await apiJson<LoginResponse>("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        });
        props.onSignedIn(res.token);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>
        {mode === "login" ? "Sign in" : "Create account"}
      </Text>
      {error !== null ? <Text style={styles.err}>{error}</Text> : null}
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="Password (min 8 chars)"
        value={password}
        onChangeText={setPassword}
      />
      {mode === "register" ? (
        <TextInput
          style={styles.input}
          placeholder="Household name"
          value={householdName}
          onChangeText={setHouseholdName}
        />
      ) : null}
      <Pressable
        style={[styles.btn, busy && styles.btnDisabled]}
        onPress={() => void submit()}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>
            {mode === "login" ? "Sign in" : "Register"}
          </Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => {
          setMode(mode === "login" ? "register" : "login");
          setError(null);
        }}
      >
        <Text style={styles.link}>
          {mode === "login"
            ? "Need an account? Register"
            : "Have an account? Sign in"}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  err: {
    color: "#b00020",
    marginBottom: 12,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 16,
  },
  btn: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: {
    marginTop: 20,
    textAlign: "center",
    color: "#2563eb",
    fontSize: 15,
  },
});
