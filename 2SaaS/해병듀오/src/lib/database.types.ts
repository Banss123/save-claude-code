export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          actor_id: string | null
          category: string
          id: number
          metadata: Json
          occurred_at: string
          ref_id: string | null
          ref_table: string | null
          store_id: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          category: string
          id?: number
          metadata?: Json
          occurred_at?: string
          ref_id?: string | null
          ref_table?: string | null
          store_id?: string | null
          type: string
        }
        Update: {
          actor_id?: string | null
          category?: string
          id?: number
          metadata?: Json
          occurred_at?: string
          ref_id?: string | null
          ref_table?: string | null
          store_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      aip_execution_logs: {
        Row: {
          action_type: string
          actor_id: string | null
          context_version: string | null
          created_at: string
          id: string
          input_hash: string | null
          input_preview: string | null
          metadata: Json
          model: string | null
          output_hash: string | null
          output_preview: string | null
          proposed_action_id: string | null
          provider: string
          quest_id: string | null
          reasoning: string | null
          risk_flags: Json
          status: string
          store_id: string | null
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          context_version?: string | null
          created_at?: string
          id?: string
          input_hash?: string | null
          input_preview?: string | null
          metadata?: Json
          model?: string | null
          output_hash?: string | null
          output_preview?: string | null
          proposed_action_id?: string | null
          provider: string
          quest_id?: string | null
          reasoning?: string | null
          risk_flags?: Json
          status?: string
          store_id?: string | null
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          context_version?: string | null
          created_at?: string
          id?: string
          input_hash?: string | null
          input_preview?: string | null
          metadata?: Json
          model?: string | null
          output_hash?: string | null
          output_preview?: string | null
          proposed_action_id?: string | null
          provider?: string
          quest_id?: string | null
          reasoning?: string | null
          risk_flags?: Json
          status?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aip_execution_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aip_execution_logs_proposed_action_id_fkey"
            columns: ["proposed_action_id"]
            isOneToOne: false
            referencedRelation: "proposed_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aip_execution_logs_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aip_execution_logs_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "v_quest_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aip_execution_logs_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "v_quest_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aip_execution_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aip_execution_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          attendees: string[] | null
          created_at: string
          created_by: string | null
          end_at: string | null
          event_type: string
          id: string
          location: string | null
          note: string | null
          start_at: string
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          attendees?: string[] | null
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          event_type: string
          id?: string
          location?: string | null
          note?: string | null
          start_at: string
          store_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          attendees?: string[] | null
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          event_type?: string
          id?: string
          location?: string | null
          note?: string | null
          start_at?: string
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      check_templates: {
        Row: {
          active: boolean
          applies_to_status:
            | Database["public"]["Enums"]["store_status"][]
            | null
          category: string
          created_at: string
          description: string | null
          frequency: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          applies_to_status?:
            | Database["public"]["Enums"]["store_status"][]
            | null
          category: string
          created_at?: string
          description?: string | null
          frequency: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          applies_to_status?:
            | Database["public"]["Enums"]["store_status"][]
            | null
          category?: string
          created_at?: string
          description?: string | null
          frequency?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      communication_channels: {
        Row: {
          code: string
          label: string
          sort_order: number
        }
        Insert: {
          code: string
          label: string
          sort_order?: number
        }
        Update: {
          code?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      communications: {
        Row: {
          body: string | null
          channel_code: string
          created_at: string
          direction: string
          id: string
          metadata: Json
          next_action: string | null
          next_action_date: string | null
          occurred_at: string
          recorded_by: string | null
          store_id: string
          summary: string
        }
        Insert: {
          body?: string | null
          channel_code: string
          created_at?: string
          direction: string
          id?: string
          metadata?: Json
          next_action?: string | null
          next_action_date?: string | null
          occurred_at?: string
          recorded_by?: string | null
          store_id: string
          summary: string
        }
        Update: {
          body?: string | null
          channel_code?: string
          created_at?: string
          direction?: string
          id?: string
          metadata?: Json
          next_action?: string | null
          next_action_date?: string | null
          occurred_at?: string
          recorded_by?: string | null
          store_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_channel_code_fkey"
            columns: ["channel_code"]
            isOneToOne: false
            referencedRelation: "communication_channels"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "communications_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      gbp_snapshots: {
        Row: {
          calls: number | null
          created_at: string
          direction_requests: number | null
          id: number
          measured_on: string
          period_days: number | null
          raw_json: Json | null
          recorded_by: string | null
          reviews_avg: number | null
          reviews_count: number | null
          source: string
          store_id: string
          views: number | null
          website_clicks: number | null
        }
        Insert: {
          calls?: number | null
          created_at?: string
          direction_requests?: number | null
          id?: number
          measured_on: string
          period_days?: number | null
          raw_json?: Json | null
          recorded_by?: string | null
          reviews_avg?: number | null
          reviews_count?: number | null
          source?: string
          store_id: string
          views?: number | null
          website_clicks?: number | null
        }
        Update: {
          calls?: number | null
          created_at?: string
          direction_requests?: number | null
          id?: number
          measured_on?: string
          period_days?: number | null
          raw_json?: Json | null
          recorded_by?: string | null
          reviews_avg?: number | null
          reviews_count?: number | null
          source?: string
          store_id?: string
          views?: number | null
          website_clicks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gbp_snapshots_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gbp_snapshots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gbp_snapshots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      google_accounts: {
        Row: {
          avatar_url: string | null
          connected_at: string
          created_at: string
          display_name: string | null
          email: string
          google_sub: string
          id: string
          last_synced_at: string | null
          metadata: Json
          profile_id: string
          refresh_token_ciphertext: string
          revoked_at: string | null
          scopes: string[]
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          connected_at?: string
          created_at?: string
          display_name?: string | null
          email: string
          google_sub: string
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          profile_id: string
          refresh_token_ciphertext: string
          revoked_at?: string | null
          scopes?: string[]
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          connected_at?: string
          created_at?: string
          display_name?: string | null
          email?: string
          google_sub?: string
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          profile_id?: string
          refresh_token_ciphertext?: string
          revoked_at?: string | null
          scopes?: string[]
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_sync_sources: {
        Row: {
          access_role: string | null
          created_at: string
          description: string | null
          google_account_id: string
          google_calendar_id: string
          id: string
          is_primary: boolean
          last_full_sync_at: string | null
          last_incremental_sync_at: string | null
          profile_id: string
          selected: boolean
          summary: string
          sync_token: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          access_role?: string | null
          created_at?: string
          description?: string | null
          google_account_id: string
          google_calendar_id: string
          id?: string
          is_primary?: boolean
          last_full_sync_at?: string | null
          last_incremental_sync_at?: string | null
          profile_id: string
          selected?: boolean
          summary: string
          sync_token?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          access_role?: string | null
          created_at?: string
          description?: string | null
          google_account_id?: string
          google_calendar_id?: string
          id?: string
          is_primary?: boolean
          last_full_sync_at?: string | null
          last_incremental_sync_at?: string | null
          profile_id?: string
          selected?: boolean
          summary?: string
          sync_token?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_sync_sources_google_account_id_fkey"
            columns: ["google_account_id"]
            isOneToOne: false
            referencedRelation: "google_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_sync_sources_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      google_task_sync_sources: {
        Row: {
          created_at: string
          google_account_id: string
          google_tasklist_id: string
          id: string
          last_synced_at: string | null
          profile_id: string
          selected: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          google_account_id: string
          google_tasklist_id: string
          id?: string
          last_synced_at?: string | null
          profile_id: string
          selected?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          google_account_id?: string
          google_tasklist_id?: string
          id?: string
          last_synced_at?: string | null
          profile_id?: string
          selected?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_task_sync_sources_google_account_id_fkey"
            columns: ["google_account_id"]
            isOneToOne: false
            referencedRelation: "google_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_task_sync_sources_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kakao_conversation_imports: {
        Row: {
          error_message: string | null
          id: string
          imported_at: string
          imported_by: string | null
          message_count: number
          parsed_at: string | null
          raw_meta: Json
          raw_text_hash: string
          room_title: string | null
          source_file_name: string | null
          status: string
          store_id: string
        }
        Insert: {
          error_message?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          message_count?: number
          parsed_at?: string | null
          raw_meta?: Json
          raw_text_hash: string
          room_title?: string | null
          source_file_name?: string | null
          status?: string
          store_id: string
        }
        Update: {
          error_message?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          message_count?: number
          parsed_at?: string | null
          raw_meta?: Json
          raw_text_hash?: string
          room_title?: string | null
          source_file_name?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kakao_conversation_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_conversation_imports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_conversation_imports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      kakao_conversation_messages: {
        Row: {
          created_at: string
          features: Json
          id: string
          import_id: string
          line_number: number | null
          message_text: string
          room_title: string | null
          sender_kind: string | null
          sender_name: string | null
          sender_profile_id: string | null
          sent_at: string | null
          source_hash: string
          store_id: string
        }
        Insert: {
          created_at?: string
          features?: Json
          id?: string
          import_id: string
          line_number?: number | null
          message_text: string
          room_title?: string | null
          sender_kind?: string | null
          sender_name?: string | null
          sender_profile_id?: string | null
          sent_at?: string | null
          source_hash: string
          store_id: string
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          import_id?: string
          line_number?: number | null
          message_text?: string
          room_title?: string | null
          sender_kind?: string | null
          sender_name?: string | null
          sender_profile_id?: string | null
          sent_at?: string | null
          source_hash?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kakao_conversation_messages_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "kakao_conversation_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_conversation_messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_conversation_messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_conversation_messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      kakao_ingest_batches: {
        Row: {
          completed_at: string | null
          device_id: string | null
          duplicate_count: number
          event_count: number
          failed_count: number
          id: string
          ignored_count: number
          inserted_count: number
          proposed_count: number
          raw_meta: Json
          received_at: string
          request_hash: string | null
        }
        Insert: {
          completed_at?: string | null
          device_id?: string | null
          duplicate_count?: number
          event_count?: number
          failed_count?: number
          id?: string
          ignored_count?: number
          inserted_count?: number
          proposed_count?: number
          raw_meta?: Json
          received_at?: string
          request_hash?: string | null
        }
        Update: {
          completed_at?: string | null
          device_id?: string | null
          duplicate_count?: number
          event_count?: number
          failed_count?: number
          id?: string
          ignored_count?: number
          inserted_count?: number
          proposed_count?: number
          raw_meta?: Json
          received_at?: string
          request_hash?: string | null
        }
        Relationships: []
      }
      kakao_notification_event_archives: {
        Row: {
          archive_reason: string
          archived_at: string
          classification: Json
          device_id: string
          error_message: string | null
          event_key: string | null
          id: string
          ignored_reason: string | null
          ingest_batch_id: string | null
          ingest_version: string
          message_text: string
          message_text_hash: string | null
          message_text_length: number | null
          package_name: string
          posted_at: string | null
          processed_at: string | null
          proposed_action_id: string | null
          raw_payload: Json
          received_at: string
          room_kind: string | null
          room_title: string | null
          sender_kind: string | null
          sender_name: string | null
          sender_profile_id: string | null
          source_hash: string
          status: string
          store_id: string | null
          store_match_method: string | null
        }
        Insert: {
          archive_reason?: string
          archived_at?: string
          classification?: Json
          device_id: string
          error_message?: string | null
          event_key?: string | null
          id: string
          ignored_reason?: string | null
          ingest_batch_id?: string | null
          ingest_version?: string
          message_text: string
          message_text_hash?: string | null
          message_text_length?: number | null
          package_name?: string
          posted_at?: string | null
          processed_at?: string | null
          proposed_action_id?: string | null
          raw_payload?: Json
          received_at: string
          room_kind?: string | null
          room_title?: string | null
          sender_kind?: string | null
          sender_name?: string | null
          sender_profile_id?: string | null
          source_hash: string
          status: string
          store_id?: string | null
          store_match_method?: string | null
        }
        Update: {
          archive_reason?: string
          archived_at?: string
          classification?: Json
          device_id?: string
          error_message?: string | null
          event_key?: string | null
          id?: string
          ignored_reason?: string | null
          ingest_batch_id?: string | null
          ingest_version?: string
          message_text?: string
          message_text_hash?: string | null
          message_text_length?: number | null
          package_name?: string
          posted_at?: string | null
          processed_at?: string | null
          proposed_action_id?: string | null
          raw_payload?: Json
          received_at?: string
          room_kind?: string | null
          room_title?: string | null
          sender_kind?: string | null
          sender_name?: string | null
          sender_profile_id?: string | null
          source_hash?: string
          status?: string
          store_id?: string | null
          store_match_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kakao_notification_event_archives_ingest_batch_id_fkey"
            columns: ["ingest_batch_id"]
            isOneToOne: false
            referencedRelation: "kakao_ingest_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_notification_event_archives_proposed_action_id_fkey"
            columns: ["proposed_action_id"]
            isOneToOne: false
            referencedRelation: "proposed_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_notification_event_archives_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_notification_event_archives_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_notification_event_archives_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      kakao_notification_events: {
        Row: {
          classification: Json
          device_id: string
          error_message: string | null
          event_key: string | null
          id: string
          ignored_reason: string | null
          ingest_batch_id: string | null
          ingest_version: string
          message_text: string
          message_text_hash: string | null
          message_text_length: number | null
          package_name: string
          posted_at: string | null
          processed_at: string | null
          proposed_action_id: string | null
          raw_payload: Json
          received_at: string
          room_kind: string | null
          room_title: string | null
          sender_kind: string | null
          sender_name: string | null
          sender_profile_id: string | null
          source_hash: string
          status: string
          store_id: string | null
          store_match_method: string | null
        }
        Insert: {
          classification?: Json
          device_id: string
          error_message?: string | null
          event_key?: string | null
          id?: string
          ignored_reason?: string | null
          ingest_batch_id?: string | null
          ingest_version?: string
          message_text: string
          message_text_hash?: string | null
          message_text_length?: number | null
          package_name?: string
          posted_at?: string | null
          processed_at?: string | null
          proposed_action_id?: string | null
          raw_payload?: Json
          received_at?: string
          room_kind?: string | null
          room_title?: string | null
          sender_kind?: string | null
          sender_name?: string | null
          sender_profile_id?: string | null
          source_hash: string
          status?: string
          store_id?: string | null
          store_match_method?: string | null
        }
        Update: {
          classification?: Json
          device_id?: string
          error_message?: string | null
          event_key?: string | null
          id?: string
          ignored_reason?: string | null
          ingest_batch_id?: string | null
          ingest_version?: string
          message_text?: string
          message_text_hash?: string | null
          message_text_length?: number | null
          package_name?: string
          posted_at?: string | null
          processed_at?: string | null
          proposed_action_id?: string | null
          raw_payload?: Json
          received_at?: string
          room_kind?: string | null
          room_title?: string | null
          sender_kind?: string | null
          sender_name?: string | null
          sender_profile_id?: string | null
          source_hash?: string
          status?: string
          store_id?: string | null
          store_match_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kakao_notification_events_ingest_batch_id_fkey"
            columns: ["ingest_batch_id"]
            isOneToOne: false
            referencedRelation: "kakao_ingest_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_notification_events_proposed_action_id_fkey"
            columns: ["proposed_action_id"]
            isOneToOne: false
            referencedRelation: "proposed_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_notification_events_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_notification_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_notification_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      kakao_room_mappings: {
        Row: {
          active: boolean
          created_at: string
          id: string
          room_title: string
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          room_title: string
          store_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          room_title?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kakao_room_mappings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakao_room_mappings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      keyword_rankings: {
        Row: {
          created_at: string
          id: number
          keyword_id: string
          measured_on: string
          note: string | null
          rank: number | null
          source: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          keyword_id: string
          measured_on: string
          note?: string | null
          rank?: number | null
          source?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          keyword_id?: string
          measured_on?: string
          note?: string | null
          rank?: number | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "keyword_rankings_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id"]
          },
        ]
      }
      keywords: {
        Row: {
          active: boolean
          created_at: string
          id: string
          region: string | null
          sort_order: number
          store_id: string
          text: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          region?: string | null
          sort_order?: number
          store_id: string
          text: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          region?: string | null
          sort_order?: number
          store_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "keywords_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keywords_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      lead_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: string
          lead_id: string
          occurred_at: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: string
          lead_id: string
          occurred_at?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: string
          lead_id?: string
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_audit_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_campaigns: {
        Row: {
          budget_total: number | null
          campaign_name: string
          created_at: string
          ended_at: string | null
          external_id: string | null
          id: string
          metadata: Json
          platform: string
          started_at: string | null
          status: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          budget_total?: number | null
          campaign_name: string
          created_at?: string
          ended_at?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          platform: string
          started_at?: string | null
          status?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          budget_total?: number | null
          campaign_name?: string
          created_at?: string
          ended_at?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          platform?: string
          started_at?: string | null
          status?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_campaigns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_campaigns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      leads: {
        Row: {
          age: number | null
          assigned_to: string | null
          campaign_id: string | null
          closed_at: string | null
          contacted_at: string | null
          created_at: string
          id: string
          memo: string | null
          name: string | null
          phone: string | null
          raw_data: Json
          region: string | null
          source_cell: string | null
          source_channel:
            | Database["public"]["Enums"]["lead_source_channel"]
            | null
          source_sheet_row: number | null
          status: Database["public"]["Enums"]["lead_status"]
          store_id: string | null
          updated_at: string
        }
        Insert: {
          age?: number | null
          assigned_to?: string | null
          campaign_id?: string | null
          closed_at?: string | null
          contacted_at?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          name?: string | null
          phone?: string | null
          raw_data?: Json
          region?: string | null
          source_cell?: string | null
          source_channel?:
            | Database["public"]["Enums"]["lead_source_channel"]
            | null
          source_sheet_row?: number | null
          status?: Database["public"]["Enums"]["lead_status"]
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          age?: number | null
          assigned_to?: string | null
          campaign_id?: string | null
          closed_at?: string | null
          contacted_at?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          name?: string | null
          phone?: string | null
          raw_data?: Json
          region?: string | null
          source_cell?: string | null
          source_channel?:
            | Database["public"]["Enums"]["lead_source_channel"]
            | null
          source_sheet_row?: number | null
          status?: Database["public"]["Enums"]["lead_status"]
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "lead_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      notifications: {
        Row: {
          acted_at: string | null
          body: string | null
          created_at: string
          created_date: string
          id: string
          lead_id: string | null
          payload: Json
          quest_id: string | null
          snoozed_until: string | null
          status: Database["public"]["Enums"]["notification_status"]
          store_id: string | null
          target_user_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          acted_at?: string | null
          body?: string | null
          created_at?: string
          created_date?: string
          id?: string
          lead_id?: string | null
          payload?: Json
          quest_id?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          store_id?: string | null
          target_user_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          acted_at?: string | null
          body?: string | null
          created_at?: string
          created_date?: string
          id?: string
          lead_id?: string | null
          payload?: Json
          quest_id?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          store_id?: string | null
          target_user_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "v_quest_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "v_quest_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "notifications_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          code: string
          label: string
          sort_order: number
        }
        Insert: {
          code: string
          label: string
          sort_order?: number
        }
        Update: {
          code?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          metadata: Json
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          metadata?: Json
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      proposed_actions: {
        Row: {
          action_type: string
          confidence: number
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          payload: Json
          priority: Database["public"]["Enums"]["quest_priority"]
          proposed_by: string | null
          quest_id: string | null
          raw_input: string | null
          reasoning: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          action_type?: string
          confidence?: number
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          payload?: Json
          priority?: Database["public"]["Enums"]["quest_priority"]
          proposed_by?: string | null
          quest_id?: string | null
          raw_input?: string | null
          reasoning?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          store_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          confidence?: number
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          payload?: Json
          priority?: Database["public"]["Enums"]["quest_priority"]
          proposed_by?: string | null
          quest_id?: string | null
          raw_input?: string | null
          reasoning?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposed_actions_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposed_actions_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposed_actions_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "v_quest_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposed_actions_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "v_quest_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposed_actions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposed_actions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposed_actions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      quest_assignees: {
        Row: {
          created_at: string
          is_primary: boolean
          profile_id: string
          quest_id: string
        }
        Insert: {
          created_at?: string
          is_primary?: boolean
          profile_id: string
          quest_id: string
        }
        Update: {
          created_at?: string
          is_primary?: boolean
          profile_id?: string
          quest_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quest_assignees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_assignees_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_assignees_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "v_quest_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_assignees_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "v_quest_priority"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_completions: {
        Row: {
          completed_at: string
          completed_by: string | null
          id: number
          metadata: Json
          note: string | null
          quest_id: string
        }
        Insert: {
          completed_at?: string
          completed_by?: string | null
          id?: number
          metadata?: Json
          note?: string | null
          quest_id: string
        }
        Update: {
          completed_at?: string
          completed_by?: string | null
          id?: number
          metadata?: Json
          note?: string | null
          quest_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quest_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_completions_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_completions_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "v_quest_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_completions_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "v_quest_priority"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_dependencies: {
        Row: {
          blocked_by_quest_id: string
          quest_id: string
        }
        Insert: {
          blocked_by_quest_id: string
          quest_id: string
        }
        Update: {
          blocked_by_quest_id?: string
          quest_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quest_dependencies_blocked_by_quest_id_fkey"
            columns: ["blocked_by_quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_dependencies_blocked_by_quest_id_fkey"
            columns: ["blocked_by_quest_id"]
            isOneToOne: false
            referencedRelation: "v_quest_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_dependencies_blocked_by_quest_id_fkey"
            columns: ["blocked_by_quest_id"]
            isOneToOne: false
            referencedRelation: "v_quest_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_dependencies_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_dependencies_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "v_quest_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_dependencies_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "v_quest_priority"
            referencedColumns: ["id"]
          },
        ]
      }
      quests: {
        Row: {
          assignee_id: string | null
          blocked_reason: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          external_url: string | null
          id: string
          is_pinned: boolean
          metadata: Json
          pinned_at: string | null
          priority: Database["public"]["Enums"]["quest_priority"]
          process_step: string | null
          source: Database["public"]["Enums"]["quest_source"]
          status: Database["public"]["Enums"]["quest_status"]
          store_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          blocked_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          external_url?: string | null
          id?: string
          is_pinned?: boolean
          metadata?: Json
          pinned_at?: string | null
          priority?: Database["public"]["Enums"]["quest_priority"]
          process_step?: string | null
          source?: Database["public"]["Enums"]["quest_source"]
          status?: Database["public"]["Enums"]["quest_status"]
          store_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          blocked_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          external_url?: string | null
          id?: string
          is_pinned?: boolean
          metadata?: Json
          pinned_at?: string | null
          priority?: Database["public"]["Enums"]["quest_priority"]
          process_step?: string | null
          source?: Database["public"]["Enums"]["quest_source"]
          status?: Database["public"]["Enums"]["quest_status"]
          store_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quests_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      recurring_checks: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          note: string | null
          performed_at: string | null
          performed_by: string | null
          result: string | null
          scheduled_for: string
          store_id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          performed_at?: string | null
          performed_by?: string | null
          result?: string | null
          scheduled_for: string
          store_id: string
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          performed_at?: string | null
          performed_by?: string | null
          result?: string | null
          scheduled_for?: string
          store_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_checks_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_checks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_checks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "recurring_checks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "check_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          body: string | null
          confirm_note: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          metadata: Json
          period_end: string
          period_start: string
          received_at: string
          received_from: string | null
          send_note: string | null
          sent_at: string | null
          sent_to: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["report_status"]
          store_id: string
          type: Database["public"]["Enums"]["report_type"]
          updated_at: string
        }
        Insert: {
          body?: string | null
          confirm_note?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          period_end: string
          period_start: string
          received_at?: string
          received_from?: string | null
          send_note?: string | null
          sent_at?: string | null
          sent_to?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          store_id: string
          type: Database["public"]["Enums"]["report_type"]
          updated_at?: string
        }
        Update: {
          body?: string | null
          confirm_note?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          period_end?: string
          period_start?: string
          received_at?: string
          received_from?: string | null
          send_note?: string | null
          sent_at?: string | null
          sent_to?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          store_id?: string
          type?: Database["public"]["Enums"]["report_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      store_assignees: {
        Row: {
          created_at: string
          is_primary: boolean
          profile_id: string
          store_id: string
        }
        Insert: {
          created_at?: string
          is_primary?: boolean
          profile_id: string
          store_id: string
        }
        Update: {
          created_at?: string
          is_primary?: boolean
          profile_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_assignees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_assignees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_assignees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      store_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          reason: string | null
          store_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: number
          occurred_at?: string
          reason?: string | null
          store_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: number
          occurred_at?: string
          reason?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_audit_log_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_audit_log_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      store_tone_examples: {
        Row: {
          conversation_message_id: string | null
          created_at: string
          direction: string
          features: Json
          id: string
          kakao_notification_event_id: string | null
          message_text: string
          observed_at: string
          sender_name: string | null
          sender_profile_id: string | null
          store_id: string
        }
        Insert: {
          conversation_message_id?: string | null
          created_at?: string
          direction: string
          features?: Json
          id?: string
          kakao_notification_event_id?: string | null
          message_text: string
          observed_at?: string
          sender_name?: string | null
          sender_profile_id?: string | null
          store_id: string
        }
        Update: {
          conversation_message_id?: string | null
          created_at?: string
          direction?: string
          features?: Json
          id?: string
          kakao_notification_event_id?: string | null
          message_text?: string
          observed_at?: string
          sender_name?: string | null
          sender_profile_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_tone_examples_conversation_message_id_fkey"
            columns: ["conversation_message_id"]
            isOneToOne: true
            referencedRelation: "kakao_conversation_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_tone_examples_kakao_notification_event_id_fkey"
            columns: ["kakao_notification_event_id"]
            isOneToOne: true
            referencedRelation: "kakao_notification_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_tone_examples_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_tone_examples_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_tone_examples_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      store_tone_profiles: {
        Row: {
          avoid_phrases: string[]
          created_at: string
          emoji_level: number
          formality_level: number
          honorific_style: string
          internal_message_count: number
          last_sample_at: string | null
          learned_from_event_count: number
          message_length: string
          owner_message_count: number
          owner_response_summary: string | null
          preferred_closing: string | null
          preferred_opening: string | null
          sample_phrases: string[]
          store_id: string
          tone_summary: string | null
          updated_at: string
          warmth_level: number
        }
        Insert: {
          avoid_phrases?: string[]
          created_at?: string
          emoji_level?: number
          formality_level?: number
          honorific_style?: string
          internal_message_count?: number
          last_sample_at?: string | null
          learned_from_event_count?: number
          message_length?: string
          owner_message_count?: number
          owner_response_summary?: string | null
          preferred_closing?: string | null
          preferred_opening?: string | null
          sample_phrases?: string[]
          store_id: string
          tone_summary?: string | null
          updated_at?: string
          warmth_level?: number
        }
        Update: {
          avoid_phrases?: string[]
          created_at?: string
          emoji_level?: number
          formality_level?: number
          honorific_style?: string
          internal_message_count?: number
          last_sample_at?: string | null
          learned_from_event_count?: number
          message_length?: string
          owner_message_count?: number
          owner_response_summary?: string | null
          preferred_closing?: string | null
          preferred_opening?: string | null
          sample_phrases?: string[]
          store_id?: string
          tone_summary?: string | null
          updated_at?: string
          warmth_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_tone_profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_tone_profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
        ]
      }
      store_types: {
        Row: {
          code: string
          label: string
          notes: string | null
          sort_order: number
        }
        Insert: {
          code: string
          label: string
          notes?: string | null
          sort_order?: number
        }
        Update: {
          code?: string
          label?: string
          notes?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      stores: {
        Row: {
          address: string | null
          archived_at: string | null
          assigned_marketer_id: string | null
          assigned_owner_id: string | null
          business_number: string | null
          channel_preferences: string[] | null
          checklist_sheet_url: string | null
          contract_months: number | null
          country_focus: string | null
          created_at: string
          current_round: number | null
          discount_amount: number | null
          discount_pct: number
          drive_folder_url: string | null
          gbp_already_created: boolean
          gbp_url: string | null
          google_map_url: string | null
          id: string
          keywords_count: number | null
          last_health_check_at: string | null
          main_keyword: string | null
          main_keyword_translation: string | null
          main_keywords_i18n: Json | null
          metadata: Json
          monthly_fee: number | null
          name: string
          naver_place_url: string | null
          onboarding_sheet_url: string | null
          owner_dislikes: string | null
          owner_email: string | null
          owner_likes: string | null
          owner_memo: string | null
          owner_name: string | null
          owner_phone: string | null
          owner_priority: string | null
          owner_sensitive: string | null
          payment_method_code: string | null
          review_sheet_url: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["store_status"]
          tax_invoice: boolean
          type_code: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          assigned_marketer_id?: string | null
          assigned_owner_id?: string | null
          business_number?: string | null
          channel_preferences?: string[] | null
          checklist_sheet_url?: string | null
          contract_months?: number | null
          country_focus?: string | null
          created_at?: string
          current_round?: number | null
          discount_amount?: number | null
          discount_pct?: number
          drive_folder_url?: string | null
          gbp_already_created?: boolean
          gbp_url?: string | null
          google_map_url?: string | null
          id?: string
          keywords_count?: number | null
          last_health_check_at?: string | null
          main_keyword?: string | null
          main_keyword_translation?: string | null
          main_keywords_i18n?: Json | null
          metadata?: Json
          monthly_fee?: number | null
          name: string
          naver_place_url?: string | null
          onboarding_sheet_url?: string | null
          owner_dislikes?: string | null
          owner_email?: string | null
          owner_likes?: string | null
          owner_memo?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          owner_priority?: string | null
          owner_sensitive?: string | null
          payment_method_code?: string | null
          review_sheet_url?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["store_status"]
          tax_invoice?: boolean
          type_code: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          assigned_marketer_id?: string | null
          assigned_owner_id?: string | null
          business_number?: string | null
          channel_preferences?: string[] | null
          checklist_sheet_url?: string | null
          contract_months?: number | null
          country_focus?: string | null
          created_at?: string
          current_round?: number | null
          discount_amount?: number | null
          discount_pct?: number
          drive_folder_url?: string | null
          gbp_already_created?: boolean
          gbp_url?: string | null
          google_map_url?: string | null
          id?: string
          keywords_count?: number | null
          last_health_check_at?: string | null
          main_keyword?: string | null
          main_keyword_translation?: string | null
          main_keywords_i18n?: Json | null
          metadata?: Json
          monthly_fee?: number | null
          name?: string
          naver_place_url?: string | null
          onboarding_sheet_url?: string | null
          owner_dislikes?: string | null
          owner_email?: string | null
          owner_likes?: string | null
          owner_memo?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          owner_priority?: string | null
          owner_sensitive?: string | null
          payment_method_code?: string | null
          review_sheet_url?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["store_status"]
          tax_invoice?: boolean
          type_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_assigned_marketer_id_fkey"
            columns: ["assigned_marketer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_assigned_owner_id_fkey"
            columns: ["assigned_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_payment_method_code_fkey"
            columns: ["payment_method_code"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "stores_type_code_fkey"
            columns: ["type_code"]
            isOneToOne: false
            referencedRelation: "store_types"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      v_activity_heatmap: {
        Row: {
          actor_id: string | null
          category: string | null
          cnt: number | null
          day: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_dashboard_stats: {
        Row: {
          due_today: number | null
          managed_stores: number | null
          overdue: number | null
          pending_quests: number | null
          stale_health_check: number | null
        }
        Relationships: []
      }
      v_quest_dashboard: {
        Row: {
          assignee_id: string | null
          blocked_reason: string | null
          due_bucket: string | null
          due_date: string | null
          external_url: string | null
          id: string | null
          is_pinned: boolean | null
          priority: Database["public"]["Enums"]["quest_priority"] | null
          process_step: string | null
          source: Database["public"]["Enums"]["quest_source"] | null
          status: Database["public"]["Enums"]["quest_status"] | null
          store_id: string | null
          store_name: string | null
          title: string | null
          type_code: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quests_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "stores_type_code_fkey"
            columns: ["type_code"]
            isOneToOne: false
            referencedRelation: "store_types"
            referencedColumns: ["code"]
          },
        ]
      }
      v_quest_priority: {
        Row: {
          assignee_id: string | null
          blocked_reason: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_bucket: string | null
          due_date: string | null
          external_url: string | null
          id: string | null
          is_pinned: boolean | null
          metadata: Json | null
          pinned_at: string | null
          priority: Database["public"]["Enums"]["quest_priority"] | null
          process_step: string | null
          source: Database["public"]["Enums"]["quest_source"] | null
          status: Database["public"]["Enums"]["quest_status"] | null
          store_id: string | null
          store_name: string | null
          store_owner_id: string | null
          store_type_code: string | null
          title: string | null
          updated_at: string | null
          urgency_rank: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quests_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "v_store_360"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "stores_assigned_owner_id_fkey"
            columns: ["store_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_type_code_fkey"
            columns: ["store_type_code"]
            isOneToOne: false
            referencedRelation: "store_types"
            referencedColumns: ["code"]
          },
        ]
      }
      v_store_360: {
        Row: {
          active_quest_count: number | null
          active_quests: Json | null
          address: string | null
          archived_at: string | null
          assigned_marketer_id: string | null
          assigned_marketer_name: string | null
          assigned_owner_id: string | null
          assigned_owner_name: string | null
          business_number: string | null
          channel_preferences: string[] | null
          checklist_sheet_url: string | null
          comm_count_30d: number | null
          contract_end_date: string | null
          contract_months: number | null
          country_focus: string | null
          created_at: string | null
          current_round: number | null
          days_since_health_check: number | null
          days_since_start: number | null
          days_until_contract_end: number | null
          discount_pct: number | null
          drive_folder_url: string | null
          gbp_already_created: boolean | null
          gbp_url: string | null
          google_map_url: string | null
          health_status: string | null
          keyword_movement: Json | null
          last_comm_at: string | null
          last_health_check_at: string | null
          latest_gbp: Json | null
          main_keyword: string | null
          main_keyword_translation: string | null
          main_keywords_i18n: Json | null
          metadata: Json | null
          monthly_fee: number | null
          naver_place_url: string | null
          onboarding_sheet_url: string | null
          overdue_quest_count: number | null
          owner_dislikes: string | null
          owner_email: string | null
          owner_likes: string | null
          owner_memo: string | null
          owner_name: string | null
          owner_phone: string | null
          owner_priority: string | null
          owner_sensitive: string | null
          recent_audit: Json | null
          recent_comms: Json | null
          recent_issues: Json | null
          review_sheet_url: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["store_status"] | null
          store_id: string | null
          store_name: string | null
          type_code: string | null
          type_label: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_assigned_marketer_id_fkey"
            columns: ["assigned_marketer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_assigned_owner_id_fkey"
            columns: ["assigned_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_type_code_fkey"
            columns: ["type_code"]
            isOneToOne: false
            referencedRelation: "store_types"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Functions: {
      archive_old_kakao_notification_events: {
        Args: { p_before?: string; p_limit?: number }
        Returns: {
          archived_count: number
          cutoff: string
        }[]
      }
      fn_compute_notifications: {
        Args: never
        Returns: {
          created: number
          type_breakdown: Json
        }[]
      }
      fn_insert_process_quest_if_missing: {
        Args: {
          p_created_by?: string
          p_description: string
          p_due_date?: string
          p_metadata?: Json
          p_priority?: Database["public"]["Enums"]["quest_priority"]
          p_process_step: string
          p_store_id: string
          p_title: string
        }
        Returns: undefined
      }
      fn_seed_next_month: {
        Args: { p_store_id: string }
        Returns: {
          checks_added: number
          quests_added: number
        }[]
      }
      get_decision_brief: { Args: { p_quest_id: string }; Returns: Json }
      mark_health_checked: {
        Args: { p_note?: string; p_store_id: string }
        Returns: string
      }
    }
    Enums: {
      lead_source_channel:
        | "walk_in"
        | "meta_ad"
        | "youtube"
        | "threads"
        | "kakao_channel"
        | "naver_blog"
        | "naver_place"
        | "google_search"
        | "referral"
        | "manual"
      lead_status:
        | "new"
        | "contacted"
        | "interested"
        | "booked"
        | "closed"
        | "dropped"
        | "invalid"
      notification_status: "pending" | "seen" | "acted" | "snoozed"
      notification_type:
        | "health_stale"
        | "paused_candidate"
        | "quest_overdue"
        | "sheet_missing"
        | "lead_new"
        | "lead_unmatched"
        | "contract_ending"
        | "medical_law_pending"
        | "manual"
      quest_priority: "urgent" | "normal" | "low"
      quest_source: "auto" | "manual" | "sheet_missing"
      quest_status: "pending" | "blocked" | "completed" | "cancelled"
      report_status: "received" | "revision_requested" | "confirmed" | "sent"
      report_type: "weekly" | "mid_rank" | "monthly"
      store_status:
        | "contract_pending"
        | "contract_signed"
        | "ready_to_start"
        | "active"
        | "paused"
        | "churned"
        | "archived"
      user_role: "sales" | "marketer" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      lead_source_channel: [
        "walk_in",
        "meta_ad",
        "youtube",
        "threads",
        "kakao_channel",
        "naver_blog",
        "naver_place",
        "google_search",
        "referral",
        "manual",
      ],
      lead_status: [
        "new",
        "contacted",
        "interested",
        "booked",
        "closed",
        "dropped",
        "invalid",
      ],
      notification_status: ["pending", "seen", "acted", "snoozed"],
      notification_type: [
        "health_stale",
        "paused_candidate",
        "quest_overdue",
        "sheet_missing",
        "lead_new",
        "lead_unmatched",
        "contract_ending",
        "medical_law_pending",
        "manual",
      ],
      quest_priority: ["urgent", "normal", "low"],
      quest_source: ["auto", "manual", "sheet_missing"],
      quest_status: ["pending", "blocked", "completed", "cancelled"],
      report_status: ["received", "revision_requested", "confirmed", "sent"],
      report_type: ["weekly", "mid_rank", "monthly"],
      store_status: [
        "contract_pending",
        "contract_signed",
        "ready_to_start",
        "active",
        "paused",
        "churned",
        "archived",
      ],
      user_role: ["sales", "marketer", "admin"],
    },
  },
} as const
