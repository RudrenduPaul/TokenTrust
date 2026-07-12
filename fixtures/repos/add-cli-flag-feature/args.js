// Small hand-rolled argument parser. It currently understands --name and
// --output but has no --verbose flag -- add one that sets result.verbose =
// true when present, defaulting to false.

function parseArgs(argv) {
  const result = { name: null, output: null };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--name') {
      result.name = argv[++i];
    } else if (arg === '--output') {
      result.output = argv[++i];
    }
  }

  return result;
}

module.exports = { parseArgs };
