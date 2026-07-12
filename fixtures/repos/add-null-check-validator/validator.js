const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns true when `email` looks like a valid email address.
 *
 * Bug: passing null or undefined throws a TypeError from `.trim()` instead
 * of returning false like every other invalid-input case.
 *
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
  const trimmed = email.trim();
  if (trimmed.length === 0) return false;
  return EMAIL_PATTERN.test(trimmed);
}

module.exports = { validateEmail };
