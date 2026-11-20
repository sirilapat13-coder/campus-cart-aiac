// homepage.js - makes the store search work and shows which stores are
// closed. Stores that are not active in the database disappear.

import { getSession } from '../auth.js';
import { getAllShops } from '../stores.js';
import { tryCatch } from '../utils.js';

const searchForm = document.getElementById('store-search-form');
const searchInput = document.getElementById('store-search');
const noResults = document.getElementById('no-results');

// Hides the store cards that don't match what was typed in the search box.
function applySearch() {
  const term = searchInput.value.trim().toLowerCase();
  let visibleCount = 0;

  document.querySelectorAll('.store-card').forEach((card) => {
    const nameElement = card.querySelector('.store-name');
    const name = nameElement ? nameElement.textContent.toLowerCase() : '';
    const matches = term === '' || name.includes(term);
    card.hidden = !matches;
    if (matches) {
      visibleCount += 1;
    }
  });

  noResults.hidden = term === '' || visibleCount > 0;
}

// Set up the search first, so it works even while stores are loading.
if (searchForm && searchInput && noResults) {
  searchForm.addEventListener('submit', (event) => event.preventDefault());
  searchInput.addEventListener('input', applySearch);
}

// Marks closed stores and removes stores that are not active.
function applyShopStatus(shops) {
  const shopsBySlug = new Map(shops.map((shop) => [shop.slug, shop]));

  document.querySelectorAll('.store-card').forEach((card) => {
    const shop = shopsBySlug.get(card.dataset.shopId);

    if (!shop) {
      card.remove();
      return;
    }
    if (!shop.is_open) {
      const link = card.querySelector('.store-link');
      if (link) {
        link.textContent = 'Closed right now';
      }
      card.style.opacity = '0.65';
    }
  });
}

const session = await getSession();
if (session) {
  const { data: shops } = await tryCatch(() => getAllShops(), { context: 'Loading stores' });
  if (shops) {
    applyShopStatus(shops);
  }
}