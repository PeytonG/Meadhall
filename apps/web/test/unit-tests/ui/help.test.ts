// SPDX-License-Identifier: AGPL-3.0-only
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseHelp } from "../../../src/ui/help/HelpDialog";

const HELP = fs.readFileSync(path.resolve(__dirname, "../../../../../docs/help/meadhall-help.md"), "utf8");

describe("help", () => {
    it("splits the help file into categories and questions", () => {
        const categories = parseHelp(HELP);
        expect(categories.length).toBeGreaterThanOrEqual(8);
        for (const category of categories) {
            expect(category.topics.length).toBeGreaterThan(0);
            for (const topic of category.topics) expect(topic.body.length).toBeGreaterThan(10);
        }
        expect(categories.flatMap((category) => category.topics).some((topic) => topic.question === "How do I add a friend?")).toBe(true);
    });
});
