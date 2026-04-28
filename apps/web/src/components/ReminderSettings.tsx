import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
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

export function ReminderSettings() {
  const { session } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>({ enabled: true, minutesBefore: 30 });
  const [offsets, setOffsets] = useState<number[]>([30]);
  const [saving, setSaving] = useState(false);

  const fetchPrefs = useCallback(async () => {
    if (!session) return;
    try {
      const data = await apiJson<{ preferences: Prefs; allowedOffsets: number[] }>(
        "/reminders/preferences",
        { token: session.token }
      );
      setPrefs(data.preferences);
      setOffsets(data.allowedOffsets);
    } catch {}
  }, [session]);

  useEffect(() => {
    void fetchPrefs();
  }, [fetchPrefs]);

  if (!session) return null;

  async function updatePref(patch: Partial<Prefs>) {
    if (!session) return;
    setSaving(true);
    try {
      const data = await apiJson<{ preferences: Prefs }>(
        "/reminders/preferences",
        {
          method: "PATCH",
          token: session.token,
          body: JSON.stringify(patch),
        }
      );
      setPrefs(data.preferences);
    } catch {}
    setSaving(false);
  }

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Lesson Reminders</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary"
            checked={prefs.enabled}
            disabled={saving}
            onChange={(e) => void updatePref({ enabled: e.target.checked })}
          />
          Enabled
        </label>
      </div>

      {prefs.enabled && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Notify before class</p>
          <div className="flex flex-wrap gap-2">
            {offsets.map((mins) => (
              <button
                key={mins}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  prefs.minutesBefore === mins
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
                disabled={saving}
                onClick={() => void updatePref({ minutesBefore: mins })}
              >
                {OFFSET_LABELS[mins] ?? `${mins} min`}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Push notifications are delivered to your mobile device. Install the mobile app for real-time alerts.
      </p>
    </div>
  );
}
