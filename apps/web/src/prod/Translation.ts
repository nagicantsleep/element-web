/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { logger } from "matrix-js-sdk/src/logger";
import SettingsStore from "../settings/SettingsStore";

/**
 * Client-side message translation (E2EE-safe): the platform never sees
 * plaintext of encrypted rooms — the client posts already-decrypted message
 * bodies to a configurable translation service (LibreTranslate-compatible).
 */

const cache = new Map<string, string>();

export function translateTargetLanguage(): string {
    const appLanguage = SettingsStore.getValue("language") as string | undefined;
    // Configured target wins; fall back to a short code of the app language.
    return (SettingsStore.getValue("prodTranslationTarget") as string | undefined) || appLanguage?.slice(0, 2) || "en";
}

export function translationServiceUrl(): string | undefined {
    return (SettingsStore.getValue("prodTranslationUrl") as string | undefined) || undefined;
}

export async function translateMessage(eventId: string, text: string): Promise<string | null> {
    const target = translateTargetLanguage();
    const key = `${eventId}:${target}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const url = translationServiceUrl();
    if (!url) return null;
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q: text, source: "auto", target, format: "text" }),
        });
        if (!response.ok) return null;
        const data = (await response.json()) as { translatedText?: string | string[] };
        const translated = Array.isArray(data.translatedText) ? data.translatedText.join("\n") : data.translatedText;
        if (!translated) return null;
        cache.set(key, translated);
        return translated;
    } catch (err) {
        logger.warn("translateMessage failed", err);
        return null;
    }
}
