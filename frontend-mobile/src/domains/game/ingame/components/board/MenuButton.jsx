// 카드 시트 그림 버튼 하나 (수락·취소 그림 위에 글), 못 누를 땐 이유를 아래 글로
// CardSheet가 씀 (데스크톱은 title 툴팁, 손가락엔 툴팁이 없어서 같은 이유 글을 보이게 적음)
import { PLAYER_CARD_OVERLAY_ASSETS } from "@/domains/game/ingame/constants/board/ingamePlayerCardOverlayAssets.js"
import {
    OVERLAY_BTN_IMG_CLASS,
    OVERLAY_BTN_LABEL_CLASS,
} from "@/domains/game/ingame/constants/board/ingamePlayerCardOverlayLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 데스크톱 OVERLAY_BTN_CLASS에서 hover만 빼고 같은 눌림·꺼짐 모양 (누름 자리 44px 이상)
const BTN_BASE =
    "group relative block w-full cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"

// default: 카드 시트, compact: 플레이어 목록 시트 (행마다 붙는 버튼)
const SIZE_STYLES = {
    default: {
        btn: `${BTN_BASE} min-h-11`,
        img: OVERLAY_BTN_IMG_CLASS,
        label: `${OVERLAY_BTN_LABEL_CLASS} !text-[0.95rem]`,
        reason: "text-center text-[0.72rem] leading-snug text-[#5b3a2a]",
    },
    compact: {
        btn: `${BTN_BASE} min-h-8 max-h-9`,
        img: "block h-8 w-full max-w-full select-none object-contain object-center",
        label: `${OVERLAY_BTN_LABEL_CLASS} !text-[0.72rem] pb-[2%]`,
        reason: "text-left text-[0.65rem] leading-snug text-[#5b3a2a]",
    },
}

// tone: confirm(수락 그림) | cancel(취소 그림)
export default function MenuButton({
    label,
    tone = "confirm",
    size = "default",
    showDisabledReason = true,
    disabled = false,
    disabledReason = null,
    onClick,
    kind,
}) {
    const styles = SIZE_STYLES[size] ?? SIZE_STYLES.default
    const src = tone === "cancel" ? PLAYER_CARD_OVERLAY_ASSETS.cancelButton : PLAYER_CARD_OVERLAY_ASSETS.confirmButton
    const wrapClass = size === "compact"
        ? "flex w-[8.25rem] shrink-0 flex-col items-stretch gap-0.5"
        : "flex w-full flex-col items-center gap-1"

    return (
        <div className={wrapClass}>
            <button
                type="button"
                role="menuitem"
                aria-label={label}
                title={disabled && disabledReason ? disabledReason : undefined}
                className={styles.btn}
                disabled={disabled}
                onClick={onClick}
                data-card-menu-kind={kind}
                style={{ outline: "none" }}
            >
                <PublicAsset src={src} alt="" className={styles.img} />
                <span className={styles.label}>{label}</span>
            </button>
            {showDisabledReason && disabled && disabledReason ? (
                <p className={styles.reason}>{disabledReason}</p>
            ) : null}
        </div>
    )
}
