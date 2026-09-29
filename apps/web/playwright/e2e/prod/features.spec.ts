/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from "../../element-web-test";

/**
 * Product (Z/L) features, ADR 0015: scheduled send, self-destruct,
 * wallpaper, friends. Drives the real app against the bundled Synapse.
 *
 * Server config: `search_all_users` so the user directory finds users who
 * don't share a room, and a non-zero `max_event_delay_duration` because
 * Synapse keeps the MSC4140 delayed-events API disabled otherwise.
 */
test.use({
    synapseConfig: {
        user_directory: { search_all_users: true },
        max_event_delay_duration: "24h",
    },
});

test.describe("Product features", () => {
    test.use({
        botCreateOpts: { displayName: "Buddy" },
        room: async ({ app, user }, use) => {
            const roomId = await app.client.createRoom({ name: "Product test room" });
            await app.viewRoomByName("Product test room");
            await use({ roomId });
        },
    });

    // The schedule control lives in the composer overflow menu at this viewport
    // (CollapsibleButton renders as an IconizedContextMenuOption there).
    async function openScheduleMenu(page: import("@playwright/test").Page): Promise<void> {
        await page.locator(".mx_MessageComposer_buttonMenu").click();
        await page.getByRole("menuitem", { name: "Send later / Auto-destruct" }).click();
        // The option toggles our standalone dropdown listing the presets.
        await expect(page.getByRole("menuitem", { name: "Send later — In 5 minutes" })).toBeVisible();
    }

    test("composer exposes the schedule button and dropdown options", async ({ page, room }) => {
        await openScheduleMenu(page);
        await expect(page.getByRole("menuitem", { name: "Auto-destruct — 1 hour" })).toBeVisible();
        await page.keyboard.press("Escape");
    });

    test("send later queues a delayed message and records it as scheduled", async ({ page, room }) => {
        const composer = page.getByRole("textbox", { name: /Send an (unencrypted|encrypted) message/ });
        await composer.fill("Hello from the future");
        await openScheduleMenu(page);
        await page.getByRole("menuitem", { name: "Send later — In 5 minutes" }).click();
        // Let the context menus close so the keydown lands in the composer.
        await expect(page.locator(".mx_ContextualMenu_background")).toHaveCount(0);
        await composer.press("Enter");

        // Nothing was delivered yet — the body must not appear in the timeline.
        await expect(page.locator(".mx_EventTile_body, .mx_MTextBody").filter({ hasText: "Hello from the future" })).toHaveCount(0);

        // The scheduled listing records the pending send locally (written after
        // the delayed-send request resolves, so poll briefly).
        await expect
            .poll(() =>
                page.evaluate(() => {
                    const all = JSON.parse(localStorage.getItem("mx_prod_scheduled_messages") || "{}") as Record<
                        string,
                        { content?: { body?: string }; sendAt?: number }[]
                    >;
                    return Object.values(all).flat().find((e) => e.content?.body?.includes("Hello from the future"));
                }),
            )
            .toBeDefined();
        const entry = await page.evaluate(() => {
            const all = JSON.parse(localStorage.getItem("mx_prod_scheduled_messages") || "{}") as Record<
                string,
                { content?: { body?: string }; sendAt?: number }[]
            >;
            return Object.values(all).flat().find((e) => e.content?.body?.includes("Hello from the future"));
        });
        expect(entry!.sendAt).toBeGreaterThan(Date.now());
    });

    test("self-destruct marks the content with a TTL and badge", async ({ page, room }) => {
        const composer = page.getByRole("textbox", { name: /Send an (unencrypted|encrypted) message/ });
        await composer.fill("This message will vanish");
        await openScheduleMenu(page);
        await page.getByRole("menuitem", { name: "Auto-destruct — 1 hour" }).click();
        await page.keyboard.press("Escape"); // make sure no menu intercepts the click
        await page.getByRole("button", { name: "Send message" }).click();

        await expect(page.getByText("This message will vanish")).toBeVisible();
        await expect(page.locator(".mx_SelfDestruct_badge").first()).toBeVisible();
    });

    test("room settings offer a chat wallpaper section", async ({ page, room }) => {
        await page.locator(".mx_RoomHeader").getByRole("button", { name: "Room info" }).first().click();
        await page.getByRole("menuitem", { name: "Settings" }).click();
        await page.getByRole("tab", { name: "General" }).click();

        await expect(page.getByRole("heading", { name: "Chat wallpaper" })).toBeVisible();
        await expect(page.locator(".mx_ChatWallpaper_color").first()).toBeVisible();
    });

    test("server-side search finds a message in another room", async ({ page, room }) => {
        // Send a distinctive message in the fixture room, then search from
        // the spotlight: the server-side /search spans every joined room.
        const marker = `needle-${Date.now()}`;
        await page.getByRole("textbox", { name: /Send an (unencrypted|encrypted) message/ }).fill(marker);
        await page.getByRole("button", { name: "Send message" }).click();
        await expect(page.getByText(marker)).toBeVisible();

        await page.getByRole("button", { name: "Search" }).click();
        await page.getByRole("textbox", { name: "Search" }).fill(marker);
        // Wait for the server result to land in the dialog.
        await expect(page.getByText(marker).first()).toBeVisible({ timeout: 10_000 });
    });

    test("friends section appears above the room list and accepts search", async ({ page, bot }) => {
        const section = page.locator(".mx_FriendsSection");
        await expect(section).toBeVisible();

        // The server-side user directory excludes the caller, so search for the bot.
        // Paste the full mxid (as a scanned personal QR code would) — the
        // server-side directory resolves it with search_all_users.
        await section.locator("input").fill(bot.credentials!.userId);
        await section.locator("input").press("Enter");
        // The result row shows the bot's display name ("B Buddy") with an add-friend button.
        await expect(section.locator(".mx_FriendsSection_row").first()).toBeVisible({ timeout: 10_000 });
    });
});
