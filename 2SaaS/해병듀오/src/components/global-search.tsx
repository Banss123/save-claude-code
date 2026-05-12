"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Store, ListChecks, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type StoreHit = { id: string; name: string; store_types: { label: string } | null };
type QuestHit = { id: string; store_id: string; title: string; process_step: string | null };

export function GlobalSearch() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState<StoreHit[]>([]);
  const [quests, setQuests] = useState<QuestHit[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // 검색 (200ms debounce)
  useEffect(() => {
    if (!q.trim()) {
      setStores([]);
      setQuests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const [s, qres] = await Promise.all([
        supabase
          .from("stores")
          .select("id, name, store_types(label)")
          .ilike("name", `%${q}%`)
          .is("archived_at", null)
          .limit(5),
        supabase
          .from("v_quest_dashboard")
          .select("id, store_id, title, process_step")
          .ilike("title", `%${q}%`)
          .limit(5),
      ]);
      setStores((s.data ?? []) as unknown as StoreHit[]);
      setQuests((qres.data ?? []) as QuestHit[]);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, supabase]);

  const goStore = (id: string) => {
    router.push(`/app/stores/${id}`);
    setOpen(false);
    setQ("");
  };

  const goQuest = (id: string, storeId: string) => {
    window.dispatchEvent(
      new CustomEvent("banss:focus-notification", {
        detail: { questId: id, storeId },
      }),
    );
    router.push(`/app?quest=${encodeURIComponent(id)}`);
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1 md:max-w-md">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        placeholder="매장·퀘스트 검색"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="w-full rounded-md border bg-background py-1.5 pl-9 pr-8 text-sm outline-none focus:border-foreground/30"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}

      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[420px] overflow-y-auto rounded-md border bg-card shadow-lg">
          {stores.length === 0 && quests.length === 0 && !loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              결과 없음
            </div>
          ) : (
            <>
              {stores.length > 0 && (
                <div>
                  <div className="border-b bg-muted/30 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    매장
                  </div>
                  {stores.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => goStore(s.id)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                      )}
                    >
                      <Store className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.store_types?.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {quests.length > 0 && (
                <div>
                  <div className="border-b border-t bg-muted/30 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    퀘스트
                  </div>
                  {quests.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => goQuest(q.id, q.store_id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <ListChecks className="size-3.5 shrink-0 text-muted-foreground" />
                      {q.process_step && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                          {q.process_step}
                        </span>
                      )}
                      <span className="flex-1 truncate">{q.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
