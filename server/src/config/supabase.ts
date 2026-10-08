import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './env.js';

let supabaseClient: SupabaseClient | null = null;
let supabaseAdminClient: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
  if (!supabaseClient) {
    supabaseClient = createClient(
      config.supabase.url || 'https://placeholder.supabase.co',
      config.supabase.anonKey || 'placeholder-anon-key'
    );
  }
  return supabaseClient;
};

export const getSupabaseAdmin = (): SupabaseClient => {
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(
      config.supabase.url || 'https://placeholder.supabase.co',
      config.supabase.serviceRoleKey || 'placeholder-service-key',
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );
  }
  return supabaseAdminClient;
};
