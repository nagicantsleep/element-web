/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import React, { useEffect, useRef, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import { _t } from "../../../languageHandler";
import AccessibleButton from "../elements/AccessibleButton";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import {
    clearWallpaper,
    getWallpaper,
    setWallpaperColor,
    setWallpaperFromMxc,
} from "../../../prod/Wallpaper";

const WALLPAPER_COLORS = ["#e8f0fe", "#e6f4ea", "#fef7e0", "#fce8e6", "#f3e8fd", "#e0f2f1"];

/**
 * Per-user chat wallpaper for this room: pick an image (uploaded through the
 * media repo so platform storage applies) or a flat colour. Stored in room
 * account data — visible only to the current user.
 */
export function ChatWallpaperSettings({ room }: { room: Room }) {
    const client = MatrixClientPeg.safeGet();
    const fileInput = useRef<HTMLInputElement | null>(null);
    const [active, setActive] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        getWallpaper(client, room.roomId).then((wallpaper) => {
            if (wallpaper?.mxc) setActive(wallpaper.mxc);
            else if (wallpaper?.color) setActive(wallpaper.color);
            else setActive(null);
        });
    }, [client, room]);

    const onPickFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setBusy(true);
        try {
            const upload = await client.uploadContent(file, { type: file.type });
            const mxc = typeof upload === "string" ? upload : upload.content_uri;
            if (!mxc) return;
            await setWallpaperFromMxc(client, room, mxc);
            setActive(mxc);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <AccessibleButton
                kind="primary_outline"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
            >
                {busy ? "…" : _t("action|upload")}
            </AccessibleButton>
            <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={onPickFile}
            />
            <div className="mx_ChatWallpaper_colors">
                {WALLPAPER_COLORS.map((color) => (
                    <button
                        key={color}
                        type="button"
                        className="mx_ChatWallpaper_color"
                        style={{ background: color }}
                        aria-label={color}
                        onClick={async () => {
                            await setWallpaperColor(client, room, color);
                            setActive(color);
                        }}
                    />
                ))}
            </div>
            {active ? (
                <AccessibleButton
                    kind="danger_inline"
                    onClick={async () => {
                        await clearWallpaper(client, room.roomId);
                        setActive(null);
                    }}
                >
                    {_t("action|remove")}
                </AccessibleButton>
            ) : null}
        </div>
    );
}

export default ChatWallpaperSettings;
