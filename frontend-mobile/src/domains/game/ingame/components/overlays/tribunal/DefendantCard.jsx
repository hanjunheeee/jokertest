// 재판 피고 카드: 판 카드와 같은 그림(초상·상태 표시·테마 테두리·틀·이름판), 데스크톱 InGamePlayerCard를 넘기는 값 그대로
// 재판 연출 창(TribunalOverlay)이 씀, 카드 그림은 판 담당의 PlayerCard를 불러 씀 (시험 표시는 판 카드와 겹치지 않게 뺌)
import PlayerCard from "../../board/PlayerCard.jsx"

// defendant = 플레이어 세션 목록의 한 사람 (portraitSrc·frameSrc·nickname·status·theme)
export default function DefendantCard({ defendant, className = "" }) {
    return (
        <div className={className} data-tribunal-defendant={defendant.id}>
            <PlayerCard
                portraitSrc={defendant.portraitSrc}
                frameSrc={defendant.frameSrc}
                nickname={defendant.nickname}
                status={defendant.status}
                theme={defendant.theme}
                withE2e={false}
                className="w-full"
            />
        </div>
    )
}
