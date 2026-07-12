// Inconsistent naming: some values are snake_case, some are camelCase, for
// the same kind of config value. Rename everything to camelCase.
const max_retries = 3;
const retryDelayMs = 250;
const api_timeout_ms = 5000;
const cacheTtlSeconds = 60;
const default_page_size = 25;

function buildConfig(overrides = {}) {
  return {
    max_retries,
    retryDelayMs,
    api_timeout_ms,
    cacheTtlSeconds,
    default_page_size,
    ...overrides,
  };
}

module.exports = { buildConfig };
