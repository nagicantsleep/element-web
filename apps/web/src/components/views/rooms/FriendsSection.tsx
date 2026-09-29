/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import React, { useEffect, useMemo, useState } from "react";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";


import { _t } from "../../../languageHandler";
import dis from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import AccessibleButton from "../elements/AccessibleButton";
import BaseAvatar from "../avatars/BaseAvatar";
import {
    addFriend,
    getFriendRequests,
    getFriends,
    removeFriend,
    sendFriendRequest,
    type FriendEntry,
} from "../../../prod/Friends";
import { MatrixClientPeg } from "../../../MatrixClientPeg";

/**
 * Friends section above the room list (Z/L social layer, ADR 0015).
 * State is per-user global account data; requests travel as DM messages.
 */
export function FriendsSection(): React.JSX.Element {
    const client = MatrixClientPeg.safeGet() as MatrixClient;
    const [collapsed, setCollapsed] = useState(false);
    const [friends, setFriends] = useState<FriendEntry[]>([]);
    const [incoming, setIncoming] = useState<string[]>([]);
    const [searchText, setSearchText] = useState("");
    const [searchResults, setSearchResults] = useState<{ userId: string; displayName?: string }[]>([]);

    const refresh = (): void => {
        if (!client) return;
        setFriends(getFriends(client));
        setIncoming(getFriendRequests(client).incoming.map((r) => r.user_id));
    };

    useEffect(refresh, [client]);
    // Refresh when account data changes (own writes) and on sync (remote writes).
    (client as unknown as { on: (e: string, h: () => void) => void }).on("accountData", refresh);
    const ownStore = client ? MatrixClientPeg.get() : null;
    useEffect(() => {
        if (!ownStore) return undefined;
        (ownStore as unknown as { on: (e: string, h: () => void) => void }).on("sync", refresh);
        return () => {
            (ownStore as unknown as { off: (e: string, h: () => void) => void }).off("sync", refresh);
        };
    }, [ownStore]);

    const openDm = (userId: string): void => {
        dis.dispatch({
            action: Action.ViewStartChatOrReuse,
            userId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
    };

    const results = useMemo(() => {
        if (!searchText.trim()) return [];
        const q = searchText.trim().toLowerCase();
        return searchResults.filter(
            (r) => !friends.some((f) => f.user_id === r.userId) && r.userId.toLowerCase().includes(q),
        );
    }, [searchText, searchResults, friends]);

    const onSearch = async (): Promise<void> => {
        if (!searchText.trim()) {
            setSearchResults([]);
            return;
        }
        try {
            const response = (await client.searchUserDirectory({
                term: searchText.trim(),
                limit: 10,
            })) as { results?: { user_id: string; display_name?: string }[] };
            setSearchResults(
                (response.results || []).map((r) => ({ userId: r.user_id, displayName: r.display_name })),
            );
        } catch {
            setSearchResults([]);
        }
    };

    return (
        <section className="mx_FriendsSection" aria-label={_t("translation|friends")}>
            <header className="mx_FriendsSection_header">
                <h2>{_t("translation|friends")}</h2>
                <div>
                    <AccessibleButton
                        kind="link_inline"
                        onClick={() => {
                            if (!searchText && !results.length) {
                                // Seed the user-directory search box with an empty query.
                                void onSearch();
                            }
                            setCollapsed((c) => !c);
                        }}
                    >
                        {collapsed ? "+" : "–"}
                    </AccessibleButton>
                </div>
            </header>

            <input
                className="mx_FriendsSection_search"
                placeholder={_t("translation|add_friend")}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") void onSearch();
                }}
            />

            {results.map((r) => (
                <div key={r.userId} className="mx_FriendsSection_row">
                    <BaseAvatar
                        name={r.displayName || r.userId}
                        idName={r.userId}
                        size="24px"
                    />
                    <span className="mx_FriendsSection_name">{r.displayName || r.userId}</span>
                    <AccessibleButton
                        kind="link_inline"
                        onClick={async () => {
                            await sendFriendRequest(client, r.userId, r.displayName);
                            await onSearch();
                        }}
                    >
                        {_t("translation|add_friend")}
                    </AccessibleButton>
                </div>
            ))}

            {!collapsed ? (
                <>
                    {incoming.map((userId) => (
                        <div key={userId} className="mx_FriendsSection_row">
                            <BaseAvatar name={userId} idName={userId} size="24px" />
                            <span className="mx_FriendsSection_name">{userId}</span>
                            <AccessibleButton
                                kind="link_inline"
                                onClick={async () => {
                                    await addFriend(client, userId);
                                    refresh();
                                }}
                            >
                                {_t("translation|accept")}
                            </AccessibleButton>
                        </div>
                    ))}
                    {friends.map((friend) => (
                        <div key={friend.user_id} className="mx_FriendsSection_row">
                            <BaseAvatar name={friend.display_name || friend.user_id} idName={friend.user_id} size="24px" />
                            <button
                                className="mx_FriendsSection_name"
                                onClick={() => openDm(friend.user_id)}
                            >
                                {friend.display_name || friend.user_id}
                            </button>
                            <AccessibleButton
                                kind="link_inline"
                                onClick={async () => {
                                    await removeFriend(client, friend.user_id);
                                    refresh();
                                }}
                            >
                                ×
                            </AccessibleButton>
                        </div>
                    ))}
                </>
            ) : null}
        </section>
    );
}

export default FriendsSection;
