/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Per-room chat wallpaper (LINE/Zalo-style): stored in room account data
 * (per-user, not shared with the room) as a custom event, rendered as a
 * background layer of the room timeline. Images go through the media repo,
 * so platform media storage (S3 plugin) applies automatically.
 */

import { type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

export const WALLPAPER_EVENT_TYPE = "m.room.chat_wallpaper";

export interface WallpaperContent {
    /** mxc:// URL of the wallpaper image */
    mxc?: string;
    /** optional CSS color fallback */
    color?: string;
    /** dimming of the image so bubbles stay readable, 0..1 */
    opacity?: number;
}

export async function getWallpaper(client: MatrixClient, roomId: string): Promise<WallpaperContent | null> {
    try {
        const room = client.getRoom(roomId) as unknown as { getAccountData: (t: string) => { getContent: () => WallpaperContent } | null } | null;
        const event = room?.getAccountData(WALLPAPER_EVENT_TYPE) ?? null;
        return (event?.getContent() as WallpaperContent | undefined) ?? null;
    } catch {
        return null;
    }
}

export async function setWallpaperFromMxc(
    client: MatrixClient,
    room: Room,
    mxc: string,
    opacity = 0.25,
): Promise<void> {
    await (client.setRoomAccountData as unknown as (roomId: string, type: string, content: WallpaperContent) => Promise<void>)(
        room.roomId,
        WALLPAPER_EVENT_TYPE,
        { mxc, opacity },
    );
}

export async function setWallpaperColor(client: MatrixClient, room: Room, color: string): Promise<void> {
    await (client.setRoomAccountData as unknown as (roomId: string, type: string, content: WallpaperContent) => Promise<void>)(
        room.roomId,
        WALLPAPER_EVENT_TYPE,
        { color },
    );
}

export async function clearWallpaper(client: MatrixClient, roomId: string): Promise<void> {
    try {
        // Room account data has no dedicated delete endpoint in the client API:
        // write an empty content.
        await (client.setRoomAccountData as unknown as (r: string, t: string, c: Record<string, never>) => Promise<void>)(
            roomId, WALLPAPER_EVENT_TYPE, {},
        );
    } catch (err) {
        logger.warn("clearWallpaper failed", err);
    }
}

/** Resolve an mxc URL to an HTTP URL the <img>/background can use. */
export function wallpaperUrl(client: MatrixClient, content: WallpaperContent): string | undefined {
    if (!content.mxc) return undefined;
    const size = Math.round(window.innerWidth / 2);
    return client.mxcUrlToHttp(content.mxc, size, Math.round(size * 1.5), "scale", false, false) ?? undefined;
}
