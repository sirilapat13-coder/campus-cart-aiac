// Step A: load Supabase's ready-made code from the internet.
// "import" means "bring this tool into my file".
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Step B: your two values. Replace the text inside the quote marks.
// Keep the quote marks. Do not add spaces.
const SUPABASE_URL = 'https://hjjddgaqhkxmfibvdpqa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_BYtgsy1KFgXjyddJjTBMiw_D-HmTyRh';

// Step C: a safety check. If you forgot to paste your values,
// the page stops and shows a clear message in the Console.
if (SUPABASE_URL.includes('PASTE') || SUPABASE_ANON_KEY.includes('PASTE')) {
  throw new Error('Open js/supabaseClient.js and paste your Supabase URL and key.');
}

// Step D: create the connection and share it.
// "export" means "other files are allowed to import this".
// Logged-in sessions are remembered by the browser automatically.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);