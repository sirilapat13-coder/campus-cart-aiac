// main.js - runs on every page EXCEPT login.html and signup.html.
// 1. Makes sure a student is logged in (otherwise sends them to login.html).
// 2. Fills the Account menu in the header with the student's real details.
// 3. Shows the right delivery item in the menu (apply / pending / switch ...).
// 4. Makes the Logout button work (and sets delivery partners offline first).
// 5. Keeps the cart badge and cart bar up to date.

import { requireLogin, getMyProfile, signOut } from './auth.js';
import { clearCart } from './cart.js';
import { initCartIndicators } from './cart-ui.js';
import { getMyDeliveryState, getDeliveryMenuItem, goOffline } from './partner.js';
import { formatIndianMobile, toText, tryCatch } from './utils.js';

const LOGIN_PAGE = 'login.html';

// The Account menu already contains one delivery link in the HTML.
// We find it by its data attribute (set below) or by its original address.
const DELIVERY_LINK_SELECTOR = '#account-menu [data-delivery-link], #account-menu a[href="delivery-partner.html"]';

// Remembered so the Logout button knows who to set offline.
let currentUserId = null;
let currentlyOnline = false;

// Adds a "My Orders" link to the Account menu (once).
function addMyOrdersLink() {
  const menu = document.querySelector('#account-menu .account-menu');
  if (!menu || menu.querySelector('[data-my-orders]')) {
    return;
  }
  const link = document.createElement('a');
  link.href = 'my-orders.html';
  link.className = 'account-link';
  link.textContent = 'My Orders';
  link.dataset.myOrders = 'true';

  const deliveryLink = menu.querySelector(DELIVERY_LINK_SELECTOR);
  if (deliveryLink) {
    deliveryLink.before(link);
  } else {
    menu.append(link);
  }
}

// Writes the student's details into the Account dropdown.
function fillAccountMenu(session, profile) {
  const nameElement = document.getElementById('account-name');
  const phoneElement = document.getElementById('account-phone');
  const emailElement = document.getElementById('account-email');

  if (nameElement) {
    nameElement.textContent = toText(profile && profile.full_name, 'Student');
  }
  if (phoneElement) {
    const phone = profile && profile.phone ? formatIndianMobile(profile.phone) : 'Not added yet';
    phoneElement.textContent = `Phone: ${phone}`;
  }
  if (emailElement) {
    emailElement.textContent = `Email: ${toText(session.user.email, '')}`;
  }

  addMyOrdersLink();
  addAdminLink(profile);
}

// Admins get an "Admin Dashboard" link. (The page itself is built in Phase 6.)
function addAdminLink(profile) {
  const menu = document.querySelector('#account-menu .account-menu');
  if (!menu || !profile || profile.role !== 'admin' || menu.querySelector('[data-admin-link]')) {
    return;
  }
  const link = document.createElement('a');
  link.href = 'admin.html';
  link.className = 'account-link';
  link.textContent = 'Admin Dashboard';
  link.dataset.adminLink = 'true';

  const logoutButton = menu.querySelector('#logout-button');
  if (logoutButton) {
    logoutButton.before(link);
  } else {
    menu.append(link);
  }
}

// Shows the right delivery item for this student.
// This is only navigation. The database decides what they may actually do.
async function fillDeliveryLink(session, profile) {
  const link = document.querySelector(DELIVERY_LINK_SELECTOR);
  if (!link) {
    return;
  }
  link.dataset.deliveryLink = 'true';

  let state;
  try {
    state = await getMyDeliveryState(session.user.id, profile);
  } catch (error) {
    // If we cannot tell, hide the link rather than show a wrong one.
    console.warn('Could not load delivery status:', error);
    link.hidden = true;
    return;
  }

  const item = getDeliveryMenuItem(state.status);
  link.textContent = item.label;
  link.setAttribute('href', item.href);
  link.dataset.deliveryState = state.status;
  link.hidden = false;
}

// Makes the Logout button log the student out and go to the login page.
function setupLogoutButton() {
  const button = document.getElementById('logout-button');
  if (!button) {
    return;
  }
  button.addEventListener('click', async () => {
    button.disabled = true;

    // A partner who is "online" is set offline first (never blocks the logout).
    if (currentUserId && currentlyOnline) {
      await goOffline(currentUserId);
    }

    const { error } = await tryCatch(() => signOut(), { context: 'Logout' });
    if (error) {
      button.disabled = false;
      return;
    }
    clearCart();
    window.location.replace(LOGIN_PAGE);
  });
}

// ---- This part runs when the page opens ----

const session = await requireLogin();

if (session) {
  currentUserId = session.user.id;

  // Hide the delivery link until we know the student's state (no flicker).
  const deliveryLink = document.querySelector(DELIVERY_LINK_SELECTOR);
  if (deliveryLink) {
    deliveryLink.hidden = true;
  }

  initCartIndicators();
  setupLogoutButton();
  addMyOrdersLink();
  const { data: profile } = await tryCatch(() => getMyProfile(), { context: 'Loading profile' });
  currentlyOnline = Boolean(profile && profile.delivery_available);
  fillAccountMenu(session, profile);
  await fillDeliveryLink(session, profile);
}