// 카드 시트 그림 버튼 하나 (수락·취소 그림 위에 글), 못 누를 땐 이유를 아래 글로
// CardSheet가 씀 (데스크톱은 title 툴팁, 손가락엔 툴팁이 없어서 같은 이유 글을 보이게 적음)
import { PLAYER_CARD_OVERLAY_ASSETS } from "@/domains/game/ingame/constants/board/ingamePlayerCardOverlayAssets.js"
import {
    OVERLAY_BTN_IMG_CLASS,
    OVERLAY_BTN_LABEL_CLASS,
} from "@/domains/game/ingame/constants/board/ingamePlayerCardOverlayLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 데스크톱 OVERLAY_BTN_CLASS에서 hover만 빼고 같은 눌림·꺼짐 모양 (누름 자리 44px 이상)
const BTN_CLASS =
    "group relative block w-full min-h-11 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"

// 글 크기는 데스크톱 cqw 대신 고정 (시트는 카드보다 넓음)
const LABEL_CLASS = `${OVERLAY_BTN_LABEL_CLASS} !text-[0.95rem]`

// tone: confirm(수락 그림) | cancel(취소 그림)
export default function MenuButton({ label, tone = "confirm", disabled = false, disabledReason = null, onClick, kind }) {
    const src = tone === "cancel" ? PLAYER_CARD_OVERLAY_ASSETS.cancelButton : PLAYER_CARD_OVERLAY_ASSETS.confirmButton
    return (
        <div className="flex w-full flex-col items-center gap-1">
            <button
                type="button"
                role="menuitem"
                aria-label={label}
                title={disabled && disabledReason ? disabledReason : undefined}
                className={BTN_CLASS}
                disabled={disabled}
                onClick={onClick}
                data-card-menu-kind={kind}
                style={{ outline: "none" }}
            >
                <PublicAsset src={src} alt="" className={OVERLAY_BTN_IMG_CLASS} />
                <span className={LABEL_CLASS}>{label}</span>
            </button>
            {disabled && disabledReason ? (
                <p className="text-center text-[0.72rem] leading-snug text-[#5b3a2a]">{disabledReason}</p>
            ) : null}
        </div>
    )
}
