import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/database.types";

type Store360Row = Database["public"]["Views"]["v_store_360"]["Row"];
type QuestRow = Database["public"]["Tables"]["quests"]["Row"];
type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type StoreToneProfileRow =
  Database["public"]["Tables"]["store_tone_profiles"]["Row"];
type KakaoNotificationEventRow =
  Database["public"]["Tables"]["kakao_notification_events"]["Row"];
type KakaoConversationMessageRow =
  Database["public"]["Tables"]["kakao_conversation_messages"]["Row"];

export type AipAllowedAction =
  | {
      type: "complete_quest";
      serverAction: "completeQuest";
      requiresUserConfirmation: true;
    }
  | {
      type: "delegate_quest";
      serverAction: "delegateQuest";
      requiresUserConfirmation: true;
    }
  | {
      type: "skip_quest";
      serverAction: "skipQuest";
      requiresUserConfirmation: true;
    }
  | {
      type: "add_quest_note";
      serverAction: "addQuestNote";
      requiresUserConfirmation: true;
    }
  | {
      type: "draft_owner_message";
      serverAction: null;
      requiresUserConfirmation: true;
    };

export type AipQuestSummary = {
  id: string;
  title: string;
  description: string | null;
  processStep: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  source: string;
  isPinned: boolean;
  hasExternalUrl: boolean;
};

export type AipCommunicationSummary = {
  id: string;
  channelCode: string | null;
  direction: string | null;
  summary: string;
  occurredAt: string;
  nextAction: string | null;
  nextActionDate: string | null;
};

export type AipToneProfileSummary = {
  toneSummary: string | null;
  ownerResponseSummary: string | null;
  formalityLevel: number;
  warmthLevel: number;
  emojiLevel: number;
  messageLength: string;
  learnedFromEventCount: number;
  samplePhrases: string[];
};

export type AipKakaoMessageSummary = {
  source: "notification" | "import";
  occurredAt: string;
  roomTitle: string | null;
  senderKind: string | null;
  senderName: string | null;
  messageSnippet: string;
  status: string | null;
};

export type AipContext = {
  version: "aip-context.v1";
  generatedAt: string;
  source: "quest" | "store";
  store: {
    id: string;
    name: string;
    typeCode: string | null;
    typeLabel: string | null;
    status: string | null;
    address: string | null;
    currentRound: number | null;
    mainKeyword: string | null;
    mainKeywordTranslation: string | null;
    mainKeywordsI18n: Record<string, string>;
    assignedOwnerName: string | null;
    assignedMarketerName: string | null;
  };
  ownerProfile: {
    ownerName: string | null;
    contactAvailable: {
      phone: boolean;
      email: boolean;
    };
    countryFocus: string | null;
    channelPreferences: string[];
    priority: string | null;
    memo: string | null;
  };
  operatingSignals: {
    healthStatus: string | null;
    daysSinceHealthCheck: number | null;
    daysSinceStart: number | null;
    daysUntilContractEnd: number | null;
    activeQuestCount: number | null;
    overdueQuestCount: number | null;
    commCount30d: number | null;
    lastCommAt: string | null;
    missingLinks: string[];
  };
  selectedQuest: AipQuestSummary | null;
  activeQuests: AipQuestSummary[];
  recentComms: AipCommunicationSummary[];
  recentIssues: AipCommunicationSummary[];
  toneProfile: AipToneProfileSummary | null;
  recentKakaoMessages: AipKakaoMessageSummary[];
  pendingNotifications: Array<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    createdAt: string;
    questId: string | null;
  }>;
  allowedActions: AipAllowedAction[];
  guardrails: {
    directDbWritesAllowed: false;
    requiresUserApprovalForActions: true;
    rawContactDetailsIncluded: false;
  };
};

const ALLOWED_ACTIONS: AipAllowedAction[] = [
  {
    type: "complete_quest",
    serverAction: "completeQuest",
    requiresUserConfirmation: true,
  },
  {
    type: "delegate_quest",
    serverAction: "delegateQuest",
    requiresUserConfirmation: true,
  },
  {
    type: "skip_quest",
    serverAction: "skipQuest",
    requiresUserConfirmation: true,
  },
  {
    type: "add_quest_note",
    serverAction: "addQuestNote",
    requiresUserConfirmation: true,
  },
  {
    type: "draft_owner_message",
    serverAction: null,
    requiresUserConfirmation: true,
  },
];

export async function getAipContextForQuest(
  questId: string,
): Promise<AipContext | null> {
  const supabase = await createClient();
  const { data: quest, error: questError } = await supabase
    .from("quests")
    .select("*")
    .eq("id", questId)
    .single();

  if (questError || !quest) return null;
  return getAipContextForStore(quest.store_id, quest);
}

export async function getAipContextForStore(
  storeId: string,
  selectedQuest?: QuestRow | null,
): Promise<AipContext | null> {
  const supabase = await createClient();
  const [
    { data: store, error: storeError },
    { data: notifications },
    { data: toneProfile },
    { data: kakaoEvents },
    { data: kakaoMessages },
  ] = await Promise.all([
      supabase
        .from("v_store_360")
        .select("*")
        .eq("store_id", storeId)
        .single(),
      supabase
        .from("notifications")
        .select("*")
        .eq("store_id", storeId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("store_tone_profiles")
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle(),
      supabase
        .from("kakao_notification_events")
        .select("*")
        .eq("store_id", storeId)
        .order("received_at", { ascending: false })
        .limit(8),
      supabase
        .from("kakao_conversation_messages")
        .select("*")
        .eq("store_id", storeId)
        .order("sent_at", { ascending: false })
        .limit(8),
    ]);

  if (storeError || !store?.store_id || !store.store_name) return null;

  return buildAipContext({
    source: selectedQuest ? "quest" : "store",
    store,
    selectedQuest: selectedQuest ?? null,
    notifications: notifications ?? [],
    toneProfile: toneProfile ?? null,
    kakaoEvents: kakaoEvents ?? [],
    kakaoMessages: kakaoMessages ?? [],
  });
}

function buildAipContext({
  source,
  store,
  selectedQuest,
  notifications,
  toneProfile,
  kakaoEvents,
  kakaoMessages,
}: {
  source: AipContext["source"];
  store: Store360Row;
  selectedQuest: QuestRow | null;
  notifications: NotificationRow[];
  toneProfile: StoreToneProfileRow | null;
  kakaoEvents: KakaoNotificationEventRow[];
  kakaoMessages: KakaoConversationMessageRow[];
}): AipContext {
  const activeQuests = toQuestSummaries(store.active_quests);

  return {
    version: "aip-context.v1",
    generatedAt: new Date().toISOString(),
    source,
    store: {
      id: store.store_id ?? "",
      name: store.store_name ?? "",
      typeCode: store.type_code,
      typeLabel: store.type_label,
      status: store.status,
      address: store.address,
      currentRound: store.current_round,
      mainKeyword: store.main_keyword,
      mainKeywordTranslation: store.main_keyword_translation,
      mainKeywordsI18n: stringRecord(store.main_keywords_i18n),
      assignedOwnerName: store.assigned_owner_name,
      assignedMarketerName: store.assigned_marketer_name,
    },
    ownerProfile: {
      ownerName: store.owner_name,
      contactAvailable: {
        phone: Boolean(store.owner_phone),
        email: Boolean(store.owner_email),
      },
      countryFocus: store.country_focus,
      channelPreferences: store.channel_preferences ?? [],
      priority: store.owner_priority,
      memo: store.owner_memo,
    },
    operatingSignals: {
      healthStatus: store.health_status,
      daysSinceHealthCheck: store.days_since_health_check,
      daysSinceStart: store.days_since_start,
      daysUntilContractEnd: store.days_until_contract_end,
      activeQuestCount: store.active_quest_count,
      overdueQuestCount: store.overdue_quest_count,
      commCount30d: store.comm_count_30d,
      lastCommAt: store.last_comm_at,
      missingLinks: missingLinks(store),
    },
    selectedQuest: selectedQuest ? tableQuestSummary(selectedQuest) : null,
    activeQuests,
    recentComms: toComms(store.recent_comms),
    recentIssues: toComms(store.recent_issues),
    toneProfile: toneProfile ? toToneProfile(toneProfile) : null,
    recentKakaoMessages: toKakaoMessages(kakaoEvents, kakaoMessages),
    pendingNotifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      createdAt: n.created_at,
      questId: n.quest_id,
    })),
    allowedActions: ALLOWED_ACTIONS,
    guardrails: {
      directDbWritesAllowed: false,
      requiresUserApprovalForActions: true,
      rawContactDetailsIncluded: false,
    },
  };
}

function tableQuestSummary(quest: QuestRow): AipQuestSummary {
  return {
    id: quest.id,
    title: quest.title,
    description: quest.description,
    processStep: quest.process_step,
    status: quest.status,
    priority: quest.priority,
    dueDate: quest.due_date,
    source: quest.source,
    isPinned: quest.is_pinned,
    hasExternalUrl: Boolean(quest.external_url),
  };
}

function toQuestSummaries(value: Json | null): AipQuestSummary[] {
  return jsonArray(value).map((item) => ({
    id: stringValue(item.id),
    title: stringValue(item.title),
    description: nullableString(item.description),
    processStep: nullableString(item.process_step),
    status: stringValue(item.status),
    priority: stringValue(item.priority),
    dueDate: nullableString(item.due_date),
    source: stringValue(item.source),
    isPinned: Boolean(item.is_pinned),
    hasExternalUrl: Boolean(item.external_url),
  }));
}

function toComms(value: Json | null): AipCommunicationSummary[] {
  return jsonArray(value).map((item) => ({
    id: stringValue(item.id),
    channelCode: nullableString(item.channel_code),
    direction: nullableString(item.direction),
    summary: stringValue(item.summary),
    occurredAt: stringValue(item.occurred_at),
    nextAction: nullableString(item.next_action),
    nextActionDate: nullableString(item.next_action_date),
  }));
}

function toToneProfile(profile: StoreToneProfileRow): AipToneProfileSummary {
  return {
    toneSummary: profile.tone_summary,
    ownerResponseSummary: profile.owner_response_summary,
    formalityLevel: profile.formality_level,
    warmthLevel: profile.warmth_level,
    emojiLevel: profile.emoji_level,
    messageLength: profile.message_length,
    learnedFromEventCount: profile.learned_from_event_count,
    samplePhrases: profile.sample_phrases
      .slice(0, 5)
      .map((phrase) => sanitizeTextForAip(phrase, 120)),
  };
}

function toKakaoMessages(
  events: KakaoNotificationEventRow[],
  messages: KakaoConversationMessageRow[],
): AipKakaoMessageSummary[] {
  const rows: AipKakaoMessageSummary[] = [
    ...events.map((event) => ({
      source: "notification" as const,
      occurredAt: event.posted_at ?? event.received_at,
      roomTitle: event.room_title,
      senderKind: event.sender_kind,
      senderName: event.sender_name,
      messageSnippet: sanitizeTextForAip(event.message_text, 240),
      status: event.status,
    })),
    ...messages.map((message) => ({
      source: "import" as const,
      occurredAt: message.sent_at ?? message.created_at,
      roomTitle: message.room_title,
      senderKind: message.sender_kind,
      senderName: message.sender_name,
      messageSnippet: sanitizeTextForAip(message.message_text, 240),
      status: null,
    })),
  ];
  return rows
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 12);
}

function sanitizeTextForAip(text: string, maxLength: number) {
  return text
    .replace(/010[-\s]?\d{4}[-\s]?\d{4}/g, "[phone]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function jsonArray(value: Json | null): Record<string, Json>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, Json> => isRecord(item))
    : [];
}

function isRecord(value: Json): value is Record<string, Json> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringRecord(value: Json | null): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => typeof v === "string")
      .map(([k, v]) => [k, v as string]),
  );
}

function stringValue(value: Json | undefined): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function missingLinks(store: Store360Row): string[] {
  const requiredLinks: Array<[string, string | null]> = [
    ["naver_place_url", store.naver_place_url],
    ["google_map_url", store.google_map_url],
    ["drive_folder_url", store.drive_folder_url],
    ["onboarding_sheet_url", store.onboarding_sheet_url],
    ["checklist_sheet_url", store.checklist_sheet_url],
    ["review_sheet_url", store.review_sheet_url],
  ];

  return requiredLinks
    .filter(([, value]) => !value)
    .map(([label]) => label);
}
