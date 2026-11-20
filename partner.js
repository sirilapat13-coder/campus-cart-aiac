// partner.js - student-side helpers for delivery-partner access.
// Phase 3 only READS the delivery state and builds the account-menu link.
// Phase 4 adds applyForDelivery() at the bottom of this file.
//
// The five possible states of a student:
//   'none'      never applied
//   'pending'   applied, waiting for the admin
//   'rejected'  the admin said no (admin_note explains why)
//   'approved'  allowed to deliver
//   'suspended' delivery access was switched off by the admin

import { supabase } from './supabaseClient.js';

// Works out which of the five states this student is in.
// profile.delivery_status is the official permission ('none' / 'approved' / 'suspended').
// Only when it is 'none' do we look at the application to tell pending from rejected.
export async function getMyDeliveryState(userId, profile) {
  const permission = profile && profile.delivery_status;

  if (permission === 'approved') {
    return { status: 'approved', note: '' };
  }
  if (permission === 'suspended') {
    return { status: 'suspended', note: '' };
  }

  // Newest application of this student. We filter by user_id ourselves because
  // an admin account can read everyone's applications.
  const { data, error } = await supabase
    .from('delivery_partner_applications')
    .select('status, admin_note, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (data && data.status === 'pending') {
    return { status: 'pending', note: '' };
  }
  if (data && data.status === 'rejected') {
    return { status: 'rejected', note: data.admin_note || '' };
  }
  return { status: 'none', note: '' };
}

// The text and link shown in the Account menu for each state.
const MENU_ITEMS = {
  none:      { label: 'Become a Delivery Partner',         href: 'delivery-apply.html' },
  pending:   { label: 'Application Pending',               href: 'delivery-apply.html' },
  rejected:  { label: 'Delivery application: Rejected',    href: 'delivery-apply.html' },
  approved:  { label: 'Switch to Delivery Partner',        href: 'delivery-partner.html' },
  suspended: { label: 'Delivery access suspended',         href: 'delivery-apply.html' }
};

export function getDeliveryMenuItem(status) {
  return MENU_ITEMS[status] || MENU_ITEMS.none;
}

// Sets the student offline. Used when they log out so "online" stays trustworthy.
// It never throws: a failure here must not stop the logout.
export async function goOffline(userId) {
  try {
    await supabase
      .from('profiles')
      .update({ delivery_available: false })
      .eq('id', userId);
  } catch (error) {
    console.warn('Could not set offline before logout:', error);
  }
}

// =====================================================================
// PHASE 4: submit a delivery-partner application
// =====================================================================

// >>> CHECK THESE FOUR NAMES AGAINST YOUR DATABASE FUNCTION <<<
// The left side is our own label (do not change). The right side must be the
// EXACT parameter name of apply_for_delivery in your Supabase database.
// See "Step 1" of the Phase 4 instructions for how to look them up.
// If your function has no parameter for one of these, delete that line here
// AND the matching line inside applyForDelivery() below.
const APPLY_PARAMS = {
  block: 'p_block_or_hostel',
  availability: 'p_availability_note',
  reason: 'p_reason',
  agreed: 'p_agreed'
};

// Sends the application to the database.
// The database decides everything important (one pending application per
// student, no re-applying if approved or suspended, text length limits).
export async function applyForDelivery({ block, availability, reason, agreed }) {
  const { data, error } = await supabase.rpc('apply_for_delivery', {
    [APPLY_PARAMS.block]: block,
    [APPLY_PARAMS.availability]: availability,
    [APPLY_PARAMS.reason]: reason,
    [APPLY_PARAMS.agreed]: agreed
  });
  if (error) throw error;
  return data;
}
