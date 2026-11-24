// 역할 공개(ROLE_REVEAL) 동안 화면을 살짝 어둡게 하고 입장 안내 문구 (역할 창은 위에 그대로)
// OverlayLayer가 씀, 글·모양은 데스크톱 InGameEntryPreparingOverlay와 같은 상수 (화면 파일은 모바일 쪽에 따로 둠)
import {
    INGAME_ENTRY_PREPARING_BACKDROP_CLASS,
    INGAME_ENTRY_PREPARING_MESSAGE,
    INGAME_ENTRY_PREPARING_MESSAGE_CLASS,
} from "@/domains/game/ingame/constants/ingameEntryPreparing.js"

export default function EntryPreparingOverlay({ open = false }) {
    if (!open) return null

    return (
        <div
            className={INGAME_ENTRY_PREPARING_BACKDROP_CLASS}
            role="status"
            aria-live="polite"
            aria-busy="true"
            data-ingame-entry-preparing=""
        >
            <p className={INGAME_ENTRY_PREPARING_MESSAGE_CLASS}>{INGAME_ENTRY_PREPARING_MESSAGE}</p>
        </div>
    )
}
