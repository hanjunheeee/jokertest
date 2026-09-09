/**
 * 인게임 설정 — 방관리 행 (제목·설명 + 액션 링크 또는 체크박스)
 */
import { INGAME_SETTING_ASSETS } from "../../../constants/controls/ingameSetting/ingameSettingAssets.js"
import {
  INGAME_SETTING_CHECKBOX_CLASS,
  INGAME_SETTING_ROOM_ACTION_LINK_CLASS,
  INGAME_SETTING_ROOM_ACTION_LINK_DANGER_CLASS,
  INGAME_SETTING_ROOM_ROW_DESC_CLASS,
  INGAME_SETTING_ROOM_ROW_PLATE_CLASS,
  INGAME_SETTING_ROOM_ROW_TEXT_CLASS,
  INGAME_SETTING_ROOM_ROW_TITLE_CLASS,
} from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import CheckBox from "@/shared/ui/CheckBox.jsx"

export default function SettingRoomRow({
  title,
  description,
  variant,
  actionLabel,
  actionTone = "default",
  checked,
  onAction,
  onChange,
}) {
  return (
    <div className={INGAME_SETTING_ROOM_ROW_PLATE_CLASS} data-setting-row>
      <div className={INGAME_SETTING_ROOM_ROW_TEXT_CLASS}>
        <span className={INGAME_SETTING_ROOM_ROW_TITLE_CLASS}>{title}</span>
        {description ? (
          <span className={INGAME_SETTING_ROOM_ROW_DESC_CLASS}>{description}</span>
        ) : null}
      </div>

      {variant === "action" ? (
        <button
          type="button"
          onClick={onAction}
          className={
            actionTone === "danger"
              ? INGAME_SETTING_ROOM_ACTION_LINK_DANGER_CLASS
              : INGAME_SETTING_ROOM_ACTION_LINK_CLASS
          }
          style={{ outline: "none" }}
        >
          {actionLabel}
        </button>
      ) : (
        <CheckBox
          ariaLabel={title}
          checked={checked}
          onChange={onChange}
          checkboxSrc={INGAME_SETTING_ASSETS.checkbox}
          checkMarkSrc={INGAME_SETTING_ASSETS.checkMark}
          className={INGAME_SETTING_CHECKBOX_CLASS}
        />
      )}
    </div>
  )
}
