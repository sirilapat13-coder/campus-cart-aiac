// checkout.js - makes checkout.html work.
// 1. Reads which store to check out from the address (checkout.html?shop=canteen).
// 2. Shows that store's cart items (and tablet / Xerox request) with real prices.
// 3. Fills in the student's details.
// 4. Places the order through a secure database function.

import { getSession, getMyProfile } from '../auth.js';
import { getShopBySlug } from '../stores.js';
import { getProductsByIds } from '../products.js';
import { getCartItems, getRequest, removeShopItems, describeRequest } from '../cart.js';
import { placeOrder, placeXeroxOrder, getOrderSummary } from '../orders.js';
import {
  formatCurrency,
  getQueryParam,
  showError,
  toNumber,
  tryCatch,
  validateIndianMobile,
  validateRequired
} from '../utils.js';

// The checkout form says "cod"; the database says "cash_on_delivery".
const PAYMENT_METHODS = new Map([['cod', 'cash_on_delivery']]);

// Find the parts of the page we need.
const form = document.getElementById('checkout-form');
const fullNameInput = document.getElementById('full-name');
const rollNumberInput = document.getElementById('roll-number');
const phoneInput = document.getElementById('phone');
const locationSelect = document.getElementById('delivery-location');
const roomInput = document.getElementById('room-or-landmark');
const instructionsInput = document.getElementById('delivery-instructions');
const placeOrderButton = document.getElementById('place-order-button');
const placeOrderNote = document.querySelector('.place-order .note');
const itemsList = document.getElementById('order-items-list');
const storeNameElement = document.querySelector('#order-summary .store-name');
const subtotalElement = document.getElementById('summary-subtotal');
const deliveryFeeElement = document.getElementById('summary-delivery-fee');
const totalElement = document.getElementById('summary-total');

// Remove the sample designs at the bottom of the page.
const samples = document.querySelector('.samples');
if (samples) {
  samples.remove();
}

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

// Switches the Place Order button off and shows why.
function blockCheckout(message) {
  placeOrderButton.disabled = true;
  if (placeOrderNote) {
    placeOrderNote.textContent = message;
  }
}

// Draws the list of lines and the price summary.
// Each line is { emoji, name, meta, priceText }.
function showOrderSummary(shop, lines, totals) {
  storeNameElement.textContent = `From: ${shop.name}`;

  const rows = lines.map((line) => {
    const row = createElement('li', 'item');
    const info = createElement('div', 'item-info');
    info.append(
      createElement('p', 'item-name', line.name),
      createElement('p', 'item-meta', line.meta)
    );
    row.append(
      createElement('div', 'item-image', line.emoji),
      info,
      createElement('p', 'item-price', line.priceText)
    );
    return row;
  });
  itemsList.replaceChildren(...rows);

  subtotalElement.textContent = totals.subtotalText;
  deliveryFeeElement.textContent = totals.deliveryFeeText;
  totalElement.textContent = totals.totalText;
}

// Replaces the form with an "Order placed" message.
function showConfirmation(orderId, order, kind) {
  form.hidden = true;

  const box = createElement('section', 'card');
  box.setAttribute('role', 'status');
  box.append(
    createElement('h2', 'card-title', 'Order placed! 🎉'),
    createElement('p', '', `Order number: #${orderId.slice(0, 8).toUpperCase()}`)
  );

  if (kind === 'xerox') {
    box.append(
      createElement('p', '', 'The Xerox shop will check your file and confirm the price.'),
      createElement('p', '', 'You will pay in cash on delivery.')
    );
  } else if (kind === 'tablet') {
    box.append(
      createElement('p', '', 'Infirmary staff will review your tablet request before it is delivered.')
    );
  } else {
    box.append(createElement('p', '', 'Your order is now waiting for a delivery partner.'));
  }

  if (order && kind !== 'xerox') {
    const total = toNumber(order.total_amount);
    box.append(
      createElement(
        'p',
        '',
        total === 0
          ? 'Nothing to pay for this order.'
          : `Please pay ${formatCurrency(total)} in cash to the delivery partner.`
      )
    );
  }

    const buttons = [
    ['View My Orders', 'my-orders.html'],
    ['Back to Stores', 'homepage.html']
  ];
  for (const [text, address] of buttons) {
    const link = createElement('a', 'btn-primary', text);
    link.href = address;
    link.style.display = 'block';
    link.style.textAlign = 'center';
    link.style.textDecoration = 'none';
    link.style.marginTop = '12px';
    box.append(link);
  }

  form.after(box);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function startCheckout() {
  // Not logged in? main.js is already sending the student to login.html.
  const session = await getSession();
  if (!session) {
    return;
  }

  // Which store? It comes from the address: checkout.html?shop=canteen
  const shopSlug = getQueryParam('shop', { pattern: /^[a-z0-9-]+$/ });
  if (!shopSlug) {
    window.location.replace('cart.html');
    return;
  }

  // Load the store, the cart items for that store, their live prices,
  // and the student's profile.
  const { data, error } = await tryCatch(
    async () => {
      const shop = await getShopBySlug(shopSlug);
      if (!shop) {
        throw new Error('This store is not available right now.');
      }
      const cartItems = getCartItems().filter((item) => item.shopId === shop.id);
      const products = await getProductsByIds(cartItems.map((item) => item.productId));
      const profile = await getMyProfile();
      return { shop, cartItems, products, profile };
    },
    { context: 'Loading checkout' }
  );

  if (error) {
    blockCheckout('Could not load checkout. Please go back to your cart and try again.');
    return;
  }

  const { shop, cartItems, products, profile } = data;

  // Is there a tablet request (Medicine) or a Xerox request for THIS store?
  const savedTablet = getRequest('tablet');
  const savedXerox = getRequest('xerox');
  const tabletRequest =
    shop.category === 'medicine' && savedTablet && savedTablet.shopId === shop.id ? savedTablet : null;
  const xeroxRequest =
    shop.category === 'xerox' && savedXerox && savedXerox.shopId === shop.id ? savedXerox : null;

  // Nothing to check out? Go back to the cart.
  const nothingToOrder =
    shop.category === 'xerox' ? !xeroxRequest : cartItems.length === 0 && !tabletRequest;
  if (nothingToOrder) {
    window.location.replace('cart.html');
    return;
  }

  // Fill in the student's details. Name and student ID come from the account.
  fullNameInput.value = profile ? profile.full_name : '';
  rollNumberInput.value = profile && profile.student_id ? profile.student_id : '';
  phoneInput.value = profile && profile.phone ? profile.phone : '';
  fullNameInput.readOnly = true;
  rollNumberInput.readOnly = true;
  form.noValidate = true;

  // Combine each product with its latest details from the database.
  const productsById = new Map(products.map((product) => [product.id, product]));
  const orderItems = [];
  const lines = [];
  let hasProblem = false;
  let subtotal = 0;

  for (const item of cartItems) {
    const product = productsById.get(item.productId);
    if (!product || !product.is_available) {
      hasProblem = true;
    }
    const name = product ? product.name : item.name;
    const price = product ? toNumber(product.price) : item.price;
    const emoji = product && product.emoji ? product.emoji : item.emoji;

    orderItems.push({ productId: item.productId, quantity: item.quantity });
    subtotal += price * item.quantity;
    lines.push({
      emoji,
      name,
      meta: `${shop.name} • Qty: ${item.quantity} • ${price === 0 ? 'Free' : `${formatCurrency(price)} each`}`,
      priceText: price === 0 ? 'Free' : formatCurrency(price * item.quantity)
    });
  }

  // Add the tablet or Xerox request as a line too.
  for (const [kind, request] of [
    ['tablet', tabletRequest],
    ['xerox', xeroxRequest]
  ]) {
    if (request) {
      const description = describeRequest(kind, request);
      lines.push({
        emoji: description.emoji,
        name: description.title,
        meta: `${shop.name} • ${description.detail}`,
        priceText: description.priceText
      });
    }
  }

  const deliveryFee = toNumber(shop.delivery_fee);
  const totals = xeroxRequest
    ? {
        subtotalText: 'To be confirmed',
        deliveryFeeText: formatCurrency(deliveryFee),
        totalText: 'To be confirmed'
      }
    : {
        subtotalText: formatCurrency(subtotal),
        deliveryFeeText: formatCurrency(deliveryFee),
        totalText: formatCurrency(subtotal + deliveryFee)
      };
  showOrderSummary(shop, lines, totals);

  // Helpful notes under the button.
  if (placeOrderNote && xeroxRequest) {
    placeOrderNote.textContent = 'Final price will be confirmed after the Xerox shop checks your file.';
  } else if (placeOrderNote && tabletRequest) {
    placeOrderNote.textContent = 'Tablet requests need infirmary staff approval before delivery.';
  }

  // Stop here if this order cannot be placed.
  if (!shop.is_open) {
    blockCheckout(`${shop.name} is closed right now.`);
    showError(`${shop.name} is closed right now.`);
    return;
  }
  if (hasProblem) {
    blockCheckout('Some items are no longer available. Please go back to your cart.');
    showError('Some items in your cart are no longer available.');
    return;
  }

  let isPlacing = false;

  // Runs when the student clicks "Place Order".
  async function handlePlaceOrder() {
    if (isPlacing) {
      return;
    }

    // Check the form.
    const locationResult = validateRequired(locationSelect.value, 'Delivery location');
    if (!locationResult.valid) {
      showError('Please select a delivery location.');
      locationSelect.focus();
      return;
    }
    const phoneResult = validateIndianMobile(phoneInput.value, 'Mobile number');
    if (!phoneResult.valid) {
      showError(phoneResult.message);
      phoneInput.focus();
      return;
    }

    const selectedOption = locationSelect.options[locationSelect.selectedIndex];
    const selectedPayment = form.querySelector('input[name="payment_method"]:checked');
    const paymentMethod =
      PAYMENT_METHODS.get(selectedPayment ? selectedPayment.value : 'cod') || 'cash_on_delivery';

    // The details every kind of order needs.
    const common = {
      deliveryLocation: selectedOption.textContent.trim(),
      roomNumber: roomInput.value.trim().slice(0, 100),
      deliveryInstructions: instructionsInput.value.trim().slice(0, 300),
      customerPhone: phoneResult.value,
      paymentMethod
    };

    // Block double clicks while we wait for the database.
    isPlacing = true;
    placeOrderButton.disabled = true;
    placeOrderButton.textContent = 'Placing order...';

    const { data: orderId, error: orderError } = await tryCatch(
      () =>
        xeroxRequest
          ? placeXeroxOrder({ ...common, request: xeroxRequest })
          : placeOrder({
              ...common,
              shopId: shop.id,
              items: orderItems,
              tabletRequest: tabletRequest ? tabletRequest.text : null
            }),
      { context: 'Placing order' }
    );

    if (orderError) {
      isPlacing = false;
      placeOrderButton.disabled = false;
      placeOrderButton.textContent = 'Place Order';
      return;
    }

    // The order exists. Remove this store's items and requests from the cart.
    removeShopItems(shop.id);

    // Show the total the DATABASE calculated.
    const { data: order } = await tryCatch(() => getOrderSummary(orderId), {
      context: 'Loading order',
      notify: false
    });
    const kind = xeroxRequest ? 'xerox' : tabletRequest ? 'tablet' : 'order';
    showConfirmation(orderId, order, kind);
  }

  placeOrderButton.addEventListener('click', handlePlaceOrder);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handlePlaceOrder();
  });
}

await startCheckout();