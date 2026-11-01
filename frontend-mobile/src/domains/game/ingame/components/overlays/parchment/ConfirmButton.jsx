// 양피지 확인 버튼: 수락 버튼 그림 위에 글자, 누르면 확인 소리 (손가락 크기 44px 이상)
// 연출 양피지 창·밤 성공 자료 대기 창이 씀
import { forwardRef } from "react"
import PublicAsset from "@/shared/ui/PublicAsset"
import {
    BTN_ASSET,
    PARCHMENT_CONFIRM_LABEL,
} from "@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js"

const BTN_CLASS =
    "relative block w-[9.5rem] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b4321] land:w-[8rem]"

const LABEL_CLASS =
    "pointer-events-none absolute inset-0 flex items-center justify-center pb-[3%] font-subheading text-[0.95rem] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// 그림 버튼 하나, ref로 바깥에서 초점 줄 수 있음
const ConfirmButton = forwardRef(function ConfirmButton(
    { label = PARCHMENT_CONFIRM_LABEL, onClick, sfxKind = "ui-confirm" },
    ref,
) {
    return (
        <button
            ref={ref}
            type="button"
            aria-label={label}
            className={BTN_CLASS}
            data-sfx-kind={sfxKind}
            onClick={onClick}
        >
            <PublicAsset src={BTN_ASSET} alt="" draggable={false} className="block h-auto w-full select-none" />
            <span className={LABEL_CLASS}>{label}</span>
        </button>
    )
})

export default ConfirmButton
