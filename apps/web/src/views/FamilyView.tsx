import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { apiJson } from "@/lib/api";
import { Pencil, Trash2, Plus, X, Check } from "lucide-react";

type Item = { id: string; name: string; notes: string | null; archived: boolean };

function ManageSection({
  title,
  endpoint,
  token,
  householdId,
}: {
  title: string;
  endpoint: "children" | "providers";
  token: string;
  householdId: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  const base = `/households/${householdId}/${endpoint}`;

  const load = useCallback(async () => {
    try {
      const data = await apiJson<{ [k: string]: Item[] }>(base, { token });
      setItems(data[endpoint] ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [base, token, endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd() {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      await apiJson(base, {
        method: "POST",
        token,
        body: JSON.stringify({ name: newName.trim() }),
      });
      setNewName("");
      setAdding(false);
      await load();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(id: string) {
    if (!editName.trim() || busy) return;
    setBusy(true);
    try {
      await apiJson(`${base}/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ name: editName.trim() }),
      });
      setEditId(null);
      await load();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await apiJson(`${base}/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ archived: true }),
      });
      await load();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  const label = endpoint === "children" ? "child" : "tutor";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          {!adding && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-xs"
              onClick={() => {
                setAdding(true);
                setEditId(null);
              }}
            >
              <Plus className="size-3.5" /> Add
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {adding && (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              placeholder={`${label} name`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAdd();
                if (e.key === "Escape") setAdding(false);
              }}
              className="h-9 text-sm"
            />
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              disabled={busy || !newName.trim()}
              onClick={() => void handleAdd()}
            >
              <Check className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              onClick={() => {
                setAdding(false);
                setNewName("");
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        )}

        {loading ? (
          <p className="py-3 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : items.length === 0 && !adding ? (
          <p className="py-3 text-center text-sm text-muted-foreground">
            No {endpoint} yet. Tap Add to create one.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-lg border px-3 py-2"
            >
              {editId === item.id ? (
                <>
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleRename(item.id);
                      if (e.key === "Escape") setEditId(null);
                    }}
                    className="h-8 flex-1 text-sm"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    disabled={busy || !editName.trim()}
                    onClick={() => void handleRename(item.id)}
                  >
                    <Check className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    onClick={() => setEditId(null)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{item.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0 text-muted-foreground"
                    onClick={() => {
                      setEditId(item.id);
                      setEditName(item.name);
                      setAdding(false);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => void handleArchive(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function FamilyView() {
  const { session } = useAuth();

  if (!session) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          Sign in from the Account tab to manage your family.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <ManageSection
        title="Children"
        endpoint="children"
        token={session.token}
        householdId={session.householdId}
      />
      <ManageSection
        title="Tutors"
        endpoint="providers"
        token={session.token}
        householdId={session.householdId}
      />
    </div>
  );
}
