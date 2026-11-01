// 인게임 기록 시트: 플레이어 리스트(프로필·이름·판 수·승률)
// InGamePage 위 줄이 { open, onClose }로 엶, 목록은 데스크톱 플레이어 세션 문맥 그대로 (PlayerRecordListContent와 같음)
import { getPlayerRecordListFallbackProfileAssets } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import Sheet from "./frame/Sheet.jsx"
import RecordRow from "./record/RecordRow.jsx"

// 전적 값이 둘 다 온 사람만 숫자를 넘김 (아니면 조회 실패 글)
export default function RecordSheet({ open, onClose }) {
  const { players } = useInGamePlayerSessionContext()

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="플레이어 리스트"
      ariaLabel="플레이어별 전적목록"
      subtitle="모든 플레이어의 전적과 정보를 확인할 수 있습니다."
      closeLabel="플레이어별 전적목록 닫기"
      testId="record-sheet"
    >
      <ul aria-label="플레이어 전적 목록" className="flex flex-col">
        {players.map((player, index) => {
          // 프로필 그림은 줄 순서대로 기본 그림을 돌려 씀 (데스크톱과 같음)
          const fallback = getPlayerRecordListFallbackProfileAssets(index)
          const hasRecord = Object.hasOwn(player, "accountTotalGames") && Object.hasOwn(player, "accountWinRate")
          return (
            <RecordRow
              key={player.id}
              playerId={player.id}
              name={player.nickname}
              totalGames={hasRecord ? player.accountTotalGames : undefined}
              winRate={hasRecord ? player.accountWinRate : undefined}
              profilePhotoSrc={fallback.profilePhotoSrc}
              profileBorderSrc={fallback.profileBorderSrc}
            />
          )
        })}
      </ul>
    </Sheet>
  )
}
