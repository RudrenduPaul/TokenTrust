import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/cli.ts', // thin argv-parsing shim, covered indirectly by verify.test.ts
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
        // 95%+ on every verification-category file -- a wrong measurement
        // here is the exact failure mode this tool exists to catch in other
        // people's tools.
        'src/categories/tt01_compression_ratio.ts': {
          lines: 95,
          statements: 95,
          functions: 95,
          branches: 95,
        },
        'src/categories/tt02_cost_delta.ts': {
          lines: 95,
          statements: 95,
          functions: 95,
          branches: 95,
        },
        'src/categories/tt03_never_worse_guard.ts': {
          lines: 95,
          statements: 95,
          functions: 95,
          branches: 95,
        },
        'src/categories/tt04_cross_tool_benchmark.ts': {
          lines: 95,
          statements: 95,
          functions: 95,
          branches: 95,
        },
        'src/categories/tt05_version_drift.ts': {
          lines: 95,
          statements: 95,
          functions: 95,
          branches: 95,
        },
      },
    },
  },
});
