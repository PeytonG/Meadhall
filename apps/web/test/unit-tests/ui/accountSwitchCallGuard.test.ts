// SPDX-License-Identifier: AGPL-3.0-only
// Switching accounts reloads the app, so during a call it asks first; "Cancel" keeps the call and the account.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const switchToAccount = vi.fn(async () => undefined);
vi.mock("../../../src/core/storage/accounts", () => ({
    addingAccountFrom: () => null,
    loadVault: async () => [],
    startAddingAccount: vi.fn(async () => undefined),
    switchToAccount,
}));

const { addAccount, setInCallForSwitching, switchAccount } = await import("../../../src/ui/accounts/accountSwitching");

describe("switching accounts during a call", () => {
    const stopClient = vi.fn();
    const client = { stopClient, getUserId: () => "@me:example.org", getUser: () => null } as never;
    let reload: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        reload = vi.fn();
        Object.defineProperty(window, "location", { value: { reload }, configurable: true });
        switchToAccount.mockClear();
        stopClient.mockClear();
    });
    afterEach(() => {
        setInCallForSwitching(false);
        vi.restoreAllMocks();
    });

    it("switches straight away when not in a call", async () => {
        const confirm = vi.spyOn(window, "confirm");
        await switchAccount(client, "@other:example.org");
        expect(confirm).not.toHaveBeenCalled();
        expect(switchToAccount).toHaveBeenCalled();
        expect(reload).toHaveBeenCalled();
    });

    it("asks during a call, and Cancel keeps everything as it was", async () => {
        setInCallForSwitching(true);
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
        await switchAccount(client, "@other:example.org");
        await addAccount(client);
        expect(confirm).toHaveBeenCalledTimes(2);
        expect(String(confirm.mock.calls[0]?.[0])).toContain("ends your call");
        expect(stopClient).not.toHaveBeenCalled();
        expect(switchToAccount).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
    });

    it("switches during a call when confirmed", async () => {
        setInCallForSwitching(true);
        vi.spyOn(window, "confirm").mockReturnValue(true);
        await switchAccount(client, "@other:example.org");
        expect(stopClient).toHaveBeenCalled();
        expect(switchToAccount).toHaveBeenCalled();
    });
});
