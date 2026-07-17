const express = require('express');
const router = express.Router();

// The pricing calculation below is inlined directly in the route handler --
// it should be extracted into a calculatePricing() function in a new
// pricing-service.js file so it can be tested and reused independently of
// the HTTP layer.
router.post('/checkout', (req, res) => {
  const { items, couponCode } = req.body;

  let subtotal = 0;
  for (const item of items) {
    subtotal += item.price * item.qty;
  }

  let discount = 0;
  if (couponCode === 'SAVE10') {
    discount = subtotal * 0.1;
  } else if (couponCode === 'SAVE20') {
    discount = subtotal * 0.2;
  }

  const tax = (subtotal - discount) * 0.0825;
  const total = subtotal - discount + tax;

  res.json({ subtotal, discount, tax, total: Math.round(total * 100) / 100 });
});

module.exports = router;
