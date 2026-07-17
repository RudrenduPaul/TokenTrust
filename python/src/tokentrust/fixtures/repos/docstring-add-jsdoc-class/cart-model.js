// ShoppingCart has no JSDoc on any of its public methods -- add parameter
// and return-value documentation for each one.
class ShoppingCart {
  constructor() {
    this.items = [];
  }

  addItem(sku, price, qty) {
    this.items.push({ sku, price, qty });
  }

  removeItem(sku) {
    this.items = this.items.filter((item) => item.sku !== sku);
  }

  getTotal() {
    return this.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  }

  isEmpty() {
    return this.items.length === 0;
  }
}

module.exports = { ShoppingCart };
