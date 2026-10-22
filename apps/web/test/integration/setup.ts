// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, beforeAll } from "vitest";
import { logger } from "matrix-js-sdk/src/logger";

import { SYNAPSE_URL, stopAllClients } from "./support/synapse";

// The SDK logs every sync at debug level; keep test output readable.
logger.setLevel("warn");

beforeAll(async () => {
    const response = await fetch(`${SYNAPSE_URL}/health`).catch(() => null);
    if (!response?.ok) {
        throw new Error(`No Synapse at ${SYNAPSE_URL}. Start one with: node scripts/test-synapse.mjs start`);
    }
});

afterEach(() => {
    stopAllClients();
});
