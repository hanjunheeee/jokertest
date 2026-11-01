// 재판 연출 버튼 칸: 유죄·무죄 버튼(못 누르면 이유 안내 글)과 재판 판정 버튼
// 재판 연출 창(TribunalOverlay)이 씀
import VoteButtons from "./VoteButtons.jsx"

const NOTICE_CLASS =
    "text-center font-subheading text-[0.9rem] font-semibold leading-snug text-white/80 [word-break:keep-all] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

const RESOLVE_BTN_CLASS =
    "min-h-11 rounded-md border border-white/25 bg-black/50 px-5 py-2 font-subheading text-[0.95rem] font-semibold text-white/80 active:bg-black/65 disabled:cursor-not-allowed disabled:opacity-40"

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
