/*
 * Copyright 2026 nagicantsleep
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

import { _t } from "../../../languageHandler";
import BaseDialog from "./BaseDialog";
import DialogButtons from "../elements/DialogButtons";

interface IProps {
    /** The mxid to encode. */
    userId: string;
    onFinished(): void;
}

/**
 * Shows the signed-in user's Matrix ID as a QR code (Zalo/LINE "personal
 * QR"): friends scan it and land on the matrix.to link, whose mxid the
 * Friends search box accepts directly.
 */
const MyQrCodeDialog: React.FC<IProps> = ({ userId, onFinished }) => {
    const [dataUrl, setDataUrl] = useState<string>();

    useEffect(() => {
        let cancelled = false;
        void QRCode.toDataURL(`https://matrix.to/#/${encodeURIComponent(userId)}`, {
            margin: 1,
            width: 220,
            errorCorrectionLevel: "M",
        }).then((url) => {
            if (!cancelled) setDataUrl(url);
        });
        return () => {
            cancelled = true;
        };
    }, [userId]);

    return (
        <BaseDialog title={_t("translation|my_qr")} onFinished={onFinished} fixedWidth>
            <div className="mx_Dialog_content mx_MyQrCodeDialog_body">
                {dataUrl ? (
                    <img src={dataUrl} alt={_t("translation|my_qr")} width={220} height={220} />
                ) : (
                    <div className="mx_MyQrCodeDialog_placeholder" />
                )}
                <p>{userId}</p>
            </div>
            <DialogButtons primaryButton={_t("action|ok")} onPrimaryButtonClick={() => onFinished()} hasCancel={false} />
        </BaseDialog>
    );
};

export default MyQrCodeDialog;
