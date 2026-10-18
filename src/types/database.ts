// Generated from versioned migrations by npm run db:types:embedded.
// After linking Supabase, use npm run db:types for the authoritative remote types.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      authors: {
        Row: {
          id: string
          ao3_username: string | null
          name: string
          ao3_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          ao3_username?: string | null
          name: string
          ao3_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          ao3_username?: string | null
          name?: string
          ao3_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      collection_works: {
        Row: {
          user_id: string
          collection_id: string
          library_entry_id: string
          created_at: string
        }
        Insert: {
          user_id?: string
          collection_id: string
          library_entry_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          collection_id?: string
          library_entry_id?: string
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'collection_works_collection_id_user_id_fkey'; columns: ['collection_id', 'user_id']; isOneToOne: false; referencedRelation: 'collections'; referencedColumns: ['id', 'user_id'] },
          { foreignKeyName: 'collection_works_library_entry_id_user_id_fkey'; columns: ['library_entry_id', 'user_id']; isOneToOne: false; referencedRelation: 'library_entries'; referencedColumns: ['id', 'user_id'] },
        ]
      }
      collections: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          default_key: string | null
          created_at: string
          updated_at: string
          color: string | null
          symbol: string | null
          sort_position: number | null
          last_story_added_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string
          name: string
          description?: string | null
          default_key?: string | null
          created_at?: string
          updated_at?: string
          color?: string | null
          symbol?: string | null
          sort_position?: number | null
          last_story_added_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          default_key?: string | null
          created_at?: string
          updated_at?: string
          color?: string | null
          symbol?: string | null
          sort_position?: number | null
          last_story_added_at?: string | null
        }
        Relationships: [
        ]
      }
      fandoms: {
        Row: {
          id: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      import_batches: {
        Row: {
          id: string
          user_id: string
          created_at: string
          cancelled_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          cancelled_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          cancelled_at?: string | null
        }
        Relationships: [
        ]
      }
      import_items: {
        Row: {
          id: string
          batch_id: string
          user_id: string
          ordinal: number
          original_url: string
          ao3_work_id: number | null
          chapter_id: string | null
          status: string
          result: string | null
          metadata_status: string
          error_category: string | null
          error_message: string | null
          entry_id: string | null
          duplicate_of: string | null
          verified_position: number | null
          last_attempt_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          batch_id: string
          user_id: string
          ordinal: number
          original_url: string
          ao3_work_id?: number | null
          chapter_id?: string | null
          status: string
          result?: string | null
          metadata_status?: string
          error_category?: string | null
          error_message?: string | null
          entry_id?: string | null
          duplicate_of?: string | null
          verified_position?: number | null
          last_attempt_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          batch_id?: string
          user_id?: string
          ordinal?: number
          original_url?: string
          ao3_work_id?: number | null
          chapter_id?: string | null
          status?: string
          result?: string | null
          metadata_status?: string
          error_category?: string | null
          error_message?: string | null
          entry_id?: string | null
          duplicate_of?: string | null
          verified_position?: number | null
          last_attempt_at?: string | null
          completed_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'import_items_entry_id_fkey'; columns: ['entry_id']; isOneToOne: false; referencedRelation: 'library_entries'; referencedColumns: ['id'] },
          { foreignKeyName: 'import_items_duplicate_of_fkey'; columns: ['duplicate_of']; isOneToOne: false; referencedRelation: 'import_items'; referencedColumns: ['id'] },
          { foreignKeyName: 'import_items_batch_id_user_id_fkey'; columns: ['batch_id', 'user_id']; isOneToOne: false; referencedRelation: 'import_batches'; referencedColumns: ['id', 'user_id'] },
        ]
      }
      library_entries: {
        Row: {
          id: string
          user_id: string
          work_id: string
          original_url: string
          reading_status: Database['public']['Enums']['reading_status']
          last_read_chapter: number
          personal_rating: number | null
          notes: string
          is_favorite: boolean
          metadata_overrides: Json
          started_at: string | null
          finished_at: string | null
          last_update_notification_at: string | null
          update_dismissed_at: string | null
          created_at: string
          updated_at: string
          extension_metadata: Json
          extension_chapters: Json
        }
        Insert: {
          id?: string
          user_id?: string
          work_id: string
          original_url: string
          reading_status?: Database['public']['Enums']['reading_status']
          last_read_chapter?: number
          personal_rating?: number | null
          notes?: string
          is_favorite?: boolean
          metadata_overrides?: Json
          started_at?: string | null
          finished_at?: string | null
          last_update_notification_at?: string | null
          update_dismissed_at?: string | null
          created_at?: string
          updated_at?: string
          extension_metadata?: Json
          extension_chapters?: Json
        }
        Update: {
          id?: string
          user_id?: string
          work_id?: string
          original_url?: string
          reading_status?: Database['public']['Enums']['reading_status']
          last_read_chapter?: number
          personal_rating?: number | null
          notes?: string
          is_favorite?: boolean
          metadata_overrides?: Json
          started_at?: string | null
          finished_at?: string | null
          last_update_notification_at?: string | null
          update_dismissed_at?: string | null
          created_at?: string
          updated_at?: string
          extension_metadata?: Json
          extension_chapters?: Json
        }
        Relationships: [
          { foreignKeyName: 'library_entries_work_id_fkey'; columns: ['work_id']; isOneToOne: false; referencedRelation: 'works'; referencedColumns: ['id'] },
        ]
      }
      library_entry_tags: {
        Row: {
          user_id: string
          library_entry_id: string
          personal_tag_id: string
          created_at: string
        }
        Insert: {
          user_id?: string
          library_entry_id: string
          personal_tag_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          library_entry_id?: string
          personal_tag_id?: string
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'library_entry_tags_library_entry_id_user_id_fkey'; columns: ['library_entry_id', 'user_id']; isOneToOne: false; referencedRelation: 'library_entries'; referencedColumns: ['id', 'user_id'] },
          { foreignKeyName: 'library_entry_tags_personal_tag_id_user_id_fkey'; columns: ['personal_tag_id', 'user_id']; isOneToOne: false; referencedRelation: 'personal_tags'; referencedColumns: ['id', 'user_id'] },
        ]
      }
      metadata_jobs: {
        Row: {
          id: string
          batch_id: string
          user_id: string
          work_id: string
          entry_id: string | null
          created_entry: boolean
          status: string
          attempts: number
          retryable: boolean
          next_attempt_at: string
          lease_token: string | null
          lease_until: string | null
          last_attempt_at: string | null
          completed_at: string | null
          error_category: string | null
          error_message: string | null
          created_at: string
          retrieval_mode: string
          update_reading_location: boolean
        }
        Insert: {
          id?: string
          batch_id: string
          user_id: string
          work_id: string
          entry_id?: string | null
          created_entry: boolean
          status?: string
          attempts?: number
          retryable?: boolean
          next_attempt_at?: string
          lease_token?: string | null
          lease_until?: string | null
          last_attempt_at?: string | null
          completed_at?: string | null
          error_category?: string | null
          error_message?: string | null
          created_at?: string
          retrieval_mode?: string
          update_reading_location?: boolean
        }
        Update: {
          id?: string
          batch_id?: string
          user_id?: string
          work_id?: string
          entry_id?: string | null
          created_entry?: boolean
          status?: string
          attempts?: number
          retryable?: boolean
          next_attempt_at?: string
          lease_token?: string | null
          lease_until?: string | null
          last_attempt_at?: string | null
          completed_at?: string | null
          error_category?: string | null
          error_message?: string | null
          created_at?: string
          retrieval_mode?: string
          update_reading_location?: boolean
        }
        Relationships: [
          { foreignKeyName: 'metadata_jobs_work_id_fkey'; columns: ['work_id']; isOneToOne: false; referencedRelation: 'works'; referencedColumns: ['id'] },
          { foreignKeyName: 'metadata_jobs_entry_id_fkey'; columns: ['entry_id']; isOneToOne: false; referencedRelation: 'library_entries'; referencedColumns: ['id'] },
          { foreignKeyName: 'metadata_jobs_batch_id_user_id_fkey'; columns: ['batch_id', 'user_id']; isOneToOne: false; referencedRelation: 'import_batches'; referencedColumns: ['id', 'user_id'] },
        ]
      }
      metadata_preferences: {
        Row: {
          user_id: string
          retrieval_mode: string
        }
        Insert: {
          user_id?: string
          retrieval_mode?: string
        }
        Update: {
          user_id?: string
          retrieval_mode?: string
        }
        Relationships: [
        ]
      }
      metadata_worker_state: {
        Row: {
          id: number
          next_request_at: string
          paused_until: string | null
          reason: string | null
        }
        Insert: {
          id: number
          next_request_at?: string
          paused_until?: string | null
          reason?: string | null
        }
        Update: {
          id?: number
          next_request_at?: string
          paused_until?: string | null
          reason?: string | null
        }
        Relationships: [
        ]
      }
      personal_tags: {
        Row: {
          id: string
          user_id: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      processing_logs: {
        Row: {
          id: string
          job_id: string
          user_id: string
          created_at: string
          category: string
          message: string
        }
        Insert: {
          id?: string
          job_id: string
          user_id: string
          created_at?: string
          category: string
          message: string
        }
        Update: {
          id?: string
          job_id?: string
          user_id?: string
          created_at?: string
          category?: string
          message?: string
        }
        Relationships: [
          { foreignKeyName: 'processing_logs_job_id_user_id_fkey'; columns: ['job_id', 'user_id']; isOneToOne: false; referencedRelation: 'metadata_jobs'; referencedColumns: ['id', 'user_id'] },
        ]
      }
      tags: {
        Row: {
          id: string
          name: string
          category: Database['public']['Enums']['ao3_tag_category']
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          category?: Database['public']['Enums']['ao3_tag_category']
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          category?: Database['public']['Enums']['ao3_tag_category']
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      userscript_devices: {
        Row: {
          id: string
          user_id: string
          name: string
          secret_hash: string
          paired: boolean
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          secret_hash: string
          paired?: boolean
          expires_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          secret_hash?: string
          paired?: boolean
          expires_at?: string
          created_at?: string
        }
        Relationships: [
        ]
      }
      work_authors: {
        Row: {
          work_id: string
          author_id: string
        }
        Insert: {
          work_id: string
          author_id: string
        }
        Update: {
          work_id?: string
          author_id?: string
        }
        Relationships: [
          { foreignKeyName: 'work_authors_work_id_fkey'; columns: ['work_id']; isOneToOne: false; referencedRelation: 'works'; referencedColumns: ['id'] },
          { foreignKeyName: 'work_authors_author_id_fkey'; columns: ['author_id']; isOneToOne: false; referencedRelation: 'authors'; referencedColumns: ['id'] },
        ]
      }
      work_fandoms: {
        Row: {
          work_id: string
          fandom_id: string
        }
        Insert: {
          work_id: string
          fandom_id: string
        }
        Update: {
          work_id?: string
          fandom_id?: string
        }
        Relationships: [
          { foreignKeyName: 'work_fandoms_work_id_fkey'; columns: ['work_id']; isOneToOne: false; referencedRelation: 'works'; referencedColumns: ['id'] },
          { foreignKeyName: 'work_fandoms_fandom_id_fkey'; columns: ['fandom_id']; isOneToOne: false; referencedRelation: 'fandoms'; referencedColumns: ['id'] },
        ]
      }
      work_tags: {
        Row: {
          work_id: string
          tag_id: string
          source_position: number | null
        }
        Insert: {
          work_id: string
          tag_id: string
          source_position?: number | null
        }
        Update: {
          work_id?: string
          tag_id?: string
          source_position?: number | null
        }
        Relationships: [
          { foreignKeyName: 'work_tags_work_id_fkey'; columns: ['work_id']; isOneToOne: false; referencedRelation: 'works'; referencedColumns: ['id'] },
          { foreignKeyName: 'work_tags_tag_id_fkey'; columns: ['tag_id']; isOneToOne: false; referencedRelation: 'tags'; referencedColumns: ['id'] },
        ]
      }
      works: {
        Row: {
          id: string
          ao3_work_id: number
          canonical_url: string | null
          canonical_verified_at: string | null
          title: string | null
          summary: string | null
          rating: string | null
          language: string | null
          word_count: number | null
          published_chapters: number | null
          total_chapters: number | null
          is_complete: boolean | null
          ao3_published_at: string | null
          ao3_updated_at: string | null
          last_metadata_check: string | null
          metadata_source: Database['public']['Enums']['metadata_source']
          field_provenance: Json
          created_at: string
          updated_at: string
          verified_chapters: Json
          automatic_metadata: Json
          last_metadata_success: string | null
        }
        Insert: {
          id?: string
          ao3_work_id: number
          canonical_url?: string | null
          canonical_verified_at?: string | null
          title?: string | null
          summary?: string | null
          rating?: string | null
          language?: string | null
          word_count?: number | null
          published_chapters?: number | null
          total_chapters?: number | null
          is_complete?: boolean | null
          ao3_published_at?: string | null
          ao3_updated_at?: string | null
          last_metadata_check?: string | null
          metadata_source?: Database['public']['Enums']['metadata_source']
          field_provenance?: Json
          created_at?: string
          updated_at?: string
          verified_chapters?: Json
          automatic_metadata?: Json
          last_metadata_success?: string | null
        }
        Update: {
          id?: string
          ao3_work_id?: number
          canonical_url?: string | null
          canonical_verified_at?: string | null
          title?: string | null
          summary?: string | null
          rating?: string | null
          language?: string | null
          word_count?: number | null
          published_chapters?: number | null
          total_chapters?: number | null
          is_complete?: boolean | null
          ao3_published_at?: string | null
          ao3_updated_at?: string | null
          last_metadata_check?: string | null
          metadata_source?: Database['public']['Enums']['metadata_source']
          field_provenance?: Json
          created_at?: string
          updated_at?: string
          verified_chapters?: Json
          automatic_metadata?: Json
          last_metadata_success?: string | null
        }
        Relationships: [
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      manage_userscript_device: { Args: { p_action: string; p_name?: string; p_id?: string }; Returns: Json }
      userscript_library: { Args: { p_secret: string; p_action: string; p_work?: number; p_input?: Json }; Returns: Json }
      submit_import_urls: { Args: { p_urls: string[]; p_update_reading_location?: boolean }; Returns: string | null }
      cancel_import_batch: { Args: { p_batch: string }; Returns: undefined }
      retry_metadata_job: { Args: { p_job: string }; Returns: undefined }
      claim_extension_job: { Args: Record<string, never>; Returns: Json }
      approve_import_progress: { Args: { p_item: string }; Returns: undefined }
      clear_metadata_override: { Args: { p_entry: string; p_field: string }; Returns: undefined }
      reorder_collections: { Args: { p_ids: string[] }; Returns: undefined }
      restore_library_story: { Args: { p_entry: Json; p_collections: string[]; p_tags: string[] }; Returns: string }

      save_library_story: {
        Args: { p_url: string; p_metadata: Json; p_status: Database['public']['Enums']['reading_status']; p_progress: number; p_notes: string; p_rating: number | null; p_favorite: boolean; p_collections: string[]; p_tags: string[]; p_id?: string | null }
        Returns: string
      }
    }
    Enums: {
      metadata_source: 'unknown' | 'ao3' | 'manual' | 'extension'
      ao3_tag_category: 'relationship' | 'character' | 'freeform' | 'warning' | 'category'
      reading_status: 'to_read' | 'reading' | 'waiting_for_updates' | 're_reading' | 'finished' | 'did_not_finish'
    }
    CompositeTypes: { [_ in never]: never }
  }
}
