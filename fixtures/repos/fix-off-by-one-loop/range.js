/**
 * Sums every number in `values`.
 *
 * @param {number[]} values
 * @returns {number}
 */
function sumRange(values) {
  let total = 0;
  // Bug: `i < values.length - 1` skips the last element.
  for (let i = 0; i < values.length - 1; i++) {
    total += values[i];
  }
  return total;
}

module.exports = { sumRange };
