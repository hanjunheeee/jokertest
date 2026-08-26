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
import { buildInGameTargetE2eAttrs } from "../../constants/e2e/ingameE2eHooks.js"

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

/**
 * 투표/스킬 대상을 고르는 플레이어 버튼 목록입니다.
 *
 * 각 버튼에는 buildInGameTargetE2eAttrs가 만든 대상 uuid data 훅을 얹습니다 — 표시에는
 * 영향이 없고, E2E가 닉네임 문자열이 아니라 canonical uuid로 대상을 지목할 수 있게 합니다.
 *
 * @param {Array} players buildNightActionTargets/buildDayVoteTargets가 만든 대상 목록. 선택 가능
 *   여부는 빌더가 selectable로 확정해 넘깁니다(생존/사망 기준 포함) — 이 컴포넌트는 alive를
 *   표시(상태 dot·"생존/사망" 라벨)에만 씁니다. 사망자를 목록에 포함시키는 빌더는 그 항목의
 *   selectable을 반드시 스스로 명시해야 합니다.
 * @param {string|null} selectedTargetId 지금 선택된 대상의 uuid
 * @param {Function} onSelect 대상 버튼을 눌렀을 때 uuid를 받는 콜백
 * @param {boolean} disabled 목록 전체를 잠글지 여부
 * @flow players를 순회하며 항목별로 선택 여부·비활성 조건(연결끊김·선택 불가)을 계산해
 *   버튼 하나씩을 그립니다.
 */
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
            disabled={disabled || !player.connected || player.selectable === false}
            aria-pressed={isSelected}
            className={isSelected ? INGAME_ACTION_SELECTED_TARGET_BUTTON_CLASS : INGAME_ACTION_TARGET_BUTTON_CLASS}
            onClick={() => onSelect(player.id)}
            {...buildInGameTargetE2eAttrs(player)}
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
