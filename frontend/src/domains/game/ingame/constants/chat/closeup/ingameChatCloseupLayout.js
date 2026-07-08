/**
 * 인게임 채팅 클로즈업 레이아웃.
 *
 * InGameChatCloseupOverlay·variant="closeup" InGameChatContent에서 사용합니다.
 */
import {
  INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME,
  mapFrameInsetToLayoutBox,
} from "../ingameChatFrameLayout.js"

export const INGAME_CHAT_CLOSEUP_PANEL_TRANSITION = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1],
}

/** 전체 화면 dim — 클릭 시 닫기 */
export const INGAME_CHAT_CLOSEUP_BACKDROP_CLASS =
  "fixed inset-0 z-[45] cursor-default border-0 bg-black/45 p-0"

/** 클로즈업 패널 — 중앙 정렬 (perspective 없음) */
export const INGAME_CHAT_CLOSEUP_PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[46] flex items-center justify-center px-[clamp(0.5rem,2vw,1rem)] py-[clamp(0.75rem,3vh,1.5rem)]"

/** 채팅 프레임 컨테이너 — 보드보다 크게 (cqi 타이포 자동 확대) */
const INGAME_CHAT_CLOSEUP_PANEL_WIDTH_BASE = {
  minRem: 44,
  midVw: 84,
  maxRem: 66,
}

export function getInGameChatCloseupPanelStyle() {
  const { minRem, midVw, maxRem } = INGAME_CHAT_CLOSEUP_PANEL_WIDTH_BASE
  return {
    width: `clamp(${minRem}rem, ${midVw}vw, ${maxRem}rem)`,
  }
}

export const INGAME_CHAT_CLOSEUP_PANEL_INNER_CLASS =
  "pointer-events-auto relative w-full [container-type:inline-size]"

/** 클로즈업 — 프레임 우측 상단 닫기 */
export const INGAME_CHAT_CLOSEUP_CLOSE_BUTTON_CLASS =
  "interactive-scale absolute right-[clamp(-0.35rem,-0.8cqi,-0.1rem)] top-[clamp(-0.15rem,0.6cqi,0.25rem)] z-20 block w-[clamp(4rem,10cqi,6rem)] cursor-pointer border-0 bg-transparent p-0 leading-none"

/** 인게임-채팅창프레임2.png — 클로즈업 메시지 목록 */
const CHAT_MESSAGE_LIST_INSET_FRAME_CLOSEUP = {
  top: 8,
  left: 4 + INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME,
  right: 7,
  height: 65,
}

/** 인게임-채팅창프레임2.png — 클로즈업 텍스트 입력줄 + 보내기 버튼 (세로 확대) */
const CHAT_TEXT_FIELD_INSET_FRAME_CLOSEUP = {
  bottom: 4,
  left: 5,
  right: 5,
  height: 14,
}

/** InGameChatContent — 클로즈업 메시지 목록 inset (scale 보정 적용) */
export const INGAME_CHAT_CLOSEUP_MESSAGE_LIST_INSET = mapFrameInsetToLayoutBox(
  CHAT_MESSAGE_LIST_INSET_FRAME_CLOSEUP,
)

/** InGameChatContent — 클로즈업 입력줄 inset */
export const INGAME_CHAT_CLOSEUP_TEXT_FIELD_INSET = mapFrameInsetToLayoutBox(
  CHAT_TEXT_FIELD_INSET_FRAME_CLOSEUP,
)

/** 클로즈업 — 입력·목록 타이포 (보드 대비 cqi·rem 상향) */
export const INGAME_CHAT_CLOSEUP_TEXT_TYPOGRAPHY_CLASS =
  "font-subheading text-[clamp(0.95rem,4.15cqi,1.28rem)] font-bold leading-[1.35] tracking-[0.04em] text-[#3a1a0c]"

/** 클로즈업 — 1줄 line-height */
export const INGAME_CHAT_CLOSEUP_INPUT_SINGLE_LINE_HEIGHT_CLASS =
  "max-h-[clamp(1.28rem,5.6cqi,1.75rem)]"

/** 클로즈업 — 입력 viewport (2줄 peek + 큰 타이포) */
export const INGAME_CHAT_CLOSEUP_INPUT_VIEWPORT_FIXED_HEIGHT_CLASS =
  "h-[clamp(2.35rem,9.2cqi,3.05rem)]"

/** 클로즈업 — 채팅 내역 줄바꿈 폭 trim */
export const INGAME_CHAT_CLOSEUP_TEXT_WRAP_TRIM_CLASS =
  "pl-[clamp(0.35rem,1.5cqi,0.6rem)] pr-[clamp(1.1rem,4.8cqi,2.1rem)]"

/** 클로즈업 — 입력창 우측 시프트 (값을 키우면 더 오른쪽에서 시작) */
export const INGAME_CHAT_CLOSEUP_INPUT_SHIFT_CLASS =
  "ml-[clamp(2rem,10cqi,3.25rem)]"

/** 클로즈업 — 보내기 버튼 */
export const INGAME_CHAT_CLOSEUP_SEND_BUTTON_CLASS =
  "interactive-scale relative block w-[clamp(5.75rem,38cqi,8.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0"

export const INGAME_CHAT_CLOSEUP_SEND_BUTTON_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.88rem,4.75cqi,1.18rem)] font-bold text-[#e9b582] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/** 값을 키우면 왼쪽으로 이동 */
export const INGAME_CHAT_CLOSEUP_SEND_BUTTON_SHIFT_CLASS =
  "-translate-x-[clamp(1.85rem,9.5cqi,2.85rem)]"
