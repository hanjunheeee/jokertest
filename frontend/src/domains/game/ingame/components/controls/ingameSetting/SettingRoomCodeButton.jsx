/**
 * 인게임 설정 패널 — 방 코드 보기(모든 참가자 공통, 우측 하단 고정)
 */
import { INGAME_SETTING_ASSETS } from "../../../constants/controls/ingameSetting/ingameSettingAssets.js"
import {
  INGAME_SETTING_ROOM_CODE_BTN_CLASS,
  INGAME_SETTING_ROOM_CODE_BTN_IMG_CLASS,
  INGAME_SETTING_ROOM_CODE_BTN_LABEL_CLASS,
  INGAME_SETTING_ROOM_CODE_BTN_WRAP_CLASS,
} from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function SettingRoomCodeButton({ onClick }) {
  return (
    <div className={INGAME_SETTING_ROOM_CODE_BTN_WRAP_CLASS}>
      <button
        type="button"
        aria-label="방 코드 보기"
        onClick={onClick}
        className={INGAME_SETTING_ROOM_CODE_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={INGAME_SETTING_ASSETS.roomCodeButton}
          alt=""
          className={INGAME_SETTING_ROOM_CODE_BTN_IMG_CLASS}
        />
        <span className={INGAME_SETTING_ROOM_CODE_BTN_LABEL_CLASS} aria-hidden="true">
          방 코드 보기
        </span>
      </button>
    </div>
  )
}
