// shop-page.js - used by canteen, greendabba1-3, store and medicine pages.
// It reads the shop from <main data-shop-id="...">, loads that shop and its
// products from Supabase, draws the product sections, and makes the
// Add to Cart buttons work.

import { getSession } from '../auth.js';
import { getShopBySlug } from '../stores.js';
import {
  getProducts,
  buildProductSections,
  setupQuantityButtons,
  setupProductSearch
} from '../products.js';
import { addToCart, getShopsInCart } from '../cart.js';
import { handleError, showInfo, showSuccess, toNumber, tryCatch } from '../utils.js';

// Updates the Open / Closed badge and the "shop is closed" notice.
function showShopStatus(shop) {
  const badge = document.getElementById('shop-status');
  if (badge) {
    badge.classList.toggle('open', shop.is_open);
    badge.classList.toggle('closed', !shop.is_open);
    badge.dataset.status = shop.is_open ? 'open' : 'closed';
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    badge.replaceChildren(dot, document.createTextNode(shop.is_open ? ' Open now' : ' Closed'));
  }

  const notice = document.getElementById('shop-closed-notice');
  if (notice) {
    notice.hidden = shop.is_open;
  }
}

// Replaces the category tabs (Breakfast, Lunch, ...) with the real categories.
function showCategoryTabs(categories) {
  const tabs = document.querySelector('.category-tabs');
  if (!tabs) {
    return;
  }
  const links = categories.map((category) => {
    const link = document.createElement('a');
    link.href = `#${category.slug}`;
    link.className = 'tab';
    link.textContent = category.title;
    return link;
  });
  tabs.replaceChildren(...links);
}

// Makes every "Add to Cart" button work.
function setupAddToCart(main, shop, products) {
  // A quick way to find a product by its id.
  const productsById = new Map(products.map((product) => [product.id, product]));
  const word = shop.category === 'medicine' ? 'request' : 'cart';

  main.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="add-to-cart"]');
    // The tablet request button is not inside a product card, so it is
    // skipped here (it gets its own code in a later step).
    const card = button ? button.closest('.food-card') : null;
    if (!button || !card || button.disabled) {
      return;
    }

    const product = productsById.get(card.dataset.productId);
    if (!product || !product.is_available || !shop.is_open) {
      return;
    }

    const quantityElement = card.querySelector('.qty-value');
    const quantity = toNumber(quantityElement.textContent, 1);

    try {
      addToCart(shop, product, quantity);
    } catch (error) {
      handleError(error, { context: 'Add to cart' });
      return;
    }

    quantityElement.textContent = '1';
    showSuccess(`${quantity} × ${product.name} added to your ${word}.`);

    // Remind the student if their cart now has more than one store.
    if (getShopsInCart().length > 1) {
      showInfo('Your cart has items from more than one store. You can check out one store at a time.');
    }
  });
}

async function loadShopPage(main) {
  // Not logged in? main.js is already sending the student to login.html.
  const session = await getSession();
  if (!session) {
    return;
  }

  // Find the old hard-coded product sections and replace them with a
  // "Loading" message. The tablets form and summary have no products,
  // so they are left alone.
  const oldSections = Array.from(main.querySelectorAll('.food-section')).filter((section) =>
    section.querySelector('[data-product-id]')
  );
  const placeholder = document.createElement('p');
  placeholder.className = 'no-results';
  placeholder.textContent = 'Loading products...';
  if (oldSections.length > 0) {
    oldSections[0].before(placeholder);
  } else {
    main.append(placeholder);
  }
  oldSections.forEach((section) => section.remove());

  // Get the shop and its products from Supabase.
  const { data, error } = await tryCatch(
    async () => {
      const shop = await getShopBySlug(main.dataset.shopId);
      if (!shop) {
        throw new Error('This shop is not available right now.');
      }
      const products = await getProducts(shop.id);
      return { shop, products };
    },
    { context: 'Loading shop' }
  );

  if (error) {
    placeholder.textContent = 'Could not load products. Please refresh the page.';
    return;
  }

  const { shop, products } = data;
  showShopStatus(shop);

  if (products.length === 0) {
    placeholder.textContent = 'No products are available right now.';
    return;
  }

  // Draw the sections and tabs, then switch on the buttons and search.
  const { sections, categories } = buildProductSections(products, shop);
  placeholder.replaceWith(...sections);
  showCategoryTabs(categories);

  setupQuantityButtons(main);
  setupAddToCart(main, shop, products);
  setupProductSearch(
    document.getElementById('product-search'),
    document.getElementById('no-results'),
    main
  );
}

const main = document.querySelector('main[data-shop-id]');
if (main) {
  await loadShopPage(main);
}