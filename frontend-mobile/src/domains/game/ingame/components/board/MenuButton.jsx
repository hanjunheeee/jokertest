// 카드 시트 그림 버튼 하나 (수락·취소 그림 위에 글), 못 누를 땐 이유를 아래 글로
// CardSheet가 씀 (손가락엔 title 툴팁이 없어서 이유를 보이게 적음)
import { PLAYER_CARD_OVERLAY_ASSETS } from "@/domains/game/ingame/constants/board/ingamePlayerCardOverlayAssets.js"
import { OVERLAY_BTN_LABEL_CLASS } from "@/domains/game/ingame/constants/board/ingamePlayerCardOverlayLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const BTN_CLASS =
    "group relative block w-full min-h-11 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"

// 글 크기는 데스크톱 cqw 대신 고정 (시트는 카드보다 넓음)
const LABEL_CLASS = `${OVERLAY_BTN_LABEL_CLASS} !text-[0.95rem]`

// tone: confirm(수락 그림) | cancel(취소 그림)
export default function MenuButton({ label, tone = "confirm", disabled = false, disabledReason = null, onClick, kind }) {
    const src = tone === "cancel" ? PLAYER_CARD_OVERLAY_ASSETS.cancelButton : PLAYER_CARD_OVERLAY_ASSETS.confirmButton
    return (
        <div className="flex min-w-[9.5rem] max-w-[15rem] flex-1 flex-col items-center gap-1">
            <button
                type="button"
                role="menuitem"
                aria-label={label}
                className={BTN_CLASS}
                disabled={disabled}
                onClick={onClick}
                data-card-menu-kind={kind}
                data-sfx-kind={tone === "cancel" ? "ui-cancel" : undefined}
                style={{ outline: "none" }}
            >
                <PublicAsset src={src} alt="" className="block h-auto w-full select-none" />
                <span className={LABEL_CLASS}>{label}</span>
            </button>
            {disabled && disabledReason ? (
                <p className="text-center text-[0.72rem] leading-snug text-[#5b3a2a]">{disabledReason}</p>
            ) : null}
        </div>
    )
}
