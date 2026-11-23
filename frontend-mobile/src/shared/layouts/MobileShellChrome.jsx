// 틀 바닥: portal 자리 + (있으면) 뒤로 버튼 — 광고 줄 위
import BackButton from "@m/shared/ui/button/BackButton.jsx"
import { BOTTOM_BACK_BTN_CLASS } from "@m/shared/ui/button/bottomBackStyles.js"
import { useShellBackContext } from "@m/shared/layouts/mobileShellBack.jsx"
import { SHELL_BOTTOM_SLOT_ID } from "@m/shared/layouts/mobileShellSlots.js"

const BACK_ICON_CLASS = "block h-full w-full select-none object-contain"

export default function MobileShellChrome({ bottomSlotRef }) {
    const { back } = useShellBackContext() ?? {}

    return (
        <div
            className={`mobile-shell__chrome${back ? " mobile-shell__chrome--has-back" : ""}`}
            data-has-back={back ? "true" : undefined}
        >
            <div id={SHELL_BOTTOM_SLOT_ID} ref={bottomSlotRef} className="mobile-shell__chrome-slot" />
            {back ? (
                <ShellChromeBack onClick={back.onClick} label={back.label} />
            ) : null}
        </div>
    )
}

function ShellChromeBack({ onClick, label }) {
    return (
        <div className="mobile-shell__chrome-back shrink-0">
            <BackButton onClick={onClick} label={label} className={BOTTOM_BACK_BTN_CLASS} iconClassName={BACK_ICON_CLASS} />
        </div>
    )
}
