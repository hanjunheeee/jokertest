// 상점 쿠폰 입력 양피지 창 (어두운 덮개 + ParchmentFrame)
// CouponButton이 씀
import { useEffect, useRef } from "react"
import { getInGameParchmentModalVariant } from "@/domains/game/ingame/constants/parchment/ingameParchmentModalVariants.js"
import { MODAL_ASSETS } from "@/domains/game/matching/constants/friendInviteModalAssets.js"
import ConfirmButton from "@m/shared/ui/modal/parchment/ConfirmButton.jsx"
import ParchmentFrame from "@m/shared/ui/modal/parchment/ParchmentFrame.jsx"
import { PARCHMENT_ALERT_MSG_CLASS } from "@m/shared/ui/modal/parchment/parchmentAlertStyle.js"
import { DIALOG_ERROR_CLASS, DIALOG_SUCCESS_CLASS } from "@m/shared/ui/modal/textDialogStyle.js"
import InputSlot from "@m/shared/ui/input/InputSlot.jsx"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"

const VARIANT = getInGameParchmentModalVariant("gameStartBlocked")
const toFixed = (className) => className.replace(/^absolute /, "fixed ")

const TITLE_CLASS =
    "font-subheading font-bold text-[#3a1a0c] app-text-scaled [--app-text-size:0.95rem] land:[--app-text-size:0.9rem]"

const COMPACT_BTN = "!w-[6.6rem]"
const COMPACT_LABEL = "px-0.5 !text-[0.84rem] leading-none whitespace-nowrap"

const FORM_CLASS = "flex w-full min-w-0 flex-col items-stretch gap-2.5 text-left"

export default function CouponDialog({ open, onClose, coupon }) {
    const inputRef = useRef(null)

    useEffect(() => {
        if (open) inputRef.current?.focus({ preventScroll: true })
    }, [open])

    return (
        <SheetPortal open={open} onClose={onClose}>
            <div key="store-coupon" data-store-coupon="">
                <button
                    type="button"
                    aria-label={VARIANT.backdropLabel}
                    className={toFixed(VARIANT.backdropClass)}
                    data-sfx-kind="ui-cancel"
                    onClick={onClose}
                />
                <div className={toFixed(VARIANT.wrapClass)}>
                    <div role="dialog" aria-modal="true" aria-labelledby="coupon-dialog-title" className={VARIANT.panelClass}>
                        <ParchmentFrame>
                            <h2 id="coupon-dialog-title" className={TITLE_CLASS}>
                                쿠폰 입력
                            </h2>
                            <form onSubmit={coupon.submit} className={FORM_CLASS}>
                                <p className={`${PARCHMENT_ALERT_MSG_CLASS} text-left`}>
                                    받은 쿠폰 코드를 넣어주세요. 한 쿠폰은 한 번만 쓸 수 있습니다.
                                </p>
                                <InputSlot
                                    look="coupon"
                                    inputRef={inputRef}
                                    name="couponCode"
                                    value={coupon.code}
                                    onChange={(e) => coupon.setCode(e.target.value)}
                                    placeholder="예: WELCOME-2026"
                                    autoComplete="off"
                                    autoCapitalize="characters"
                                    maxLength={40}
                                    ariaLabel="쿠폰 코드"
                                />
                                {coupon.msg ? (
                                    <p
                                        role={coupon.msg.type === "error" ? "alert" : "status"}
                                        className={
                                            coupon.msg.type === "error" ? DIALOG_ERROR_CLASS : DIALOG_SUCCESS_CLASS
                                        }
                                    >
                                        {coupon.msg.text}
                                    </p>
                                ) : null}
                                <div className="mt-0.5 flex w-full flex-row flex-wrap items-center justify-center gap-1.5">
                                    <ConfirmButton
                                        label={coupon.loading ? "확인 중..." : "사용하기"}
                                        onClick={(e) => coupon.submit(e)}
                                        disabled={coupon.loading}
                                        raised
                                        buttonClassName={COMPACT_BTN}
                                        labelClassName={COMPACT_LABEL}
                                    />
                                    <ConfirmButton
                                        label="닫기"
                                        onClick={onClose}
                                        raised
                                        sfxKind="ui-cancel"
                                        src={MODAL_ASSETS.cancelButton}
                                        buttonClassName={COMPACT_BTN}
                                        labelClassName={COMPACT_LABEL}
                                    />
                                </div>
                            </form>
                        </ParchmentFrame>
                    </div>
                </div>
            </div>
        </SheetPortal>
    )
}
