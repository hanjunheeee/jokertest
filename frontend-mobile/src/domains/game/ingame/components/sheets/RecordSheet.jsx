// 인게임 기록 시트: 플레이어 리스트(프로필·이름·판 수·승률)·줄마다 신고 버튼과 신고 창 (재판·다른 연출 창이 뜨면 신고 창 닫음)
// InGamePage 위 줄이 { open, onClose }로 엶, 목록은 데스크톱 플레이어 세션 문맥 그대로 (PlayerRecordListContent와 같음)
import { resolvePlayerRecordListProfileAssets } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import Sheet from "./frame/Sheet.jsx"
import RecordRow from "./record/RecordRow.jsx"
import { useGameReport } from "@/domains/report/hooks/useGameReport.js"
import ReportRowButton from "@m/domains/report/ReportRowButton.jsx"
import ReportSheet from "@m/domains/report/ReportSheet.jsx"
import { selectOverlayOpen, useOverlayBridge } from "@m/domains/game/ingame/hooks/overlays/overlayBridge.js"
import { selectTribunalPresentationOpen } from "@m/domains/game/ingame/utils/tribunalOpen.js"

// 전적 값이 둘 다 온 사람만 숫자를 넘김 (아니면 조회 실패 글)
export default function RecordSheet({ open, onClose }) {
  const { players } = useInGamePlayerSessionContext()
  // 신고 창 (나·판 id 없음은 버튼 안 보임)
  const report = useGameReport()
  // 재판·다른 연출 창이 뜨면 신고 창도 닫음: 신고 창이 연출 창 위에 남아 단추를 가림, 열림 값이 남으면 시트를 다시 열 때 저절로 뜸
  // 전적 시트는 화면 훅(useInGamePage)이 닫음 (그리는 중에 바로 맞춤)
  const tribunalOpen = useInGameStore(selectTribunalPresentationOpen)
  const overlayOpen = useOverlayBridge(selectOverlayOpen)
  if ((tribunalOpen || overlayOpen) && report.isOpen) report.close()

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
          // 그 사람 사진·테두리, 없을 때만 줄 순서 기본 그림 (데스크톱과 같음)
          const profile = resolvePlayerRecordListProfileAssets(player, index)
          const hasRecord = Object.hasOwn(player, "accountTotalGames") && Object.hasOwn(player, "accountWinRate")
          return (
            <RecordRow
              key={player.id}
              playerId={player.id}
              name={player.nickname}
              totalGames={hasRecord ? player.accountTotalGames : undefined}
              winRate={hasRecord ? player.accountWinRate : undefined}
              profilePhotoSrc={profile.profilePhotoSrc}
              profileBorderSrc={profile.profileBorderSrc}
              trailing={report.canReport(player.id) ? (
                <ReportRowButton
                  name={player.nickname}
                  done={report.isReported(player.id)}
                  onClick={() => report.open({ uuid: player.id, nickname: player.nickname })}
                />
              ) : null}
            />
          )
        })}
      </ul>
      <ReportSheet dialog={report} />
    </Sheet>
  )
}
