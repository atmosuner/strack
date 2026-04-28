import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiJson } from "@/lib/api";

type PickerItem = { id: string; name: string };

type LessonRow = {
  id: string;
  seriesId: string | null;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  notes: string | null;
  recurrenceRule: unknown;
  isOccurrence: boolean;
  occurrenceDate: string | null;
  paymentStatus?: string;
  child: { id: string; name: string };
  provider: { id: string; name: string };
};

export function LessonForm(props: {
  token: string;
  householdId: string;
  role?: string;
  existing?: LessonRow | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(props.existing?.id);
  const isOccurrence = Boolean(props.existing?.isOccurrence);
  const parentId = props.existing?.seriesId ?? props.existing?.id;

  const [children, setChildren] = useState<PickerItem[]>([]);
  const [providers, setProviders] = useState<PickerItem[]>([]);

  const [childId, setChildId] = useState(props.existing?.child.id ?? "");
  const [providerId, setProviderId] = useState(props.existing?.provider.id ?? "");
  const [title, setTitle] = useState(props.existing?.title ?? "");
  const [date, setDate] = useState(
    props.existing
      ? (props.existing.occurrenceDate ?? props.existing.startAt.slice(0, 10))
      : new Date().toISOString().slice(0, 10)
  );
  const [startTime, setStartTime] = useState(
    props.existing ? props.existing.startAt.slice(11, 16) : "10:00"
  );
  const [endTime, setEndTime] = useState(
    props.existing ? props.existing.endAt.slice(11, 16) : "11:00"
  );
  const [location, setLocation] = useState(props.existing?.location ?? "");
  const [notes, setNotes] = useState(props.existing?.notes ?? "");

  const isOwner = props.role === "OWNER";
  const [paymentStatus, setPaymentStatus] = useState(
    props.existing?.paymentStatus ?? "UNPAID"
  );

  const [recurring, setRecurring] = useState(false);
  const [interval, setInterval] = useState("1");
  const [repeatCount, setRepeatCount] = useState("12");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPickers = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        apiJson<{ children: PickerItem[] }>(
          `/households/${props.householdId}/children`,
          { token: props.token }
        ),
        apiJson<{ providers: PickerItem[] }>(
          `/households/${props.householdId}/providers`,
          { token: props.token }
        ),
      ]);
      setChildren(c.children);
      setProviders(p.providers);
      if (!childId && c.children.length > 0) setChildId(c.children[0].id);
      if (!providerId && p.providers.length > 0) setProviderId(p.providers[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load options");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.householdId, props.token]);

  useEffect(() => {
    void loadPickers();
  }, [loadPickers]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!childId || !providerId) {
      setError("Select a child and provider");
      return;
    }
    const startAt = `${date}T${startTime}:00Z`;
    const endAt = `${date}T${endTime}:00Z`;
    if (new Date(endAt) <= new Date(startAt)) {
      setError("End time must be after start time");
      return;
    }

    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      childId,
      providerId,
      title: title.trim(),
      startAt,
      endAt,
      location: location.trim() || null,
      notes: notes.trim() || null,
    };

    try {
      if (isOccurrence && parentId && props.existing?.occurrenceDate) {
        await apiJson(
          `/households/${props.householdId}/lessons/${parentId}/exceptions`,
          {
            method: "POST",
            token: props.token,
            body: JSON.stringify({
              date: props.existing.occurrenceDate,
              action: "edit",
              ...payload,
            }),
          }
        );
      } else if (isEdit && props.existing) {
        if (isOwner) payload.paymentStatus = paymentStatus;
        await apiJson(
          `/households/${props.householdId}/lessons/${props.existing.id}`,
          { method: "PATCH", token: props.token, body: JSON.stringify(payload) }
        );
      } else {
        if (recurring) {
          payload.recurrenceRule = {
            freq: "weekly",
            interval: Math.max(1, parseInt(interval, 10) || 1),
            count: Math.max(1, parseInt(repeatCount, 10) || 12),
          };
        }
        await apiJson(`/households/${props.householdId}/lessons`, {
          method: "POST",
          token: props.token,
          body: JSON.stringify(payload),
        });
      }
      props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    if (!parentId || !props.existing?.occurrenceDate) return;
    if (!confirm("Skip this occurrence?")) return;

    setSaving(true);
    try {
      await apiJson(
        `/households/${props.householdId}/lessons/${parentId}/exceptions`,
        {
          method: "POST",
          token: props.token,
          body: JSON.stringify({
            date: props.existing.occurrenceDate,
            action: "skip",
          }),
        }
      );
      props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Skip failed");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!props.existing?.id) return;
    const label = props.existing.recurrenceRule
      ? "Delete entire series?"
      : "Delete this lesson?";
    if (!confirm(label)) return;

    setSaving(true);
    try {
      await apiJson(
        `/households/${props.householdId}/lessons/${props.existing.id}`,
        { method: "DELETE", token: props.token }
      );
      props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setSaving(false);
    }
  }

  function chipClasses(active: boolean) {
    return `rounded-full border px-3 py-1 text-sm transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border text-muted-foreground hover:border-primary/40"
    }`;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {isOccurrence
            ? "Edit Occurrence"
            : isEdit
              ? "Edit Lesson"
              : "New Lesson"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input placeholder="e.g. Piano Lesson" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="space-y-1">
            <Label>Child</Label>
            <div className="flex flex-wrap gap-2">
              {children.map((c) => (
                <button type="button" key={c.id} className={chipClasses(childId === c.id)} onClick={() => setChildId(c.id)}>
                  {c.name}
                </button>
              ))}
              {children.length === 0 && <span className="text-sm text-muted-foreground">No children yet.</span>}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Provider</Label>
            <div className="flex flex-wrap gap-2">
              {providers.map((p) => (
                <button type="button" key={p.id} className={chipClasses(providerId === p.id)} onClick={() => setProviderId(p.id)}>
                  {p.name}
                </button>
              ))}
              {providers.length === 0 && <span className="text-sm text-muted-foreground">No providers yet.</span>}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>End</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Location (optional)</Label>
            <Input placeholder="e.g. Studio A" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Input placeholder="Any notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {!isEdit && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  className="accent-primary"
                />
                Repeat weekly
              </label>
              {recurring && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Every N weeks</Label>
                    <Input type="number" min={1} max={4} value={interval} onChange={(e) => setInterval(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Occurrences</Label>
                    <Input type="number" min={1} max={200} value={repeatCount} onChange={(e) => setRepeatCount(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {isOwner && isEdit && (
            <div className="space-y-1">
              <Label>Payment Status</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    paymentStatus === "UNPAID"
                      ? "border-amber-400 bg-amber-50 text-amber-800"
                      : "border-border text-muted-foreground hover:border-amber-300"
                  }`}
                  onClick={() => setPaymentStatus("UNPAID")}
                >
                  Unpaid
                </button>
                <button
                  type="button"
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    paymentStatus === "PAID"
                      ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                      : "border-border text-muted-foreground hover:border-emerald-300"
                  }`}
                  onClick={() => setPaymentStatus("PAID")}
                >
                  Paid
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={props.onCancel}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving
                ? "Saving…"
                : isOccurrence
                  ? "Save Occurrence"
                  : isEdit
                    ? "Update"
                    : "Create"}
            </Button>
          </div>

          {isOccurrence && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              onClick={() => void handleSkip()}
              disabled={saving}
            >
              Skip This Occurrence
            </Button>
          )}

          {isEdit && !isOccurrence && (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-destructive"
              onClick={() => void handleDelete()}
              disabled={saving}
            >
              {props.existing?.recurrenceRule ? "Delete Entire Series" : "Delete Lesson"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
