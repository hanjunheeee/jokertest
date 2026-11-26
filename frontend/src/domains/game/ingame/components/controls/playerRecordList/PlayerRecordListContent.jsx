// 플레이어 기록 목록 내용 (스크롤 목록·줄마다 신고 버튼과 신고 창, 화면 잠금·재판 연출 시 신고 창 닫음)
// PlayerRecordListPanel이 씀
import { useRef } from "react"
import { useInGamePlayerSessionContext } from "../../InGamePlayerSessionContext.js"
import { useInGameStore } from "../../../store/ingameStore.js"
import { resolvePlayerRecordListProfileAssets } from "../../../constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import {
  SCROLL_CLASS,
  SCROLL_WRAP_CLASS,
} from "../../../constants/controls/playerRecordList/ingamePlayerRecordListLayout.js"
import SidePanelHeader from "../SidePanelHeader.jsx"
import PlayerRecordListRow from "./PlayerRecordListRow.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"
import ReportDialog from "@/domains/report/components/ReportDialog.jsx"
import ReportRowButton from "@/domains/report/components/ReportRowButton.jsx"
import { useGameReport } from "@/domains/report/hooks/useGameReport.js"

// 재판 연출이 떠 있는지 (재판 중·피고 있음·판정 전), 인게임 화면·문지기·채팅 틀과 같은 조건
function selectTribunalPresentationOpen(state) {
  return state?.phase === "TRIBUNAL"
    && Boolean(state?.tribunal?.defendantUuid)
    && state.tribunal.resolved !== true
}

// 전적 목록과 신고 창 그리기 (화면이 잠기면 body에 뜬 신고 창도 바로 닫기)
export default function PlayerRecordListContent({ interactionLocked = false }) {
  const scrollRef = useRef(null)
  const { players } = useInGamePlayerSessionContext()
  // 신고 창 (나·판 id 없음은 버튼 안 보임)
  const report = useGameReport()
  // 화면 잠금(단계 안내·아침 연출·재판 등)이 켜지면 body에 뜬 신고 창도 닫아 위 연출 가림 막기
  const tribunalPresentationOpen = useInGameStore((s) => selectTribunalPresentationOpen(s.state))
  if ((interactionLocked || tribunalPresentationOpen) && report.isOpen) report.close()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidePanelHeader
        title="플레이어 리스트"
        subtitle="모든 플레이어의 전적과 정보를 확인할 수 있습니다."
      />

      <div className={SCROLL_WRAP_CLASS}>
        <ul
          ref={scrollRef}
          className={SCROLL_CLASS}
          aria-label="플레이어 전적 목록"
        >
          {players.map((player, index) => {
            // 보드 카드와 같은 사람 사진, 없을 때만 기본 그림
            const profile = resolvePlayerRecordListProfileAssets(player, index)
            const hasRecord =
              Object.hasOwn(player, "accountTotalGames") && Object.hasOwn(player, "accountWinRate")

            return (
              <PlayerRecordListRow
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

        <Scrollbar scrollRef={scrollRef} />
      </div>
      <ReportDialog dialog={report} />
    </div>
  )
}
