import { useRef } from "react"
import { useInGamePlayerSessionContext } from "../../InGamePlayerSessionContext.js"
import { resolvePlayerRecordListProfileAssets } from "../../../constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import {
  SCROLL_CLASS,
  SCROLL_WRAP_CLASS,
} from "../../../constants/controls/playerRecordList/ingamePlayerRecordListLayout.js"
import SidePanelHeader from "../SidePanelHeader.jsx"
import PlayerRecordListRow from "./PlayerRecordListRow.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

export default function PlayerRecordListContent() {
  const scrollRef = useRef(null)
  const { players } = useInGamePlayerSessionContext()

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
              />
            )
          })}
        </ul>

        <Scrollbar scrollRef={scrollRef} />
      </div>
    </div>
  )
}
