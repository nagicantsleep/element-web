/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

/**
 * Friends / social graph (LINE-style), client-side only (ADR 0015).
 *
 * State lives in the user's own global account data:
 *  - `m.friend_list`      : accepted friends
 *  - `m.friend_requests`  : pending requests (incoming and outgoing)
 *
 * A request is delivered as an ordinary DM message event with a well-known
 * content marker, so the receiving fork's client can surface it; accepting
 * writes both parties into their own friend lists. Because the platform
 * ships its own clients on every surface, this client-authoritative model is
 * sufficient; a server-enforced graph is a later extension.
 */

export const FRIENDS_EVENT_TYPE = "m.friend_list";
export const FRIEND_REQUESTS_EVENT_TYPE = "m.friend_requests";
/** Content marker of a friend-request message inside a DM. */
export const FRIEND_REQUEST_MSGTYPE = "m.friend_request";

export interface FriendEntry {
    user_id: string;
    /** chosen display name at add time, informational only */
    display_name?: string;
    added_at: number;
}

export interface FriendRequest {
    user_id: string;
    display_name?: string;
    /** "in" = someone asked me, "out" = I asked them */
    direction: "in" | "out";
    created_at: number;
}

function readEvent(client: MatrixClient, type: string): Record<string, unknown> {
    const event = (client.getAccountData as unknown as (t: string) => { getContent?: () => Record<string, unknown> } | null)(type);
    return event?.getContent?.() ?? {};
}

async function writeEvent(client: MatrixClient, type: string, content: Record<string, unknown>): Promise<void> {
    await (client.setAccountData as unknown as (t: string, c: Record<string, unknown>) => Promise<void>)(
        type, content,
    );
}

export function getFriends(client: MatrixClient): FriendEntry[] {
    const content = readEvent(client, FRIENDS_EVENT_TYPE);
    return Object.values(content) as unknown as FriendEntry[];
}

export function getFriendRequests(client: MatrixClient): { incoming: FriendRequest[]; outgoing: FriendRequest[] } {
    const all = readEvent(client, FRIEND_REQUESTS_EVENT_TYPE) as Record<string, FriendRequest>;
    const requests = Object.values(all);
    return {
        incoming: requests.filter((r) => r.direction === "in"),
        outgoing: requests.filter((r) => r.direction === "out"),
    };
}

function upsert(client: MatrixClient, type: string, key: string, value: unknown): Promise<void> {
    const content = readEvent(client, type);
    content[key] = value;
    return writeEvent(client, type, content);
}

export async function addFriend(client: MatrixClient, userId: string, displayName?: string): Promise<void> {
    await upsert(client, FRIENDS_EVENT_TYPE, userId, {
        user_id: userId,
        display_name: displayName,
        added_at: Date.now(),
    } satisfies FriendEntry);
    // Remove any pending request entries in both directions.
    const requests = readEvent(client, FRIEND_REQUESTS_EVENT_TYPE);
    if (requests[userId]) {
        delete requests[userId];
        await writeEvent(client, FRIEND_REQUESTS_EVENT_TYPE, requests);
    }
}

export async function removeFriend(client: MatrixClient, userId: string): Promise<void> {
    const content = readEvent(client, FRIENDS_EVENT_TYPE);
    if (content[userId]) {
        delete content[userId];
        await writeEvent(client, FRIENDS_EVENT_TYPE, content);
    }
}

export async function rememberRequest(client: MatrixClient, request: FriendRequest): Promise<void> {
    await upsert(client, FRIEND_REQUESTS_EVENT_TYPE, request.user_id, request);
}

/** Send a friend request over an existing DM (or a newly created one). */
export async function sendFriendRequest(
    client: MatrixClient,
    targetUserId: string,
    displayName?: string,
): Promise<void> {
    const roomId = await ensureDmRoom(client, targetUserId);
    await (client.sendEvent as unknown as (roomId: string, type: string, content: Record<string, unknown>) => Promise<unknown>)(
        roomId, "m.room.message", { msgtype: FRIEND_REQUEST_MSGTYPE, body: "👋 Friend request" },
    );
    await rememberRequest(client, {
        user_id: targetUserId,
        display_name: displayName,
        direction: "out",
        created_at: Date.now(),
    });
}

async function ensureDmRoom(client: MatrixClient, userId: string): Promise<string> {
    // Reuse the m.direct map semantics: find an existing DM or create one.
    const direct = readEvent(client, "m.direct") as unknown as Record<string, string[]>;
    const existing = direct[userId] || [];
    for (const roomId of existing) {
        const room = client.getRoom(roomId);
        if (room && room.getMyMembership() === "join") return roomId;
    }
    const { room_id } = await client.createRoom({
        is_direct: true,
        preset: "trusted_private_chat" as never,
        invite: [userId],
    });
    direct[userId] = [room_id, ...existing];
    await (client.setAccountData as unknown as (t: string, c: Record<string, unknown>) => Promise<void>)(
        "m.direct", direct,
    );
    return room_id;
}

/**
 * Handle a friend-request message seen in a timeline: record it as incoming.
 * Called from the message pipeline; idempotent.
 */
export function observeFriendRequest(client: MatrixClient, event: MatrixEvent): void {
    try {
        const content = event.getContent() as { msgtype?: string; body?: string };
        if (content.msgtype !== FRIEND_REQUEST_MSGTYPE) return;
        const sender = event.getSender();
        if (!sender || sender === client.getSafeUserId()) return;
        const requests = readEvent(client, FRIEND_REQUESTS_EVENT_TYPE);
        if (requests[sender]) return; // already known
        void rememberRequest(client, {
            user_id: sender,
            direction: "in",
            created_at: event.getTs(),
        }).catch((err) => logger.warn("observeFriendRequest failed", err));
    } catch (err) {
        logger.warn("observeFriendRequest failed", err);
    }
}