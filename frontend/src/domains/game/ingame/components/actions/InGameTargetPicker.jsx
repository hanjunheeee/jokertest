// 파일 역할: InGameTargetPicker.jsx - 화면을 구성하는 컴포넌트입니다.
import {
  INGAME_ACTION_SELECTED_TARGET_BUTTON_CLASS,
  INGAME_ACTION_TARGET_BUTTON_CLASS,
} from "../../constants/actions/ingameActionPanel.js"

/** 투표/스킬 대상을 고르는 플레이어 버튼 목록입니다. */
export default function InGameTargetPicker({
  players,
  selectedTargetId,
  onSelect,
  disabled = false,
}) {
  return (
    <div className="grid max-h-32 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
      {players.map((player) => (
        <button
          key={player.id}
          type="button"
          disabled={disabled || !player.alive || !player.connected || player.selectable === false}
          className={
            selectedTargetId === player.id
              ? INGAME_ACTION_SELECTED_TARGET_BUTTON_CLASS
              : INGAME_ACTION_TARGET_BUTTON_CLASS
          }
          onClick={() => onSelect(player.id)}
        >
          <span className="block truncate">{player.name}</span>
          <span className="block text-[0.65rem] text-[#cdbb9e]">
            {!player.connected ? "연결끊김" : player.alive ? "생존" : "사망"}
          </span>
        </button>
      ))}
    </div>
  )
}
