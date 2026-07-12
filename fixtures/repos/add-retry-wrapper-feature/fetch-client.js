// fetchData() occasionally fails against a flaky upstream service, and
// callers currently have to handle retries themselves ad hoc. Add a
// withRetry(fn, maxAttempts) helper that retries a failing async function
// with exponential backoff, and use it to wrap fetchData().

async function fetchData(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`);
  }
  return response.json();
}

module.exports = { fetchData };
