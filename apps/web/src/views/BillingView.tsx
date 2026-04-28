import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { apiJson } from "../lib/api";

type BillingStatus = {
  stripeEnabled: boolean;
  subscription: { status: string; id: string | null };
  recentPayments: {
    id: string;
    status: string;
    amountCents: number;
    currency: string;
    description: string | null;
    createdAt: string;
  }[];
};

export function BillingView() {
  const { session } = useAuth();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const isOwner = session?.role === "OWNER";

  const fetchBilling = useCallback(async () => {
    if (!session || !isOwner) return;
    setLoading(true);
    try {
      const data = await apiJson<BillingStatus>(
        `/stripe/billing/${session.householdId}`,
        { token: session.token }
      );
      setBilling(data);
    } catch {
      setBilling(null);
    } finally {
      setLoading(false);
    }
  }, [session, isOwner]);

  useEffect(() => {
    void fetchBilling();
  }, [fetchBilling]);

  if (!session) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Sign in to view billing.
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="rounded-xl border p-4 text-sm text-muted-foreground">
        Only the household owner can manage billing.
      </div>
    );
  }

  const handleCheckout = async () => {
    setMsg(null);
    try {
      const data = await apiJson<{ url: string }>(
        "/stripe/checkout",
        {
          method: "POST",
          token: session.token,
          body: JSON.stringify({
            householdId: session.householdId,
            priceId: import.meta.env.VITE_STRIPE_PRICE_ID ?? "price_placeholder",
            successUrl: `${window.location.origin}/?billing=success`,
            cancelUrl: `${window.location.origin}/?billing=cancel`,
          }),
        }
      );
      window.location.href = data.url;
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Checkout failed");
    }
  };

  const handlePortal = async () => {
    setMsg(null);
    try {
      const data = await apiJson<{ url: string }>(
        "/stripe/portal",
        {
          method: "POST",
          token: session.token,
          body: JSON.stringify({
            householdId: session.householdId,
            returnUrl: window.location.href,
          }),
        }
      );
      window.location.href = data.url;
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Portal failed");
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h2 className="text-xl font-semibold">Billing</h2>

      {msg && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          {msg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !billing?.stripeEnabled ? (
        <div className="rounded-xl border p-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            Stripe is not configured. Set <code>STRIPE_SECRET_KEY</code> on the server to enable payments.
          </p>
          <p className="text-xs text-muted-foreground italic">
            This is not accounting or financial advice.
          </p>
        </div>
      ) : (
        <>
          {/* Subscription status */}
          <div className="rounded-xl border p-4 space-y-3">
            <h3 className="font-medium">Subscription</h3>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                billing.subscription.status === "ACTIVE"
                  ? "bg-emerald-100 text-emerald-700"
                  : billing.subscription.status === "TRIAL"
                    ? "bg-blue-100 text-blue-700"
                    : billing.subscription.status === "PAST_DUE"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-600"
              }`}>
                {billing.subscription.status}
              </span>
            </div>

            {billing.subscription.status === "NONE" || billing.subscription.status === "CANCELLED" ? (
              <button
                className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                onClick={() => void handleCheckout()}
              >
                Subscribe
              </button>
            ) : (
              <button
                className="w-full border border-gray-300 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                onClick={() => void handlePortal()}
              >
                Manage Subscription
              </button>
            )}
          </div>

          {/* Payment history */}
          {billing.recentPayments.length > 0 && (
            <div className="rounded-xl border divide-y">
              <div className="px-4 py-3 bg-gray-50 rounded-t-xl">
                <h3 className="font-medium text-sm text-gray-700">Recent Payments</h3>
              </div>
              {billing.recentPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm">{p.description ?? "Payment"}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {(p.amountCents / 100).toFixed(2)} {p.currency.toUpperCase()}
                    </div>
                    <div className={`text-xs ${
                      p.status === "completed" ? "text-emerald-600" : "text-gray-500"
                    }`}>
                      {p.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground italic text-center">
            This is not accounting or financial advice.
          </p>
        </>
      )}
    </div>
  );
}
