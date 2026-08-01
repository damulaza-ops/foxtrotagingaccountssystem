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
      app_settings: {
        Row: {
          address: string | null
          aging_buckets: Json
          company_logo_url: string | null
          company_name: string
          currency: string
          default_credit_days: number
          email: string | null
          id: number
          invoice_prefix: string
          phone: string | null
          receipt_prefix: string
          updated_at: string
          urgency_rules: Json
        }
        Insert: {
          address?: string | null
          aging_buckets?: Json
          company_logo_url?: string | null
          company_name?: string
          currency?: string
          default_credit_days?: number
          email?: string | null
          id?: number
          invoice_prefix?: string
          phone?: string | null
          receipt_prefix?: string
          updated_at?: string
          urgency_rules?: Json
        }
        Update: {
          address?: string | null
          aging_buckets?: Json
          company_logo_url?: string | null
          company_name?: string
          currency?: string
          default_credit_days?: number
          email?: string | null
          id?: number
          invoice_prefix?: string
          phone?: string | null
          receipt_prefix?: string
          updated_at?: string
          urgency_rules?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_data: Json | null
          previous_data: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_data?: Json | null
          previous_data?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_data?: Json | null
          previous_data?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          branch_name: string | null
          business_name: string
          contact_person: string | null
          created_at: string
          credit_days: number
          credit_limit: number
          customer_code: string
          email: string | null
          id: string
          location: string | null
          notes: string | null
          opening_balance: number
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          branch_name?: string | null
          business_name: string
          contact_person?: string | null
          created_at?: string
          credit_days?: number
          credit_limit?: number
          customer_code: string
          email?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          opening_balance?: number
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          branch_name?: string | null
          business_name?: string
          contact_person?: string | null
          created_at?: string
          credit_days?: number
          credit_limit?: number
          customer_code?: string
          email?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          opening_balance?: number
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          contact_method: Database["public"]["Enums"]["contact_method"]
          contacted_person: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          follow_up_date: string
          id: string
          invoice_id: string | null
          notes: string | null
          promise_to_pay_amount: number | null
          promise_to_pay_date: string | null
          status: Database["public"]["Enums"]["follow_up_status"]
        }
        Insert: {
          contact_method?: Database["public"]["Enums"]["contact_method"]
          contacted_person?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          follow_up_date?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          promise_to_pay_amount?: number | null
          promise_to_pay_date?: string | null
          status?: Database["public"]["Enums"]["follow_up_status"]
        }
        Update: {
          contact_method?: Database["public"]["Enums"]["contact_method"]
          contacted_person?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          follow_up_date?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          promise_to_pay_amount?: number | null
          promise_to_pay_date?: string | null
          status?: Database["public"]["Enums"]["follow_up_status"]
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          approved_rows: number
          duplicate_rows: number
          file_name: string
          id: string
          rejected_rows: number
          status: string
          total_rows: number
          uploaded_at: string
          uploaded_by: string | null
          warning_rows: number
        }
        Insert: {
          approved_rows?: number
          duplicate_rows?: number
          file_name: string
          id?: string
          rejected_rows?: number
          status?: string
          total_rows?: number
          uploaded_at?: string
          uploaded_by?: string | null
          warning_rows?: number
        }
        Update: {
          approved_rows?: number
          duplicate_rows?: number
          file_name?: string
          id?: string
          rejected_rows?: number
          status?: string
          total_rows?: number
          uploaded_at?: string
          uploaded_by?: string | null
          warning_rows?: number
        }
        Relationships: []
      }
      import_rows: {
        Row: {
          id: string
          import_batch_id: string
          linked_invoice_id: string | null
          mapped_data: Json | null
          raw_data: Json | null
          sheet_name: string | null
          source_row: number | null
          validation_messages: string[] | null
          validation_status: string
        }
        Insert: {
          id?: string
          import_batch_id: string
          linked_invoice_id?: string | null
          mapped_data?: Json | null
          raw_data?: Json | null
          sheet_name?: string | null
          source_row?: number | null
          validation_messages?: string[] | null
          validation_status?: string
        }
        Update: {
          id?: string
          import_batch_id?: string
          linked_invoice_id?: string | null
          mapped_data?: Json | null
          raw_data?: Json | null
          sheet_name?: string | null
          source_row?: number | null
          validation_messages?: string[] | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_linked_invoice_id_fkey"
            columns: ["linked_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          credit_days: number
          customer_id: string
          disputed: boolean
          due_date: string
          id: string
          import_batch_id: string | null
          invoice_amount: number
          invoice_date: string
          invoice_number: string
          notes: string | null
          opening_paid: number
          outstanding_balance: number | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          source_row: number | null
          source_sheet: string | null
          updated_at: string
          written_off: boolean
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          credit_days?: number
          customer_id: string
          disputed?: boolean
          due_date: string
          id?: string
          import_batch_id?: string | null
          invoice_amount?: number
          invoice_date: string
          invoice_number: string
          notes?: string | null
          opening_paid?: number
          outstanding_balance?: number | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          source_row?: number | null
          source_sheet?: string | null
          updated_at?: string
          written_off?: boolean
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          credit_days?: number
          customer_id?: string
          disputed?: boolean
          due_date?: string
          id?: string
          import_batch_id?: string | null
          invoice_amount?: number
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          opening_paid?: number
          outstanding_balance?: number | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          source_row?: number | null
          source_sheet?: string | null
          updated_at?: string
          written_off?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          allocated_amount: number
          created_at: string
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          allocated_amount: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          allocated_amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_number: string | null
          reference_number: string | null
          reversed: boolean
          reversed_at: string | null
          reversed_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          notes?: string | null
          payment_date: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_number?: string | null
          reference_number?: string | null
          reversed?: boolean
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_number?: string | null
          reference_number?: string | null
          reversed?: boolean
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id: string
          phone?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          status?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager: { Args: { _user_id: string }; Returns: boolean }
      recalc_invoice: { Args: { _invoice_id: string }; Returns: undefined }
      record_payment: {
        Args: {
          _allocations: Json
          _amount: number
          _customer_id: string
          _method: Database["public"]["Enums"]["payment_method"]
          _notes: string
          _payment_date: string
          _receipt: string
          _reference: string
        }
        Returns: string
      }
      refresh_invoice_statuses: { Args: never; Returns: undefined }
      reverse_payment: {
        Args: { _payment_id: string; _reason: string }
        Returns: undefined
      }
      write_off_invoice: {
        Args: { _invoice_id: string; _reason: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "administrator"
        | "accounts_manager"
        | "collections_officer"
        | "viewer"
      contact_method:
        | "telephone"
        | "whatsapp"
        | "email"
        | "physical_visit"
        | "other"
      follow_up_status:
        | "no_response"
        | "promised_payment"
        | "partial_payment_expected"
        | "disputed_invoice"
        | "escalated"
        | "resolved"
      payment_method: "mpesa" | "bank_transfer" | "cash" | "cheque" | "other"
      payment_status:
        | "current"
        | "partially_paid"
        | "overdue"
        | "paid"
        | "written_off"
        | "cancelled"
        | "unverified"
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
      app_role: [
        "administrator",
        "accounts_manager",
        "collections_officer",
        "viewer",
      ],
      contact_method: [
        "telephone",
        "whatsapp",
        "email",
        "physical_visit",
        "other",
      ],
      follow_up_status: [
        "no_response",
        "promised_payment",
        "partial_payment_expected",
        "disputed_invoice",
        "escalated",
        "resolved",
      ],
      payment_method: ["mpesa", "bank_transfer", "cash", "cheque", "other"],
      payment_status: [
        "current",
        "partially_paid",
        "overdue",
        "paid",
        "written_off",
        "cancelled",
        "unverified",
      ],
    },
  },
} as const
