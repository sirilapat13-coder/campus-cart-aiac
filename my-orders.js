// my-orders.js - makes my-orders.html work.
// Shows the student's orders with a progress timeline and updates live.

import { getSession } from '../auth.js';
import { getMyOrders, cancelOrder, subscribeToMyOrders } from '../orders.js';
import { formatCurrency, formatDateTime, showSuccess, toNumber, toText, tryCatch } from '../utils.js';

// The steps an order goes through, in order.
const STEPS = [
  ['placed', 'Order placed'],
  ['accepted', 'Accepted by a delivery partner'],
  ['picked_up', 'Picked up'],
  ['out_for_delivery', 'Out for delivery'],
  ['delivered', 'Delivered']
];

// Short names shown in the status badge.
const STATUS_LABELS = new Map([
  ['placed', 'Placed'],
  ['accepted', 'Accepted'],
  ['picked_up', 'Picked up'],
  ['out_for_delivery', 'Out for delivery'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled']
]);

const FINISHED_STATUSES = ['delivered', 'cancelled'];

const PRINT_TYPE_LABELS = new Map([
  ['black_white', 'Black & White'],
  ['colour', 'Colour']
]);
const PRINT_SIDES_LABELS = new Map([
  ['single', 'Single-sided'],
  ['double', 'Double-sided']
]);
const APPROVAL_LABELS = new Map([
  ['pending', 'Waiting for infirmary approval'],
  ['approved', 'Approved by infirmary staff'],
  ['rejected', 'Not approved by infirmary staff'],
  ['not_required', '']
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

// The database may send a single record or a list of one. Make it one record.
function firstRecord(value) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return value || null;
}

// A sentence that says what is happening with the order right now.
function getStatusMessage(order, infirmary) {
  if (order.status === 'cancelled') {
    return `Cancelled: ${toText(order.cancellation_reason, 'no reason given')}`;
  }
  if (order.status === 'delivered') {
    return 'Delivered. Enjoy!';
  }
  if (order.status === 'out_for_delivery') {
    return 'Your order is on its way to you.';
  }
  if (order.status === 'picked_up') {
    return 'Your order has been picked up and will be on its way soon.';
  }
  if (order.status === 'accepted') {
    return 'A delivery partner accepted your order and is collecting it.';
  }
  if (order.order_type === 'xerox' && order.pricing_status === 'pending_confirmation') {
    return 'Waiting for the Xerox shop to confirm the price.';
  }
  if (order.order_type === 'medicine' && infirmary && infirmary.approval_status === 'pending') {
    return 'Waiting for infirmary staff to review your tablet request.';
  }
  return 'Waiting for a delivery partner to accept your order.';
}

// The progress steps, with the time each one happened.
function createTimeline(order) {
  const times = new Map();
  for (const row of order.order_status_history || []) {
    times.set(row.status, row.created_at);
  }

  const currentIndex = STEPS.findIndex(([status]) => status === order.status);
  const isDelivered = order.status === 'delivered';
  const list = createElement('ol', 'timeline');

  STEPS.forEach(([status, label], index) => {
    let className = '';
    if (index < currentIndex || (isDelivered && index === currentIndex)) {
      className = 'is-done';
    } else if (index === currentIndex) {
      className = 'is-current';
    }

    const item = createElement('li', className);
    item.append(createElement('span', '', label));
    if (times.has(status)) {
      item.append(createElement('span', 'timeline-time', formatDateTime(times.get(status))));
    }
    list.append(item);
  });
  return list;
}

// Builds the "what you ordered" part of a card.
function createDetails(order, xerox, infirmary) {
  const fragment = document.createDocumentFragment();
  const lines = createElement('ul', 'order-lines');

  // Normal items (food, store, supplies).
  for (const item of order.order_items || []) {
    const price = toNumber(item.line_total);
    const line = createElement('li');
    line.append(
      createElement('span', '', `${item.quantity} × ${item.item_name}`),
      createElement('span', '', price === 0 ? 'Free' : formatCurrency(price))
    );
    lines.append(line);
  }

  // Xerox details.
  if (xerox) {
    const copies = toNumber(xerox.copies, 1);
    const options = [
      PRINT_TYPE_LABELS.get(xerox.print_type) || xerox.print_type,
      PRINT_SIDES_LABELS.get(xerox.print_sides) || xerox.print_sides,
      xerox.paper_size,
      `${copies} ${copies === 1 ? 'copy' : 'copies'}`
    ].join(' • ');

    const fileLine = createElement('li');
    fileLine.append(
      createElement('span', '', `📄 ${toText(xerox.original_file_name, 'Document')}`),
      createElement(
        'span',
        '',
        order.pricing_status === 'pending_confirmation'
          ? 'To be confirmed'
          : formatCurrency(xerox.final_amount)
      )
    );
    lines.append(fileLine);
    fragment.append(lines, createElement('p', 'order-note', options));
    return fragment;
  }

  fragment.append(lines);

  // Tablet request details.
  if (infirmary && infirmary.tablet_request) {
    const approval = APPROVAL_LABELS.get(infirmary.approval_status) || '';
    fragment.append(
      createElement('p', 'order-section-title', 'Tablet request'),
      createElement('p', 'order-note', infirmary.tablet_request)
    );
    if (approval) {
      fragment.append(createElement('p', 'order-note', `Status: ${approval}`));
    }
    if (infirmary.staff_notes) {
      fragment.append(createElement('p', 'order-note', `Staff note: ${infirmary.staff_notes}`));
    }
  }
  return fragment;
}

// What the student still has to pay.
function getPaymentText(order) {
  if (order.status === 'cancelled') {
    return '';
  }
  if (order.payment_status === 'paid') {
    return 'Paid in cash';
  }
  if (order.payment_status === 'not_required') {
    return 'Nothing to pay';
  }
  if (order.order_type === 'xerox' && order.pricing_status === 'pending_confirmation') {
    return 'Pay in cash on delivery (price to be confirmed)';
  }
  return `Pay ${formatCurrency(order.total_amount)} in cash on delivery`;
}

// Builds one order card.
function createOrderCard(order) {
  const shop = firstRecord(order.shops);
  const xerox = firstRecord(order.xerox_requests);
  const infirmary = firstRecord(order.infirmary_requests);

  const card = createElement('article', 'order-card');
  card.dataset.orderId = order.id;

  // Top row: shop, order number, time, and the status badge.
  const head = createElement('div', 'order-head');
  const titleBox = createElement('div');
  titleBox.append(
    createElement('h2', 'order-shop', shop ? shop.name : 'Store'),
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

  // What is happening right now.
  card.append(
    createElement(
      'p',
      order.status === 'cancelled' ? 'order-message is-cancelled' : 'order-message',
      getStatusMessage(order, infirmary)
    )
  );

  // The timeline (not shown for cancelled orders).
  if (order.status !== 'cancelled') {
    card.append(createTimeline(order));
  }

  // What was ordered.
  card.append(createElement('p', 'order-section-title', 'Your order'));
  card.append(createDetails(order, xerox, infirmary));

  // Where it goes.
  const place = [order.delivery_location, order.room_number].filter(Boolean).join(', ');
  card.append(createElement('p', 'order-section-title', 'Delivery to'));
  card.append(createElement('p', 'order-note', place));

  // Total, payment, and the cancel button.
  const footer = createElement('div', 'order-footer');
  const totals = createElement('div');
  const totalText =
    order.order_type === 'xerox' && order.pricing_status === 'pending_confirmation'
      ? 'To be confirmed'
      : formatCurrency(order.total_amount);
  totals.append(createElement('p', 'order-total', `Total: ${totalText}`));
  const paymentText = getPaymentText(order);
  if (paymentText) {
    totals.append(createElement('p', 'order-payment', paymentText));
  }
  footer.append(totals);

  if (order.status === 'placed') {
    const cancelButton = createElement('button', 'order-cancel', 'Cancel order');
    cancelButton.type = 'button';
    cancelButton.dataset.action = 'cancel-order';
    footer.append(cancelButton);
  }
  card.append(footer);

  return card;
}

async function startOrdersPage() {
  // Not logged in? main.js is already sending the student to login.html.
  const session = await getSession();
  if (!session) {
    return;
  }
  const userId = session.user.id;

  const list = document.getElementById('orders-list');
  const refreshButton = document.getElementById('orders-refresh');
  const tabs = Array.from(document.querySelectorAll('.orders-tab'));

  let orders = [];
  let currentTab = 'active';
  let hasLoaded = false;

  // Draws the orders that belong to the chosen tab.
  function render() {
    const isFinished = (order) => FINISHED_STATUSES.includes(order.status);
    const activeOrders = orders.filter((order) => !isFinished(order));
    const pastOrders = orders.filter(isFinished);

    // Show the counts on the tabs.
    tabs.forEach((tab) => {
      const isActiveTab = tab.dataset.tab === 'active';
      tab.textContent = `${isActiveTab ? 'Active' : 'Past orders'} (${
        isActiveTab ? activeOrders.length : pastOrders.length
      })`;
      tab.classList.toggle('is-active', tab.dataset.tab === currentTab);
    });

    const shown = currentTab === 'active' ? activeOrders : pastOrders;
    if (shown.length === 0) {
      list.replaceChildren(
        createElement(
          'p',
          'orders-empty',
          currentTab === 'active' ? 'You have no active orders.' : 'No past orders yet.'
        )
      );
      return;
    }
    list.replaceChildren(...shown.map(createOrderCard));
  }

  // Gets the orders from the database and draws them.
  async function loadOrders() {
    const { data, error } = await tryCatch(() => getMyOrders(userId), {
      context: 'Loading orders',
      notify: !hasLoaded
    });
    if (error) {
      if (!hasLoaded) {
        list.replaceChildren(
          createElement('p', 'orders-empty', 'Could not load your orders. Press Refresh to try again.')
        );
      }
      return;
    }
    hasLoaded = true;
    orders = data;
    render();
  }

  // Several changes can arrive at once, so wait a moment before reloading.
  let reloadTimer = null;
  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(loadOrders, 300);
  }

  // The Active / Past tabs.
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.tab;
      render();
    });
  });

  refreshButton.addEventListener('click', loadOrders);

  // The Cancel button on a card.
  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action="cancel-order"]');
    if (!button) {
      return;
    }
    const card = button.closest('.order-card');
    if (!window.confirm('Cancel this order?')) {
      return;
    }

    button.disabled = true;
    const { error } = await tryCatch(
      () => cancelOrder(card.dataset.orderId, 'Cancelled by customer'),
      { context: 'Cancelling order' }
    );
    if (error) {
      button.disabled = false;
      return;
    }
    showSuccess('Your order was cancelled.');
    await loadOrders();
  });

  await loadOrders();

  // Live updates, plus a refresh when the student comes back to this tab.
  const stopListening = subscribeToMyOrders(userId, scheduleReload);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleReload();
    }
  });
  window.addEventListener('pagehide', stopListening);
}

await startOrdersPage();