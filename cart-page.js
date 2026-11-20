// cart-page.js - makes cart.html show the student's real cart:
// products with live prices, plus tablet and Xerox requests.

import { getSession } from '../auth.js';
import { getAllShops } from '../stores.js';
import { getProductsByIds } from '../products.js';
import {
  getCartItems,
  getRequest,
  setItemQuantity,
  removeItem,
  removeRequest,
  describeRequest,
  onCartChange,
  MAX_ITEM_QUANTITY
} from '../cart.js';
import { formatCurrency, toNumber, showWarning, tryCatch } from '../utils.js';

const REQUEST_KINDS = ['tablet', 'xerox'];

// Small icons shown in front of each store name.
const SHOP_ICONS = new Map([
  ['canteen', '🍽️'],
  ['green-dabba-1', '🥗'],
  ['green-dabba-2', '🥗'],
  ['green-dabba-3', '🥗'],
  ['store', '🛒'],
  ['xerox', '🖨️'],
  ['medicine', '🩺']
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

// Small helper: makes a button.
function createButton(className, text, action, label) {
  const button = createElement('button', className, text);
  button.type = 'button';
  button.dataset.action = action;
  button.setAttribute('aria-label', label);
  return button;
}

// Find the parts of the page we need.
const main = document.querySelector('.cart-main');
const itemsSection = document.querySelector('.cart-items');
const layout = document.querySelector('.cart-layout');
const multiStoreNotice = document.querySelector('.multi-store-notice');
const itemCountElement = document.getElementById('cart-item-count');
const subtotalElement = document.getElementById('cart-subtotal');
const deliveryFeeElement = document.getElementById('cart-delivery-fee');
const totalElement = document.getElementById('cart-total');
const checkoutLink = document.getElementById('checkout-link');
const summaryNote = document.querySelector('.summary-note');

// Keep a copy of your "empty cart" design, then remove all the sample designs.
const emptyCartBox = document.querySelector('.empty-cart')
  ? document.querySelector('.empty-cart').cloneNode(true)
  : createElement('p', 'no-results', 'Your cart is empty.');
document.querySelectorAll('.design-section').forEach((section) => section.remove());

const defaultNote = summaryNote ? summaryNote.textContent : '';

// Builds one row for one product in the cart.
function createCartRow(item, product, shopName) {
  const name = product ? product.name : item.name;
  const price = product ? toNumber(product.price) : item.price;
  const emoji = product && product.emoji ? product.emoji : item.emoji;
  const imageUrl = product ? product.image_url : null;
  const isAvailable = product ? product.is_available : true;

  const row = createElement('div', 'cart-item');
  row.dataset.productId = item.productId;
  row.dataset.price = String(price);

  const imageBox = createElement('div', 'item-image');
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = name;
    imageBox.append(image);
  } else {
    const emojiElement = createElement('span', '', emoji);
    emojiElement.setAttribute('role', 'img');
    emojiElement.setAttribute('aria-label', name);
    imageBox.append(emojiElement);
  }

  const info = createElement('div', 'item-info');
  info.append(
    createElement('h3', 'item-name', name),
    createElement('span', 'item-store', shopName),
    createElement(
      'p',
      'item-price',
      isAvailable ? (price === 0 ? 'Free' : `${formatCurrency(price)} each`) : 'Out of Stock: please remove'
    )
  );

  const selector = createElement('div', 'quantity-selector');
  selector.append(
    createButton('qty-button', '−', 'decrease-quantity', 'Decrease quantity'),
    createElement('span', 'qty-value', String(item.quantity)),
    createButton('qty-button', '+', 'increase-quantity', 'Increase quantity')
  );

  const subtotal = createElement(
    'p',
    'item-subtotal',
    price === 0 ? 'Free' : formatCurrency(price * item.quantity)
  );
  const removeButton = createButton('remove-button', '🗑️', 'remove-item', `Remove ${name} from cart`);

  row.append(imageBox, info, selector, subtotal, removeButton);
  return row;
}

// Builds one row for a request (tablet request or Xerox file).
function createRequestRow(kind, request, shopName) {
  const description = describeRequest(kind, request);

  const row = createElement('div', 'cart-item');
  row.dataset.kind = kind;

  const imageBox = createElement('div', 'item-image');
  const emojiElement = createElement('span', '', description.emoji);
  emojiElement.setAttribute('role', 'img');
  emojiElement.setAttribute('aria-label', description.title);
  imageBox.append(emojiElement);

  const info = createElement('div', 'item-info');
  info.append(
    createElement('h3', 'item-name', description.title),
    createElement('span', 'item-store', shopName),
    createElement('p', 'item-price', description.detail)
  );

  const selector = createElement('div', 'quantity-selector');
  selector.append(createElement('span', 'qty-value', '1'));

  const price = createElement('p', 'item-subtotal', description.priceText);
  const removeButton = createButton(
    'remove-button',
    '🗑️',
    'remove-request',
    `Remove ${description.title} from cart`
  );

  row.append(imageBox, info, selector, price, removeButton);
  return row;
}

// Turns the Proceed to Checkout button on or off.
function setCheckoutLink(shopSlug) {
  if (!checkoutLink) {
    return;
  }
  if (shopSlug) {
    checkoutLink.href = `checkout.html?shop=${encodeURIComponent(shopSlug)}`;
    checkoutLink.classList.remove('is-disabled');
    checkoutLink.removeAttribute('aria-disabled');
  } else {
    checkoutLink.href = '#';
    checkoutLink.classList.add('is-disabled');
    checkoutLink.setAttribute('aria-disabled', 'true');
  }
}

async function startCartPage() {
  // Not logged in? main.js is already sending the student to login.html.
  const session = await getSession();
  if (!session) {
    return;
  }

  // Latest product and shop details from the database (real prices!).
  const liveProducts = new Map();
  const liveShops = new Map();
  let refreshed = false;

  const savedItems = getCartItems();
  const hasRequests = REQUEST_KINDS.some((kind) => getRequest(kind));

  if (savedItems.length > 0 || hasRequests) {
    const { data } = await tryCatch(
      async () => {
        const [products, shops] = await Promise.all([
          getProductsByIds(savedItems.map((item) => item.productId)),
          getAllShops()
        ]);
        return { products, shops };
      },
      { context: 'Refreshing cart' }
    );

    if (data) {
      data.products.forEach((product) => liveProducts.set(product.id, product));
      data.shops.forEach((shop) => liveShops.set(shop.id, shop));
      refreshed = true;

      // Remove products that no longer exist.
      for (const item of savedItems) {
        if (!liveProducts.has(item.productId)) {
          removeItem(item.productId);
          showWarning(`${item.name} is no longer available and was removed from your cart.`);
        }
      }
    }
  }

  // Draws the whole cart from what is saved.
  function render() {
    const items = getCartItems();
    const requests = REQUEST_KINDS.map((kind) => ({ kind, request: getRequest(kind) })).filter(
      (entry) => entry.request
    );

    if (items.length === 0 && requests.length === 0) {
      layout.hidden = true;
      if (multiStoreNotice) {
        multiStoreNotice.hidden = true;
      }
      if (!emptyCartBox.isConnected) {
        main.append(emptyCartBox);
      }
      return;
    }

    layout.hidden = false;
    emptyCartBox.remove();

    // Group everything by store.
    const groups = new Map();
    function getGroup(shopId, fallbackSlug, fallbackName) {
      if (!groups.has(shopId)) {
        const shop = liveShops.get(shopId);
        groups.set(shopId, {
          shopId,
          slug: shop ? shop.slug : fallbackSlug,
          name: shop ? shop.name : fallbackName,
          items: [],
          requests: []
        });
      }
      return groups.get(shopId);
    }
    items.forEach((item) => getGroup(item.shopId, item.shopSlug, item.shopName).items.push(item));
    requests.forEach((entry) =>
      getGroup(entry.request.shopId, entry.request.shopSlug, entry.request.shopName).requests.push(entry)
    );

    let itemCount = 0;
    let subtotal = 0;
    let hasUnavailable = false;
    let pricePending = false;
    const groupElements = [];

    for (const group of groups.values()) {
      const groupCount =
        group.items.reduce((total, item) => total + item.quantity, 0) + group.requests.length;

      const article = createElement('article', 'store-group');
      article.dataset.shopId = group.slug;

      const header = createElement('header', 'group-header');
      header.append(
        createElement('h2', 'group-title', `${SHOP_ICONS.get(group.slug) || '🏪'} ${group.name}`),
        createElement('span', 'group-count', `${groupCount} ${groupCount === 1 ? 'item' : 'items'}`)
      );
      article.append(header);

      for (const item of group.items) {
        const product = liveProducts.get(item.productId);
        const price = product ? toNumber(product.price) : item.price;
        if (product && !product.is_available) {
          hasUnavailable = true;
        }
        itemCount += item.quantity;
        subtotal += price * item.quantity;
        article.append(createCartRow(item, product, group.name));
      }

      for (const entry of group.requests) {
        itemCount += 1;
        if (entry.kind === 'xerox') {
          pricePending = true;
        }
        article.append(createRequestRow(entry.kind, entry.request, group.name));
      }

      groupElements.push(article);
    }

    itemsSection.replaceChildren(...groupElements);

    // Summary box.
    subtotal = Math.round(subtotal * 100) / 100;
    const singleGroup = groups.size === 1 ? Array.from(groups.values())[0] : null;
    const shopRecord = singleGroup ? liveShops.get(singleGroup.shopId) : null;
    const shopClosed = shopRecord ? !shopRecord.is_open : false;

    itemCountElement.textContent = String(itemCount);
    subtotalElement.textContent = pricePending ? 'To be confirmed' : formatCurrency(subtotal);
    if (shopRecord) {
      const fee = toNumber(shopRecord.delivery_fee);
      deliveryFeeElement.textContent = formatCurrency(fee);
      totalElement.textContent = pricePending ? 'To be confirmed' : formatCurrency(subtotal + fee);
    } else {
      deliveryFeeElement.textContent = '—';
      totalElement.textContent = '—';
    }

    if (multiStoreNotice) {
      multiStoreNotice.hidden = groups.size <= 1;
    }

    // Checkout is allowed only for ONE open store with no sold-out items.
    const canCheckout = Boolean(shopRecord) && refreshed && !hasUnavailable && !shopClosed;
    setCheckoutLink(canCheckout ? shopRecord.slug : null);

    if (summaryNote) {
      if (groups.size > 1) {
        summaryNote.textContent = defaultNote;
      } else if (hasUnavailable) {
        summaryNote.textContent = 'Remove out-of-stock items to continue.';
      } else if (shopClosed) {
        summaryNote.textContent = `${shopRecord.name} is closed right now.`;
      } else if (!refreshed) {
        summaryNote.textContent = 'Could not refresh prices. Please reload the page.';
      } else {
        summaryNote.textContent = defaultNote;
      }
    }
  }

  // One listener handles the + / - buttons and the bin buttons on every row.
  itemsSection.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    const row = button ? button.closest('.cart-item') : null;
    if (!button || !row) {
      return;
    }

    if (button.dataset.action === 'remove-request') {
      removeRequest(row.dataset.kind);
      return;
    }

    const productId = row.dataset.productId;
    const current = toNumber(row.querySelector('.qty-value').textContent, 1);

    if (button.dataset.action === 'increase-quantity') {
      setItemQuantity(productId, Math.min(MAX_ITEM_QUANTITY, current + 1));
    } else if (button.dataset.action === 'decrease-quantity') {
      setItemQuantity(productId, Math.max(1, current - 1));
    } else if (button.dataset.action === 'remove-item') {
      removeItem(productId);
    }
  });

  // A greyed-out checkout button should do nothing when clicked.
  if (checkoutLink) {
    checkoutLink.addEventListener('click', (event) => {
      if (checkoutLink.classList.contains('is-disabled')) {
        event.preventDefault();
      }
    });
  }

  // Draw now, and again after every cart change.
  onCartChange(render);
  render();
}

await startCartPage();