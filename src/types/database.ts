// Generated from versioned migrations by npm run db:types:embedded.
// After linking Supabase, use npm run db:types for the authoritative remote types.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      account_usernames: {
        Row: {
          user_id: string
          username: string
        }
        Insert: {
          user_id: string
          username: string
        }
        Update: {
          user_id?: string
          username?: string
        }
        Relationships: [
        ]
      }
      ao3_tag_resolutions: {
        Row: {
          user_id: string
          category: string
          name: string
          status: string
          canonical_name: string | null
          checked_at: string
          attempted_at: string
        }
        Insert: {
          user_id: string
          category: string
          name: string
          status: string
          canonical_name?: string | null
          checked_at?: string
          attempted_at?: string
        }
        Update: {
          user_id?: string
          category?: string
          name?: string
          status?: string
          canonical_name?: string | null
          checked_at?: string
          attempted_at?: string
        }
        Relationships: [
        ]
      }
      app_login_handoffs: {
        Row: {
          code_hash: string
          challenge: string
          user_id: string
          target_origin: string
          expires_at: string
          user_requested: boolean
        }
        Insert: {
          code_hash: string
          challenge: string
          user_id: string
          target_origin: string
          expires_at?: string
          user_requested?: boolean
        }
        Update: {
          code_hash?: string
          challenge?: string
          user_id?: string
          target_origin?: string
          expires_at?: string
          user_requested?: boolean
        }
        Relationships: [
        ]
      }
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
      automatic_collection_works: {
        Row: {
          user_id: string
          collection_id: string
          library_entry_id: string
        }
        Insert: {
          user_id: string
          collection_id: string
          library_entry_id: string
        }
        Update: {
          user_id?: string
          collection_id?: string
          library_entry_id?: string
        }
        Relationships: [
          { foreignKeyName: 'automatic_collection_works_collection_id_user_id_fkey'; columns: ['collection_id', 'user_id']; isOneToOne: false; referencedRelation: 'collections'; referencedColumns: ['id', 'user_id'] },
          { foreignKeyName: 'automatic_collection_works_user_id_library_entry_id_fkey'; columns: ['user_id', 'library_entry_id']; isOneToOne: false; referencedRelation: 'library_search_documents'; referencedColumns: ['user_id', 'id'] },
        ]
      }
      backup_save_state: {
        Row: {
          user_id: string
          attempted_at: string | null
          lease_token: string | null
          lease_until: string | null
        }
        Insert: {
          user_id: string
          attempted_at?: string | null
          lease_token?: string | null
          lease_until?: string | null
        }
        Update: {
          user_id?: string
          attempted_at?: string | null
          lease_token?: string | null
          lease_until?: string | null
        }
        Relationships: [
        ]
      }
      beta_signup_allowlist: {
        Row: {
          email: string
          created_at: string
        }
        Insert: {
          email: string
          created_at?: string
        }
        Update: {
          email?: string
          created_at?: string
        }
        Relationships: [
        ]
      }
      collection_series: {
        Row: {
          user_id: string
          collection_id: string
          library_series_id: string
          created_at: string
        }
        Insert: {
          user_id?: string
          collection_id: string
          library_series_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          collection_id?: string
          library_series_id?: string
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'collection_series_collection_id_user_id_fkey'; columns: ['collection_id', 'user_id']; isOneToOne: false; referencedRelation: 'collections'; referencedColumns: ['id', 'user_id'] },
          { foreignKeyName: 'collection_series_library_series_id_user_id_fkey'; columns: ['library_series_id', 'user_id']; isOneToOne: false; referencedRelation: 'library_series'; referencedColumns: ['id', 'user_id'] },
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
          automatic_rules: Json | null
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
          automatic_rules?: Json | null
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
          automatic_rules?: Json | null
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
          sync_id: string | null
          source_url: string | null
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          cancelled_at?: string | null
          sync_id?: string | null
          source_url?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          cancelled_at?: string | null
          sync_id?: string | null
          source_url?: string | null
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
      library_collection_documents: {
        Row: {
          id: string | null
          user_id: string | null
          work_id: string | null
          story: Json | null
          search_any: string | null
          search_summary: string | null
          search_notes: string | null
        }
        Insert: {
          id?: string | null
          user_id?: string | null
          work_id?: string | null
          story?: Json | null
          search_any?: string | null
          search_summary?: string | null
          search_notes?: string | null
        }
        Update: {
          id?: string | null
          user_id?: string | null
          work_id?: string | null
          story?: Json | null
          search_any?: string | null
          search_summary?: string | null
          search_notes?: string | null
        }
        Relationships: [
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
          reading_history: Json
          work_status: string
          source_bookmark: Json
          is_rec: boolean
          dnf_since: string | null
          reading_provenance: Json
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
          reading_history?: Json
          work_status?: string
          source_bookmark?: Json
          is_rec?: boolean
          dnf_since?: string | null
          reading_provenance?: Json
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
          reading_history?: Json
          work_status?: string
          source_bookmark?: Json
          is_rec?: boolean
          dnf_since?: string | null
          reading_provenance?: Json
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
      library_query_cache: {
        Row: {
          user_id: string
          key: string
          query: Json
          revision: number
          matches: Json
          touched_at: string
        }
        Insert: {
          user_id: string
          key: string
          query: Json
          revision: number
          matches: Json
          touched_at?: string
        }
        Update: {
          user_id?: string
          key?: string
          query?: Json
          revision?: number
          matches?: Json
          touched_at?: string
        }
        Relationships: [
        ]
      }
      library_query_state: {
        Row: {
          user_id: string
          revision: number
          navigation: Json | null
          navigation_revision: number | null
        }
        Insert: {
          user_id: string
          revision?: number
          navigation?: Json | null
          navigation_revision?: number | null
        }
        Update: {
          user_id?: string
          revision?: number
          navigation?: Json | null
          navigation_revision?: number | null
        }
        Relationships: [
        ]
      }
      library_search_documents: {
        Row: {
          id: string
          user_id: string
          work_id: string
          story: Json
          search_any: string | null
          search_summary: string | null
          search_notes: string | null
          reading_status: string | null
          is_favorite: boolean | null
          is_rec: boolean | null
          sort_title: string | null
          sort_added: string | null
          sort_updated: string | null
          sort_ready: number | null
          reading_sections: string[] | null
          series_story: Json | null
          catalog_story: Json | null
          sort_words: number | null
        }
        Insert: {
          id: string
          user_id: string
          work_id: string
          story: Json
          search_any?: string | null
          search_summary?: string | null
          search_notes?: string | null
          reading_status?: string | null
          is_favorite?: boolean | null
          is_rec?: boolean | null
          sort_title?: string | null
          sort_added?: string | null
          sort_updated?: string | null
          sort_ready?: number | null
          reading_sections?: string[] | null
          series_story?: Json | null
          catalog_story?: Json | null
          sort_words?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          work_id?: string
          story?: Json
          search_any?: string | null
          search_summary?: string | null
          search_notes?: string | null
          reading_status?: string | null
          is_favorite?: boolean | null
          is_rec?: boolean | null
          sort_title?: string | null
          sort_added?: string | null
          sort_updated?: string | null
          sort_ready?: number | null
          reading_sections?: string[] | null
          series_story?: Json | null
          catalog_story?: Json | null
          sort_words?: number | null
        }
        Relationships: [
          { foreignKeyName: 'library_search_documents_id_fkey'; columns: ['id']; isOneToOne: false; referencedRelation: 'library_entries'; referencedColumns: ['id'] },
          { foreignKeyName: 'library_search_documents_work_id_fkey'; columns: ['work_id']; isOneToOne: false; referencedRelation: 'works'; referencedColumns: ['id'] },
        ]
      }
      library_series: {
        Row: {
          id: string
          user_id: string
          ao3_series_id: number
          metadata: Json
          notes: string
          created_at: string
          updated_at: string
          is_favorite: boolean
          reading_status: Database['public']['Enums']['reading_status']
          is_rec: boolean
        }
        Insert: {
          id?: string
          user_id?: string
          ao3_series_id: number
          metadata: Json
          notes?: string
          created_at?: string
          updated_at?: string
          is_favorite?: boolean
          reading_status?: Database['public']['Enums']['reading_status']
          is_rec?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          ao3_series_id?: number
          metadata?: Json
          notes?: string
          created_at?: string
          updated_at?: string
          is_favorite?: boolean
          reading_status?: Database['public']['Enums']['reading_status']
          is_rec?: boolean
        }
        Relationships: [
        ]
      }
      library_story_documents: {
        Row: {
          id: string | null
          user_id: string | null
          work_id: string | null
          story: Json | null
        }
        Insert: {
          id?: string | null
          user_id?: string | null
          work_id?: string | null
          story?: Json | null
        }
        Update: {
          id?: string | null
          user_id?: string | null
          work_id?: string | null
          story?: Json | null
        }
        Relationships: [
        ]
      }
      library_sync_reports: {
        Row: {
          user_id: string
          id: string
          completed_at: string
          report: Json
        }
        Insert: {
          user_id?: string
          id: string
          completed_at?: string
          report: Json
        }
        Update: {
          user_id?: string
          id?: string
          completed_at?: string
          report?: Json
        }
        Relationships: [
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
          requested_reading_status: Database['public']['Enums']['reading_status'] | null
          bookmark_import: Json | null
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
          requested_reading_status?: Database['public']['Enums']['reading_status'] | null
          bookmark_import?: Json | null
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
          requested_reading_status?: Database['public']['Enums']['reading_status'] | null
          bookmark_import?: Json | null
        }
        Relationships: [
          { foreignKeyName: 'metadata_jobs_entry_id_fkey'; columns: ['entry_id']; isOneToOne: false; referencedRelation: 'library_entries'; referencedColumns: ['id'] },
          { foreignKeyName: 'metadata_jobs_batch_id_user_id_fkey'; columns: ['batch_id', 'user_id']; isOneToOne: false; referencedRelation: 'import_batches'; referencedColumns: ['id', 'user_id'] },
          { foreignKeyName: 'metadata_jobs_work_id_fkey'; columns: ['work_id']; isOneToOne: false; referencedRelation: 'works'; referencedColumns: ['id'] },
        ]
      }
      metadata_preferences: {
        Row: {
          user_id: string
          retrieval_mode: string
          personal_rating_info: string | null
          dnf_cleanup: Json
          retrieval_mode_mobile: string | null
          tag_appearance: Json | null
        }
        Insert: {
          user_id?: string
          retrieval_mode?: string
          personal_rating_info?: string | null
          dnf_cleanup?: Json
          retrieval_mode_mobile?: string | null
          tag_appearance?: Json | null
        }
        Update: {
          user_id?: string
          retrieval_mode?: string
          personal_rating_info?: string | null
          dnf_cleanup?: Json
          retrieval_mode_mobile?: string | null
          tag_appearance?: Json | null
        }
        Relationships: [
        ]
      }
      metadata_queue_turns: {
        Row: {
          user_id: string
          batch_id: string
          last_claimed_at: string
        }
        Insert: {
          user_id: string
          batch_id: string
          last_claimed_at: string
        }
        Update: {
          user_id?: string
          batch_id?: string
          last_claimed_at?: string
        }
        Relationships: [
          { foreignKeyName: 'metadata_queue_turns_batch_id_fkey'; columns: ['batch_id']; isOneToOne: false; referencedRelation: 'import_batches'; referencedColumns: ['id'] },
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
      reader_app_access: {
        Row: {
          user_id: string
        }
        Insert: {
          user_id: string
        }
        Update: {
          user_id?: string
        }
        Relationships: [
        ]
      }
      reader_availability: {
        Row: {
          device_id: string
          user_id: string
          installation_id: string
          name: string
          url: string
          reported_at: string
          works: Json
        }
        Insert: {
          device_id: string
          user_id: string
          installation_id: string
          name: string
          url: string
          reported_at?: string
          works: Json
        }
        Update: {
          device_id?: string
          user_id?: string
          installation_id?: string
          name?: string
          url?: string
          reported_at?: string
          works?: Json
        }
        Relationships: [
          { foreignKeyName: 'reader_availability_device_id_fkey'; columns: ['device_id']; isOneToOne: false; referencedRelation: 'userscript_devices'; referencedColumns: ['id'] },
        ]
      }
      reader_cloud_receipts: {
        Row: {
          user_id: string
          id: string
          result: Json
        }
        Insert: {
          user_id: string
          id: string
          result: Json
        }
        Update: {
          user_id?: string
          id?: string
          result?: Json
        }
        Relationships: [
        ]
      }
      reader_cloud_values: {
        Row: {
          user_id: string
          key: string
          value: Json
          revision: number
        }
        Insert: {
          user_id: string
          key: string
          value: Json
          revision?: number
        }
        Update: {
          user_id?: string
          key?: string
          value?: Json
          revision?: number
        }
        Relationships: [
        ]
      }
      reader_import_inbox: {
        Row: {
          destination: string
          id: string
          user_id: string
          hash: string
          metadata: Json
          status: string
          message: string
          created_at: string
        }
        Insert: {
          destination: string
          id: string
          user_id: string
          hash: string
          metadata?: Json
          status?: string
          message?: string
          created_at?: string
        }
        Update: {
          destination?: string
          id?: string
          user_id?: string
          hash?: string
          metadata?: Json
          status?: string
          message?: string
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'reader_import_inbox_destination_fkey'; columns: ['destination']; isOneToOne: false; referencedRelation: 'reader_transfer_destinations'; referencedColumns: ['id'] },
        ]
      }
      reader_organizer_devices: {
        Row: {
          user_id: string
          installation: string
          device: string
        }
        Insert: {
          user_id: string
          installation: string
          device: string
        }
        Update: {
          user_id?: string
          installation?: string
          device?: string
        }
        Relationships: [
          { foreignKeyName: 'reader_organizer_devices_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'reader_organizer_links'; referencedColumns: ['user_id'] },
          { foreignKeyName: 'reader_organizer_devices_device_fkey'; columns: ['device']; isOneToOne: false; referencedRelation: 'userscript_devices'; referencedColumns: ['id'] },
        ]
      }
      reader_organizer_links: {
        Row: {
          user_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          created_at?: string
        }
        Relationships: [
        ]
      }
      reader_transfer_destinations: {
        Row: {
          id: string
          user_id: string
          device: string
          label: string
          token_hash: string
          revoked: boolean
          created_at: string
        }
        Insert: {
          id: string
          user_id: string
          device: string
          label: string
          token_hash: string
          revoked?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          device?: string
          label?: string
          token_hash?: string
          revoked?: boolean
          created_at?: string
        }
        Relationships: [
        ]
      }
      reading_activity: {
        Row: {
          id: string | null
          user_id: string | null
          record: Json | null
        }
        Insert: {
          id?: string | null
          user_id?: string | null
          record?: Json | null
        }
        Update: {
          id?: string | null
          user_id?: string | null
          record?: Json | null
        }
        Relationships: [
        ]
      }
      reading_records: {
        Row: {
          id: string
          user_id: string
          ao3_work_id: number | null
          original_url: string
          bookmark_id: string | null
          reading_status: Database['public']['Enums']['reading_status']
          last_read_chapter: number
          created_at: string
          started_at: string | null
          finished_at: string | null
          dnf_since: string | null
          archived_at: string
          reading_history: Json
          metadata: Json
          format_version: number
        }
        Insert: {
          id: string
          user_id: string
          ao3_work_id?: number | null
          original_url: string
          bookmark_id?: string | null
          reading_status: Database['public']['Enums']['reading_status']
          last_read_chapter: number
          created_at: string
          started_at?: string | null
          finished_at?: string | null
          dnf_since?: string | null
          archived_at?: string
          reading_history: Json
          metadata: Json
          format_version?: number
        }
        Update: {
          id?: string
          user_id?: string
          ao3_work_id?: number | null
          original_url?: string
          bookmark_id?: string | null
          reading_status?: Database['public']['Enums']['reading_status']
          last_read_chapter?: number
          created_at?: string
          started_at?: string | null
          finished_at?: string | null
          dnf_since?: string | null
          archived_at?: string
          reading_history?: Json
          metadata?: Json
          format_version?: number
        }
        Relationships: [
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
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          secret_hash: string
          paired?: boolean
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          secret_hash?: string
          paired?: boolean
          expires_at?: string | null
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
          ao3_work_id: number | null
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
          ao3_work_id?: number | null
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
          ao3_work_id?: number | null
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
      reader_organizer_connection: { Args: { p_action: string; p_installation?: string; p_secret?: string }; Returns: Json }
      consume_app_login_handoff: { Args: { p_hash: string; p_challenge: string; p_origin: string }; Returns: string | null }
      account_has_password: { Args: Record<PropertyKey, never>; Returns: boolean }
      manage_account_username: { Args: { p_username?: string }; Returns: string | null }
      reader_has_access: { Args: Record<string, never>; Returns: boolean }
      reader_cloud_apply: { Args: { p_id: string; p_key: string; p_value: Json; p_base: number }; Returns: Json }
      reading_stats_works: { Args: { p_after?: string; p_limit?: number }; Returns: Json }
      reader_offline_snapshot: { Args: Record<string, never>; Returns: Json }
      review_import_reading: { Args: { p_ids?: string[]; p_action?: string; p_page?: number; p_scope?: string[] }; Returns: Json }
      mark_work_deleted: { Args: { p_entry: string; p_job: string }; Returns: undefined }
      claim_backup_save: { Args: { p_user: string; p_create: boolean }; Returns: Json }
      release_backup_save: { Args: { p_user: string; p_token: string }; Returns: undefined }
      backup_storage_files: { Args: { p_user: string }; Returns: Json }
      preview_library_restore: { Args: { p_backup: Json }; Returns: Json }
      restore_own_library_backup: { Args: { p_backup: Json; p_fingerprint: string; p_safety_path: string }; Returns: Json }
      export_library_backup: { Args: Record<string, never>; Returns: Json }
      restore_library_backup: { Args: { p_backup: Json; p_user: string; p_replace?: boolean }; Returns: Json }
      paged_import_history: { Args: { p_batch?: string; p_history_page?: number; p_result_page?: number; p_status?: string }; Returns: Json }
      library_revision: { Args: Record<string, never>; Returns: number }
      library_navigation_snapshot: { Args: Record<string, never>; Returns: Json }
      library_navigation: { Args: Record<string, never>; Returns: Json }
      library_query_facets: { Args: { p_query?: Json }; Returns: Json }
      library_catalog: { Args: Record<string, never>; Returns: Json }
      library_story_details: { Args: { p_ids: string[] }; Returns: Json }
      query_library: { Args: { p_query?: Json; p_page?: number; p_size?: number }; Returns: Json }
      update_library_series: { Args: { p_series: number; p_input: Json; p_base: Json }; Returns: undefined }
      finish_library_series: { Args: { p_series: number }; Returns: number }
      ensure_library_series: { Args: { p_series: number; p_title: string }; Returns: undefined }
      remove_library_series_details: { Args: { p_series: number }; Returns: undefined }
      remember_library_series: { Args: { p_metadata: Json }; Returns: string }
      save_library_series_note: { Args: { p_series: number; p_notes: string; p_base: string }; Returns: undefined }
      manage_userscript_device: { Args: { p_action: string; p_name?: string; p_id?: string }; Returns: Json }
      dnf_cleanup: { Args: { p_action?: string; p_input?: Json; p_page?: number }; Returns: Json }
      run_scheduled_dnf_cleanup: { Args: Record<string, never>; Returns: number }
      library_sync_report_history: { Args: { p_report?: Json; p_page?: number }; Returns: Json }
      tag_appearance_settings: { Args: { p_input?: Json }; Returns: Json }
      personal_rating_settings: { Args: { p_input?: Json }; Returns: Json }
      userscript_library: { Args: { p_secret: string; p_action: string; p_work?: number; p_input?: Json }; Returns: Json }
      preview_ao3_csv_import: { Args: { p_work_ids: number[]; p_bookmark_ids?: number[] }; Returns: Json }
      submit_ao3_csv_import: { Args: { p_rows: Json }; Returns: Json }
      submit_ao3_library_sync: { Args: { p_rows: Json; p_scan_id?: string; p_source_url?: string }; Returns: Json }
      submit_import_urls: { Args: { p_urls: string[]; p_update_reading_location?: boolean; p_reading_status?: Database['public']['Enums']['reading_status']; p_series_ids?: number[] }; Returns: string | null }
      cancel_import_batch: { Args: { p_batch: string }; Returns: undefined }
      retry_metadata_job: { Args: { p_job: string }; Returns: undefined }
      ao3_source_target: { Args: { p_url: string }; Returns: string }
      metadata_job_archive_source: { Args: { p_job: string }; Returns: string | null }
      claim_extension_job: { Args: Record<string, never>; Returns: Json }
      approve_import_progress: { Args: { p_item: string }; Returns: undefined }
      clear_metadata_override: { Args: { p_entry: string; p_field: string }; Returns: undefined }
      reorder_collections: { Args: { p_ids: string[] }; Returns: undefined }
      restore_library_story: { Args: { p_entry: Json; p_collections: string[]; p_tags: string[] }; Returns: string }

      save_library_story_checked: { Args: { p_id: string | null; p_url: string; p_input: Json; p_base: Json | null }; Returns: string }
      update_library_entry_checked: { Args: { p_id: string; p_input: Json; p_base: Json }; Returns: undefined }
      save_library_story: {
        Args: { p_url: string; p_metadata: Json; p_status: Database['public']['Enums']['reading_status']; p_progress: number; p_notes: string; p_rating: number | null; p_favorite: boolean; p_collections: string[]; p_tags: string[]; p_id?: string | null }
        Returns: string
      }
    }
    Enums: {
      reading_status: 'to_read' | 'reading' | 'paused_reading' | 'waiting_for_updates' | 're_reading' | 'finished' | 'did_not_finish'
      ao3_tag_category: 'relationship' | 'character' | 'freeform' | 'warning' | 'category'
      metadata_source: 'unknown' | 'ao3' | 'manual' | 'extension'
    }
    CompositeTypes: { [_ in never]: never }
  }
}
