/**
 * 플레이어별 전적목록 — 본문 (헤더 + 스크롤 목록)
 */
import { useRef } from "react"
import { DUMMY_PLAYER_RECORDS } from "../../../constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import {
  INGAME_PLAYER_RECORD_LIST_SCROLL_CLASS,
  INGAME_PLAYER_RECORD_LIST_SCROLL_WRAP_CLASS,
} from "../../../constants/controls/playerRecordList/ingamePlayerRecordListLayout.js"
import PlayerRecordListHeader from "./PlayerRecordListHeader.jsx"
import PlayerRecordListRow from "./PlayerRecordListRow.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

export default function PlayerRecordListContent() {
  const scrollRef = useRef(null)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PlayerRecordListHeader />

      <div className={INGAME_PLAYER_RECORD_LIST_SCROLL_WRAP_CLASS}>
        <ul
          ref={scrollRef}
          className={INGAME_PLAYER_RECORD_LIST_SCROLL_CLASS}
          aria-label="플레이어 전적 목록"
        >
          {DUMMY_PLAYER_RECORDS.map((record, index) => (
            <PlayerRecordListRow key={record.id} index={index} {...record} />
          ))}
        </ul>

        <Scrollbar scrollRef={scrollRef} />
      </div>
    </div>
  )
}
