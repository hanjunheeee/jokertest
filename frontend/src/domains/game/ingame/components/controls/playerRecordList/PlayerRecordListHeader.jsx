/**
 * 플레이어별 전적목록 — 헤더 (탑레벨 프레임 + 부제)
 */
import { INGAME_PLAYER_RECORD_LIST_ASSETS } from "../../../constants/controls/playerRecordList/ingamePlayerRecordListAssets.js"
import {
  INGAME_PLAYER_RECORD_LIST_HEADER_PLATE_CLASS,
  INGAME_PLAYER_RECORD_LIST_HEADER_SUBTITLE_CLASS,
  INGAME_PLAYER_RECORD_LIST_HEADER_TITLE_CLASS,
  INGAME_PLAYER_RECORD_LIST_HEADER_WRAP_CLASS,
} from "../../../constants/controls/playerRecordList/ingamePlayerRecordListLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function PlayerRecordListHeader() {
  return (
    <header className={INGAME_PLAYER_RECORD_LIST_HEADER_WRAP_CLASS}>
      <div className="relative w-full">
        <PublicAsset
          src={INGAME_PLAYER_RECORD_LIST_ASSETS.headerPlate}
          alt=""
          className={INGAME_PLAYER_RECORD_LIST_HEADER_PLATE_CLASS}
        />
        <h2 className={INGAME_PLAYER_RECORD_LIST_HEADER_TITLE_CLASS}>
          플레이어 리스트
        </h2>
      </div>
      <p className={INGAME_PLAYER_RECORD_LIST_HEADER_SUBTITLE_CLASS}>
        모든 플레이어의 전적과 정보를 확인할 수 있습니다.
      </p>
    </header>
  )
}
