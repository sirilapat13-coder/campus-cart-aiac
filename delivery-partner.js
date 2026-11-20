// delivery-partner.js - makes delivery-partner.html work (Delivery Mode).
//
// Who may use this page is decided by profile.delivery_status:
//   'approved'  -> full dashboard
//   'suspended' -> can only finish deliveries they already accepted
//   anything else -> sent to the application page
// This is for convenience only. The database refuses everything else.

import { getSession, getMyProfile } from '../auth.js';
import {
  getDeliveryOrders,
  setDeliveryAvailable,
  acceptOrder,
  updateDeliveryStatus,
  subscribeToDeliveryOrders
} from '../delivery.js';
import {
  formatCurrency,
  formatDateTime,
  formatIndianMobile,
  normalizeIndianMobile,
  showError,
  showSuccess,
  toText,
  tryCatch
} from '../utils.js';

const ACTIVE_STATUSES = ['accepted', 'picked_up', 'out_for_delivery'];
const FINISHED_STATUSES = ['delivered', 'cancelled'];

// How often the page checks for new orders by itself (milliseconds).
const AUTO_REFRESH_MS = 30000;

// Where "Switch to Customer Mode" goes.
const CUSTOMER_HOME = 'homepage.html';

// What the button says, and which status it moves the order to.
const NEXT_STEP = new Map([
  ['accepted', { status: 'picked_up', label: 'Mark picked up' }],
  ['picked_up', { status: 'out_for_delivery', label: 'Out for delivery' }],
  ['out_for_delivery', { status: 'delivered', label: 'Mark delivered' }]
]);

const STATUS_LABELS = new Map([
  ['placed', 'New'],
  ['accepted', 'Accepted'],
  ['picked_up', 'Picked up'],
  ['out_for_delivery', 'Out for delivery'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled']
]);

// Small helper: makes an element with a class and some text.
function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

// The database may send one record or a list of one. Make it one record.
function firstRecord(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

// How much cash the partner must collect.
function getCollectText(order) {
  if (order.payment_status === 'paid') {
    return 'Cash collected';
  }
  if (order.payment_status === 'not_required') {
    return 'Nothing to collect';
  }
  return `Collect ${formatCurrency(order.total_amount)} in cash`;
}

// Builds one order card.
// mode is 'available', 'active' or 'done'.
function createOrderCard(order, mode, isAvailable) {
  const shop = firstRecord(order.shops);

  const card = createElement('article', 'order-card');
  card.dataset.orderId = order.id;

  // Top row: shop, order number, time and status.
  const head = createElement('div', 'order-head');
  const titleBox = createElement('div');
  titleBox.append(
    createElement('h3', 'order-shop', shop ? shop.name : 'Store'),
    createElement(
      'p',
      'order-meta',
      `Order #${order.id.slice(0, 8).toUpperCase()} • ${formatDateTime(order.created_at)}`
    )
  );
  head.append(
    titleBox,
    createElement(
      'span',
      `status-pill status-${order.status}`,
      STATUS_LABELS.get(order.status) || order.status
    )
  );
  card.append(head);

  // Where to pick it up.
  card.append(createElement('p', 'order-section-title', 'Pick up from'));
  card.append(
    createElement(
      'p',
      'order-note',
      shop && shop.location ? `${shop.name} • ${shop.location}` : shop ? shop.name : 'Store'
    )
  );

  // What is in the order.
  card.append(createElement('p', 'order-section-title', 'Items'));
  const items = order.order_items || [];
  if (items.length > 0) {
    const lines = createElement('ul', 'order-lines');
    for (const item of items) {
      const line = createElement('li');
      line.append(createElement('span', '', `${item.quantity} × ${item.item_name}`));
      lines.append(line);
    }
    card.append(lines);
  } else if (order.order_type === 'xerox') {
    card.append(createElement('p', 'order-note', 'Printed documents, ready at the Xerox shop.'));
  } else {
    card.append(createElement('p', 'order-note', 'See the shop for the order details.'));
  }

  // Where to deliver it, and who to call.
  card.append(createElement('p', 'order-section-title', 'Deliver to'));
  const place = [order.delivery_location, order.room_number].filter(Boolean).join(', ');
  card.append(createElement('p', 'order-note', place));

  const contact = createElement('p', 'order-note');
  contact.append(document.createTextNode(`${toText(order.customer_name, 'Customer')}: `));
  const mobile = normalizeIndianMobile(order.customer_phone);
  if (mobile) {
    const link = createElement('a', 'contact-link', `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`);
    link.href = `tel:+91${mobile}`;
    contact.append(link);
  } else {
    contact.append(document.createTextNode(toText(order.customer_phone, 'No phone number')));
  }
  card.append(contact);

  if (order.delivery_instructions) {
    card.append(createElement('p', 'order-note', `Note: ${order.delivery_instructions}`));
  }

  // Cash to collect and the action button.
  const footer = createElement('div', 'order-footer');
  const totals = createElement('div');
  totals.append(createElement('p', 'order-total', getCollectText(order)));
  footer.append(totals);

  if (mode === 'available') {
    const button = createElement('button', 'order-action', 'Accept order');
    button.type = 'button';
    button.dataset.action = 'accept-order';
    button.disabled = !isAvailable;
    footer.append(button);
  } else if (mode === 'active') {
    const next = NEXT_STEP.get(order.status);
    if (next) {
      const button = createElement('button', 'order-action', next.label);
      button.type = 'button';
      button.dataset.action = 'advance-order';
      button.dataset.nextStatus = next.status;
      footer.append(button);
    }
  }
  card.append(footer);

  return card;
}

// Shows a message in a list when it is empty.
function emptyMessage(text) {
  return createElement('p', 'orders-empty', text);
}

async function startDeliveryPage() {
  // Not logged in? main.js is already sending the student to login.html.
  const session = await getSession();
  if (!session) {
    return;
  }
  const userId = session.user.id;

  const message = document.getElementById('partner-message');
  const banner = document.getElementById('partner-banner');
  const switchButton = document.getElementById('switch-customer-button');
  const availabilityCard = document.getElementById('availability-card');
  const availabilityText = document.getElementById('availability-text');
  const toggle = document.getElementById('availability-toggle');
  const content = document.getElementById('partner-content');
  const availableSection = document.getElementById('available-section');
  const availableList = document.getElementById('available-list');
  const activeList = document.getElementById('active-list');
  const doneList = document.getElementById('done-list');
  const availableHeading = document.getElementById('available-heading');
  const activeHeading = document.getElementById('active-heading');
  const refreshButton = document.getElementById('orders-refresh');

  // ---- 1. Who is this? Load the profile and check delivery access. ----
  const { data: profile } = await tryCatch(() => getMyProfile(), { context: 'Loading profile' });

  if (!profile) {
    message.textContent = 'We could not load your profile. Please refresh the page.';
    return;
  }

  let accessStatus = profile.delivery_status;

  if (accessStatus !== 'approved' && accessStatus !== 'suspended') {
    // Not a delivery partner: point to the application page instead of a dead end.
    message.replaceChildren(
      document.createTextNode('You are not a delivery partner yet. '),
      Object.assign(document.createElement('a'), {
        href: 'delivery-apply.html',
        textContent: 'Apply or check your application status.'
      })
    );
    return;
  }

  message.hidden = true;
  content.hidden = false;
  switchButton.hidden = false;

  let isAvailable = Boolean(profile.delivery_available);
  let orders = [];
  let hasLoaded = false;
  let isBusy = false;

  // ---- 2. Profile section ----
  document.getElementById('profile-name').textContent = toText(profile.full_name, 'Student');
  document.getElementById('profile-student-id').textContent = toText(profile.student_id, 'Not added');
  document.getElementById('profile-phone').textContent = profile.phone
    ? formatIndianMobile(profile.phone)
    : 'Not added';
  document.getElementById('profile-email').textContent = toText(session.user.email, '');
  const profileStatus = document.getElementById('profile-status');

  // ---- 3. Show or hide parts of the page depending on access ----
  function applyAccessView() {
    const approved = accessStatus === 'approved';
    availabilityCard.hidden = !approved;
    availableSection.hidden = !approved;
    banner.hidden = approved;
    profileStatus.textContent = approved ? 'Approved' : 'Suspended';
    if (!approved) {
      banner.textContent =
        'Your delivery access has been suspended by an admin, so you cannot accept new orders. ' +
        'You can still finish any deliveries listed below. Please contact the campus admin to ask why.';
    }
  }

  // Updates the switch and its explanation.
  function showAvailability() {
    toggle.checked = isAvailable;
    availabilityText.textContent = isAvailable
      ? 'You are available. New orders appear below.'
      : 'You are not available. Turn this on to accept orders.';
  }

  // Draws the three lists.
  function render() {
    const available = orders
      .filter((order) => order.status === 'placed' && !order.delivery_partner_id && order.customer_id !== userId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const active = orders.filter(
      (order) => order.delivery_partner_id === userId && ACTIVE_STATUSES.includes(order.status)
    );
    const done = orders
      .filter((order) => order.delivery_partner_id === userId && FINISHED_STATUSES.includes(order.status))
      .slice(0, 10);

    availableHeading.textContent = `Available orders (${available.length})`;
    activeHeading.textContent = `My active deliveries (${active.length})`;

    // Available orders (with a hint if the partner is not available).
    const availableCards = available.map((order) => createOrderCard(order, 'available', isAvailable));
    if (available.length > 0 && !isAvailable) {
      availableCards.unshift(
        createElement('p', 'partner-hint', 'Turn on "Available for deliveries" to accept orders.')
      );
    }
    availableList.replaceChildren(
      ...(availableCards.length > 0 ? availableCards : [emptyMessage('No orders are waiting right now.')])
    );

    activeList.replaceChildren(
      ...(active.length > 0
        ? active.map((order) => createOrderCard(order, 'active', isAvailable))
        : [emptyMessage('You have no active deliveries.')])
    );

    doneList.replaceChildren(
      ...(done.length > 0
        ? done.map((order) => createOrderCard(order, 'done', isAvailable))
        : [emptyMessage('Nothing completed yet.')])
    );
  }

  // Gets the orders from the database and draws them.
  async function loadOrders() {
    const { data, error } = await tryCatch(() => getDeliveryOrders(), {
      context: 'Loading deliveries',
      notify: !hasLoaded
    });
    if (error) {
      if (!hasLoaded) {
        availableList.replaceChildren(emptyMessage('Could not load orders. Press Refresh to try again.'));
      }
      return;
    }
    hasLoaded = true;
    orders = data;
    render();
  }

  // ---- 4. Re-check access (an admin may suspend or remove it while the page is open) ----
  async function recheckAccess() {
    let fresh;
    try {
      fresh = await getMyProfile();
    } catch (error) {
      return; // network hiccup: try again next time
    }
    if (!fresh) {
      return;
    }

    const status = fresh.delivery_status;
    if (status !== 'approved' && status !== 'suspended') {
      showError('Your delivery access has been removed.');
      setTimeout(() => window.location.replace(CUSTOMER_HOME), 1500);
      return;
    }

    const accessChanged = status !== accessStatus;
    const availabilityChanged = Boolean(fresh.delivery_available) !== isAvailable;
    accessStatus = status;
    isAvailable = Boolean(fresh.delivery_available);

    if (accessChanged) {
      if (status === 'suspended') {
        showError('Your delivery access has been suspended by an admin.');
      } else {
        showSuccess('Your delivery access has been restored.');
      }
    }
    if (accessChanged || availabilityChanged) {
      applyAccessView();
      showAvailability();
      render();
    }
  }

  // Several changes can arrive at once, so wait a moment before reloading.
  let reloadTimer = null;
  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(loadOrders, 300);
  }

  // ---- 5. Buttons and switches ----

  // The "Available for deliveries" switch.
  toggle.addEventListener('change', async () => {
    const wanted = toggle.checked;
    toggle.disabled = true;
    const { data: saved, error } = await tryCatch(() => setDeliveryAvailable(userId, wanted), {
      context: 'Changing availability'
    });
    toggle.disabled = false;
    if (!error) {
      isAvailable = saved;
    }
    showAvailability();
    render();
  });

  refreshButton.addEventListener('click', loadOrders);

  // "Switch to Customer Mode": go offline, then open the customer homepage.
  // Approval and delivery history are NOT touched, and nobody is logged out.
  switchButton.addEventListener('click', async () => {
    const activeCount = orders.filter(
      (order) => order.delivery_partner_id === userId && ACTIVE_STATUSES.includes(order.status)
    ).length;

    if (activeCount > 0) {
      const words = activeCount === 1 ? '1 active delivery' : `${activeCount} active deliveries`;
      const ok = window.confirm(
        `You still have ${words}. They stay assigned to you, and you can finish them from this page at any time. Switch to Customer Mode anyway?`
      );
      if (!ok) {
        return;
      }
    }

    switchButton.disabled = true;
    if (isAvailable) {
      await tryCatch(() => setDeliveryAvailable(userId, false), {
        context: 'Going offline',
        notify: false
      });
    }
    window.location.href = CUSTOMER_HOME;
  });

  // One listener handles Accept and the status buttons on every card.
  content.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || isBusy) {
      return;
    }
    const card = button.closest('.order-card');
    const orderId = card.dataset.orderId;
    const order = orders.find((entry) => entry.id === orderId);

    if (button.dataset.action === 'accept-order') {
      isBusy = true;
      button.disabled = true;
      const { error } = await tryCatch(() => acceptOrder(orderId), { context: 'Accepting order' });
      isBusy = false;
      if (error) {
        await recheckAccess(); // maybe access was just removed
      } else {
        showSuccess('Order accepted! Go and pick it up.');
      }
      await loadOrders();
      return;
    }

    if (button.dataset.action === 'advance-order') {
      const nextStatus = button.dataset.nextStatus;

      // Before marking delivered, remind the partner about the cash.
      if (nextStatus === 'delivered' && order && order.payment_status === 'pending') {
        const amount = formatCurrency(order.total_amount);
        if (!window.confirm(`Mark as delivered? Make sure you have collected ${amount} in cash.`)) {
          return;
        }
      }

      isBusy = true;
      button.disabled = true;
      const { error } = await tryCatch(() => updateDeliveryStatus(orderId, nextStatus), {
        context: 'Updating order'
      });
      isBusy = false;
      if (!error) {
        showSuccess(nextStatus === 'delivered' ? 'Delivered. Well done!' : 'Order updated.');
      }
      await loadOrders();
    }
  });

  // ---- 6. Start ----
  applyAccessView();
  showAvailability();
  await loadOrders();

  // Live updates, a refresh every 30 seconds, and a refresh when you come back
  // to this tab. (Some changes, like another partner taking an order, don't
  // arrive live, so the timer keeps the list correct.)
  const stopListening = subscribeToDeliveryOrders(scheduleReload);
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      loadOrders();
      recheckAccess();
    }
  }, AUTO_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleReload();
      recheckAccess();
    }
  });
  window.addEventListener('pagehide', () => {
    stopListening();
    clearInterval(timer);
  });
}

await startDeliveryPage();