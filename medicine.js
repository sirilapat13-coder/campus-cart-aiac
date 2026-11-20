// medicine.js - makes the Tablets request form and the Request Summary
// on medicine.html work. (The first-aid products are handled by shop-page.js.)

import { getSession } from '../auth.js';
import { getShopBySlug } from '../stores.js';
import { getCartItems, getRequest, setRequest, onCartChange } from '../cart.js';
import {
  formatCurrency,
  showError,
  showInfo,
  showSuccess,
  toNumber,
  tryCatch
} from '../utils.js';

const MIN_DESCRIPTION_LENGTH = 5;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_NOTE_LENGTH = 200;

// Find the parts of the page we need.
const form = document.getElementById('tablet-request-form');
const descriptionInput = document.getElementById('request-description');
const noteInput = document.getElementById('request-note');
const addButton = form ? form.querySelector('.request-button') : null;

// Fills the Request Summary box with the real numbers from the cart.
function updateSummary(shop) {
  // The four values in order: items, supplies cost, delivery fee, total.
  const values = document.querySelectorAll('#summary .summary-row dd');
  if (values.length < 4) {
    return;
  }

  const items = getCartItems().filter((item) => item.shopId === shop.id);
  const tablet = getRequest('tablet');
  const hasTablet = Boolean(tablet && tablet.shopId === shop.id);

  const count = items.reduce((total, item) => total + item.quantity, 0) + (hasTablet ? 1 : 0);
  const suppliesCost = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = count > 0 ? toNumber(shop.delivery_fee) : 0;

  values[0].textContent = String(count);
  values[1].textContent = formatCurrency(suppliesCost);
  values[2].textContent = formatCurrency(deliveryFee);
  values[3].textContent = formatCurrency(suppliesCost + deliveryFee);
}

async function startMedicinePage() {
  // Not logged in? main.js is already sending the student to login.html.
  const session = await getSession();
  if (!session || !form || !descriptionInput || !noteInput || !addButton) {
    return;
  }

  const { data: shop } = await tryCatch(() => getShopBySlug('medicine'), {
    context: 'Loading Medicine'
  });
  if (!shop) {
    return;
  }

  // Keep the summary correct now and after every cart change.
  updateSummary(shop);
  onCartChange(() => updateSummary(shop));

  addButton.disabled = !shop.is_open;

  // Pressing Enter must not reload the page.
  form.addEventListener('submit', (event) => event.preventDefault());

  // Runs when the student clicks "Add to Request" under Tablets.
  addButton.addEventListener('click', () => {
    const description = descriptionInput.value.trim();
    const note = noteInput.value.trim();

    if (description.length < MIN_DESCRIPTION_LENGTH) {
      showError(`Please describe your request (at least ${MIN_DESCRIPTION_LENGTH} characters).`);
      descriptionInput.focus();
      return;
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      showError(`Your description is too long (maximum ${MAX_DESCRIPTION_LENGTH} characters).`);
      descriptionInput.focus();
      return;
    }
    if (note.length > MAX_NOTE_LENGTH) {
      showError(`Your note is too long (maximum ${MAX_NOTE_LENGTH} characters).`);
      noteInput.focus();
      return;
    }
    if (!shop.is_open) {
      showError(`${shop.name} is closed right now.`);
      return;
    }

    const alreadyHadOne = Boolean(getRequest('tablet'));
    const text = note ? `${description}\n\nNote: ${note}` : description;

    try {
      setRequest('tablet', {
        shopId: shop.id,
        shopSlug: shop.slug,
        shopName: shop.name,
        text
      });
    } catch (error) {
      showError(error.message);
      return;
    }

    descriptionInput.value = '';
    noteInput.value = '';
    showSuccess('Tablet request added. Infirmary staff will review it after you place the order.');
    if (alreadyHadOne) {
      showInfo('Your earlier tablet request was replaced.');
    }
  });
}

await startMedicinePage();