/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

/**
 * Self-destructing messages (LINE-style "hidden chat" timer): the content
 * carries m.self_destruct_after_ms; every client seeing the event schedules a
 * MSC4140 delayed redaction, so the message disappears server-side even for
 * offline recipients. UX guarantee, not a security guarantee — non-cooperating
 * clients can bypass the visual expiry and the content exists until the
 * redaction fires.
 */
export const SELF_DESTRUCT_KEY = "m.self_destruct_after_ms";

export const SELF_DESTRUCT_OPTIONS: { label: string; value: number }[] = [
    { label: "Off", value: 0 },
    { label: "1 hour", value: 3_600_000 },
    { label: "24 hours", value: 86_400_000 },
    { label: "1 week", value: 604_800_000 },
];

export const SEND_LATER_OPTIONS: { label: string; value: number }[] = [
    { label: "In 5 minutes", value: 5 * 60_000 },
    { label: "In 30 minutes", value: 30 * 60_000 },
    { label: "In 1 hour", value: 60 * 60_000 },
    { label: "Tomorrow morning", value: -1 }, // special-cased: 9am next day
];

export function sendAtFor(optionValue: number): number {
    if (optionValue === -1) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d.getTime();
    }
    return Date.now() + optionValue;
}

/**
 * Schedule a delayed redaction for a self-destructing message we did not send
 * ourselves (senders already schedule on send). Fire-and-forget.
 */
export function observeSelfDestruct(client: MatrixClient, event: { getId?: () => string; getType?: () => string; getTs?: () => number; getRoomId?: () => string }): void {
    try {
        const type = event.getType?.();
        if (!type || type === "m.room.redaction" || type.startsWith("m.room.message") === false && type !== "m.sticker") {
            // Only message-like events carry the marker.
            if (!type?.startsWith("m.room.message")) return;
        }
        const content = (event as unknown as { getContent?: () => Record<string, unknown> }).getContent?.() || {};
        const ttl = content[SELF_DESTRUCT_KEY];
        const eventId = event.getId?.();
        const roomId = event.getRoomId?.();
        if (typeof ttl !== "number" || ttl <= 0 || !eventId || !roomId) return;
        import("./Scheduling").then(({ scheduleSelfDestructRedaction }) =>
            scheduleSelfDestructRedaction(client, roomId, eventId, ttl, event.getTs?.()),
        ).catch((err) => logger.warn("self-destruct scheduling failed", err));
    } catch (err) {
        logger.warn("observeSelfDestruct failed", err);
    }
}
