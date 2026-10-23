// SPDX-License-Identifier: AGPL-3.0-only
// Block / Ignore uses Matrix's own ignore list (account data m.ignored_user_list): the server stops sending you the
// person's messages and invites on every device, in Element too. The app also hides what was already loaded.
import { useCallback, useEffect, useState } from "react";
import { ClientEvent, EventType, type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";

export function useIgnoredUsers(client: MatrixClient): {
    ignored: string[];
    setIgnored: (userId: string, ignored: boolean) => Promise<void>;
} {
    const [ignored, setIgnoredState] = useState<string[]>(() => client.getIgnoredUsers());
    useEffect(() => {
        const onAccountData = (event: MatrixEvent): void => {
            if (event.getType() === EventType.IgnoredUserList) setIgnoredState(client.getIgnoredUsers());
        };
        client.on(ClientEvent.AccountData, onAccountData);
        return () => {
            client.removeListener(ClientEvent.AccountData, onAccountData);
        };
    }, [client]);
    const setIgnored = useCallback(
        async (userId: string, ignore: boolean): Promise<void> => {
            const current = client.getIgnoredUsers();
            const next = ignore ? Array.from(new Set([...current, userId])) : current.filter((id) => id !== userId);
            await client.setIgnoredUsers(next);
            setIgnoredState(next);
        },
        [client],
    );
    return { ignored, setIgnored };
}
