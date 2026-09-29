/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import React, { useEffect, useState } from "react";
import { _t } from "../languageHandler";
import AccessibleButton from "../components/views/elements/AccessibleButton";
import { translateMessage, translationServiceUrl } from "./Translation";

interface IProps {
    eventId: string;
    /** Already-decrypted plaintext body of the message (never raw event content for E2EE rooms). */
    text: string | null | undefined;
}

/**
 * Inline "Translate" control under a message bubble: fetches the translation
 * from the configured service and renders it below the original body.
 * E2EE-safe by construction — only the decrypted plaintext leaves the client,
 * and only when the user explicitly asks for a translation.
 */
export function TranslatedBody({ eventId, text }: IProps): React.JSX.Element | null {
    const [translated, setTranslated] = useState<string | null>(null);
    const [visible, setVisible] = useState(false);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setTranslated(null);
        setVisible(false);
        setFailed(false);
    }, [eventId, text]);

    if (!text?.trim() || !translationServiceUrl()) return null;

    const onTranslate = async (): Promise<void> => {
        if (translated) {
            setVisible((v) => !v);
            return;
        }
        setBusy(true);
        const result = await translateMessage(eventId, text);
        setBusy(false);
        if (result) {
            setTranslated(result);
            setVisible(true);
        } else {
            setFailed(true);
        }
    };

    return (
        <div className="mx_TranslatedBody">
            <AccessibleButton kind="link_inline" onClick={onTranslate} disabled={busy}>
                {busy ? "…" : translated ? (visible ? _t("action|hide") : _t("translation|show_original")) : _t("translation|translate")}
            </AccessibleButton>
            {visible && translated ? (
                <div className="mx_TranslatedBody_result">
                    {translated}
                    <AccessibleButton kind="link_inline" onClick={() => navigator.clipboard.writeText(translated)}>
                        {_t("action|copy")}
                    </AccessibleButton>
                </div>
            ) : null}
            {failed ? <div className="mx_TranslatedBody_error">{_t("translation|failed")}</div> : null}
        </div>
    );
}

export default TranslatedBody;
