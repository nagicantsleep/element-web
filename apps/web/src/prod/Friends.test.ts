/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    addFriend,
    getFriendRequests,
    getFriends,
    removeFriend,
    sendFriendRequest,
} from "./Friends";

function fakeClient(accountData: Record<string, object> = {}) {
    return {
        getAccountData: (type: string) =>
            accountData[type] ? { getContent: () => accountData[type] } : undefined,
        setAccountData: vi.fn().mockImplementation(async (type: string, content: object) => {
            accountData[type] = content;
        }),
        sendEvent: vi.fn().mockResolvedValue({}),
        createRoom: vi.fn().mockResolvedValue({ room_id: "!newdm:chat.example" }),
        getRoom: vi.fn().mockReturnValue(null),
        getSafeUserId: vi.fn().mockReturnValue("@me:chat.example"),
    } as unknown as import("matrix-js-sdk/src/matrix").MatrixClient;
}

describe("prod/Friends", () => {
    let client: ReturnType<typeof fakeClient>;

    beforeEach(() => {
        client = fakeClient();
    });

    it("getFriends returns an empty list with no account data", () => {
        expect(getFriends(client)).toEqual([]);
    });

    it("addFriend writes the entry into m.friend_list", async () => {
        await addFriend(client, "@alice:chat.example", "Alice");
        const friends = getFriends(client);
        expect(friends).toHaveLength(1);
        expect(friends[0].user_id).toBe("@alice:chat.example");
        expect(friends[0].display_name).toBe("Alice");
    });

    it("addFriend clears a pending request for the same user", async () => {
        // seed an outgoing request
        await sendFriendRequest(client, "@bob:chat.example", "Bob");
        expect(getFriendRequests(client).outgoing).toHaveLength(1);

        await addFriend(client, "@bob:chat.example", "Bob");
        expect(getFriendRequests(client).outgoing).toHaveLength(0);
        expect(getFriends(client).map((f) => f.user_id)).toContain("@bob:chat.example");
    });

    it("removeFriend deletes only that user", async () => {
        await addFriend(client, "@alice:chat.example");
        await addFriend(client, "@bob:chat.example");
        await removeFriend(client, "@alice:chat.example");

        expect(getFriends(client).map((f) => f.user_id)).toEqual(["@bob:chat.example"]);
    });

    it("sendFriendRequest sends a DM marker message and records an outgoing request", async () => {
        await sendFriendRequest(client, "@carol:chat.example", "Carol");

        expect(client.sendEvent).toHaveBeenCalledWith(
            "!newdm:chat.example",
            "m.room.message",
            expect.objectContaining({ msgtype: "m.friend_request" }),
        );
        const { outgoing } = getFriendRequests(client);
        expect(outgoing).toHaveLength(1);
        expect(outgoing[0]).toMatchObject({ user_id: "@carol:chat.example", direction: "out" });
    });

    it("sendFriendRequest reuses an existing DM room from the m.direct map", async () => {
        const clientWithDm = fakeClient({
            "m.direct": { "@carol:chat.example": ["!existing:chat.example"] },
        });
        (clientWithDm.getRoom as ReturnType<typeof vi.fn>).mockReturnValue({
            getMyMembership: () => "join",
        });

        await sendFriendRequest(clientWithDm, "@carol:chat.example");

        expect(clientWithDm.createRoom).not.toHaveBeenCalled();
        expect(clientWithDm.sendEvent).toHaveBeenCalledWith(
            "!existing:chat.example",
            "m.room.message",
            expect.anything(),
        );
    });
});
