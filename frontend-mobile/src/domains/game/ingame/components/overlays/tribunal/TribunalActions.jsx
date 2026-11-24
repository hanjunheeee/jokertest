// 재판 연출 버튼 칸: 유죄·무죄 버튼(못 누르면 이유 안내 글)
// 재판 연출 창(TribunalOverlay)·세로 재판 시트(TribunalSheet)가 씀, 안내 글 모양은 데스크톱 상수 (판정은 표가 다 차면 서버가 5초 뒤 함)
import { NOTICE_CLASS } from "@/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js"
import VoteButtons from "./VoteButtons.jsx"

// noticeClassName: 안내 글 모양 (기본은 어두운 연출 창 위 흰 글, 양피지 시트는 어두운 칸을 깔아 대비 맞춤)
export default function TribunalActions({
    showVoteButtons,
    noticeText,
    voteDisabled,
    onVoteGuilty,
    onVoteNotGuilty,
    noticeClassName = NOTICE_CLASS,
}) {
    if (showVoteButtons) {
        return <VoteButtons disabled={voteDisabled} onGuilty={onVoteGuilty} onNotGuilty={onVoteNotGuilty} />
    }
    return noticeText ? <p className={noticeClassName}>{noticeText}</p> : null
}
