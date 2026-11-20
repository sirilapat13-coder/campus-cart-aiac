// signup.js - makes signup.html work.

import {
  validateRequired,
  validateEmail,
  validateIndianMobile,
  showSuccess,
  showError,
  tryCatch
} from '../utils.js';
import { signUpStudent, redirectIfLoggedIn } from '../auth.js';

// If the student is already logged in, skip this page.
await redirectIfLoggedIn();

// Find the parts of the page we need.
const form = document.getElementById('signup-form');
const successBox = document.getElementById('signup-success');
const fullNameInput = document.getElementById('full-name');
const studentIdInput = document.getElementById('student-id');
const phoneInput = document.getElementById('phone');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirm-password');
const showPasswordBox = document.getElementById('show-password');
const signupButton = document.getElementById('signup-button');

// Student ID: 4 to 20 letters, numbers or dashes.
// If your roll numbers follow a different pattern, change it here.
const STUDENT_ID_PATTERN = /^[A-Za-z0-9-]{4,20}$/;
const MIN_PASSWORD_LENGTH = 8;

// Checks the student ID and returns { valid, message, value }.
function checkStudentId(value) {
  const required = validateRequired(value, 'Student ID');
  if (!required.valid) {
    return required;
  }
  if (!STUDENT_ID_PATTERN.test(required.value)) {
    return {
      valid: false,
      message: 'Student ID must be 4 to 20 letters or numbers.',
      value: null
    };
  }
  return { valid: true, message: '', value: required.value.toUpperCase() };
}

// Checks the password and the confirmation.
function checkPassword(password, confirm) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) {
    return 'The two passwords do not match.';
  }
  return '';
}

// "Show password" checkbox: affects both password boxes.
showPasswordBox.addEventListener('change', () => {
  const type = showPasswordBox.checked ? 'text' : 'password';
  passwordInput.type = type;
  confirmInput.type = type;
});

// Runs when the student clicks "Create account".
form.addEventListener('submit', async (event) => {
  event.preventDefault();

  // Each item is: [the check result, the box to highlight if it fails].
  const fullName = validateRequired(fullNameInput.value, 'Full name');
  const studentId = checkStudentId(studentIdInput.value);
  const phone = validateIndianMobile(phoneInput.value, 'Mobile number');
  const email = validateEmail(emailInput.value, 'Email');
  const passwordMessage = checkPassword(passwordInput.value, confirmInput.value);

  const checks = [
    [fullName, fullNameInput],
    [studentId, studentIdInput],
    [phone, phoneInput],
    [email, emailInput]
  ];

  // Show only the FIRST problem so the student fixes one thing at a time.
  const firstProblem = checks.find(([result]) => !result.valid);
  if (firstProblem) {
    showError(firstProblem[0].message);
    firstProblem[1].focus();
    return;
  }
  if (passwordMessage) {
    showError(passwordMessage);
    passwordInput.focus();
    return;
  }

  // Block double clicks while we wait for Supabase.
  signupButton.disabled = true;
  signupButton.textContent = 'Creating account...';

  const { data, error } = await tryCatch(
    () =>
      signUpStudent({
        fullName: fullName.value,
        studentId: studentId.value,
        phone: phone.value,
        email: email.value,
        password: passwordInput.value
      }),
    { context: 'Sign up' }
  );

  if (error) {
    signupButton.disabled = false;
    signupButton.textContent = 'Create account';
    return;
  }

  // If "Confirm email" is OFF, Supabase logs the student in straight away.
  if (data.session) {
    showSuccess('Account created! Welcome to Campus Cart.');
    window.location.replace('homepage.html');
    return;
  }

  // If "Confirm email" is ON, the student must click the link in their email first.
  form.hidden = true;
  successBox.hidden = false;
  showSuccess('Account created!');
});