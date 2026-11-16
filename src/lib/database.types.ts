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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          connection_id: string | null
          cost_estimate: number | null
          created_at: string
          id: string
          input_tokens: number
          model: string
          ok: boolean
          output_tokens: number
          task: string
          user_id: string
        }
        Insert: {
          connection_id?: string | null
          cost_estimate?: number | null
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          ok: boolean
          output_tokens?: number
          task: string
          user_id: string
        }
        Update: {
          connection_id?: string | null
          cost_estimate?: number | null
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          ok?: boolean
          output_tokens?: number
          task?: string
          user_id?: string
        }
        Relationships: []
      }
      cards: {
        Row: {
          card_type: string
          created_at: string
          difficulty: number
          due_at: string
          id: string
          item_id: string
          lapses: number
          last_review_at: string | null
          learning_step: number
          reps: number
          schedule_status: string
          scheduled_days: number
          stability: number
          stability_fast: number
          state: number
          suspended: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          card_type: string
          created_at?: string
          difficulty?: number
          due_at?: string
          id?: string
          item_id: string
          lapses?: number
          last_review_at?: string | null
          learning_step?: number
          reps?: number
          schedule_status?: string
          scheduled_days?: number
          stability?: number
          stability_fast?: number
          state?: number
          suspended?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          card_type?: string
          created_at?: string
          difficulty?: number
          due_at?: string
          id?: string
          item_id?: string
          lapses?: number
          last_review_at?: string | null
          learning_step?: number
          reps?: number
          schedule_status?: string
          scheduled_days?: number
          stability?: number
          stability_fast?: number
          state?: number
          suspended?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_item_id_user_id_fkey"
            columns: ["item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      course_messages: {
        Row: {
          content: string
          course_id: string
          created_at: string
          id: string
          plan_change: string | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          course_id: string
          created_at?: string
          id?: string
          plan_change?: string | null
          role: string
          user_id?: string
        }
        Update: {
          content?: string
          course_id?: string
          created_at?: string
          id?: string
          plan_change?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_messages_course_id_user_id_fkey"
            columns: ["course_id", "user_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          deck_id: string | null
          goal: string
          id: string
          kind: string
          level: string | null
          minutes_per_day: number
          plan_model: string | null
          planned_at: string | null
          roadmap: Json | null
          scheduled: boolean
          source_id: string | null
          summary: string | null
          title: string | null
          updated_at: string
          user_id: string
          weeks: number | null
        }
        Insert: {
          created_at?: string
          deck_id?: string | null
          goal: string
          id?: string
          kind?: string
          level?: string | null
          minutes_per_day?: number
          plan_model?: string | null
          planned_at?: string | null
          roadmap?: Json | null
          scheduled?: boolean
          source_id?: string | null
          summary?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          weeks?: number | null
        }
        Update: {
          created_at?: string
          deck_id?: string | null
          goal?: string
          id?: string
          kind?: string
          level?: string | null
          minutes_per_day?: number
          plan_model?: string | null
          planned_at?: string | null
          roadmap?: Json | null
          scheduled?: boolean
          source_id?: string | null
          summary?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          weeks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_deck_id_user_id_fkey"
            columns: ["deck_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "courses_source_id_user_id_fkey"
            columns: ["source_id", "user_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      daily_activity: {
        Row: {
          created_at: string
          duration_ms: number
          goal: number
          goal_met_at: string | null
          id: string
          local_date: string
          new_items: number
          points: number
          points_goal: number
          reviews: number
          time_zone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          goal: number
          goal_met_at?: string | null
          id?: string
          local_date: string
          new_items?: number
          points?: number
          points_goal?: number
          reviews?: number
          time_zone: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          goal?: number
          goal_met_at?: string | null
          id?: string
          local_date?: string
          new_items?: number
          points?: number
          points_goal?: number
          reviews?: number
          time_zone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      decks: {
        Row: {
          active: boolean
          created_at: string
          exam_date: string | null
          id: string
          name: string
          new_per_day: number
          priority: boolean
          subject: string
          target_lang: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          exam_date?: string | null
          id?: string
          name: string
          new_per_day?: number
          priority?: boolean
          subject?: string
          target_lang?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          exam_date?: string | null
          id?: string
          name?: string
          new_per_day?: number
          priority?: boolean
          subject?: string
          target_lang?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      homework: {
        Row: {
          checked_at: string | null
          course_id: string
          created_at: string
          id: string
          mode: string
          model: string | null
          result: Json | null
          solution_paths: string[]
          task: string | null
          task_path: string | null
          transcription: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checked_at?: string | null
          course_id: string
          created_at?: string
          id?: string
          mode?: string
          model?: string | null
          result?: Json | null
          solution_paths?: string[]
          task?: string | null
          task_path?: string | null
          transcription?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          checked_at?: string | null
          course_id?: string
          created_at?: string
          id?: string
          mode?: string
          model?: string | null
          result?: Json | null
          solution_paths?: string[]
          task?: string | null
          task_path?: string | null
          transcription?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_course_id_user_id_fkey"
            columns: ["course_id", "user_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      items: {
        Row: {
          created_at: string
          deck_id: string
          id: string
          introduced_at: string | null
          kind: string
          lesson_id: string | null
          meaning: string
          new_position: number | null
          notes: string | null
          source_id: string | null
          term: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deck_id: string
          id?: string
          introduced_at?: string | null
          kind: string
          lesson_id?: string | null
          meaning: string
          new_position?: number | null
          notes?: string | null
          source_id?: string | null
          term: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deck_id?: string
          id?: string
          introduced_at?: string | null
          kind?: string
          lesson_id?: string | null
          meaning?: string
          new_position?: number | null
          notes?: string | null
          source_id?: string | null
          term?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_deck_id_user_id_fkey"
            columns: ["deck_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "items_lesson_fkey"
            columns: ["lesson_id", "user_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "items_source_fkey"
            columns: ["source_id", "user_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      lessons: {
        Row: {
          completed_at: string | null
          course_id: string
          created_at: string
          explanation: Json | null
          id: string
          learned_at: string | null
          material_at: string | null
          material_refs: Json | null
          objectives: Json
          position: number
          practice: Json | null
          practice_at: string | null
          prepared_at: string | null
          stage: number
          summary: string
          title: string
          updated_at: string
          user_id: string
          week: number
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          created_at?: string
          explanation?: Json | null
          id?: string
          learned_at?: string | null
          material_at?: string | null
          material_refs?: Json | null
          objectives?: Json
          position: number
          practice?: Json | null
          practice_at?: string | null
          prepared_at?: string | null
          stage?: number
          summary: string
          title: string
          updated_at?: string
          user_id?: string
          week: number
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          created_at?: string
          explanation?: Json | null
          id?: string
          learned_at?: string | null
          material_at?: string | null
          material_refs?: Json | null
          objectives?: Json
          position?: number
          practice?: Json | null
          practice_at?: string | null
          prepared_at?: string | null
          stage?: number
          summary?: string
          title?: string
          updated_at?: string
          user_id?: string
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_user_id_fkey"
            columns: ["course_id", "user_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          daily_goal: number
          daily_points: number
          display_name: string | null
          push_token: string | null
          reminder_time: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_goal?: number
          daily_points?: number
          display_name?: string | null
          push_token?: string | null
          reminder_time?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          daily_goal?: number
          daily_points?: number
          display_name?: string | null
          push_token?: string | null
          reminder_time?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      review_events: {
        Row: {
          card_id: string | null
          correct: boolean | null
          created_at: string
          device_id: string | null
          duration_ms: number | null
          id: string
          item_id: string
          lesson_id: string | null
          rating: number
          response: Json | null
          reviewed_at: string
          user_id: string
        }
        Insert: {
          card_id?: string | null
          correct?: boolean | null
          created_at?: string
          device_id?: string | null
          duration_ms?: number | null
          id?: string
          item_id: string
          lesson_id?: string | null
          rating: number
          response?: Json | null
          reviewed_at: string
          user_id?: string
        }
        Update: {
          card_id?: string | null
          correct?: boolean | null
          created_at?: string
          device_id?: string | null
          duration_ms?: number | null
          id?: string
          item_id?: string
          lesson_id?: string | null
          rating?: number
          response?: Json | null
          reviewed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_events_card_id_user_id_fkey"
            columns: ["card_id", "user_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "review_events_item_id_user_id_fkey"
            columns: ["item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "review_events_lesson_fkey"
            columns: ["lesson_id", "user_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      sources: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          kind: string
          mime_type: string | null
          part_paths: string[]
          parts_read: number
          read_at: string | null
          role: string | null
          storage_path: string | null
          text: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          kind: string
          mime_type?: string | null
          part_paths?: string[]
          parts_read?: number
          read_at?: string | null
          role?: string | null
          storage_path?: string | null
          text?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string | null
          part_paths?: string[]
          parts_read?: number
          read_at?: string | null
          role?: string | null
          storage_path?: string | null
          text?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_course_fkey"
            columns: ["course_id", "user_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      count_activity: {
        Args: {
          p_at: string
          p_duration_ms: number
          p_new_items: number
          p_points: number
          p_reviews: number
          p_time_zone: string
        }
        Returns: Json
      }
      event_points: {
        Args: {
          p_card_type: string
          p_correct: boolean
          p_exercise: string
          p_rating: number
        }
        Returns: number
      }
      import_items: {
        Args: {
          p_deck_id: string
          p_items: Json
          p_text: string
          p_title: string
        }
        Returns: Json
      }
      record_quiz_answer: {
        Args: {
          p_correct: boolean
          p_device_id?: string
          p_duration_ms?: number
          p_item_id: string
          p_lesson_id: string
          p_response: Json
          p_reviewed_at: string
          p_time_zone?: string
        }
        Returns: Json
      }
      record_review: {
        Args: {
          p_card_id: string
          p_correct?: boolean
          p_device_id?: string
          p_duration_ms?: number
          p_rating: number
          p_response?: Json
          p_reviewed_at: string
          p_schedule: Json
          p_time_zone?: string
        }
        Returns: Json
      }
      review_stats: {
        Args: { p_card_types: string[]; p_days?: number; p_time_zone: string }
        Returns: Json
      }
      save_course_plan: {
        Args: { p_course_id: string; p_model: string; p_plan: Json }
        Returns: undefined
      }
      save_lesson_content: {
        Args: { p_explanation: Json; p_items: Json; p_lesson_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
