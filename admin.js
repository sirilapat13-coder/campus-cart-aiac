// admin.js (page) - makes admin.html work.
// 1. Only admins see the dashboard (the database also refuses everyone else).
// 2. Applications tab: approve / reject pending applications.
// 3. Partners tab: suspend / reinstate / revoke, with online status and counts.

import { requireLogin, getMyProfile } from '../auth.js';
import { listApplications, reviewApplication, listPartners, setDeliveryStatus,
         listXeroxPending, xeroxFileUrl, confirmXeroxPrice,
         listInfirmaryPending, reviewInfirmary,
         listAllShops, createShop, updateShop,
         listShopProducts, createProduct, updateProduct } from '../admin.js';
import { toText, formatIndianMobile, formatDateTime, showError, showSuccess, tryCatch } from '../utils.js';

const gate = document.getElementById('admin-gate');
const dashboard = document.getElementById('admin-dashboard');
const tabButtons = document.querySelectorAll('[data-tab-button]');
const panels = {
  applications: document.getElementById('panel-applications'),
  partners: document.getElementById('panel-partners'),
  xerox: document.getElementById('panel-xerox'),
  medicine: document.getElementById('panel-medicine'),
  shops: document.getElementById('panel-shops'),
  products: document.getElementById('panel-products')
};
const appsList = document.getElementById('applications-list');
const appsEmpty = document.getElementById('applications-empty');
const partnersList = document.getElementById('partners-list');
const partnersEmpty = document.getElementById('partners-empty');
const xeroxList = document.getElementById('xerox-list');
const xeroxEmpty = document.getElementById('xerox-empty');
const medicineList = document.getElementById('medicine-list');
const medicineEmpty = document.getElementById('medicine-empty');
const shopsList = document.getElementById('shops-list');
const shopsEmpty = document.getElementById('shops-empty');
const addShopForm = document.getElementById('add-shop-form');
const productShopSelect = document.getElementById('product-shop-select');
const addProductForm = document.getElementById('add-product-form');
const productsList = document.getElementById('products-list');
const productsEmpty = document.getElementById('products-empty');

let shopsCache = [];

// ---- tiny DOM helpers (textContent only, never innerHTML) ----
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
function field(label, value) {
  const row = el('p', 'admin-field');
  row.append(el('span', 'admin-field-label', `${label}: `));
  row.append(document.createTextNode(toText(value, '-')));
  return row;
}

// ---- tabs ----
function showTab(name) {
  Object.entries(panels).forEach(([key, panel]) => {
    panel.hidden = key !== name;
  });
  tabButtons.forEach((button) => {
    const active = button.dataset.tabButton === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}
tabButtons.forEach((button) => {
  button.addEventListener('click', () => showTab(button.dataset.tabButton));
});

// ---- Applications ----
function applicationCard(app) {
  const profile = app.profiles || {};
  const card = el('article', 'admin-card');

  const head = el('div', 'admin-card-head');
  head.append(
    el('h3', 'admin-card-name', toText(profile.full_name, 'Student')),
    el('span', `status-pill is-${app.status}`, app.status)
  );
  card.append(head);

  const phone = profile.phone ? formatIndianMobile(profile.phone) : '-';
  card.append(
    el('p', 'admin-meta', `ID ${toText(profile.student_id, '-')} · ${phone} · applied ${formatDateTime(app.created_at, '-')}`)
  );

  card.append(field('Hostel / block', app.block_or_hostel));
  card.append(field('Usually free', app.availability_note));
  card.append(field('Why', app.reason));
  if (app.admin_note) {
    card.append(field('Admin note', app.admin_note));
  }

  if (app.status === 'pending') {
    const actions = el('div', 'admin-actions');
    actions.append(
      actionButton('Approve', 'is-approve', (button) => decide(app, 'approved', button)),
      actionButton('Reject', 'is-reject', (button) => decide(app, 'rejected', button))
    );
    card.append(actions);
  }
  return card;
}

async function decide(app, decision, button) {
  let note = null;
  if (decision === 'rejected') {
    note = window.prompt('Reason for rejection (optional, shown to the student):', '');
    if (note === null) {
      return; // admin cancelled
    }
    note = note.trim() || null;
  }
  button.disabled = true;
  const { error } = await tryCatch(
    () => reviewApplication(app.id, decision, note),
    { context: 'Reviewing application' }
  );
  if (error) {
    button.disabled = false;
    return;
  }
  showSuccess(decision === 'approved' ? 'Application approved.' : 'Application rejected.');
  await loadApplications();
}

async function loadApplications() {
  clear(appsList);
  appsEmpty.hidden = true;
  const { data, error } = await tryCatch(() => listApplications(), { context: 'Loading applications' });
  if (error) {
    return;
  }
  // Pending first, then the rest (the query already sorts newest first within each).
  const ordered = data.slice().sort(
    (a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1)
  );
  if (ordered.length === 0) {
    appsEmpty.hidden = false;
    return;
  }
  ordered.forEach((app) => appsList.append(applicationCard(app)));
}

// ---- Partners ----
function partnerCard(row) {
  const card = el('article', 'admin-card');

  const head = el('div', 'admin-card-head');
  head.append(
    el('h3', 'admin-card-name', toText(row.full_name, 'Student')),
    el('span', `status-pill is-${row.delivery_status}`, row.delivery_status)
  );
  card.append(head);

  card.append(
    el('span',
      `online-dot ${row.delivery_available ? 'is-online' : 'is-offline'}`,
      row.delivery_available ? 'Online' : 'Offline')
  );

  const phone = row.phone ? formatIndianMobile(row.phone) : '-';
  card.append(el('p', 'admin-meta', `${toText(row.student_id, '-')} · ${phone}`));
  card.append(el('p', 'admin-counts', `Active: ${row.active_deliveries} · Completed: ${row.completed_deliveries}`));

  const actions = el('div', 'admin-actions');
  if (row.delivery_status === 'approved') {
    actions.append(
      actionButton('Suspend', 'is-reject', (button) => change(row, 'suspended', true, button)),
      actionButton('Revoke', 'is-reject', (button) => change(row, 'revoked', true, button))
    );
  } else if (row.delivery_status === 'suspended') {
    actions.append(
      actionButton('Reinstate', 'is-approve', (button) => change(row, 'approved', false, button)),
      actionButton('Revoke', 'is-reject', (button) => change(row, 'revoked', true, button))
    );
  }
  if (actions.childElementCount > 0) {
    card.append(actions);
  }
  return card;
}

async function change(row, newStatus, noteRequired, button) {
  let note;
  if (noteRequired) {
    const active = Number(row.active_deliveries) || 0;
    const warn = active > 0
      ? `This partner has ${active} active delivery(ies) and can still finish them. `
      : '';
    note = window.prompt(`${warn}Reason (required):`, '');
    if (note === null) {
      return;
    }
    note = note.trim();
    if (!note) {
      showError('A reason is required.');
      return;
    }
  } else {
    note = window.prompt('Note (optional):', '');
    if (note === null) {
      return;
    }
    note = note.trim() || null;
  }
  button.disabled = true;
  const { error } = await tryCatch(
    () => setDeliveryStatus(row.user_id, newStatus, note),
    { context: 'Updating delivery access' }
  );
  if (error) {
    button.disabled = false;
    return;
  }
  showSuccess('Delivery access updated.');
  await loadPartners();
}

async function loadPartners() {
  clear(partnersList);
  partnersEmpty.hidden = true;
  const { data, error } = await tryCatch(() => listPartners(), { context: 'Loading partners' });
  if (error) {
    return;
  }
  if (!data || data.length === 0) {
    partnersEmpty.hidden = false;
    return;
  }
  data.forEach((row) => partnersList.append(partnerCard(row)));
}

function actionButton(label, variant, handler) {
  const button = el('button', `admin-btn ${variant}`, label);
  button.type = 'button';
  button.addEventListener('click', () => handler(button));
  return button;
}

// ---- Xerox pricing ----
function xeroxCard(order) {
  const req = Array.isArray(order.xerox_requests) ? order.xerox_requests[0] : order.xerox_requests;
  const card = el('article', 'admin-card');
  const head = el('div', 'admin-card-head');
  head.append(
    el('h3', 'admin-card-name', toText(order.customer_name, 'Student')),
    el('span', 'status-pill is-pending', 'needs price')
  );
  card.append(head);
  card.append(el('p', 'admin-meta', `${toText(order.delivery_location, '-')} · ${formatDateTime(order.created_at, '-')}`));
  if (req) {
    card.append(field('File', req.original_file_name));
    card.append(field('Print', `${req.print_type}, ${req.print_sides}, ${req.paper_size}, ${req.copies} copies`));
    if (req.instructions) card.append(field('Notes', req.instructions));
  }
  const actions = el('div', 'admin-actions');
  const view = el('button', 'admin-btn is-approve', 'View PDF');
  view.type = 'button';
  view.addEventListener('click', () => openPdf(req && req.file_path, view));
  const price = document.createElement('input');
  price.type = 'number'; price.min = '0'; price.step = '1';
  price.className = 'admin-price'; price.placeholder = 'Price';
  const confirm = el('button', 'admin-btn is-approve', 'Confirm price');
  confirm.type = 'button';
  confirm.addEventListener('click', () => doConfirm(order, price, confirm));
  actions.append(view, price, confirm);
  card.append(actions);
  return card;
}

async function openPdf(path, button) {
  if (!path) { showError('No file on this order.'); return; }
  button.disabled = true;
  const { data, error } = await tryCatch(() => xeroxFileUrl(path), { context: 'Opening file' });
  button.disabled = false;
  if (error) return;
  window.open(data, '_blank', 'noopener');
}

async function doConfirm(order, input, button) {
  const amount = Number(input.value);
  if (!Number.isFinite(amount) || amount < 0) { showError('Enter a valid amount.'); input.focus(); return; }
  button.disabled = true;
  const { error } = await tryCatch(() => confirmXeroxPrice(order.id, amount), { context: 'Confirming price' });
  if (error) { button.disabled = false; return; }
  showSuccess('Price confirmed.');
  await loadXerox();
}

async function loadXerox() {
  clear(xeroxList);
  xeroxEmpty.hidden = true;
  const { data, error } = await tryCatch(() => listXeroxPending(), { context: 'Loading Xerox orders' });
  if (error) return;
  if (!data || data.length === 0) { xeroxEmpty.hidden = false; return; }
  data.forEach((order) => xeroxList.append(xeroxCard(order)));
}

// ---- Medicine approval ----
function medicineCard(row) {
  const order = row.orders || {};
  const card = el('article', 'admin-card');
  const head = el('div', 'admin-card-head');
  head.append(
    el('h3', 'admin-card-name', toText(order.customer_name, 'Student')),
    el('span', 'status-pill is-pending', 'pending')
  );
  card.append(head);
  card.append(el('p', 'admin-meta', `${toText(order.delivery_location, '-')} · ${formatDateTime(order.created_at, '-')}`));
  card.append(field('Request', row.tablet_request));
  const actions = el('div', 'admin-actions');
  actions.append(
    actionButton('Approve', 'is-approve', (button) => decideMed(row, 'approved', button)),
    actionButton('Reject', 'is-reject', (button) => decideMed(row, 'rejected', button))
  );
  card.append(actions);
  return card;
}

async function decideMed(row, decision, button) {
  let note = null;
  if (decision === 'rejected') {
    note = window.prompt('Reason (optional, shown to the student):', '');
    if (note === null) return;
    note = note.trim() || null;
  }
  button.disabled = true;
  const { error } = await tryCatch(
    () => reviewInfirmary(row.order_id, decision, note),
    { context: 'Reviewing request' }
  );
  if (error) { button.disabled = false; return; }
  showSuccess(decision === 'approved' ? 'Request approved.' : 'Request rejected (order cancelled).');
  await loadMedicine();
}

async function loadMedicine() {
  clear(medicineList);
  medicineEmpty.hidden = true;
  const { data, error } = await tryCatch(() => listInfirmaryPending(), { context: 'Loading medicine requests' });
  if (error) return;
  if (!data || data.length === 0) { medicineEmpty.hidden = false; return; }
  data.forEach((row) => medicineList.append(medicineCard(row)));
}

// ---- Shared edit-row helper ----
function editRow(card, label, type, value) {
  const wrap = el('label', 'admin-edit');
  wrap.append(el('span', 'admin-edit-label', label));
  const input = document.createElement('input');
  input.type = type;
  if (type === 'number') {
    input.step = '1';
    if (label === 'Delivery fee' || label === 'Price') input.min = '0';
  }
  input.value = (value === null || value === undefined) ? '' : String(value);
  wrap.append(input);
  card.append(wrap);
  return input;
}

// ---- Shops ----
function shopCard(shop) {
  const card = el('article', 'admin-card');
  const head = el('div', 'admin-card-head');
  head.append(
    el('h3', 'admin-card-name', toText(shop.name, 'Shop')),
    el('span', `status-pill is-${shop.is_active ? 'approved' : 'suspended'}`, shop.is_active ? 'active' : 'hidden')
  );
  card.append(head);
  card.append(el('p', 'admin-meta', `${toText(shop.slug, '-')} · ${toText(shop.category, '-')} · ${shop.is_open ? 'Open' : 'Closed'}`));

  const inputs = {
    name: editRow(card, 'Name', 'text', shop.name),
    description: editRow(card, 'Description', 'text', shop.description),
    location: editRow(card, 'Location', 'text', shop.location),
    opening_hours: editRow(card, 'Opening hours', 'text', shop.opening_hours),
    delivery_fee: editRow(card, 'Delivery fee', 'number', shop.delivery_fee),
    sort_order: editRow(card, 'Sort order', 'number', shop.sort_order)
  };

  const actions = el('div', 'admin-actions');
  const saveBtn = el('button', 'admin-btn is-approve', 'Save');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', () => saveShop(shop, inputs, saveBtn));
  const openBtn = el('button', 'admin-btn is-approve', shop.is_open ? 'Set Closed' : 'Set Open');
  openBtn.type = 'button';
  openBtn.addEventListener('click', () => toggleShop(shop, 'is_open', !shop.is_open, openBtn));
  const activeBtn = el('button', `admin-btn ${shop.is_active ? 'is-reject' : 'is-approve'}`, shop.is_active ? 'Hide' : 'Show');
  activeBtn.type = 'button';
  activeBtn.addEventListener('click', () => toggleShop(shop, 'is_active', !shop.is_active, activeBtn));
  actions.append(saveBtn, openBtn, activeBtn);
  card.append(actions);
  return card;
}

async function saveShop(shop, inputs, button) {
  const name = inputs.name.value.trim();
  if (!name) { showError('Name cannot be empty.'); return; }
  const fee = Number(inputs.delivery_fee.value);
  if (!Number.isFinite(fee) || fee < 0) { showError('Delivery fee must be 0 or more.'); return; }
  const patch = {
    name,
    description: inputs.description.value.trim() || null,
    location: inputs.location.value.trim() || null,
    opening_hours: inputs.opening_hours.value.trim() || null,
    delivery_fee: fee,
    sort_order: Math.trunc(Number(inputs.sort_order.value) || 0)
  };
  button.disabled = true;
  const { error } = await tryCatch(() => updateShop(shop.id, patch), { context: 'Saving shop' });
  if (error) { button.disabled = false; return; }
  showSuccess('Shop saved.');
  await loadShops();
}

async function toggleShop(shop, fieldName, value, button) {
  button.disabled = true;
  const { error } = await tryCatch(() => updateShop(shop.id, { [fieldName]: value }), { context: 'Updating shop' });
  if (error) { button.disabled = false; return; }
  showSuccess('Shop updated.');
  await loadShops();
}

async function loadShops() {
  clear(shopsList);
  shopsEmpty.hidden = true;
  const { data, error } = await tryCatch(() => listAllShops(), { context: 'Loading shops' });
  if (error) return;
  shopsCache = data || [];
  if (shopsCache.length === 0) {
    shopsEmpty.hidden = false;
  } else {
    shopsCache.forEach((shop) => shopsList.append(shopCard(shop)));
  }
  populateShopSelect();
}

if (addShopForm) addShopForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('shop-new-name').value.trim();
  const slug = document.getElementById('shop-new-slug').value.trim().toLowerCase();
  const category = document.getElementById('shop-new-category').value;
  const fee = Number(document.getElementById('shop-new-fee').value);
  const sort = Math.trunc(Number(document.getElementById('shop-new-sort').value) || 0);
  const desc = document.getElementById('shop-new-desc').value.trim();
  if (name.length < 2) { showError('Enter a shop name.'); return; }
  if (!/^[a-z0-9-]+$/.test(slug)) { showError('Slug can use only lowercase letters, numbers and hyphens.'); return; }
  if (!Number.isFinite(fee) || fee < 0) { showError('Delivery fee must be 0 or more.'); return; }
  const button = addShopForm.querySelector('button');
  button.disabled = true;
  const { error } = await tryCatch(
    () => createShop({ name, slug, category, description: desc || null, delivery_fee: fee, sort_order: sort }),
    { context: 'Adding shop' }
  );
  button.disabled = false;
  if (error) return;
  showSuccess('Shop added.');
  addShopForm.reset();
  await loadShops();
});

// ---- Products ----
function populateShopSelect() {
  const previous = productShopSelect.value;
  clear(productShopSelect);
  shopsCache.forEach((shop) => {
    const option = document.createElement('option');
    option.value = shop.id;
    option.textContent = shop.name;
    productShopSelect.append(option);
  });
  if (previous) productShopSelect.value = previous;
}

if (productShopSelect) productShopSelect.addEventListener('change', loadProducts);


function productCard(product) {
  const card = el('article', 'admin-card');
  const head = el('div', 'admin-card-head');
  head.append(
    el('h3', 'admin-card-name', toText(product.name, 'Item')),
    el('span', `status-pill is-${product.is_active ? 'approved' : 'suspended'}`, product.is_active ? 'active' : 'hidden')
  );
  card.append(head);

  const inputs = {
    name: editRow(card, 'Name', 'text', product.name),
    category: editRow(card, 'Category', 'text', product.category),
    price: editRow(card, 'Price', 'number', product.price),
    emoji: editRow(card, 'Emoji', 'text', product.emoji),
    sort_order: editRow(card, 'Sort order', 'number', product.sort_order)
  };

  const actions = el('div', 'admin-actions');
  const saveBtn = el('button', 'admin-btn is-approve', 'Save');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', () => saveProduct(product, inputs, saveBtn));
  const availBtn = el('button', `admin-btn ${product.is_available ? 'is-reject' : 'is-approve'}`, product.is_available ? 'Mark out of stock' : 'Mark available');
  availBtn.type = 'button';
  availBtn.addEventListener('click', () => toggleProduct(product, 'is_available', !product.is_available, availBtn));
  const activeBtn = el('button', `admin-btn ${product.is_active ? 'is-reject' : 'is-approve'}`, product.is_active ? 'Hide' : 'Show');
  activeBtn.type = 'button';
  activeBtn.addEventListener('click', () => toggleProduct(product, 'is_active', !product.is_active, activeBtn));
  actions.append(saveBtn, availBtn, activeBtn);
  card.append(actions);
  return card;
}

async function saveProduct(product, inputs, button) {
  const name = inputs.name.value.trim();
  if (!name) { showError('Name cannot be empty.'); return; }
  const price = Number(inputs.price.value);
  if (!Number.isFinite(price) || price < 0) { showError('Price must be 0 or more.'); return; }
  const patch = {
    name,
    category: inputs.category.value.trim() || null,
    price,
    emoji: inputs.emoji.value.trim() || null,
    sort_order: Math.trunc(Number(inputs.sort_order.value) || 0)
  };
  button.disabled = true;
  const { error } = await tryCatch(() => updateProduct(product.id, patch), { context: 'Saving product' });
  if (error) { button.disabled = false; return; }
  showSuccess('Product saved.');
  await loadProducts();
}

async function toggleProduct(product, fieldName, value, button) {
  button.disabled = true;
  const { error } = await tryCatch(() => updateProduct(product.id, { [fieldName]: value }), { context: 'Updating product' });
  if (error) { button.disabled = false; return; }
  showSuccess('Product updated.');
  await loadProducts();
}

async function loadProducts() {
  const shopId = productShopSelect.value;
  clear(productsList);
  productsEmpty.hidden = true;
  if (!shopId) {
    productsEmpty.textContent = 'Add a shop first.';
    productsEmpty.hidden = false;
    addProductForm.hidden = true;
    return;
  }
  addProductForm.hidden = false;
  const { data, error } = await tryCatch(() => listShopProducts(shopId), { context: 'Loading products' });
  if (error) return;
  if (!data || data.length === 0) {
    productsEmpty.textContent = 'No products in this shop yet.';
    productsEmpty.hidden = false;
    return;
  }
  data.forEach((product) => productsList.append(productCard(product)));
}

addProductForm && addProductForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const shopId = productShopSelect.value;
  if (!shopId) { showError('Pick a shop first.'); return; }
  const name = document.getElementById('prod-new-name').value.trim();
  const category = document.getElementById('prod-new-category').value.trim();
  const price = Number(document.getElementById('prod-new-price').value);
  const emoji = document.getElementById('prod-new-emoji').value.trim();
  const sort = Math.trunc(Number(document.getElementById('prod-new-sort').value) || 0);
  if (name.length < 2) { showError('Enter a product name.'); return; }
  if (!Number.isFinite(price) || price < 0) { showError('Price must be 0 or more.'); return; }
  const button = addProductForm.querySelector('button');
  button.disabled = true;
  const { error } = await tryCatch(
    () => createProduct({ shop_id: shopId, name, category: category || null, price, emoji: emoji || null, sort_order: sort }),
    { context: 'Adding product' }
  );
  button.disabled = false;
  if (error) return;
  showSuccess('Product added.');
  addProductForm.reset();
  await loadProducts();
});

// ---- Page start ----
const session = await requireLogin();

if (session) {
  const { data: profile } = await tryCatch(() => getMyProfile(), { context: 'Loading profile' });

  if (!profile || profile.role !== 'admin') {
    // The database would refuse every call anyway; this is just a friendly screen.
    gate.hidden = false;
    dashboard.hidden = true;
  } else {
    gate.hidden = true;
    dashboard.hidden = false;
    showTab('applications');
    await loadApplications();
    await loadPartners();
    await loadXerox();
    await loadMedicine();
    await loadShops();
    await loadProducts();
  }
}