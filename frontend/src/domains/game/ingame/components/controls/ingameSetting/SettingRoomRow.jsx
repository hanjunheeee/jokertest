import { INGAME_SETTING_ASSETS } from "../../../constants/controls/ingameSetting/ingameSettingAssets.js"
import {
  CHECKBOX_CLASS,
  ROOM_ACTION_LINK_CLASS,
  ROOM_ACTION_LINK_DANGER_CLASS,
  ROOM_ROW_DESC_CLASS,
  ROOM_ROW_PLATE_CLASS,
  ROOM_ROW_TEXT_CLASS,
  ROOM_ROW_TITLE_CLASS,
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
    <div className={ROOM_ROW_PLATE_CLASS} data-setting-row>
      <div className={ROOM_ROW_TEXT_CLASS}>
        <span className={ROOM_ROW_TITLE_CLASS}>{title}</span>
        {description ? (
          <span className={ROOM_ROW_DESC_CLASS}>{description}</span>
        ) : null}
      </div>

      {variant === "action" ? (
        <button
          type="button"
          onClick={onAction}
          className={
            actionTone === "danger"
              ? ROOM_ACTION_LINK_DANGER_CLASS
              : ROOM_ACTION_LINK_CLASS
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
          className={CHECKBOX_CLASS}
        />
      )}
    </div>
  )
}
