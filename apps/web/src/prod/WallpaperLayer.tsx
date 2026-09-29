/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import React, { useEffect, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import { MatrixClientPeg } from "../MatrixClientPeg";
import { getWallpaper, wallpaperUrl, type WallpaperContent } from "./Wallpaper";

/**
 * Background layer of the room timeline rendering the per-user wallpaper
 * stored in room account data. Rendered inside .mx_RoomView_timeline, behind
 * the scroll panel (z-index below the message list).
 */
export function WallpaperLayer({ room }: { room: Room | null }): React.JSX.Element | null {
    const client = MatrixClientPeg.get();
    const [wallpaper, setWallpaper] = useState<WallpaperContent | null>(null);
    const [url, setUrl] = useState<string | undefined>();

    useEffect(() => {
        if (!client || !room) {
            setWallpaper(null);
            return undefined;
        }
        let cancelled = false;
        getWallpaper(client, room.roomId).then((content) => {
            if (cancelled) return;
            setWallpaper(content);
            setUrl(content ? wallpaperUrl(client, content) : undefined);
        });
        const handler = (): void => {
            getWallpaper(client, room.roomId).then((content) => {
                if (cancelled) return;
                setWallpaper(content);
                setUrl(content ? wallpaperUrl(client, content) : undefined);
            });
        };
        (room as unknown as { on: (e: string, h: () => void) => void }).on("Room.accountData", handler);
        return () => {
            cancelled = true;
            (room as unknown as { removeListener: (e: string, h: () => void) => void }).removeListener("Room.accountData", handler);
        };
    }, [client, room]);

    if (!wallpaper) return null;

    const style: React.CSSProperties = {};
    if (url) {
        style.backgroundImage = `url(${url})`;
        style.backgroundSize = "cover";
        style.backgroundPosition = "center";
        style.opacity = wallpaper.opacity ?? 0.25;
    } else if (wallpaper.color) {
        style.background = wallpaper.color;
    } else {
        return null;
    }

    return <div className="mx_RoomView_wallpaper" style={style} aria-hidden />;
}
