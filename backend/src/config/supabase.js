import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

let supabaseUrl = process.env.SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  if (process.env.NODE_ENV === 'test') {
    // Unit/integration tests that only exercise routing or validators must
    // not need real credentials. Database-backed tests are intentionally not
    // part of the automated suite.
    supabaseUrl = 'http://127.0.0.1:54321';
    supabaseKey = 'test-service-key';
  } else {
    throw new Error('Missing Supabase credentials. Please check your .env file.');
  }
}

// Use service key for backend operations (bypasses RLS)
export const supabase = createClient(supabaseUrl, supabaseKey);

// For operations that need to respect RLS
export const supabaseClient = createClient(supabaseUrl, process.env.SUPABASE_KEY || supabaseKey);