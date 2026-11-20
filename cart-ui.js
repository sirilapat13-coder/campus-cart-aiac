// cart-ui.js - keeps the cart badge (in the header) and the cart bar
// (at the bottom of the page) up to date.

import { getCartItemCount, getCartSubtotal, getRequest, onCartChange } from './cart.js';
import { formatCurrency } from './utils.js';

// Updates every place that shows the cart count or total.
export function updateCartIndicators() {
  const count = getCartItemCount();
  const subtotal = getCartSubtotal();

  // The small number badge next to the Cart link (hidden when empty).
  const badge = document.getElementById('header-cart-count');
  if (badge) {
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  // The bottom cart bar. Shop pages use #cart-bar-count and #cart-bar-total;
  // the homepage uses the classes .cart-items and .cart-total.
  const barCount = document.querySelector('.cart-bar #cart-bar-count, .cart-bar .cart-items');
  const barTotal = document.querySelector('.cart-bar #cart-bar-total, .cart-bar .cart-total');

  if (barCount) {
    barCount.textContent =
      count === 0 ? 'Cart is empty' : `${count} ${count === 1 ? 'item' : 'items'}`;
  }
  if (barTotal) {
    if (count === 0) {
      barTotal.textContent = 'Add items to get started';
    } else if (subtotal > 0) {
      barTotal.textContent = `Total: ${formatCurrency(subtotal)}`;
    } else if (getRequest('xerox')) {
      barTotal.textContent = 'Price to be confirmed';
    } else {
      barTotal.textContent = 'Free supplies';
    }
  }
}

// Call this once when a page opens. It updates now and again after every change.
export function initCartIndicators() {
  updateCartIndicators();
  onCartChange(updateCartIndicators);
}