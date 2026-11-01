// 양피지 확인 버튼: 수락 버튼 그림 위에 글자, 누르면 확인 소리 (폭은 데스크톱 최대 9.3rem → 높이 44px 넘음)
// 연출 양피지 창·밤 성공 자료 대기 창·대기방 시작 막힘 창이 씀
import { forwardRef } from "react"
import PublicAsset from "@/shared/ui/PublicAsset"
import {
    BTN_ASSET,
    IMG_CLASS,
    PARCHMENT_CONFIRM_LABEL,
} from "@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js"

const BTN_CLASS =
    "relative block w-[9.3rem] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform active:scale-95"

// 데스크톱 두 모양: 붙임(-mt) / 띄움(mt-2 + 초점 테두리)
const TIGHT_CLASS = "-mt-[0.3rem]"
const RAISED_CLASS =
    "mt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b4321]"

// 글자 모양은 데스크톱 LABEL_CLASS의 최대 크기
const LABEL_CLASS =
    "pointer-events-none absolute inset-0 flex items-center justify-center pb-[2%] pt-[0.12rem] font-subheading text-[0.92rem] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// 그림 버튼 하나, ref로 바깥에서 초점 줄 수 있음
const ConfirmButton = forwardRef(function ConfirmButton(
    { label = PARCHMENT_CONFIRM_LABEL, onClick, raised = false, sfxKind = "ui-confirm" },
    ref,
) {
    return (
        <button
            ref={ref}
            type="button"
            aria-label={label}
            className={`${BTN_CLASS} ${raised ? RAISED_CLASS : TIGHT_CLASS}`}
            style={raised ? undefined : { outline: "none" }}
            data-sfx-kind={sfxKind}
            onClick={onClick}
        >
            <PublicAsset src={BTN_ASSET} alt="" draggable={false} className={IMG_CLASS} />
            <span className={LABEL_CLASS}>{label}</span>
        </button>
    )
})

export default ConfirmButton
