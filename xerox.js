// xerox.js - makes xerox.html work.
// Checks the PDF, uploads it, and puts the print request in the cart.

import { getSession } from '../auth.js';
import { getShopBySlug } from '../stores.js';
import { getRequest, setRequest } from '../cart.js';
import { looksLikePdf, uploadXeroxFile } from '../files.js';
import {
  formatFileSize,
  showError,
  showInfo,
  showSuccess,
  toNumber,
  tryCatch,
  validateFile,
  validateQuantity
} from '../utils.js';

const MAX_COPIES = 100;
const MAX_FILE_SIZE_MB = 10;
const MAX_INSTRUCTIONS_LENGTH = 300;
const NO_FILE_TEXT = 'No file selected yet';

// The values on your form -> the values the database accepts.
const PRINT_TYPES = new Map([
  ['black-white', 'black_white'],
  ['colour', 'colour']
]);
const PRINT_SIDES = new Map([
  ['single', 'single'],
  ['double', 'double']
]);
const PAPER_SIZES = new Map([
  ['a4', 'A4'],
  ['a3', 'A3']
]);

// Find the parts of the page we need.
const form = document.getElementById('xerox-form');
const fileInput = document.getElementById('pdf-file');
const fileNameText = document.getElementById('selected-file-name');
const copiesInput = document.getElementById('copies');
const instructionsInput = document.getElementById('instructions');
const addButton = document.getElementById('xerox-add-to-cart');

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

// Returns the value of the chosen radio button (for example "colour").
function getChosenValue(name) {
  const chosen = form.querySelector(`input[name="${name}"]:checked`);
  return chosen ? chosen.value : '';
}

// Forgets the chosen file.
function clearFile() {
  fileInput.value = '';
  fileNameText.textContent = NO_FILE_TEXT;
}

// Checks a file: right type, right size, and really a PDF.
// Shows a red message and returns false if there is a problem.
async function checkFile(file) {
  const result = validateFile(file, {
    allowedExtensions: ['pdf'],
    maxSizeMB: MAX_FILE_SIZE_MB,
    fieldName: 'File'
  });
  if (!result.valid) {
    showError(result.message);
    return false;
  }
  if (!(await looksLikePdf(file))) {
    showError('This file does not look like a real PDF. Please choose another file.');
    return false;
  }
  return true;
}

async function startXeroxPage() {
  // Not logged in? main.js is already sending the student to login.html.
  const session = await getSession();
  if (!session || !form || !fileInput || !copiesInput || !addButton) {
    return;
  }

  const { data: shop } = await tryCatch(() => getShopBySlug('xerox'), {
    context: 'Loading Xerox'
  });
  if (!shop) {
    addButton.disabled = true;
    return;
  }
  showShopStatus(shop);
  addButton.disabled = !shop.is_open;

  // Pressing Enter must not reload the page.
  form.addEventListener('submit', (event) => event.preventDefault());

  // When a file is chosen: check it and show its name and size.
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) {
      fileNameText.textContent = NO_FILE_TEXT;
      return;
    }
    if (!(await checkFile(file))) {
      clearFile();
      return;
    }
    fileNameText.textContent = `${file.name} (${formatFileSize(file.size)})`;
  });

  // The + and - buttons for the number of copies (1 to 100).
  form.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="increase-copies"], [data-action="decrease-copies"]');
    if (!button) {
      return;
    }
    const change = button.dataset.action === 'increase-copies' ? 1 : -1;
    const current = toNumber(copiesInput.value, 1);
    copiesInput.value = String(Math.min(MAX_COPIES, Math.max(1, current + change)));
  });

  let isBusy = false;

  // Runs when the student clicks "Add to Cart".
  addButton.addEventListener('click', async () => {
    if (isBusy) {
      return;
    }

    // 1. The file.
    const file = fileInput.files[0];
    if (!file) {
      showError('Please choose a PDF file first.');
      return;
    }
    if (!(await checkFile(file))) {
      clearFile();
      return;
    }

    // 2. The print options.
    const printType = PRINT_TYPES.get(getChosenValue('print_type'));
    const printSides = PRINT_SIDES.get(getChosenValue('print_sides'));
    const paperSize = PAPER_SIZES.get(getChosenValue('paper_size'));
    if (!printType || !printSides || !paperSize) {
      showError('Please choose all the print options.');
      return;
    }

    const copiesResult = validateQuantity(copiesInput.value, {
      max: MAX_COPIES,
      fieldName: 'Number of copies'
    });
    if (!copiesResult.valid) {
      showError(copiesResult.message);
      copiesInput.focus();
      return;
    }

    const instructions = instructionsInput.value.trim();
    if (instructions.length > MAX_INSTRUCTIONS_LENGTH) {
      showError(`Your instructions are too long (maximum ${MAX_INSTRUCTIONS_LENGTH} characters).`);
      instructionsInput.focus();
      return;
    }

    if (!shop.is_open) {
      showError('The Xerox shop is closed right now.');
      return;
    }

    // 3. Upload the file. The button is switched off while we wait.
    isBusy = true;
    addButton.disabled = true;
    addButton.textContent = 'Uploading...';

    try {
      const { data: filePath, error } = await tryCatch(
        () => uploadXeroxFile(session.user.id, file),
        { context: 'Uploading file' }
      );
      if (error) {
        return;
      }

      // 4. Save the request in the cart.
      const alreadyHadOne = Boolean(getRequest('xerox'));
      try {
        setRequest('xerox', {
          shopId: shop.id,
          shopSlug: shop.slug,
          shopName: shop.name,
          fileName: file.name,
          filePath,
          printType,
          printSides,
          paperSize,
          copies: copiesResult.value,
          instructions
        });
      } catch (saveError) {
        showError(saveError.message);
        return;
      }

      // 5. Reset the form for the next file.
      clearFile();
      copiesInput.value = '1';
      instructionsInput.value = '';
      showSuccess('Your document was added to the cart.');
      if (alreadyHadOne) {
        showInfo('Your earlier Xerox request was replaced.');
      }
    } finally {
      isBusy = false;
      addButton.disabled = !shop.is_open;
      addButton.textContent = 'Add to Cart';
    }
  });
}

await startXeroxPage();