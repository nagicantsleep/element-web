/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    cancelScheduledMessage,
    listScheduledMessages,
    scheduleMessage,
    scheduleSelfDestructRedaction,
    sendScheduledMessageNow,
} from "./Scheduling";

const ROOM_ID = "!room:chat.example";

// The vitest project runs in a node environment; stub the localStorage the
// store uses for its local listing.
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    clear: () => storage.clear(),
});

function fakeClient() {
    return {
        _unstable_sendDelayedEvent: vi
            .fn()
            .mockResolvedValue({ delay_id: "delay-1" }),
        _unstable_cancelScheduledDelayedEvent: vi.fn().mockResolvedValue({}),
        _unstable_updateDelayedEvent: vi.fn().mockResolvedValue({}),
        redactEvent: vi.fn().mockResolvedValue({}),
    } as unknown as import("matrix-js-sdk/src/matrix").MatrixClient;
}

describe("prod/Scheduling", () => {
    beforeEach(() => {
        storage.clear();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("scheduleMessage stores delay_id, room and content locally", async () => {
        const client = fakeClient();
        const sendAt = Date.now() + 60_000;
        const scheduled = await scheduleMessage(client, { roomId: ROOM_ID } as never, "m.room.message", { body: "hi" }, { sendAt });

        expect(scheduled.delayId).toBe("delay-1");
        expect(scheduled.sendAt).toBe(sendAt);
        expect(scheduled.content.body).toBe("hi");
        expect(listScheduledMessages({ roomId: ROOM_ID } as never)).toHaveLength(1);
    });

    it("scheduleMessage enriches content with a self-destruct marker when asked", async () => {
        const client = fakeClient();
        const scheduled = await scheduleMessage(
            client,
            { roomId: ROOM_ID } as never,
            "m.room.message",
            { body: "hi" },
            { sendAt: Date.now() + 60_000, selfDestructAfterMs: 3_600_000 },
        );

        expect(scheduled.content["m.self_destruct_after_ms"]).toBe(3_600_000);
        // the delayed event payload carries the marker too
        const [, , , , sentContent] = (client._unstable_sendDelayedEvent as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(sentContent["m.self_destruct_after_ms"]).toBe(3_600_000);
    });

    it("cancelScheduledMessage removes the local entry", async () => {
        const client = fakeClient();
        const scheduled = await scheduleMessage(client, { roomId: ROOM_ID } as never, "m.room.message", { body: "x" }, { sendAt: Date.now() + 60_000 });
        expect(listScheduledMessages({ roomId: ROOM_ID } as never)).toHaveLength(1);

        await cancelScheduledMessage(client, scheduled);

        expect(client._unstable_cancelScheduledDelayedEvent).toHaveBeenCalledWith("delay-1");
        expect(listScheduledMessages({ roomId: ROOM_ID } as never)).toHaveLength(0);
    });

    it("sendScheduledMessageNow delivers and removes the local entry", async () => {
        const client = fakeClient();
        const scheduled = await scheduleMessage(client, { roomId: ROOM_ID } as never, "m.room.message", { body: "x" }, { sendAt: Date.now() + 60_000 });

        await sendScheduledMessageNow(client, scheduled);

        expect(client._unstable_updateDelayedEvent).toHaveBeenCalledWith("delay-1", "send");
        expect(listScheduledMessages({ roomId: ROOM_ID } as never)).toHaveLength(0);
    });

    it("scheduling is isolated per room", async () => {
        const client = fakeClient();
        await scheduleMessage(client, { roomId: ROOM_ID } as never, "m.room.message", { body: "a" }, { sendAt: Date.now() + 60_000 });
        await scheduleMessage(client, { roomId: "!other:chat.example" } as never, "m.room.message", { body: "b" }, { sendAt: Date.now() + 60_000 });

        expect(listScheduledMessages({ roomId: ROOM_ID } as never)).toHaveLength(1);
        expect(listScheduledMessages({ roomId: "!other:chat.example" } as never)).toHaveLength(1);
    });

    describe("scheduleSelfDestructRedaction", () => {
        it("schedules a delayed redaction for the remaining TTL", async () => {
            const client = fakeClient();
            const sentAt = Date.now() - 60_000; // one minute elapsed
            await scheduleSelfDestructRedaction(client, ROOM_ID, "$evt1", 3_600_000, sentAt);

            expect(client.redactEvent).not.toHaveBeenCalled();
            const [roomId, delayOpts, , eventType, content] = (client._unstable_sendDelayedEvent as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(roomId).toBe(ROOM_ID);
            expect(delayOpts.delay).toBe(3_540_000);
            expect(eventType).toBe("m.room.redaction");
            expect(content.redacts).toBe("$evt1");
        });

        it("redacts immediately when the TTL already elapsed", async () => {
            const client = fakeClient();
            const sentAt = Date.now() - 7_200_000; // 2h elapsed, TTL 1h
            await scheduleSelfDestructRedaction(client, ROOM_ID, "$evt2", 3_600_000, sentAt);

            expect(client.redactEvent).toHaveBeenCalledWith(ROOM_ID, "$evt2");
            expect(client._unstable_sendDelayedEvent).not.toHaveBeenCalled();
        });
    });
});
