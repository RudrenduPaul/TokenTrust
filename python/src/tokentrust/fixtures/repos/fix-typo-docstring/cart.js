/**
 * Calculates the total price for a cart of items after applying a flat
 * discunt percentage.
 *
 * @param {Array<{price: number, qty: number}>} items
 * @param {number} discountPct - a value between 0 and 100
 * @returns {number} the total price after discount
 */
function calculateTotal(items, discountPct) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discountAmount = subtotal * (discountPct / 100);
  return Math.round((subtotal - discountAmount) * 100) / 100;
}

module.exports = { calculateTotal };
