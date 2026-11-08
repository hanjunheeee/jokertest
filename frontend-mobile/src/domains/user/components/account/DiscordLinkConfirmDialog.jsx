// Discord 연결 확인 창 (양피지 창 + 문구 + 연결·취소), 기본 confirm 창 대신 (MO-029)
// DiscordSection이 씀, 덮개·감싸개는 대기방 시작 막힘 창과 같은 양피지 창 종류

import { useEffect, useRef } from "react"
import { getInGameParchmentModalVariant } from "@/domains/game/ingame/constants/parchment/ingameParchmentModalVariants.js"
import { MODAL_ASSETS } from "@/domains/game/matching/constants/friendInviteModalAssets.js"
import ConfirmButton from "@m/shared/ui/modal/parchment/ConfirmButton.jsx"
import ParchmentFrame from "@m/shared/ui/modal/parchment/ParchmentFrame.jsx"
import { PARCHMENT_ALERT_MSG_CLASS } from "@m/shared/ui/modal/parchment/parchmentAlertStyle.js"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"

const VARIANT = getInGameParchmentModalVariant("gameStartBlocked")
const CONFIRM_MESSAGE = "Discord 계정을 이 계정에 연결하시겠습니까?"

// 데스크톱 variant의 absolute 덮개·감싸개를 body 기준 fixed로
const toFixed = (className) => className.replace(/^absolute /, "fixed ")

// 열리면 연결 버튼에 초점, 덮개·Esc·취소는 onCancel
export default function DiscordLinkConfirmDialog({ open, onConfirm, onCancel }) {
    const confirmRef = useRef(null)

    useEffect(() => {
        if (open) confirmRef.current?.focus({ preventScroll: true })
    }, [open])

    return (
        <SheetPortal open={open} onClose={onCancel}>
            <div key="discord-link-confirm" data-discord-link-confirm="">
                <button
                    type="button"
                    aria-label={VARIANT.backdropLabel}
                    className={toFixed(VARIANT.backdropClass)}
                    data-sfx-kind="ui-cancel"
                    onClick={onCancel}
                />
                <div className={toFixed(VARIANT.wrapClass)}>
                    <div role="dialog" aria-modal="true" aria-label="Discord 연결 확인" className={VARIANT.panelClass}>
                        <ParchmentFrame>
                            <p className={PARCHMENT_ALERT_MSG_CLASS}>{CONFIRM_MESSAGE}</p>
                            <div className="flex items-center justify-center gap-3">
                                <ConfirmButton ref={confirmRef} label="연결" onClick={onConfirm} raised />
                                <ConfirmButton
                                    label="취소"
                                    onClick={onCancel}
                                    raised
                                    sfxKind="ui-cancel"
                                    src={MODAL_ASSETS.cancelButton}
                                />
                            </div>
                        </ParchmentFrame>
                    </div>
                </div>
            </div>
        </SheetPortal>
    )
}
