// auth.js - everything about logging in and out.
// Other files import these functions instead of repeating the code.

import { supabase } from './supabaseClient.js';
import { getQueryParam } from './utils.js';

// The names of your pages. Change them here if you ever rename a page.
const LOGIN_PAGE = 'login.html';
const HOME_PAGE = 'homepage.html';

// A page name is only trusted if it looks like "something.html".
// This stops someone from sending students to another website
// by putting a fake address in the link.
const SAFE_PAGE_PATTERN = /^[a-z0-9-]+\.html$/i;

// Creates a new student account.
// The extra details (name, student ID, mobile) are saved with the account,
// and the database turns them into the student's profile automatically.
export async function signUpStudent({ fullName, studentId, phone, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, student_id: studentId, phone },
      emailRedirectTo: new URL(LOGIN_PAGE, window.location.href).href
    }
  });
  if (error) throw error;

  // If the email is already registered, Supabase pretends it worked
  // but returns a user with no "identities". We catch that here.
  const alreadyRegistered =
    data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
  if (alreadyRegistered) {
    throw new Error('An account with this email already exists. Please log in.');
  }
  return data;
}

// Logs a student in with email and password.
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Logs the student out.
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Returns the current login session, or null if nobody is logged in.
// Supabase remembers the session in the browser, so this works after a refresh.
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

// Returns the logged-in student's profile (name, phone, student ID, role).
// Returns null if nobody is logged in.
export async function getMyProfile() {
  const session = await getSession();
  if (!session) {
    return null;
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, student_id, phone, role, delivery_available, delivery_status')
    .eq('id', session.user.id)
    .single();
  if (error) throw error;
  return data;
}

// Reads the "?next=cart.html" part of the address so that after logging in,
// the student returns to the page they were trying to open.
export function getNextPage() {
  return getQueryParam('next', { fallback: HOME_PAGE, pattern: SAFE_PAGE_PATTERN });
}

// Call this at the top of any page that needs a logged-in student.
// If nobody is logged in, it sends them to the login page.
export async function requireLogin() {
  const session = await getSession();
  if (session) {
    return session;
  }
  const currentPage = window.location.pathname.split('/').pop() || HOME_PAGE;
  const next = SAFE_PAGE_PATTERN.test(currentPage)
    ? `?next=${encodeURIComponent(currentPage)}`
    : '';
  window.location.replace(LOGIN_PAGE + next);
  return null;
}

// Call this on the login and signup pages.
// If the student is already logged in, it skips ahead.
export async function redirectIfLoggedIn() {
  const session = await getSession();
  if (session) {
    window.location.replace(getNextPage());
    return true;
  }
  return false;
}