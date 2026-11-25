// 재판 연출 버튼 칸: 유죄·무죄 버튼(못 누르면 이유 안내 글)과 재판 판정 버튼
// 재판 연출 창(TribunalOverlay)이 씀, 안내 글 모양은 데스크톱 상수, 판정 버튼은 데스크톱 색에서 hover만 뺌
import { NOTICE_CLASS } from "@/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js"
import VoteButtons from "./VoteButtons.jsx"

// 데스크톱 DEV_RESOLVE_BTN_CLASS (화면 아래 가운데 → 폰에선 버튼 칸 안)
const RESOLVE_BTN_CLASS =
    "min-h-11 cursor-pointer rounded-md border border-white/25 bg-black/50 px-6 py-2.5 font-subheading text-[1rem] font-semibold leading-tight text-white/75 transition active:border-white/40 active:bg-black/65 active:text-white/90 disabled:cursor-not-allowed disabled:opacity-40"

// 판정 버튼은 글자 받았을 때만
export default function TribunalActions({
    showVoteButtons,
    noticeText,
    voteDisabled,
    onVoteGuilty,
    onVoteNotGuilty,
    devResolveLabel,
    devResolveEnabled,
    onDevResolve,
}) {
    return (
        <>
            {showVoteButtons ? (
                <VoteButtons disabled={voteDisabled} onGuilty={onVoteGuilty} onNotGuilty={onVoteNotGuilty} />
            ) : noticeText ? (
                <p className={NOTICE_CLASS}>{noticeText}</p>
            ) : null}
            {devResolveLabel ? (
                <button
                    type="button"
                    className={RESOLVE_BTN_CLASS}
                    data-dev-tribunal-resolve=""
                    disabled={!devResolveEnabled}
                    onClick={() => onDevResolve?.()}
                >
                    {devResolveLabel}
                </button>
            ) : null}
        </>
    )
}
