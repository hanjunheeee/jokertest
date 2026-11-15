// 재판 연출 버튼 칸: 유죄·무죄 버튼(못 누르면 이유 안내 글)
// 재판 연출 창(TribunalOverlay)이 씀, 안내 글 모양은 데스크톱 상수 (판정은 표가 다 차면 서버가 5초 뒤 함)
import { NOTICE_CLASS } from "@/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js"
import VoteButtons from "./VoteButtons.jsx"

export default function TribunalActions({
    showVoteButtons,
    noticeText,
    voteDisabled,
    onVoteGuilty,
    onVoteNotGuilty,
}) {
    if (showVoteButtons) {
        return <VoteButtons disabled={voteDisabled} onGuilty={onVoteGuilty} onNotGuilty={onVoteNotGuilty} />
    }
    return noticeText ? <p className={NOTICE_CLASS}>{noticeText}</p> : null
}
