// 파일 역할: InGameTargetPicker.jsx - 화면을 구성하는 컴포넌트입니다.
import {
  INGAME_ACTION_SELECTED_TARGET_BUTTON_CLASS,
  INGAME_ACTION_TARGET_BUTTON_CLASS,
  INGAME_ACTION_TARGET_GRID_CLASS,
  INGAME_ACTION_TARGET_NAME_CLASS,
  INGAME_ACTION_TARGET_STATUS_DOT_ALIVE_CLASS,
  INGAME_ACTION_TARGET_STATUS_DOT_DEAD_CLASS,
  INGAME_ACTION_TARGET_STATUS_DOT_DISCONNECTED_CLASS,
  INGAME_ACTION_TARGET_STATUS_ROW_CLASS,
} from "../../constants/actions/ingameActionPanel.js"

function resolveStatusDotClass(player) {
  if (!player.connected) return INGAME_ACTION_TARGET_STATUS_DOT_DISCONNECTED_CLASS
  return player.alive ? INGAME_ACTION_TARGET_STATUS_DOT_ALIVE_CLASS : INGAME_ACTION_TARGET_STATUS_DOT_DEAD_CLASS
}

// 카드 왼쪽의 원형 이니셜 아바타 — 이름 앞머리 한 글자로 "누구를 고를지" 한눈에 훑을 수 있게
// 돕는 장식 요소다(순수 프레젠테이션, 서버로 아무것도 전달하지 않는다).
function resolveInitial(player) {
  return typeof player.name === "string" && player.name.length > 0 ? player.name.slice(0, 1) : "?"
}

const TARGET_CARD_ROW_CLASS = "flex items-center gap-2"

const TARGET_CARD_AVATAR_CLASS =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#8a6a44]/40 bg-[#1c0f08]/70 text-[0.66rem] font-semibold text-[#f3e3c6]"

const TARGET_CARD_TEXT_COLUMN_CLASS = "flex min-w-0 flex-1 flex-col"

/** 투표/스킬 대상을 고르는 플레이어 버튼 목록입니다. */
export default function InGameTargetPicker({
  players,
  selectedTargetId,
  onSelect,
  disabled = false,
}) {
  return (
    <div className={INGAME_ACTION_TARGET_GRID_CLASS}>
      {players.map((player) => {
        const isSelected = selectedTargetId === player.id
        return (
          <button
            key={player.id}
            type="button"
            disabled={disabled || !player.alive || !player.connected || player.selectable === false}
            aria-pressed={isSelected}
            className={isSelected ? INGAME_ACTION_SELECTED_TARGET_BUTTON_CLASS : INGAME_ACTION_TARGET_BUTTON_CLASS}
            onClick={() => onSelect(player.id)}
          >
            <span className={TARGET_CARD_ROW_CLASS}>
              <span aria-hidden="true" className={TARGET_CARD_AVATAR_CLASS}>
                {resolveInitial(player)}
              </span>
              <span className={TARGET_CARD_TEXT_COLUMN_CLASS}>
                <span className={INGAME_ACTION_TARGET_NAME_CLASS}>{player.name}</span>
                <span className={INGAME_ACTION_TARGET_STATUS_ROW_CLASS}>
                  <span aria-hidden="true" className={resolveStatusDotClass(player)} />
                  {!player.connected ? "연결끊김" : player.alive ? "생존" : "사망"}
                </span>
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
