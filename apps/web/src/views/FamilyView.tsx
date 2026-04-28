import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { apiJson } from "../lib/api";

type Invitation = {
  id: string;
  email: string;
  status: string;
  role: string;
  createdAt: string;
};

export function FamilyView() {
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [acceptToken, setAcceptToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const isOwner = session?.role === "OWNER";

  const fetchInvitations = useCallback(async () => {
    if (!session || !isOwner) return;
    try {
      const data = await apiJson<{ invitations: Invitation[] }>(
        `/invitations?householdId=${session.householdId}`,
        { token: session.token }
      );
      setInvitations(data.invitations);
    } catch {}
  }, [session, isOwner]);

  useEffect(() => {
    void fetchInvitations();
  }, [fetchInvitations]);

  if (!session) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Sign in to manage family members.
      </div>
    );
  }

  const handleSend = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setMsg(null);
    try {
      await apiJson("/invitations", {
        method: "POST",
        token: session.token,
        body: JSON.stringify({
          householdId: session.householdId,
          email: email.trim(),
        }),
      });
      setMsg(`Invitation sent to ${email.trim()}`);
      setEmail("");
      void fetchInvitations();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await apiJson(`/invitations/${id}`, {
        method: "DELETE",
        token: session.token,
      });
      void fetchInvitations();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed to revoke");
    }
  };

  const handleAccept = async () => {
    if (!acceptToken.trim()) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await apiJson<{ message: string }>(
        "/invitations/accept",
        {
          method: "POST",
          token: session.token,
          body: JSON.stringify({ token: acceptToken.trim() }),
        }
      );
      setMsg(res.message);
      setAcceptToken("");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed to accept");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h2 className="text-xl font-semibold">Family Members</h2>

      {msg && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
          {msg}
        </div>
      )}

      {/* Accept invitation */}
      <div className="rounded-xl border p-4 space-y-3">
        <h3 className="font-medium">Accept an Invitation</h3>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            placeholder="Paste invitation token…"
            value={acceptToken}
            onChange={(e) => setAcceptToken(e.target.value)}
          />
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            disabled={loading}
            onClick={handleAccept}
          >
            Accept
          </button>
        </div>
      </div>

      {/* Send invitation — owner only */}
      {isOwner && (
        <div className="rounded-xl border p-4 space-y-3">
          <h3 className="font-medium">Invite a Family Member</h3>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              placeholder="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              disabled={loading}
              onClick={handleSend}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Invitation list — owner only */}
      {isOwner && (
        <div className="rounded-xl border divide-y">
          <div className="px-4 py-3 bg-gray-50 rounded-t-xl">
            <h3 className="font-medium text-sm text-gray-700">Sent Invitations</h3>
          </div>
          {invitations.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No invitations sent yet.
            </div>
          ) : (
            invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <div className="text-sm">{inv.email}</div>
                  <div className="text-xs text-gray-500">
                    {inv.status} &middot; {inv.role}
                  </div>
                </div>
                {inv.status === "PENDING" && (
                  <button
                    className="text-red-600 text-sm font-medium"
                    onClick={() => handleRevoke(inv.id)}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
