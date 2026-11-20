// =====================================================================
// utils.js - small helper functions used by all Campus Cart pages.
// Each function is "exported" so other JavaScript files can import it.
// =====================================================================


// ---------------------------------------------------------------------
// SETTINGS (constants)
// These values never change while the page runs. They sit at the top
// so they are easy to find and edit.
// ---------------------------------------------------------------------

// Indian number style (for example 12,34,567) and the rupee currency.
const CURRENCY_LOCALE = 'en-IN';
const CURRENCY_CODE = 'INR';

// Dates are always shown in Indian time, whatever the phone's setting is.
const DATE_LOCALE = 'en-IN';
const DATE_TIME_ZONE = 'Asia/Kolkata';

// Message shown when we cannot work out what went wrong.
const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.';

// The id of the box that holds the pop-up notifications.
const NOTIFICATION_CONTAINER_ID = 'campus-cart-notifications';

// At most this many notifications are shown at once.
const MAX_VISIBLE_NOTIFICATIONS = 4;

// Ignore URL values longer than this (protects against junk links).
const MAX_QUERY_VALUE_LENGTH = 200;

// "Patterns" (regular expressions) describe what valid text looks like.
// Email: name@domain.com
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
// Indian mobile: exactly 10 digits, starting with 6, 7, 8 or 9.
const MOBILE_PATTERN = /^[6-9]\d{9}$/;
// A plain number such as 12, -3, 4.5 or .5
const NUMBER_PATTERN = /^-?(\d+\.?\d*|\.\d+)$/;
// The id format Supabase uses, for example e2b8bd78-d735-4dfa-915d-feab7d52e6a8
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Formatters are created once here and reused every time (faster than
// creating a new one on every call).

// Shows whole rupees with no decimals: ₹240
const wholeRupeeFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  style: 'currency',
  currency: CURRENCY_CODE,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

// Shows paise with 2 decimals: ₹240.50
const paiseRupeeFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  style: 'currency',
  currency: CURRENCY_CODE,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

// Date like: 14 Nov 2026
const dateFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: DATE_TIME_ZONE
});

// Time like: 3:45 pm
const timeFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: DATE_TIME_ZONE
});

// Colours, icon and display time for each type of notification.
// Object.freeze means nobody can change these by accident.
const NOTIFICATION_THEMES = Object.freeze({
  success: { icon: '✓', background: '#e8f7ee', border: '#2e9e5b', color: '#14532d', duration: 3500 },
  error: { icon: '✕', background: '#fdecec', border: '#d64545', color: '#7f1d1d', duration: 6000 },
  warning: { icon: '!', background: '#fff6e0', border: '#e0a100', color: '#7a4e00', duration: 5000 },
  info: { icon: 'i', background: '#e8f1fd', border: '#3b82d6', color: '#17406e', duration: 4000 }
});

// Pieces of text that show up when the internet connection fails.
const NETWORK_ERROR_HINTS = Object.freeze([
  'failed to fetch',
  'networkerror',
  'network request failed',
  'load failed'
]);

// Technical error codes (from the database and login system) and the
// friendly message a student should see instead.
const ERROR_CODE_MESSAGES = Object.freeze({
  '42501': 'You do not have permission to do that.',
  '23505': 'This value is already in use.',
  '23503': 'This item is linked to other records and cannot be changed.',
  '23514': 'Some of the information entered is not valid.',
  '22P02': 'Some of the information entered is not valid.',
  PGRST116: 'The requested item was not found.',
  PGRST301: 'Your session has expired. Please log in again.',
  invalid_credentials: 'Incorrect email or password.',
  email_not_confirmed: 'Please confirm your email before logging in.',
  user_already_exists: 'An account with this email already exists.',
  weak_password: 'Your password is too weak. Please choose a stronger one.',
  over_email_send_rate_limit: 'Too many emails were sent. Please wait a few minutes and try again.'
});


// ---------------------------------------------------------------------
// PRIVATE HELPERS
// These two are NOT exported. Only this file uses them.
// ---------------------------------------------------------------------

// Turns a value into a number. Accepts 120, "120", "120.00" and "₹1,200".
// Returns null when the value is not a real number.
function parseNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  // Remove the ₹ sign, commas and spaces, then check what is left.
  const cleaned = value.replace(/[₹,\s]/g, '');
  if (!NUMBER_PATTERN.test(cleaned)) {
    return null;
  }
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

// Every validate...() function returns an answer in this same shape:
//   valid   - true or false
//   message - what to show the student when it is not valid
//   value   - the cleaned-up value when it is valid
function buildResult(valid, message = '', value = null) {
  return {
    valid,
    message: valid ? '' : message,
    value: valid ? value : null
  };
}


// ---------------------------------------------------------------------
// EMPTY VALUES AND SAFE VALUES
// ---------------------------------------------------------------------

// Is this value "nothing"? True for null, undefined, blank text,
// empty lists and empty objects. Note: 0 and false are NOT empty.
export function isEmpty(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  if (typeof value === 'number') {
    return Number.isNaN(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (value instanceof Map || value instanceof Set) {
    return value.size === 0;
  }
  // Only plain objects like {} count as empty (an Error object does not).
  if (Object.prototype.toString.call(value) === '[object Object]') {
    return Object.keys(value).length === 0;
  }
  return false;
}

// Use the value, but switch to the fallback if the value is empty.
// Example: valueOr(shop.description, 'No description yet')
export function valueOr(value, fallback) {
  return isEmpty(value) ? fallback : value;
}

// Safely turns a value into trimmed text. Returns the fallback when
// there is nothing useful to show.
export function toText(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? fallback : trimmed;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : fallback;
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}

// Safely turns a value into a number. Supabase often sends prices as
// text like "120.00", so this is very handy.
export function toNumber(value, fallback = 0) {
  const number = parseNumber(value);
  return number === null ? fallback : number;
}

// Reads a value deep inside an object without crashing if a part is missing.
// Example: getSafe(order, 'shop.name', 'Unknown shop')
export function getSafe(source, path, fallback = null) {
  // 'shop.name' becomes ['shop', 'name']
  const keys = Array.isArray(path) ? path : toText(path).split('.').filter(Boolean);
  let current = source;
  for (const key of keys) {
    if (current === null || current === undefined) {
      return fallback;
    }
    current = current[key];
  }
  return current === null || current === undefined ? fallback : current;
}

// Makes text safe to put inside innerHTML, so nobody can sneak in
// HTML or scripts. (Using textContent is even safer when you can.)
export function escapeHtml(value) {
  return toText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Checks that a value looks like a Supabase id (UUID).
export function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}


// ---------------------------------------------------------------------
// CURRENCY
// ---------------------------------------------------------------------

// Turns a number into rupees: 240 -> ₹240, 1234567.5 -> ₹12,34,567.50
// If the amount is not a valid number, the fallback text is returned.
export function formatCurrency(amount, fallback = '₹0') {
  const number = parseNumber(amount);
  if (number === null) {
    return fallback;
  }
  // Round to 2 decimals. "|| 0" avoids showing "-₹0".
  const rounded = Math.round(number * 100) / 100 || 0;
  // Whole amounts show no decimals, other amounts show 2 decimals.
  const formatter = Number.isInteger(rounded) ? wholeRupeeFormatter : paiseRupeeFormatter;
  return formatter.format(rounded);
}


// ---------------------------------------------------------------------
// VALIDATION: EMAIL, MOBILE NUMBER, REQUIRED FIELDS
// ---------------------------------------------------------------------

// Quick yes/no check for an email address.
export function isValidEmail(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const email = value.trim();
  if (email.length === 0 || email.length > 254 || email.includes('..')) {
    return false;
  }
  return EMAIL_PATTERN.test(email);
}

// Full email check that returns a message you can show in the form.
export function validateEmail(value, fieldName = 'Email') {
  // First make sure something was typed.
  const required = validateRequired(value, fieldName);
  if (!required.valid) {
    return required;
  }
  if (!isValidEmail(required.value)) {
    return buildResult(false, 'Please enter a valid email address.');
  }
  return buildResult(true, '', required.value);
}

// Cleans a mobile number down to 10 digits.
// '+91 98765 43210' -> '9876543210'. Returns '' if it is not valid.
export function normalizeIndianMobile(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  // Keep digits only (removes spaces, dashes, +, brackets).
  let digits = String(value).replace(/\D/g, '');
  // Remove a leading country code (91) or leading zero.
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return MOBILE_PATTERN.test(digits) ? digits : '';
}

// Quick yes/no check for an Indian mobile number.
export function isValidIndianMobile(value) {
  return normalizeIndianMobile(value) !== '';
}

// Full mobile check that returns a message. When valid, "value" is the
// clean 10-digit number, ready to send to the database.
export function validateIndianMobile(value, fieldName = 'Mobile number') {
  const required = validateRequired(value, fieldName);
  if (!required.valid) {
    return required;
  }
  const mobile = normalizeIndianMobile(required.value);
  if (mobile === '') {
    return buildResult(false, 'Please enter a valid 10-digit Indian mobile number.');
  }
  return buildResult(true, '', mobile);
}

// Shows a mobile number nicely: 9876543210 -> +91 98765 43210
export function formatIndianMobile(value) {
  const mobile = normalizeIndianMobile(value);
  if (mobile === '') {
    return toText(value);
  }
  return `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
}

// Checks that a field is not empty.
// Example: validateRequired(nameInput.value, 'Student name')
export function validateRequired(value, fieldName = 'This field') {
  const label = toText(fieldName, 'This field');
  if (isEmpty(value)) {
    return buildResult(false, `${label} is required.`);
  }
  // Text is returned with extra spaces removed.
  return buildResult(true, '', typeof value === 'string' ? value.trim() : value);
}


// ---------------------------------------------------------------------
// VALIDATION: NUMBERS AND QUANTITIES
// ---------------------------------------------------------------------

// Checks that a value is a number greater than zero.
// Options: allowZero (true allows 0) and max (the largest allowed number).
export function validatePositiveNumber(value, fieldName = 'Value', options = {}) {
  const label = toText(fieldName, 'Value');
  const allowZero = Boolean(options && options.allowZero);
  const max = options && options.max !== undefined ? options.max : Infinity;

  if (isEmpty(value)) {
    return buildResult(false, `${label} is required.`);
  }
  const number = parseNumber(value);
  if (number === null) {
    return buildResult(false, `${label} must be a number.`);
  }
  if (allowZero && number < 0) {
    return buildResult(false, `${label} cannot be negative.`);
  }
  if (!allowZero && number <= 0) {
    return buildResult(false, `${label} must be greater than zero.`);
  }
  if (Number.isFinite(max) && number > max) {
    return buildResult(false, `${label} cannot be more than ${max}.`);
  }
  return buildResult(true, '', number);
}

// Checks a quantity: it must be a whole number between min and max.
// Defaults are 1 to 50, which matches the database rules.
// For Xerox copies use: validateQuantity(value, { max: 100, fieldName: 'Number of copies' })
export function validateQuantity(value, options = {}) {
  const min = options && Number.isFinite(options.min) ? options.min : 1;
  const max = options && Number.isFinite(options.max) ? options.max : 50;
  const label = toText(options && options.fieldName, 'Quantity');

  if (isEmpty(value)) {
    return buildResult(false, `${label} is required.`);
  }
  const number = parseNumber(value);
  if (number === null || !Number.isInteger(number)) {
    return buildResult(false, `${label} must be a whole number.`);
  }
  if (number < min) {
    return buildResult(false, `${label} must be at least ${min}.`);
  }
  if (number > max) {
    return buildResult(false, `${label} cannot be more than ${max}.`);
  }
  return buildResult(true, '', number);
}


// ---------------------------------------------------------------------
// VALIDATION: FILES (for the Xerox PDF upload)
// ---------------------------------------------------------------------

// Gets the file type from a file name: 'Notes.PDF' -> 'pdf'
// Returns '' when the name has no extension.
export function getFileExtension(fileName) {
  const name = toText(fileName);
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return '';
  }
  return name.slice(dotIndex + 1).toLowerCase();
}

// Turns a size in bytes into easy text: 2097152 -> '2.0 MB'
export function formatFileSize(bytes) {
  const size = toNumber(bytes, 0);
  if (size < 1024) {
    return `${Math.max(0, Math.round(size))} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// Checks a chosen file. By default only PDF files up to 10 MB are
// allowed (this matches the xerox-files storage bucket).
// Options: allowedExtensions, maxSizeMB, fieldName
export function validateFile(file, options = {}) {
  const label = toText(options && options.fieldName, 'File');
  const maxSizeMB = options && options.maxSizeMB !== undefined ? options.maxSizeMB : 10;
  const extensionList = options && Array.isArray(options.allowedExtensions)
    ? options.allowedExtensions
    : ['pdf'];
  // Clean the list: remove dots and capital letters ('.PDF' -> 'pdf').
  const allowedExtensions = extensionList
    .map((extension) => toText(extension).replace(/^\./, '').toLowerCase())
    .filter(Boolean);

  // A real file has a name and a size.
  const looksLikeFile = file && typeof file.name === 'string' && typeof file.size === 'number';
  if (!looksLikeFile) {
    return buildResult(false, 'Please select a file.');
  }

  const extension = getFileExtension(file.name);
  if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
    const names = allowedExtensions.map((item) => item.toUpperCase()).join(', ');
    return buildResult(false, `Only ${names} files are allowed.`);
  }
  if (file.size === 0) {
    return buildResult(false, 'The selected file is empty.');
  }
  if (Number.isFinite(maxSizeMB) && maxSizeMB > 0 && file.size > maxSizeMB * 1024 * 1024) {
    return buildResult(
      false,
      `${label} is too large (${formatFileSize(file.size)}). The maximum size is ${maxSizeMB} MB.`
    );
  }
  return buildResult(true, '', file);
}


// ---------------------------------------------------------------------
// DATE AND TIME
// ---------------------------------------------------------------------

// Turns text, a number or a Date into a real Date.
// Returns null if it is not a valid date (so nothing crashes).
export function parseDate(value) {
  let date = null;
  if (value instanceof Date) {
    date = value;
  } else if (
    (typeof value === 'string' && value.trim() !== '') ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    date = new Date(value);
  }
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

// 14 Nov 2026
export function formatDate(value, fallback = '') {
  const date = parseDate(value);
  return date ? dateFormatter.format(date) : fallback;
}

// 3:45 pm
export function formatTime(value, fallback = '') {
  const date = parseDate(value);
  return date ? timeFormatter.format(date) : fallback;
}

// 14 Nov 2026, 3:45 pm
export function formatDateTime(value, fallback = '') {
  const date = parseDate(value);
  return date ? `${dateFormatter.format(date)}, ${timeFormatter.format(date)}` : fallback;
}


// ---------------------------------------------------------------------
// NOTIFICATIONS (small pop-up messages in the top-right corner)
// ---------------------------------------------------------------------

// Finds the box that holds the notifications. If it does not exist yet,
// it is created and added to the page.
function getNotificationContainer() {
  if (typeof document === 'undefined' || !document.body) {
    return null;
  }
  let container = document.getElementById(NOTIFICATION_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = NOTIFICATION_CONTAINER_ID;
    container.style.position = 'fixed';
    container.style.top = '16px';
    // On phones with a notch, keep the box below it.
    container.style.top = 'calc(env(safe-area-inset-top, 0px) + 16px)';
    container.style.right = '16px';
    container.style.width = 'min(380px, calc(100vw - 32px))';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    // A high number keeps notifications above everything else on the page.
    container.style.zIndex = '9999';
    // Lets students click the page behind the empty space.
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);
  }
  return container;
}

// The main notification function. The four show... functions below
// call this one. type is 'success', 'error', 'warning' or 'info'.
// It returns a function that closes this notification when called.
export function showNotification(type, message, options = {}) {
  const text = toText(message);
  if (text === '') {
    return () => {};
  }

  // An unknown type is treated as 'info'.
  const kind = Object.prototype.hasOwnProperty.call(NOTIFICATION_THEMES, type) ? type : 'info';
  const container = getNotificationContainer();

  // If there is no page (for example during a test), just print to the console.
  if (!container) {
    const log = kind === 'error' ? console.error : console.log;
    log(`[Campus Cart ${kind}] ${text}`);
    return () => {};
  }

  // Remove the oldest notification if too many are already showing.
  while (container.children.length >= MAX_VISIBLE_NOTIFICATIONS) {
    container.firstElementChild.remove();
  }

  const theme = NOTIFICATION_THEMES[kind];

  // The notification box. Screen readers announce it using its role.
  const toast = document.createElement('div');
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  Object.assign(toast.style, {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 14px',
    borderRadius: '10px',
    border: `1px solid ${theme.border}`,
    borderLeft: `5px solid ${theme.border}`,
    background: theme.background,
    color: theme.color,
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',
    fontSize: '0.95rem',
    lineHeight: '1.4',
    pointerEvents: 'auto',
    wordBreak: 'break-word'
  });

  // The small icon on the left.
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = theme.icon;
  icon.style.fontWeight = '700';

  // The message text. textContent is used (not innerHTML) so the message
  // can never run HTML or scripts.
  const body = document.createElement('span');
  body.textContent = text;
  body.style.flex = '1';

  // The × button that closes the notification.
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Dismiss notification');
  closeButton.textContent = '×';
  Object.assign(closeButton.style, {
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    fontSize: '1.2rem',
    lineHeight: '1',
    cursor: 'pointer',
    padding: '0 2px'
  });

  // Closes this notification and cancels its auto-hide timer.
  let timerId = null;
  const close = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    toast.remove();
  };
  closeButton.addEventListener('click', close);

  toast.append(icon, body, closeButton);
  container.append(toast);

  // Hide automatically after a few seconds (a duration of 0 keeps it open).
  const duration = Number.isFinite(options && options.duration) ? options.duration : theme.duration;
  if (duration > 0) {
    timerId = setTimeout(close, duration);
  }
  return close;
}

// Green notification: something worked.
export function showSuccess(message, options = {}) {
  return showNotification('success', message, options);
}

// Red notification: something failed.
export function showError(message, options = {}) {
  return showNotification('error', message, options);
}

// Yellow notification: be careful.
export function showWarning(message, options = {}) {
  return showNotification('warning', message, options);
}

// Blue notification: general information.
export function showInfo(message, options = {}) {
  return showNotification('info', message, options);
}

// Removes every notification from the screen.
export function clearNotifications() {
  if (typeof document === 'undefined') {
    return;
  }
  const container = document.getElementById(NOTIFICATION_CONTAINER_ID);
  if (container) {
    container.replaceChildren();
  }
}


// ---------------------------------------------------------------------
// URL QUERY PARAMETERS (the part of a link after the ?)
// Example link: store.html?shop=canteen
// ---------------------------------------------------------------------

// Reads one value from the URL. It returns the fallback when the value is
// missing, blank, too long, or does not match the pattern you give.
// Example: getQueryParam('shop', { pattern: /^[a-z0-9-]+$/ })
// Use the search option to test with your own text instead of the real URL.
export function getQueryParam(name, options = {}) {
  const fallback = options && options.fallback !== undefined ? options.fallback : null;
  try {
    if (typeof name !== 'string' || name === '') {
      return fallback;
    }
    // Use the text you passed in, otherwise the real page address.
    const search = options && typeof options.search === 'string'
      ? options.search
      : typeof window !== 'undefined'
        ? window.location.search
        : '';
    const rawValue = new URLSearchParams(search).get(name);
    if (rawValue === null) {
      return fallback;
    }
    const value = rawValue.trim();
    if (value === '' || value.length > MAX_QUERY_VALUE_LENGTH) {
      return fallback;
    }
    // If a pattern was given, the value must match it.
    const pattern = options && options.pattern;
    if (pattern instanceof RegExp) {
      pattern.lastIndex = 0;
      if (!pattern.test(value)) {
        return fallback;
      }
    }
    // Always show this value with textContent, never innerHTML.
    return value;
  } catch {
    return fallback;
  }
}

// Reads ALL values from the URL as one object.
// '?shop=canteen&page=2' -> { shop: 'canteen', page: '2' }
export function getQueryParams(search) {
  try {
    const source = typeof search === 'string'
      ? search
      : typeof window !== 'undefined'
        ? window.location.search
        : '';
    const entries = [];
    for (const [key, rawValue] of new URLSearchParams(source)) {
      const value = rawValue.trim();
      if (key !== '' && value !== '' && value.length <= MAX_QUERY_VALUE_LENGTH) {
        entries.push([key, value]);
      }
    }
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}


// ---------------------------------------------------------------------
// UNIQUE IDS (for temporary testing only)
// Real orders and products get their ids from the database.
// ---------------------------------------------------------------------

// Makes a unique id like 'order-3f2a1b7c-...'. The prefix is optional.
export function generateId(prefix = 'id') {
  // Keep only safe characters in the prefix.
  const safePrefix = toText(prefix, 'id').replace(/[^a-zA-Z0-9_-]/g, '') || 'id';
  // Use the browser's built-in generator when available,
  // otherwise build one from the time and a random number.
  const unique =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${safePrefix}-${unique}`;
}


// ---------------------------------------------------------------------
// ERROR HANDLING
// ---------------------------------------------------------------------

// Turns any error into a short, friendly message a student can read.
// It understands text errors, normal JavaScript errors, and errors from
// the database and login system.
export function getErrorMessage(error, fallback = DEFAULT_ERROR_MESSAGE) {
  const safeFallback = toText(fallback, DEFAULT_ERROR_MESSAGE);

  if (isEmpty(error)) {
    return safeFallback;
  }
  if (typeof error === 'string') {
    return toText(error, safeFallback);
  }
  if (typeof error !== 'object') {
    return safeFallback;
  }

  const message = toText(error.message);
  const details = toText(error.details);
  const code = toText(error.code);
  // One lowercase text to search through for known phrases.
  const text = `${message} ${details}`.toLowerCase();

  // 1. Internet problems.
  if (NETWORK_ERROR_HINTS.some((hint) => text.includes(hint))) {
    return 'Network problem. Please check your internet connection and try again.';
  }
  // 2. Messages written by our own database functions are already friendly
  //    (for example "This order is no longer available"), so show them as they are.
  if (code === 'P0001') {
    return message || safeFallback;
  }
  // 3. Phone number or student ID already used by another account.
  if (code === '23505' && text.includes('phone')) {
    return 'This mobile number is already registered.';
  }
  if (code === '23505' && text.includes('student_id')) {
    return 'This student ID is already registered.';
  }
  // 4. Common login and sign-up problems.
  if (text.includes('database error saving new user')) {
    return 'Could not create your account. The mobile number or student ID may already be registered.';
  }
  if (text.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (text.includes('email not confirmed')) {
    return 'Please confirm your email before logging in.';
  }
  if (text.includes('user already registered')) {
    return 'An account with this email already exists.';
  }
  if (text.includes('jwt expired')) {
    return 'Your session has expired. Please log in again.';
  }
  // 5. Other known error codes from the list at the top of this file.
  if (Object.prototype.hasOwnProperty.call(ERROR_CODE_MESSAGES, code)) {
    return ERROR_CODE_MESSAGES[code];
  }
  // 6. Unknown technical error: do not show confusing database text.
  if (code) {
    return safeFallback;
  }
  // 7. A normal error we wrote ourselves (for example new Error('Cart is empty')).
  return message || safeFallback;
}

// Writes an error to the browser console (press F12 to see it).
// The context says where it happened, for example 'Placing order'.
export function logError(context, error) {
  console.error(`[Campus Cart] ${toText(context, 'Error')}:`, error);
}

// One-step error handling: logs the error, shows a red notification,
// and returns the friendly message.
// Options: context, fallback, notify (set false to skip the notification)
export function handleError(error, options = {}) {
  const context = options && options.context;
  const fallback = options && options.fallback;
  const notify = !options || options.notify !== false;

  logError(context, error);
  const message = getErrorMessage(error, fallback);
  if (notify) {
    showError(message);
  }
  return message;
}

// Runs an async function and never crashes your page.
// If it works:  { data: <result>, error: null, message: '' }
// If it fails:  { data: null, error: <error>, message: '<friendly message>' }
// Example: const { data, error } = await tryCatch(() => loadShops(), { context: 'Loading shops' });
export async function tryCatch(asyncFunction, options = {}) {
  try {
    const data = await asyncFunction();
    return { data, error: null, message: '' };
  } catch (error) {
    const message = handleError(error, options);
    return { data: null, error, message };
  }
}