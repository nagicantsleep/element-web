/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import React, { useContext, useRef, useState } from "react";
import { TimeIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { _t } from "../../../languageHandler";
import { type MenuProps } from "../../structures/ContextMenu";
import IconizedContextMenu, {
    IconizedContextMenuOption,
    IconizedContextMenuOptionList,
} from "../context_menus/IconizedContextMenu";
import { CollapsibleButton, OverflowMenuContext } from "./CollapsibleButton";
import {
    SEND_LATER_OPTIONS,
    SELF_DESTRUCT_OPTIONS,
    sendAtFor,
} from "../../../prod/SchedulingMenu";

interface ScheduleButtonProps {
    /** Anchors the dropdown next to the composer button. */
    menuPosition?: MenuProps;
    scheduleAt?: number;
    selfDestructAfterMs?: number;
    onScheduleAtChange: (scheduleAt?: number) => void;
    onSelfDestructChange: (selfDestructAfterMs?: number) => void;
}

/**
 * Product (Z/L): composer clock button with a dropdown of "Send later"
 * presets and "Auto-destruct" TTLs, applied to the next sent message.
 */
export function ScheduleButton(props: ScheduleButtonProps): React.JSX.Element {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    // When rendered inside the composer overflow menu, this closes the menu that
    // hosts us: otherwise its modal background swallows every further click.
    const closeParentOverflowMenu = useContext(OverflowMenuContext);

    const pickSendLater = (value: number): void => {
        props.onScheduleAtChange(sendAtFor(value));
        setOpen(false);
        closeParentOverflowMenu?.();
    };

    const pickDestruct = (value: number): void => {
        props.onSelfDestructChange(value > 0 ? value : undefined);
        setOpen(false);
        closeParentOverflowMenu?.();
    };

    if (open) {
        return (
            <IconizedContextMenu
                onFinished={() => setOpen(false)}
                {...props.menuPosition}
                wrapperClassName="mx_ScheduleButton_menu"
                compact={true}
            >
                <IconizedContextMenuOptionList>
                    {SEND_LATER_OPTIONS.map((option) => (
                        <IconizedContextMenuOption
                            key={`send-${option.label}`}
                            label={`Send later — ${option.label}`}
                            onClick={() => pickSendLater(option.value)}
                        />
                    ))}
                    {SELF_DESTRUCT_OPTIONS.map((option) => (
                        <IconizedContextMenuOption
                            key={`destruct-${option.label}`}
                            label={`Auto-destruct — ${option.label}`}
                            onClick={() => pickDestruct(option.value)}
                        />
                    ))}
                </IconizedContextMenuOptionList>
            </IconizedContextMenu>
        );
    }

    return (
        <CollapsibleButton
            className="mx_MessageComposer_button"
            onClick={() => setOpen(true)}
            title={_t("composer|send_later")}
            inputRef={buttonRef}
        >
            <TimeIcon />
        </CollapsibleButton>
    );
}

export default ScheduleButton;
