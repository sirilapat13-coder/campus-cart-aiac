// files.js - uploading files to Supabase Storage.

import { supabase } from './supabaseClient.js';
import { generateId } from './utils.js';

// The PRIVATE bucket for Xerox PDFs.
const XEROX_BUCKET = 'xerox-files';

// Checks that a file REALLY is a PDF by reading its first 5 characters.
// (A real PDF always starts with "%PDF-". This stops someone from just
// renaming another kind of file to .pdf.)
export async function looksLikePdf(file) {
  try {
    const start = await file.slice(0, 5).text();
    return start === '%PDF-';
  } catch {
    return false;
  }
}

// Uploads a Xerox PDF into the student's own folder and returns its path.
// The path looks like: <student-id>/xerox-<random-id>.pdf
// Only that path is saved in the database, never the file itself.
export async function uploadXeroxFile(userId, file) {
  const path = `${userId}/${generateId('xerox')}.pdf`;

  const { error } = await supabase.storage.from(XEROX_BUCKET).upload(path, file, {
    contentType: 'application/pdf',
    upsert: false
  });

  if (error) {
    console.error('[Campus Cart] Upload error:', error);
    throw new Error('Could not upload your file. Please check your connection and try again.');
  }
  return path;
}