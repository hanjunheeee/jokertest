/**
 * 인게임 설정 — 방관리 탭 (방장 전용)
 */
import { useState } from "react"
import { INGAME_SETTING_ROOM_ROWS } from "../../../constants/controls/ingameSetting/ingameSettingData.js"
import { INGAME_SETTING_TAB_BODY_CLASS } from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import SettingRoomRow from "./SettingRoomRow.jsx"

export default function SettingRoomTab({ onOpenKickPlayer }) {
  const [checks, setChecks] = useState(() =>
    Object.fromEntries(
      INGAME_SETTING_ROOM_ROWS.filter((row) => row.kind === "checkbox").map(
        ({ id, defaultChecked }) => [id, defaultChecked],
      ),
    ),
  )

  const handleRoomAction = (rowId) => {
    if (rowId === "kick-player") {
      onOpenKickPlayer?.()
    }
  }

  return (
    <div className={INGAME_SETTING_TAB_BODY_CLASS}>
      {INGAME_SETTING_ROOM_ROWS.map((row) =>
        row.kind === "action" ? (
          <SettingRoomRow
            key={row.id}
            title={row.title}
            description={row.description}
            variant="action"
            actionLabel={row.actionLabel}
            actionTone={row.actionTone}
            onAction={() => handleRoomAction(row.id)}
          />
        ) : (
          <SettingRoomRow
            key={row.id}
            title={row.title}
            description={row.description}
            variant="checkbox"
            checked={checks[row.id]}
            onChange={(next) => setChecks((prev) => ({ ...prev, [row.id]: next }))}
          />
        ),
      )}
    </div>
  )
}
