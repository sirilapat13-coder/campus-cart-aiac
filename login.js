// login.js - makes login.html work.

import { validateEmail, validateRequired, showSuccess, showError, tryCatch } from '../utils.js';
import { signIn, redirectIfLoggedIn, getNextPage } from '../auth.js';

// If the student is already logged in, skip this page.
await redirectIfLoggedIn();

// Find the parts of the page we need.
const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const showPasswordBox = document.getElementById('show-password');
const loginButton = document.getElementById('login-button');

// "Show password" checkbox: switches the box between dots and plain text.
showPasswordBox.addEventListener('change', () => {
  passwordInput.type = showPasswordBox.checked ? 'text' : 'password';
});

// Runs when the student clicks "Log in" or presses Enter.
form.addEventListener('submit', async (event) => {
  // Stops the browser from reloading the page.
  event.preventDefault();

  // Check the two fields.
  const emailResult = validateEmail(emailInput.value, 'Email');
  if (!emailResult.valid) {
    showError(emailResult.message);
    emailInput.focus();
    return;
  }
  const passwordResult = validateRequired(passwordInput.value, 'Password');
  if (!passwordResult.valid) {
    showError(passwordResult.message);
    passwordInput.focus();
    return;
  }

  // Block double clicks while we wait for Supabase.
  loginButton.disabled = true;
  loginButton.textContent = 'Logging in...';

  // tryCatch shows a friendly red message if something goes wrong.
  const { error } = await tryCatch(
    () => signIn(emailResult.value, passwordInput.value),
    { context: 'Login' }
  );

  if (error) {
    loginButton.disabled = false;
    loginButton.textContent = 'Log in';
    return;
  }

  showSuccess('Logged in!');
  window.location.replace(getNextPage());
});