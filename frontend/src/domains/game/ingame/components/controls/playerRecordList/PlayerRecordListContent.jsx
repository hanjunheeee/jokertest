// 파일 역할: PlayerRecordListContent.jsx - 화면을 구성하는 컴포넌트입니다.
/**
 * 플레이어별 전적목록 — 본문 (헤더 + 스크롤 목록)
 */
import { useRef } from "react"
import { useInGamePlayerSessionContext } from "../../InGamePlayerSessionContext.js"
import { getPlayerRecordListFallbackProfileAssets } from "../../../constants/controls/playerRecordList/ingamePlayerRecordListData.js"
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
            const fallbackProfile = getPlayerRecordListFallbackProfileAssets(index)
            // CO S-1(AC-05): 전적은 슬롯 index가 아니라 **그 플레이어 자신**에게서만 온다.
            // 예전에는 index로 더미 배열을 찾아 남의 자리 숫자를 그렸다. 서버가 조회하지 못한
            // 참가자는 두 키가 아예 없으므로(own-property 계약) 값을 넘기지 않고, 행이
            // "조회 실패"라고 말하게 둔다 — 0판 0%로 꾸미지 않는다.
            const hasRecord =
              Object.hasOwn(player, "accountTotalGames") && Object.hasOwn(player, "accountWinRate")

            return (
              <PlayerRecordListRow
                key={player.id}
                playerId={player.id}
                name={player.nickname}
                totalGames={hasRecord ? player.accountTotalGames : undefined}
                winRate={hasRecord ? player.accountWinRate : undefined}
                profilePhotoSrc={fallbackProfile.profilePhotoSrc}
                profileBorderSrc={fallbackProfile.profileBorderSrc}
              />
            )
          })}
        </ul>

        <Scrollbar scrollRef={scrollRef} />
      </div>
    </div>
  )
}
