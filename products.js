// products.js - gets products from Supabase and draws them on the page.

import { supabase } from './supabaseClient.js';
import { formatCurrency, toNumber, toText } from './utils.js';

// The most of one item a student can order at once (matches the database rule).
const MAX_QUANTITY = 50;

// Nicer titles for categories whose title is not just the capitalised name.
const CATEGORY_TITLES = new Map([['first-aid', 'First Aid Supplies']]);

// Gets all products of one shop, in the order set by sort_order.
export async function getProducts(shopId) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, description, category, price, image_url, emoji, is_available, sort_order')
    .eq('shop_id', shopId)
    .order('sort_order');
  if (error) throw error;
  return data;
}

// 'Ice Creams' -> 'ice-creams'. Used for section ids and the category tabs.
function categorySlug(category) {
  const slug = toText(category, 'other')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'other';
}

// 'ice-creams' -> 'Ice Creams'
function categoryTitle(slug) {
  if (CATEGORY_TITLES.has(slug)) {
    return CATEGORY_TITLES.get(slug);
  }
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Small helper: makes an element with a class and some text.
// textContent is used (never innerHTML) so product names can't inject HTML.
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

// Small helper: makes one button.
function createButton(className, text, action, ariaLabel, disabled) {
  const button = createElement('button', className, text);
  button.type = 'button';
  button.dataset.action = action;
  if (ariaLabel) {
    button.setAttribute('aria-label', ariaLabel);
  }
  button.disabled = disabled;
  return button;
}

// Builds ONE product card. It has the same structure as your old HTML cards,
// so your existing CSS styles it exactly the same way.
function createProductCard(product, shop) {
  const isFree = toNumber(product.price) === 0;
  const isRequestShop = shop.category === 'medicine';
  const canOrder = product.is_available && shop.is_open;

  const card = createElement('article', product.is_available ? 'food-card' : 'food-card out-of-stock');
  card.dataset.productId = product.id;
  card.dataset.category = categorySlug(product.category);
  card.dataset.price = String(toNumber(product.price));

  // The picture: a real image if image_url is set, otherwise the emoji.
  const imageBox = createElement('div', 'food-image');
  if (product.image_url) {
    const image = document.createElement('img');
    image.src = product.image_url;
    image.alt = product.name;
    imageBox.append(image);
  } else {
    const emoji = createElement('span', '', toText(product.emoji, '🍽️'));
    emoji.setAttribute('role', 'img');
    emoji.setAttribute('aria-label', product.name);
    imageBox.append(emoji);
  }

  const body = createElement('div', 'food-body');
  const name = createElement('h3', 'food-name', product.name);

  // Price (or "Free") and the Available / Out of Stock label.
  const priceRow = createElement('div', 'food-price-row');
  const price = isFree
    ? createElement('span', 'free-label', 'Free')
    : createElement('p', 'food-price', formatCurrency(product.price));
  const availability = createElement(
    'span',
    product.is_available ? 'availability available' : 'availability unavailable',
    product.is_available ? 'Available' : 'Out of Stock'
  );
  priceRow.append(price, availability);

  // Quantity buttons and the Add button.
  const actions = createElement('div', 'food-actions');
  const selector = createElement('div', 'quantity-selector');
  selector.append(
    createButton('qty-button', '−', 'decrease-quantity', 'Decrease quantity', !canOrder),
    createElement('span', 'qty-value', '1'),
    createButton('qty-button', '+', 'increase-quantity', 'Increase quantity', !canOrder)
  );
  const addButton = createButton(
    'add-button',
    isRequestShop ? 'Add to Request' : 'Add to Cart',
    'add-to-cart',
    null,
    !canOrder
  );
  actions.append(selector, addButton);

  body.append(name, priceRow, actions);
  card.append(imageBox, body);
  return card;
}

// Turns the list of products into category sections (Breakfast, Lunch, ...).
// Returns the sections, plus the list of categories for the tabs.
export function buildProductSections(products, shop) {
  // Group products by category, keeping the order from sort_order.
  const groups = new Map();
  for (const product of products) {
    const slug = categorySlug(product.category);
    if (!groups.has(slug)) {
      groups.set(slug, []);
    }
    groups.get(slug).push(product);
  }

  const sections = [];
  const categories = [];
  for (const [slug, items] of groups) {
    const title = categoryTitle(slug);

    const section = createElement('section', 'food-section');
    section.id = slug;
    section.append(createElement('h2', 'section-title', title));

    const grid = createElement('div', 'food-grid');
    items.forEach((product) => grid.append(createProductCard(product, shop)));
    section.append(grid);

    sections.push(section);
    categories.push({ slug, title });
  }
  return { sections, categories };
}

// Makes the + and - buttons change the number between them (1 to 50).
// One listener on the whole page handles every card, even ones added later.
export function setupQuantityButtons(root) {
  root.addEventListener('click', (event) => {
    const button = event.target.closest(
      '[data-action="increase-quantity"], [data-action="decrease-quantity"]'
    );
    if (!button || button.disabled) {
      return;
    }
    const valueElement = button.closest('.quantity-selector').querySelector('.qty-value');
    const current = toNumber(valueElement.textContent, 1);
    const change = button.dataset.action === 'increase-quantity' ? 1 : -1;
    valueElement.textContent = String(Math.min(MAX_QUANTITY, Math.max(1, current + change)));
  });
}

// Makes the search box hide products that don't match what was typed.
export function setupProductSearch(input, noResultsMessage, root) {
  if (!input) {
    return;
  }
  // Pressing Enter should not reload the page.
  const form = input.closest('form');
  if (form) {
    form.addEventListener('submit', (event) => event.preventDefault());
  }

  input.addEventListener('input', () => {
    const term = input.value.trim().toLowerCase();
    let visibleTotal = 0;

    root.querySelectorAll('.food-section').forEach((section) => {
      const cards = section.querySelectorAll('.food-card');
      if (cards.length === 0) {
        return;
      }
      let visibleInSection = 0;
      cards.forEach((card) => {
        const nameElement = card.querySelector('.food-name');
        const name = nameElement ? nameElement.textContent.toLowerCase() : '';
        const matches = term === '' || name.includes(term);
        card.hidden = !matches;
        if (matches) {
          visibleInSection += 1;
        }
      });
      section.hidden = visibleInSection === 0;
      visibleTotal += visibleInSection;
    });

    if (noResultsMessage) {
      noResultsMessage.hidden = term === '' || visibleTotal > 0;
    }
  });
}

// Gets the latest details of specific products (used by the cart page to
// show real, up-to-date prices).
export async function getProductsByIds(productIds) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from('products')
    .select('id, shop_id, name, price, emoji, image_url, is_available')
    .in('id', productIds);
  if (error) throw error;
  return data;
}