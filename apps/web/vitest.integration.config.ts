import { defineConfig } from "vitest/config";

// Integration tests run against a real Synapse: start one with `node scripts/test-synapse.mjs start`.
export default defineConfig({
    test: {
        globals: false,
        environment: "node",
        setupFiles: ["./test/integration/setup.ts"],
        include: ["test/integration/**/*.integration.test.ts"],
        testTimeout: 90_000,
        hookTimeout: 90_000,
        fileParallelism: false,
        // The SDK's per-room loggers are chatty; only show output for failing tests.
        silent: "passed-only",
    },
});
