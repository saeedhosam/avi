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
      airport_maps: {
        Row: {
          airfield: Json | null
          curated_version: string | null
          iata: string
          indoor: Json | null
          osm_fetched_at: string | null
          routing: Json | null
          source: string
          updated_at: string
        }
        Insert: {
          airfield?: Json | null
          curated_version?: string | null
          iata: string
          indoor?: Json | null
          osm_fetched_at?: string | null
          routing?: Json | null
          source?: string
          updated_at?: string
        }
        Update: {
          airfield?: Json | null
          curated_version?: string | null
          iata?: string
          indoor?: Json | null
          osm_fetched_at?: string | null
          routing?: Json | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          id: string
          last_seen: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      flight_alerts: {
        Row: {
          alert_type: string
          created_at: string
          flight_number: string
          id: string
          is_read: boolean
          message: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          flight_number: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          flight_number?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      flight_snapshots: {
        Row: {
          expires_at: string
          fetched_at: string
          flight_key: string
          flight_number: string
          provider: string
          snapshot: Json
        }
        Insert: {
          expires_at: string
          fetched_at?: string
          flight_key: string
          flight_number: string
          provider?: string
          snapshot: Json
        }
        Update: {
          expires_at?: string
          fetched_at?: string
          flight_key?: string
          flight_number?: string
          provider?: string
          snapshot?: Json
        }
        Relationships: []
      }
      osm_ingest_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          iata: string
          id: string
          started_at: string
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          iata: string
          id?: string
          started_at?: string
          status: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          iata?: string
          id?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          email: string
          home_airport: string | null
          id: string
          photo_url: string | null
          theme_preference: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string
          home_airport?: string | null
          id: string
          photo_url?: string | null
          theme_preference?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          home_airport?: string | null
          id?: string
          photo_url?: string | null
          theme_preference?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_cache: {
        Row: {
          cache_key: string
          expires_at: string
          fetched_at: string
          payload: Json
          status: number
        }
        Insert: {
          cache_key: string
          expires_at: string
          fetched_at?: string
          payload: Json
          status?: number
        }
        Update: {
          cache_key?: string
          expires_at?: string
          fetched_at?: string
          payload?: Json
          status?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen: string
          p256dh: string
          platform: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen?: string
          p256dh: string
          platform?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen?: string
          p256dh?: string
          platform?: string
          user_id?: string
        }
        Relationships: []
      }
      tracked_flights: {
        Row: {
          airline: string
          created_at: string
          custom_notes: string
          dest_code: string
          flight_id: string
          flight_number: string
          is_favorite: boolean
          origin_code: string
          snapshot: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          airline?: string
          created_at?: string
          custom_notes?: string
          dest_code?: string
          flight_id: string
          flight_number: string
          is_favorite?: boolean
          origin_code?: string
          snapshot?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          airline?: string
          created_at?: string
          custom_notes?: string
          dest_code?: string
          flight_id?: string
          flight_number?: string
          is_favorite?: boolean
          origin_code?: string
          snapshot?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
