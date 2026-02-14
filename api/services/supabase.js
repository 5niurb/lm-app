import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Client-scoped client (respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client (bypasses RLS) — use only in server-side operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
