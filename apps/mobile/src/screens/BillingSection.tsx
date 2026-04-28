import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "../lib/api";

type BillingStatus = {
  stripeEnabled: boolean;
  subscription: { status: string; id: string | null };
};

export function BillingSection(props: {
  token: string;
  householdId: string;
  role: string;
}): ReactElement | null {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const isOwner = props.role === "OWNER";

  const fetchBilling = useCallback(async () => {
    if (!isOwner) return;
    setLoading(true);
    try {
      const data = await apiJson<BillingStatus>(
        `/stripe/billing/${props.householdId}`,
        { method: "GET", token: props.token }
      );
      setBilling(data);
    } catch {
      setBilling(null);
    } finally {
      setLoading(false);
    }
  }, [props.token, props.householdId, isOwner]);

  useEffect(() => {
    void fetchBilling();
  }, [fetchBilling]);

  if (!isOwner || !billing?.stripeEnabled) return null;

  const handleCheckout = async () => {
    try {
      const data = await apiJson<{ url: string }>(
        "/stripe/checkout",
        {
          method: "POST",
          token: props.token,
          body: JSON.stringify({
            householdId: props.householdId,
            priceId: "price_placeholder",
            successUrl: "https://example.com/billing-success",
            cancelUrl: "https://example.com/billing-cancel",
          }),
        }
      );
      await Linking.openURL(data.url);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Checkout failed");
    }
  };

  const handlePortal = async () => {
    try {
      const data = await apiJson<{ url: string }>(
        "/stripe/portal",
        {
          method: "POST",
          token: props.token,
          body: JSON.stringify({
            householdId: props.householdId,
            returnUrl: "https://example.com",
          }),
        }
      );
      await Linking.openURL(data.url);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Portal failed");
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Billing</Text>

      {loading ? (
        <Text style={styles.meta}>Loading…</Text>
      ) : (
        <>
          <View style={styles.statusRow}>
            <Text style={styles.label}>Subscription</Text>
            <Text style={[
              styles.badge,
              billing.subscription.status === "ACTIVE" ? styles.badgeActive :
              billing.subscription.status === "PAST_DUE" ? styles.badgeWarn : styles.badgeNone,
            ]}>
              {billing.subscription.status}
            </Text>
          </View>

          {billing.subscription.status === "NONE" || billing.subscription.status === "CANCELLED" ? (
            <Pressable style={styles.primaryBtn} onPress={() => void handleCheckout()}>
              <Text style={styles.primaryBtnText}>Subscribe</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.outlineBtn} onPress={() => void handlePortal()}>
              <Text style={styles.outlineBtnText}>Manage Subscription</Text>
            </Pressable>
          )}

          <Text style={styles.disclaimer}>This is not accounting or financial advice.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20, padding: 12, backgroundColor: "#f8fafc", borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0" },
  heading: { fontWeight: "600", fontSize: 16, marginBottom: 12 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  label: { fontSize: 15 },
  badge: { fontSize: 12, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: "hidden" },
  badgeActive: { backgroundColor: "#d1fae5", color: "#065f46" },
  badgeWarn: { backgroundColor: "#fef3c7", color: "#92400e" },
  badgeNone: { backgroundColor: "#f3f4f6", color: "#6b7280" },
  primaryBtn: { backgroundColor: "#2563eb", padding: 12, borderRadius: 8, alignItems: "center", marginBottom: 8 },
  primaryBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  outlineBtn: { borderWidth: 1, borderColor: "#d1d5db", padding: 12, borderRadius: 8, alignItems: "center", marginBottom: 8 },
  outlineBtnText: { color: "#374151", fontWeight: "600", fontSize: 15 },
  disclaimer: { fontSize: 11, color: "#9ca3af", textAlign: "center", fontStyle: "italic", marginTop: 4 },
  meta: { fontSize: 14, color: "#9ca3af" },
});
