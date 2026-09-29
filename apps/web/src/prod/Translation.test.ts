/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { translateMessage } from "./Translation";
// The translation cache is module-level; expose a reset through a distinct
// event id per test instead of reaching into the module.
const uniqueId = (() => {
    let n = 0;
    return (prefix: string) => `${prefix}-${++n}`;
})();

vi.mock("../settings/SettingsStore", () => ({
    default: {
        getValue: vi.fn((key: string) => {
            if (key === "prodTranslationUrl") return "https://translate.example/translate";
            if (key === "prodTranslationTarget") return "vi";
            if (key === "language") return "en";
            return undefined;
        }),
    },
}));

describe("prod/Translation", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("posts to the configured service and returns the translated text", async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => ({ translatedText: "xin chào" }),
        });

        const result = await translateMessage("$evt1", "hello");
        expect(result).toBe("xin chào");

        const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(url).toBe("https://translate.example/translate");
        expect(JSON.parse(init.body)).toMatchObject({ q: "hello", source: "auto", target: "vi" });
    });

    it("caches per (event, target) so a second call does not refetch", async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => ({ translatedText: "xin chào" }),
        });

        const evt = uniqueId("$evt");
        await translateMessage(evt, "hello");
        await translateMessage(evt, "hello");

        expect((globalThis.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    });

    it("returns null when the service is unreachable", async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("down"));
        expect(await translateMessage(uniqueId("$evt"), "hello")).toBeNull();
    });

    it("returns null when the service answers non-OK", async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
        expect(await translateMessage(uniqueId("$evt"), "hello")).toBeNull();
    });
});
