// Generated from the Phase 1 migration by npm run db:types:embedded.
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
        }
        Insert: {
          id?: string
          user_id?: string
          name: string
          description?: string | null
          default_key?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          default_key?: string | null
          created_at?: string
          updated_at?: string
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
        }
        Insert: {
          work_id: string
          tag_id: string
        }
        Update: {
          work_id?: string
          tag_id?: string
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
        }
        Relationships: [
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: {
      metadata_source: 'unknown' | 'ao3' | 'manual' | 'extension'
      ao3_tag_category: 'relationship' | 'character' | 'freeform' | 'warning' | 'category'
      reading_status: 'to_read' | 'reading' | 'waiting_for_updates' | 're_reading' | 'finished' | 'did_not_finish'
    }
    CompositeTypes: { [_ in never]: never }
  }
}
