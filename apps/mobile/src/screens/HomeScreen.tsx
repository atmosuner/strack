import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { type MeResponse, apiJson } from "../lib/api";
import { HouseholdEntityList } from "./HouseholdEntityList";
import { LessonListScreen } from "./LessonListScreen";
import { LessonFormScreen } from "./LessonFormScreen";
import { AgendaScreen } from "./AgendaScreen";
import { IcsSection } from "./IcsSection";
import { InviteScreen } from "./InviteScreen";
import { ReminderSettings } from "./ReminderSettings";
import { BillingSection } from "./BillingSection";

type LessonPayload = {
  id: string;
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

type Panel =
  | "home"
  | "children"
  | "providers"
  | "lessons"
  | "lessonNew"
  | "lessonEdit"
  | "agenda"
  | "family";

export function HomeScreen(props: {
  token: string;
  onSignOut: () => void;
}): ReactElement {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("home");
  const [editingLesson, setEditingLesson] = useState<LessonPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<MeResponse>("/me", {
          method: "GET",
          token: props.token,
        });
        if (!cancelled) setMe(data);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load profile");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.token]);

  if (panel === "children" && me !== null) {
    return (
      <HouseholdEntityList
        token={props.token}
        householdId={me.householdId}
        entity="children"
        title="Children"
        onBack={() => setPanel("home")}
      />
    );
  }

  if (panel === "providers" && me !== null) {
    return (
      <HouseholdEntityList
        token={props.token}
        householdId={me.householdId}
        entity="providers"
        title="Providers"
        onBack={() => setPanel("home")}
      />
    );
  }

  if (panel === "agenda" && me !== null) {
    return (
      <AgendaScreen
        token={props.token}
        householdId={me.householdId}
        onBack={() => setPanel("home")}
      />
    );
  }

  if (panel === "family" && me !== null) {
    return (
      <InviteScreen
        token={props.token}
        householdId={me.householdId}
        role={me.role ?? "OWNER"}
        onBack={() => setPanel("home")}
      />
    );
  }

  if (panel === "lessons" && me !== null) {
    return (
      <LessonListScreen
        token={props.token}
        householdId={me.householdId}
        onBack={() => setPanel("home")}
        onAdd={() => setPanel("lessonNew")}
        onSelect={(l) => {
          setEditingLesson({
            id: l.id,
            seriesId: l.seriesId,
            childId: l.child.id,
            providerId: l.provider.id,
            title: l.title,
            startAt: l.startAt,
            endAt: l.endAt,
            location: l.location,
            notes: l.notes,
            recurrenceRule: l.recurrenceRule,
            isOccurrence: l.isOccurrence,
            occurrenceDate: l.occurrenceDate,
            paymentStatus: l.paymentStatus,
          });
          setPanel("lessonEdit");
        }}
      />
    );
  }

  if (panel === "lessonNew" && me !== null) {
    return (
      <LessonFormScreen
        token={props.token}
        householdId={me.householdId}
        role={me.role ?? "OWNER"}
        onBack={() => setPanel("lessons")}
        onSaved={() => setPanel("lessons")}
      />
    );
  }

  if (panel === "lessonEdit" && me !== null && editingLesson) {
    return (
      <LessonFormScreen
        token={props.token}
        householdId={me.householdId}
        role={me.role ?? "OWNER"}
        existing={editingLesson}
        onBack={() => setPanel("lessons")}
        onSaved={() => {
          setEditingLesson(null);
          setPanel("lessons");
        }}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Family Private Class Tracker</Text>
      {error !== null ? (
        <Text style={styles.err}>{error}</Text>
      ) : me === null ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <>
          <Text style={styles.line}>Signed in as {me.user.email}</Text>
          <View style={styles.nav}>
            <Pressable
              style={styles.navBtn}
              onPress={() => setPanel("children")}
            >
              <Text style={styles.navBtnText}>Children</Text>
            </Pressable>
            <Pressable
              style={styles.navBtn}
              onPress={() => setPanel("providers")}
            >
              <Text style={styles.navBtnText}>Providers</Text>
            </Pressable>
            <Pressable
              style={styles.navBtn}
              onPress={() => setPanel("lessons")}
            >
              <Text style={styles.navBtnText}>Lessons</Text>
            </Pressable>
          </View>
          <View style={styles.nav}>
            <Pressable
              style={styles.navBtn}
              onPress={() => setPanel("agenda")}
            >
              <Text style={styles.navBtnText}>Agenda</Text>
            </Pressable>
            <Pressable
              style={styles.navBtn}
              onPress={() => setPanel("family")}
            >
              <Text style={styles.navBtnText}>Family</Text>
            </Pressable>
          </View>
        </>
      )}
      {me !== null && (
        <>
          <IcsSection token={props.token} householdId={me.householdId} />
          <ReminderSettings token={props.token} />
          <BillingSection
            token={props.token}
            householdId={me.householdId}
            role={me.role ?? "OWNER"}
          />
        </>
      )}
      <Pressable style={styles.out} onPress={props.onSignOut}>
        <Text style={styles.outText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  line: { fontSize: 15, marginBottom: 8, textAlign: "center" },
  err: { color: "#b00020", textAlign: "center", marginBottom: 8 },
  loader: { marginVertical: 16 },
  nav: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: 20,
  },
  navBtn: {
    backgroundColor: "#eff6ff",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  navBtnText: { color: "#1d4ed8", fontWeight: "600", fontSize: 15 },
  navBtnWide: { flex: 1 },
  out: {
    marginTop: 24,
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  outText: { color: "#2563eb", fontSize: 16 },
});
