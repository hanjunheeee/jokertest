// 파일 역할: PlayerRecordListContent.jsx - 화면을 구성하는 컴포넌트입니다.
/**
 * 플레이어별 전적목록 — 본문 (헤더 + 스크롤 목록)
 */
import { useRef } from "react"
import { useInGamePlayerSessionContext } from "../../InGamePlayerSessionContext.js"
import { DUMMY_PLAYER_RECORDS, getPlayerRecordListFallbackProfileAssets } from "../../../constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import {
  INGAME_PLAYER_RECORD_LIST_SCROLL_CLASS,
  INGAME_PLAYER_RECORD_LIST_SCROLL_WRAP_CLASS,
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

      <div className={INGAME_PLAYER_RECORD_LIST_SCROLL_WRAP_CLASS}>
        <ul
          ref={scrollRef}
          className={INGAME_PLAYER_RECORD_LIST_SCROLL_CLASS}
          aria-label="플레이어 전적 목록"
        >
          {players.map((player, index) => {
            const stats = DUMMY_PLAYER_RECORDS[index]
            const fallbackProfile = getPlayerRecordListFallbackProfileAssets(index)

            return (
              <PlayerRecordListRow
                key={player.id}
                playerId={player.id}
                name={player.nickname}
                wins={stats?.wins ?? 0}
                losses={stats?.losses ?? 0}
                winRate={stats?.winRate ?? 0}
                profilePhotoSrc={stats?.profilePhotoSrc ?? fallbackProfile.profilePhotoSrc}
                profileBorderSrc={stats?.profileBorderSrc ?? fallbackProfile.profileBorderSrc}
              />
            )
          })}
        </ul>

        <Scrollbar scrollRef={scrollRef} />
      </div>
    </div>
  )
}