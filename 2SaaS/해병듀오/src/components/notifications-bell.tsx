"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, AlertCircle, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  created_at: string;
  quest_id: string | null;
  store_id: string | null;
  lead_id: string | null;
};

type QuestCandidate = {
  id: string;
  store_id: string;
  process_step: string | null;
  source: string | null;
  due_date: string | null;
};

const QUEST_CONTEXT_NOTIFICATION_TYPES = new Set([
  "quest_overdue",
  "medical_law_pending",
  "sheet_missing",
]);

const DEFAULT_NOTIFICATION_SETTINGS = {
  notification_new_quest_enabled: true,
  notification_due_soon_enabled: true,
  notification_blocked_enabled: true,
  notification_store_check_enabled: true,
};
type NotificationSettings = typeof DEFAULT_NOTIFICATION_SETTINGS;

function shouldOpenQuestContext(item: NotificationRow) {
  return QUEST_CONTEXT_NOTIFICATION_TYPES.has(item.type);
}

function isNotificationTypeEnabled(
  item: NotificationRow,
  settings: NotificationSettings,
) {
  if (["manual", "lead_new", "lead_unmatched"].includes(item.type)) {
    return settings.notification_new_quest_enabled;
  }
  if (["quest_overdue", "contract_ending"].includes(item.type)) {
    return settings.notification_due_soon_enabled;
  }
  if (["sheet_missing", "medical_law_pending"].includes(item.type)) {
    return settings.notification_blocked_enabled;
  }
  if (["health_stale", "paused_candidate"].includes(item.type)) {
    return settings.notification_store_check_enabled;
  }
  return true;
}

function matchesNotificationQuest(item: NotificationRow, quest: QuestCandidate) {
  if (item.store_id !== quest.store_id) return false;
  if (item.type === "medical_law_pending") return quest.process_step === "B.5b";
  if (item.type === "sheet_missing") return quest.source === "sheet_missing";
  if (item.type === "quest_overdue") {
    return Boolean(quest.due_date && quest.due_date < new Date().toISOString().slice(0, 10));
  }
  return false;
}

function resolveNotificationQuestId(
  item: NotificationRow,
  candidates: QuestCandidate[],
) {
  if (item.quest_id || !item.store_id || !shouldOpenQuestContext(item)) {
    return item.quest_id;
  }
  const exact = candidates.find((quest) => matchesNotificationQuest(item, quest));
  if (exact) return exact.id;
  return candidates.find((quest) => quest.store_id === item.store_id)?.id ?? null;
}

export function NotificationsBell() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let ignore = false;
    async function loadNotifications() {
      const [{ data: settingRows }, { data }] = await Promise.all([
        supabase
          .from("app_settings")
          .select("key, value")
          .in("key", Object.keys(DEFAULT_NOTIFICATION_SETTINGS)),
        supabase
          .from("notifications")
          .select("id, type, title, body, created_at, quest_id, store_id, lead_id")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      const settings: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS };
      for (const row of settingRows ?? []) {
        if (row.key in settings) {
          settings[row.key as keyof typeof settings] = row.value !== "false";
        }
      }

      const rows = ((data ?? []) as NotificationRow[]).filter((item) =>
        isNotificationTypeEnabled(item, settings),
      );
      const questContextStoreIds = [
        ...new Set(
          rows
            .filter((item) => !item.quest_id && item.store_id && shouldOpenQuestContext(item))
            .map((item) => item.store_id as string),
        ),
      ];

      let questCandidates: QuestCandidate[] = [];
      if (questContextStoreIds.length > 0) {
        const { data: quests } = await supabase
          .from("quests")
          .select("id, store_id, process_step, source, due_date")
          .in("store_id", questContextStoreIds)
          .in("status", ["pending", "blocked"])
          .order("is_pinned", { ascending: false })
          .order("priority")
          .order("due_date");
        questCandidates = (quests ?? []) as QuestCandidate[];
      }

      if (ignore) return;
      setItems(
        rows.map((item) => ({
          ...item,
          quest_id: resolveNotificationQuestId(item, questCandidates),
        })).slice(0, 8),
      );
      setCount(rows.length);
    }

    loadNotifications();
    return () => {
      ignore = true;
    };
  }, [supabase]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPanelPos({
        top: rect.bottom + 6,
        right: Math.max(12, window.innerWidth - rect.right),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-muted-foreground hover:bg-muted"
        aria-label="알림"
      >
        <Bell className="size-4" />
        {count > 0 && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full text-[9px] font-semibold text-white",
              items.some((item) => item.type === "quest_overdue") ? "bg-urgent" : "bg-warning",
            )}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed z-[100] w-72 rounded-md border bg-card shadow-xl"
          style={{ top: panelPos.top, right: panelPos.right }}
        >
          <div className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            알림 {count > 0 ? `${count}건` : ""}
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              대기 중인 알림이 없습니다
            </div>
          ) : (
            <ul className="p-2">
              {items.map((item) => (
                <Item key={item.id} item={item} onSelect={() => setOpen(false)} />
              ))}
            </ul>
          )}
          <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
            알림을 누르면 관련 퀘스트나 매장 화면으로 이동합니다
          </div>
        </div>
      )}
    </div>
  );
}

function notificationHref(item: NotificationRow) {
  if (item.quest_id) return `/app?quest=${encodeURIComponent(item.quest_id)}`;
  if (item.store_id && shouldOpenQuestContext(item)) {
    return `/app?store=${encodeURIComponent(item.store_id)}`;
  }
  if (item.store_id) return `/app/stores/${item.store_id}`;
  if (item.lead_id) return `/app/leads?lead=${item.lead_id}`;
  return "/app";
}

function dispatchFocusEvent(item: NotificationRow) {
  window.dispatchEvent(
    new CustomEvent("banss:focus-notification", {
      detail: {
        questId: item.quest_id,
        storeId: item.store_id,
      },
    }),
  );
}

function Item({
  item,
  onSelect,
}: {
  item: NotificationRow;
  onSelect: () => void;
}) {
  const urgent = item.type === "quest_overdue" || item.type === "medical_law_pending";
  const Icon = urgent ? AlertCircle : Clock;
  const toneClass = urgent ? "text-urgent" : "text-warning";
  return (
    <li>
      <Link
        href={notificationHref(item)}
        onClick={() => {
          dispatchFocusEvent(item);
          onSelect();
        }}
        className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
      >
        <Icon className={cn("mt-0.5 size-3.5 shrink-0", toneClass)} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{item.title}</div>
          {item.body && (
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {item.body}
            </div>
          )}
          <div className="mt-1 text-[11px] text-muted-foreground">
            {item.quest_id ? "퀘스트 열기" : item.store_id ? "매장 보기" : "관련 화면 열기"}
          </div>
        </div>
      </Link>
    </li>
  );
}
