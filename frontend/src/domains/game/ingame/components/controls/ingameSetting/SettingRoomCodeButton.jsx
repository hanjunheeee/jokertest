// 설정 창 아래 방 코드 보기 버튼
// 설정 창 내용(SettingPanelContent)이 사용, 누르면 방 코드 창을 엶
import { INGAME_SETTING_ASSETS } from "../../../constants/controls/ingameSetting/ingameSettingAssets.js"
import {
  ROOM_CODE_BTN_CLASS,
  ROOM_CODE_BTN_IMG_CLASS,
  ROOM_CODE_BTN_LABEL_CLASS,
  ROOM_CODE_BTN_WRAP_CLASS,
} from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 글자는 그림 위에 겹침, 화면 읽기는 aria-label만 읽게 글자 숨김
export default function SettingRoomCodeButton({ onClick }) {
  return (
    <div className={ROOM_CODE_BTN_WRAP_CLASS}>
      <button
        type="button"
        aria-label="방 코드 보기"
        onClick={onClick}
        className={ROOM_CODE_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={INGAME_SETTING_ASSETS.roomCodeButton}
          alt=""
          className={ROOM_CODE_BTN_IMG_CLASS}
        />
        <span className={ROOM_CODE_BTN_LABEL_CLASS} aria-hidden="true">
          방 코드 보기
        </span>
      </button>
    </div>
  )
}
