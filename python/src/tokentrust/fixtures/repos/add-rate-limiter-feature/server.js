const http = require('node:http');

// TODO: this handler has no protection against a client hammering it with
// requests. Add a rateLimit(maxRequests, windowMs) middleware that tracks
// requests per client IP and responds 429 once the limit is exceeded within
// the current window.
function handleRequest(req, res) {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404);
  res.end();
}

const server = http.createServer(handleRequest);

module.exports = { server, handleRequest };
