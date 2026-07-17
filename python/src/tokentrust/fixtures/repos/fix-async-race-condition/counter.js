// Bug: incrementCounter() reads `count`, awaits an unrelated async tick,
// then writes `count + 1` -- under concurrent calls, two increments can
// both read the same starting value and one update gets lost.

let count = 0;

async function incrementCounter() {
  const current = count;
  await Promise.resolve(); // simulates an async boundary (e.g. a DB round-trip)
  count = current + 1;
  return count;
}

function getCount() {
  return count;
}

function resetCounter() {
  count = 0;
}

module.exports = { incrementCounter, getCount, resetCounter };
