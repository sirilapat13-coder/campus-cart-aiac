// cart.js - the shopping cart.
// It holds two kinds of things:
//   1. Products (food, store items, supplies), each with a quantity.
//   2. "Requests": a tablet request (Medicine) or a Xerox print request.
// Everything is saved in the browser (localStorage), so it survives page
// changes and refreshes. Prices saved here are for DISPLAY only:
// the database calculates the real prices when an order is placed.

import { isValidUuid, toNumber, toText } from './utils.js';

const ITEMS_STORAGE_KEY = 'campus-cart-items';
const REQUESTS_STORAGE_KEY = 'campus-cart-requests';
const CART_CHANGED_EVENT = 'campus-cart-changed';

// The kinds of requests the cart can hold (one of each at a time).
const REQUEST_KINDS = ['tablet', 'xerox'];

// The most of one item a student can order (matches the database rule).
export const MAX_ITEM_QUANTITY = 50;

// Friendly names for the Xerox options.
const PRINT_TYPE_LABELS = new Map([
  ['black_white', 'Black & White'],
  ['colour', 'Colour']
]);
const PRINT_SIDES_LABELS = new Map([
  ['single', 'Single-sided'],
  ['double', 'Double-sided']
]);

// Tells the rest of the page that the cart changed.
function notifyCartChanged() {
  window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
}

// ---------------------------------------------------------------------
// PRODUCTS IN THE CART
// ---------------------------------------------------------------------

// An item in the saved cart is only trusted if it has the right shape.
function isValidItem(item) {
  return (
    item !== null &&
    typeof item === 'object' &&
    isValidUuid(item.productId) &&
    isValidUuid(item.shopId) &&
    typeof item.shopSlug === 'string' &&
    Number.isInteger(item.quantity) &&
    item.quantity >= 1 &&
    item.quantity <= MAX_ITEM_QUANTITY
  );
}

// Reads the products from the browser. Returns [] if anything is wrong.
function readItems() {
  try {
    const raw = localStorage.getItem(ITEMS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isValidItem) : [];
  } catch {
    return [];
  }
}

// Saves the products and tells the page.
function saveItems(items) {
  try {
    localStorage.setItem(ITEMS_STORAGE_KEY, JSON.stringify(items));
  } catch {
    return false;
  }
  notifyCartChanged();
  return true;
}

// ---------------------------------------------------------------------
// REQUESTS IN THE CART (tablet request, Xerox request)
// ---------------------------------------------------------------------

// A request must at least say which shop it belongs to.
function isValidRequest(request) {
  return (
    request !== null &&
    typeof request === 'object' &&
    isValidUuid(request.shopId) &&
    typeof request.shopSlug === 'string' &&
    typeof request.shopName === 'string'
  );
}

// Reads the requests from the browser. Returns {} if anything is wrong.
function readRequests() {
  try {
    const raw = localStorage.getItem(REQUESTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const requests = {};
    for (const kind of REQUEST_KINDS) {
      if (parsed && isValidRequest(parsed[kind])) {
        requests[kind] = parsed[kind];
      }
    }
    return requests;
  } catch {
    return {};
  }
}

// Saves the requests and tells the page.
function saveRequests(requests) {
  try {
    localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(requests));
  } catch {
    return false;
  }
  notifyCartChanged();
  return true;
}

// Gets one request ('tablet' or 'xerox'), or null if there is none.
export function getRequest(kind) {
  return REQUEST_KINDS.includes(kind) ? readRequests()[kind] || null : null;
}

// Saves a request. A new one replaces the old one of the same kind.
export function setRequest(kind, request) {
  if (!REQUEST_KINDS.includes(kind) || !isValidRequest(request)) {
    throw new Error('This request cannot be saved.');
  }
  const requests = readRequests();
  requests[kind] = request;
  if (!saveRequests(requests)) {
    throw new Error('Could not save your cart. Please check that your browser allows storage.');
  }
}

// Removes one request.
export function removeRequest(kind) {
  const requests = readRequests();
  delete requests[kind];
  saveRequests(requests);
}

// Describes a request in words, for the cart and checkout pages.
export function describeRequest(kind, request) {
  if (kind === 'tablet') {
    const text = toText(request.text, '');
    return {
      emoji: '🩺',
      title: 'Tablet request',
      detail: text.length > 80 ? `${text.slice(0, 77)}...` : text,
      priceText: 'Free'
    };
  }

  const copies = toNumber(request.copies, 1);
  const detail = [
    PRINT_TYPE_LABELS.get(request.printType) || toText(request.printType),
    PRINT_SIDES_LABELS.get(request.printSides) || toText(request.printSides),
    toText(request.paperSize),
    `${copies} ${copies === 1 ? 'copy' : 'copies'}`
  ]
    .filter(Boolean)
    .join(' • ');

  return {
    emoji: '📄',
    title: toText(request.fileName, 'Document'),
    detail,
    priceText: 'To be confirmed'
  };
}

// ---------------------------------------------------------------------
// READING THE CART
// ---------------------------------------------------------------------

// Returns all products in the cart.
export function getCartItems() {
  return readItems();
}

// Total number of things in the cart (3 samosas + 1 tablet request = 4).
export function getCartItemCount() {
  const productCount = readItems().reduce((total, item) => total + item.quantity, 0);
  return productCount + Object.keys(readRequests()).length;
}

// Total price of all products (display only).
export function getCartSubtotal() {
  const total = readItems().reduce((sum, item) => sum + item.price * item.quantity, 0);
  return Math.round(total * 100) / 100;
}

// The different shops that have something in the cart.
export function getShopsInCart() {
  const shops = new Map();
  const addShop = (id, slug, name) => {
    if (!shops.has(id)) {
      shops.set(id, { id, slug, name });
    }
  };
  readItems().forEach((item) => addShop(item.shopId, item.shopSlug, item.shopName));
  Object.values(readRequests()).forEach((request) =>
    addShop(request.shopId, request.shopSlug, request.shopName)
  );
  return Array.from(shops.values());
}

// ---------------------------------------------------------------------
// CHANGING THE CART
// ---------------------------------------------------------------------

// Adds a product to the cart. If it is already there, the quantity goes up.
export function addToCart(shop, product, quantity = 1) {
  if (!shop || !product || !isValidUuid(shop.id) || !isValidUuid(product.id)) {
    throw new Error('This item cannot be added to the cart.');
  }
  const amount = Math.min(MAX_ITEM_QUANTITY, Math.max(1, Math.floor(toNumber(quantity, 1))));

  const items = readItems();
  const existing = items.find((item) => item.productId === product.id);

  if (existing) {
    existing.quantity = Math.min(MAX_ITEM_QUANTITY, existing.quantity + amount);
  } else {
    items.push({
      productId: product.id,
      shopId: shop.id,
      shopSlug: toText(shop.slug, ''),
      shopName: toText(shop.name, 'Store'),
      name: toText(product.name, 'Item'),
      price: toNumber(product.price),
      emoji: toText(product.emoji, '🍽️'),
      quantity: amount
    });
  }

  if (!saveItems(items)) {
    throw new Error('Could not save your cart. Please check that your browser allows storage.');
  }
}

// Sets the quantity of one product. A quantity below 1 removes it.
export function setItemQuantity(productId, quantity) {
  const items = readItems();
  const item = items.find((entry) => entry.productId === productId);
  if (!item) {
    return;
  }
  const amount = Math.floor(toNumber(quantity, 1));
  if (amount < 1) {
    removeItem(productId);
    return;
  }
  item.quantity = Math.min(MAX_ITEM_QUANTITY, amount);
  saveItems(items);
}

// Removes one product from the cart.
export function removeItem(productId) {
  saveItems(readItems().filter((item) => item.productId !== productId));
}

// Removes everything that belongs to ONE shop (used after that shop's
// order is placed): its products and its requests.
export function removeShopItems(shopId) {
  const requests = readRequests();
  for (const kind of REQUEST_KINDS) {
    if (requests[kind] && requests[kind].shopId === shopId) {
      delete requests[kind];
    }
  }
  saveRequests(requests);
  saveItems(readItems().filter((item) => item.shopId !== shopId));
}

// Empties the whole cart.
export function clearCart() {
  saveRequests({});
  saveItems([]);
}

// Runs your function whenever the cart changes (on this page or another tab).
// Returns a function that stops listening.
export function onCartChange(callback) {
  const handler = () => callback();
  window.addEventListener(CART_CHANGED_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CART_CHANGED_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}