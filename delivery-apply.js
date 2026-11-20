// delivery-apply.js - makes delivery-apply.html work.
// Shows ONE of three views:
//   1. the application form   (never applied, or rejected and applying again)
//   2. a status screen        (pending / rejected / approved / suspended)
//   3. a loading message
// This page is only for convenience. The database decides who may really apply.

import { requireLogin, getMyProfile } from '../auth.js';
import { getMyDeliveryState, applyForDelivery } from '../partner.js';
import { formatIndianMobile, toText, showError, showSuccess, tryCatch } from '../utils.js';

// ---- Find the parts of the page we need ----
const subtitle = document.getElementById('apply-subtitle');
const viewLoading = document.getElementById('view-loading');
const viewStatus = document.getElementById('view-status');
const form = document.getElementById('apply-form');

const whoBox = document.getElementById('apply-who');
const blockInput = document.getElementById('apply-block');
const availabilityInput = document.getElementById('apply-availability');
const reasonInput = document.getElementById('apply-reason');
const reasonCount = document.getElementById('reason-count');
const agreeBox = document.getElementById('apply-agree');
const submitButton = document.getElementById('apply-submit');

const statusPill = document.getElementById('status-pill');
const statusTitle = document.getElementById('status-title');
const statusText = document.getElementById('status-text');
const statusNote = document.getElementById('status-note');
const reapplyButton = document.getElementById('reapply-button');
const dashboardLink = document.getElementById('dashboard-link');

// ---- Switching between the three views ----
function showView(name) {
  viewLoading.hidden = name !== 'loading';
  form.hidden = name !== 'form';
  viewStatus.hidden = name !== 'status';
}

function showForm() {
  subtitle.textContent = 'Deliver orders to fellow students and earn money on campus. Tell us a little about yourself.';
  showView('form');
  blockInput.focus();
}

// What to show for each state. note = text from the admin (rejection reason).
const STATUS_SCREENS = {
  pending: {
    pill: 'Pending',
    title: 'Application pending',
    text: 'Your application has been sent to the admin. Once it is approved, "Switch to Delivery Partner" will appear in your Account menu. You can keep ordering as a customer meanwhile.'
  },
  rejected: {
    pill: 'Not approved',
    title: 'Application not approved',
    text: 'The admin did not approve your application this time. Read the note below, fix anything mentioned, and you can apply again.'
  },
  approved: {
    pill: 'Approved',
    title: 'You are a delivery partner',
    text: 'Your application was approved. Open the dashboard to go online and accept deliveries. You can switch back to Customer Mode at any time.'
  },
  suspended: {
    pill: 'Suspended',
    title: 'Delivery access suspended',
    text: 'An admin has switched off your delivery access. You can still order as a customer. Please contact the campus admin to ask why.'
  }
};

function showStatus(state) {
  const screen = STATUS_SCREENS[state.status];
  subtitle.textContent = 'Your delivery partner status';

  statusPill.textContent = screen.pill;
  statusPill.className = `status-pill is-${state.status}`;
  statusTitle.textContent = screen.title;
  statusText.textContent = screen.text;

  // textContent (not innerHTML) so nobody can inject HTML through the note.
  const hasNote = state.status === 'rejected' && Boolean(state.note);
  statusNote.hidden = !hasNote;
  statusNote.textContent = hasNote ? `Admin's note: ${state.note}` : '';

  reapplyButton.hidden = state.status !== 'rejected';
  dashboardLink.hidden = state.status !== 'approved';

  showView('status');
}

// ---- Page start ----
const session = await requireLogin();

if (session) {
  showView('loading');

  const { data: profile } = await tryCatch(() => getMyProfile(), { context: 'Loading profile' });
  const phone = profile && profile.phone ? formatIndianMobile(profile.phone) : 'no phone added';
  whoBox.textContent = `Applying as ${toText(profile && profile.full_name, 'Student')} (${phone})`;

  try {
    const state = await getMyDeliveryState(session.user.id, profile);
    if (state.status === 'none') {
      showForm();
    } else {
      showStatus(state);
    }
  } catch (error) {
    console.warn('Could not load delivery status:', error);
    subtitle.textContent = 'Something went wrong';
    viewLoading.textContent = 'We could not load your application. Please refresh the page.';
  }
}

// ---- Rejected students can apply again ----
reapplyButton.addEventListener('click', () => {
  showForm();
});

// ---- Live character counter for the reason box ----
reasonInput.addEventListener('input', () => {
  reasonCount.textContent = String(reasonInput.value.length);
});

// ---- Submitting the form ----
form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const block = blockInput.value.trim();
  const availability = availabilityInput.value.trim();
  const reason = reasonInput.value.trim();

  if (block.length < 2) {
    showError('Please enter your hostel or block.');
    blockInput.focus();
    return;
  }
  if (availability.length < 3) {
    showError('Please tell us when you are usually free.');
    availabilityInput.focus();
    return;
  }
  if (reason.length < 10) {
    showError('Please write at least a short sentence about why you want to deliver.');
    reasonInput.focus();
    return;
  }
  if (!agreeBox.checked) {
    showError('Please tick the box to agree to the delivery rules.');
    agreeBox.focus();
    return;
  }

  // Block double clicks while we wait for Supabase.
  submitButton.disabled = true;
  submitButton.textContent = 'Submitting...';

  const { error } = await tryCatch(
    () => applyForDelivery({ block, availability, reason, agreed: true }),
    { context: 'Delivery application' }
  );

  if (error) {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit application';
    return;
  }

  showSuccess('Application submitted! The admin will review it.');
  // Reload so the page and the Account menu both show "Pending".
  setTimeout(() => window.location.reload(), 1200);
});
