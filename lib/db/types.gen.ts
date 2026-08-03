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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      appointment_pets: {
        Row: {
          appointment_id: string
          pet_id: string
        }
        Insert: {
          appointment_id: string
          pet_id: string
        }
        Update: {
          appointment_id?: string
          pet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_pets_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_pets_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reminders: {
        Row: {
          appointment_id: string
          fire_at: string
          id: string
          offset_minutes: number
          sent_at: string | null
        }
        Insert: {
          appointment_id: string
          fire_at: string
          id?: string
          offset_minutes: number
          sent_at?: string | null
        }
        Update: {
          appointment_id?: string
          fire_at?: string
          id?: string
          offset_minutes?: number
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          all_day: boolean
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          household_id: string
          id: string
          location: string | null
          notes: string | null
          starts_at: string
          title: string
          type: Database["public"]["Enums"]["appt_type"]
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          household_id: string
          id?: string
          location?: string | null
          notes?: string | null
          starts_at: string
          title: string
          type?: Database["public"]["Enums"]["appt_type"]
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          household_id?: string
          id?: string
          location?: string | null
          notes?: string | null
          starts_at?: string
          title?: string
          type?: Database["public"]["Enums"]["appt_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_times: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string | null
          local_time: string
          pet_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string | null
          local_time: string
          pet_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string | null
          local_time?: string
          pet_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_times_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          household_id: string
          id: string
          max_uses: number
          revoked_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          use_count: number
        }
        Insert: {
          code?: string
          created_at?: string
          created_by: string
          expires_at?: string
          household_id: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          use_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          household_id?: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          joined_at: string
          member_expires_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          member_expires_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          household_id?: string
          joined_at?: string
          member_expires_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      logs: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          feed_time_id: string | null
          household_id: string
          id: string
          medication_id: string | null
          note: string | null
          notification_id: string | null
          occurred_at: string
          pet_id: string
          source: Database["public"]["Enums"]["log_source"]
          type: Database["public"]["Enums"]["log_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          feed_time_id?: string | null
          household_id: string
          id: string
          medication_id?: string | null
          note?: string | null
          notification_id?: string | null
          occurred_at?: string
          pet_id: string
          source?: Database["public"]["Enums"]["log_source"]
          type: Database["public"]["Enums"]["log_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          feed_time_id?: string | null
          household_id?: string
          id?: string
          medication_id?: string | null
          note?: string | null
          notification_id?: string | null
          occurred_at?: string
          pet_id?: string
          source?: Database["public"]["Enums"]["log_source"]
          type?: Database["public"]["Enums"]["log_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "logs_feed_time_id_fkey"
            columns: ["feed_time_id"]
            isOneToOne: false
            referencedRelation: "feed_times"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          active: boolean
          created_at: string
          dosage: string | null
          id: string
          local_time: string
          name: string
          pet_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          dosage?: string | null
          id?: string
          local_time: string
          name: string
          pet_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          dosage?: string | null
          id?: string
          local_time?: string
          name?: string
          pet_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medications_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          device_id: string
          expo_push_token: string
          id: string
          last_seen_at: string
          platform: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_id: string
          expo_push_token: string
          id?: string
          last_seen_at?: string
          platform: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_id?: string
          expo_push_token?: string
          id?: string
          last_seen_at?: string
          platform?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action: string | null
          action_at: string | null
          action_by: string | null
          body: string
          created_at: string
          data: Json
          dedupe_key: string
          expo_tickets: Json | null
          household_id: string
          id: string
          kind: Database["public"]["Enums"]["notif_kind"]
          pet_id: string | null
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notif_status"]
          title: string
        }
        Insert: {
          action?: string | null
          action_at?: string | null
          action_by?: string | null
          body: string
          created_at?: string
          data?: Json
          dedupe_key: string
          expo_tickets?: Json | null
          household_id: string
          id?: string
          kind: Database["public"]["Enums"]["notif_kind"]
          pet_id?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notif_status"]
          title: string
        }
        Update: {
          action?: string | null
          action_at?: string | null
          action_by?: string | null
          body?: string
          created_at?: string
          data?: Json
          dedupe_key?: string
          expo_tickets?: Json | null
          household_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["notif_kind"]
          pet_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notif_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pets: {
        Row: {
          archived_at: string | null
          avatar_emoji: string
          birthdate: string | null
          breed: string | null
          calibration_started_at: string
          created_at: string
          household_id: string
          id: string
          name: string
          pee_hold_hours: number | null
          poop_hold_hours: number | null
          species: Database["public"]["Enums"]["species"]
          updated_at: string
          updated_by: string | null
          weight_kg: number | null
        }
        Insert: {
          archived_at?: string | null
          avatar_emoji?: string
          birthdate?: string | null
          breed?: string | null
          calibration_started_at?: string
          created_at?: string
          household_id: string
          id?: string
          name: string
          pee_hold_hours?: number | null
          poop_hold_hours?: number | null
          species?: Database["public"]["Enums"]["species"]
          updated_at?: string
          updated_by?: string | null
          weight_kg?: number | null
        }
        Update: {
          archived_at?: string | null
          avatar_emoji?: string
          birthdate?: string | null
          breed?: string | null
          calibration_started_at?: string
          created_at?: string
          household_id?: string
          id?: string
          name?: string
          pee_hold_hours?: number | null
          poop_hold_hours?: number | null
          species?: Database["public"]["Enums"]["species"]
          updated_at?: string
          updated_by?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_state: {
        Row: {
          anchor_at: string | null
          break_type: Database["public"]["Enums"]["break_type"]
          buffer_minutes: number | null
          consecutive_no_count: number
          hold_hours: number | null
          last_log_id: string | null
          last_notification_id: string | null
          notify_at: string | null
          pet_id: string
          predicted_at: string | null
          snoozed_until: string | null
          updated_at: string
        }
        Insert: {
          anchor_at?: string | null
          break_type: Database["public"]["Enums"]["break_type"]
          buffer_minutes?: number | null
          consecutive_no_count?: number
          hold_hours?: number | null
          last_log_id?: string | null
          last_notification_id?: string | null
          notify_at?: string | null
          pet_id: string
          predicted_at?: string | null
          snoozed_until?: string | null
          updated_at?: string
        }
        Update: {
          anchor_at?: string | null
          break_type?: Database["public"]["Enums"]["break_type"]
          buffer_minutes?: number | null
          consecutive_no_count?: number
          hold_hours?: number | null
          last_log_id?: string | null
          last_notification_id?: string | null
          notify_at?: string | null
          pet_id?: string
          predicted_at?: string | null
          snoozed_until?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_state_last_log_id_fkey"
            columns: ["last_log_id"]
            isOneToOne: false
            referencedRelation: "logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_state_last_notification_id_fkey"
            columns: ["last_notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_state_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_emoji: string
          created_at: string
          display_name: string | null
          user_id: string
        }
        Insert: {
          avatar_emoji?: string
          created_at?: string
          display_name?: string | null
          user_id: string
        }
        Update: {
          avatar_emoji?: string
          created_at?: string
          display_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit_public: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: undefined
      }
      claim_notification: {
        Args: {
          p_action: string
          p_action_by?: string
          p_notification_id: string
        }
        Returns: string
      }
      create_appointment: {
        Args: {
          p_all_day?: boolean
          p_household_id: string
          p_id: string
          p_location?: string
          p_notes?: string
          p_pet_ids?: string[]
          p_reminder_offsets?: number[]
          p_starts_at: string
          p_title: string
          p_type: Database["public"]["Enums"]["appt_type"]
        }
        Returns: string
      }
      create_household_with_membership: {
        Args: { p_name?: string; p_timezone?: string }
        Returns: string
      }
      create_invite: {
        Args: {
          p_expires_in?: string
          p_max_uses?: number
          p_role?: Database["public"]["Enums"]["member_role"]
        }
        Returns: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          household_id: string
          id: string
          max_uses: number
          revoked_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          use_count: number
        }
        SetofOptions: {
          from: "*"
          to: "household_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      due_appointment_reminders: {
        Args: never
        Returns: {
          appointment_id: string
          dedupe_key: string
          household_id: string
          offset_minutes: number
          pet_id: string
          reminder_id: string
          starts_at: string
          title: string
        }[]
      }
      due_break_predictions: {
        Args: never
        Returns: {
          break_type: Database["public"]["Enums"]["break_type"]
          dedupe_key: string
          household_id: string
          pet_id: string
          pet_name: string
          predicted_at: string
        }[]
      }
      due_meals: {
        Args: never
        Returns: {
          dedupe_key: string
          feed_time_id: string
          household_id: string
          meal_label: string
          pet_id: string
          pet_name: string
        }[]
      }
      due_medications: {
        Args: never
        Returns: {
          dedupe_key: string
          dosage: string
          household_id: string
          medication_id: string
          medication_name: string
          pet_id: string
          pet_name: string
        }[]
      }
      get_my_data: { Args: never; Returns: Json }
      infer_schedule: { Args: { p_pet_id: string }; Returns: Json }
      join_household: {
        Args: { p_code: string; p_leave?: string }
        Returns: Json
      }
      leave_household: { Args: { p_household_id: string }; Returns: undefined }
      mark_break_dispatched: {
        Args: {
          p_break_type: Database["public"]["Enums"]["break_type"]
          p_notification_id: string
          p_pet_id: string
        }
        Returns: undefined
      }
      mark_receipts_checked: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      mark_reminder_sent: {
        Args: { p_reminder_id: string }
        Returns: undefined
      }
      my_household_id: { Args: never; Returns: string }
      notifications_awaiting_receipts: {
        Args: never
        Returns: {
          expo_tickets: Json
          id: string
        }[]
      }
      pull_changes: { Args: { p_since?: string }; Returns: Json }
      record_break_no: {
        Args: {
          p_break_type: Database["public"]["Enums"]["break_type"]
          p_pet_id: string
        }
        Returns: {
          anchor_at: string | null
          break_type: Database["public"]["Enums"]["break_type"]
          buffer_minutes: number | null
          consecutive_no_count: number
          hold_hours: number | null
          last_log_id: string | null
          last_notification_id: string | null
          notify_at: string | null
          pet_id: string
          predicted_at: string | null
          snoozed_until: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "prediction_state"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_invite: { Args: { p_code: string }; Returns: string }
      replace_feed_times: {
        Args: { p_pet_id: string; p_times: string[] }
        Returns: {
          active: boolean
          created_at: string
          id: string
          label: string | null
          local_time: string
          pet_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "feed_times"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      replace_medications: {
        Args: { p_meds: Json; p_pet_id: string }
        Returns: {
          active: boolean
          created_at: string
          dosage: string | null
          id: string
          local_time: string
          name: string
          pet_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "medications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      revoke_push_token: { Args: { p_token: string }; Returns: undefined }
      snooze_break: {
        Args: {
          p_break_type: Database["public"]["Enums"]["break_type"]
          p_minutes?: number
          p_notification_id: string
          p_pet_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      appt_type: "vet" | "groom" | "vaccine" | "other"
      break_type: "pee" | "poo"
      log_source:
        | "manual"
        | "notification_yes"
        | "backfill"
        | "import"
        | "system"
        | "walker"
      log_type: "pee" | "poo" | "food" | "medication" | "vet" | "other"
      member_role: "owner" | "member" | "walker"
      notif_kind:
        | "break_prediction"
        | "meal"
        | "medication"
        | "appointment"
        | "digest"
        | "med_escalation"
      notif_status: "sent" | "actioned" | "dismissed" | "superseded" | "failed"
      species:
        | "dog"
        | "cat"
        | "rabbit"
        | "hamster"
        | "bird"
        | "turtle"
        | "snake"
        | "fish"
        | "other"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      appt_type: ["vet", "groom", "vaccine", "other"],
      break_type: ["pee", "poo"],
      log_source: [
        "manual",
        "notification_yes",
        "backfill",
        "import",
        "system",
        "walker",
      ],
      log_type: ["pee", "poo", "food", "medication", "vet", "other"],
      member_role: ["owner", "member", "walker"],
      notif_kind: [
        "break_prediction",
        "meal",
        "medication",
        "appointment",
        "digest",
        "med_escalation",
      ],
      notif_status: ["sent", "actioned", "dismissed", "superseded", "failed"],
      species: [
        "dog",
        "cat",
        "rabbit",
        "hamster",
        "bird",
        "turtle",
        "snake",
        "fish",
        "other",
      ],
    },
  },
} as const
