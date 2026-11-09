// 설정 창 아래 공통 그림 버튼 (방 코드·개발용 타이머 자리 등)
// 방 코드 버튼·타이머 자리 버튼이 씀
import { INGAME_SETTING_ASSETS } from "../../../constants/controls/ingameSetting/ingameSettingAssets.js"
import {
  ROOM_CODE_BTN_CLASS,
  ROOM_CODE_BTN_IMG_CLASS,
  ROOM_CODE_BTN_LABEL_CLASS,
  SETTING_FOOTER_ACTION_BTN_WRAP_CLASS,
} from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_FOCUS_RING_CLASS } from "../../../constants/ingameFocusRing.js"

export default function SettingFooterImageButton({
  ariaLabel,
  label,
  onClick,
  title,
  timerPlacementDevMarker = false,
  wrapClassName = SETTING_FOOTER_ACTION_BTN_WRAP_CLASS,
}) {
  return (
    <div className={wrapClassName}>
      <button
        type="button"
        aria-label={ariaLabel}
        title={title}
        onClick={onClick}
        className={`${ROOM_CODE_BTN_CLASS} ${INGAME_FOCUS_RING_CLASS}`}
        {...(timerPlacementDevMarker ? { "data-ingame-timer-placement-dev": "" } : {})}
      >
        <PublicAsset
          src={INGAME_SETTING_ASSETS.roomCodeButton}
          alt=""
          className={ROOM_CODE_BTN_IMG_CLASS}
        />
        <span className={ROOM_CODE_BTN_LABEL_CLASS} aria-hidden="true">
          {label}
        </span>
      </button>
    </div>
  )
}
