/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Product scheduling helpers (LINE-style "send later" and self-destructing
 * messages) built on the MSC4140 delayed-events API that Synapse ships.
 *
 * MatrixClient exposes these as _unstable_ methods; this module is the only
 * place in the fork that touches them.
 */

import { type MatrixClient, type Room, UpdateDelayedEventAction } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

export interface ScheduledMessage {
    delayId: string;
    roomId: string;
    /** epoch ms at which the server will deliver the message */
    sendAt: number;
    content: Record<string, unknown>;
    eventType: string;
    /** set when the message also carries a self-destruct schedule */
    selfDestructAfterMs?: number;
}

const STORAGE_KEY = "mx_prod_scheduled_messages";

function loadLocal(roomId: string | null): ScheduledMessage[] {
    try {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, ScheduledMessage[]>;
        if (roomId) return all[roomId] || [];
        return Object.values(all).flat();
    } catch {
        return [];
    }
}

function persist(roomId: string, messages: ScheduledMessage[]): void {
    try {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, ScheduledMessage[]>;
        all[roomId] = messages;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
        // localStorage unavailable (private mode): scheduling still works,
        // only the local listing is lost.
    }
}

export function listScheduledMessages(room: Room | null): ScheduledMessage[] {
    return loadLocal(room?.roomId ?? null).sort((a, b) => a.sendAt - b.sendAt);
}

export function isSchedulingSupported(client: MatrixClient): boolean {
    // The unstable feature flag is cached by the client after capabilities fetch.
    return Boolean((client as unknown as { doesServerSupportUnstableFeature?: (f: string) => Promise<boolean> })
        .doesServerSupportUnstableFeature);
}

export function serverSupportsScheduling(client: MatrixClient): Promise<boolean> {
    return client.doesServerSupportUnstableFeature("org.matrix.msc4140.delayed_events");
}

export interface ScheduleOptions {
    /** epoch ms when the message should be delivered */
    sendAt: number;
    /** optional self-destruct TTL applied to the message content */
    selfDestructAfterMs?: number;
}

/**
 * Send a message with delayed delivery (MSC4140). Returns the delay_id so the
 * message can be cancelled/edited from the scheduled panel.
 */
export async function scheduleMessage(
    client: MatrixClient,
    room: Room,
    eventType: string,
    content: Record<string, unknown>,
    opts: ScheduleOptions,
    threadId: string | null = null,
): Promise<ScheduledMessage> {
    const delay = Math.max(0, opts.sendAt - Date.now());
    const enriched = { ...content };
    if (opts.selfDestructAfterMs) {
        enriched["m.self_destruct_after_ms"] = opts.selfDestructAfterMs;
    }
    const response = await client._unstable_sendDelayedEvent(
        room.roomId,
        { delay },
        threadId,
        eventType as never,
        enriched as never,
    );
    const scheduled: ScheduledMessage = {
        delayId: response.delay_id,
        roomId: room.roomId,
        sendAt: opts.sendAt,
        content: enriched,
        eventType,
        selfDestructAfterMs: opts.selfDestructAfterMs,
    };
    persist(room.roomId, [...loadLocal(room.roomId), scheduled]);
    return scheduled;
}

/** Persist a scheduled send so it appears in the Scheduled panel. */
export function rememberScheduledSend(message: ScheduledMessage): void {
    persist(message.roomId, [...loadLocal(message.roomId), message]);
}

export async function cancelScheduledMessage(client: MatrixClient, message: ScheduledMessage): Promise<void> {
    await client._unstable_cancelScheduledDelayedEvent(message.delayId);
    persist(message.roomId, loadLocal(message.roomId).filter((m) => m.delayId !== message.delayId));
}

export async function sendScheduledMessageNow(client: MatrixClient, message: ScheduledMessage): Promise<void> {
    await client._unstable_updateDelayedEvent(message.delayId, UpdateDelayedEventAction.Send);
    persist(message.roomId, loadLocal(message.roomId).filter((m) => m.delayId !== message.delayId));
}

/**
 * Schedule the server-side redaction of a self-destructing message. Called by
 * every client that sees such an event, so the redaction fires even when the
 * receiver is offline (Synapse persists the delayed event).
 */
export async function scheduleSelfDestructRedaction(
    client: MatrixClient,
    roomId: string,
    eventId: string,
    selfDestructAfterMs: number,
    sentAt: number | undefined,
): Promise<string | undefined> {
    try {
        const elapsed = Date.now() - (sentAt ?? Date.now());
        const remaining = selfDestructAfterMs - elapsed;
        if (remaining <= 0) {
            // Already expired: redact immediately.
            await client.redactEvent(roomId, eventId);
            return undefined;
        }
        const response = await client._unstable_sendDelayedEvent(
            roomId,
            { delay: remaining },
            null,
            "m.room.redaction" as never,
            { redacts: eventId } as never,
        );
        logger.info(`Self-destruct scheduled for ${eventId} in ${remaining}ms`);
        return response.delay_id;
    } catch (err) {
        logger.warn("Could not schedule self-destruct redaction", err);
        return undefined;
    }
}
