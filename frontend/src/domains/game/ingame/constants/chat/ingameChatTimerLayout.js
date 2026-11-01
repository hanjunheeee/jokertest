// 채팅 틀 안쪽 단계 타이머 모양: 타이머 자리·층, 타이머 켜면 메시지 목록 내리는 값
// 단계 타이머 묶음(InGamePhaseTurnTimerPanel)·판 위 채팅 모양 상수가 사용
import {
  CONTENT_SHIFT_LEFT_FRAME,
  mapFrameInsetToLayoutBox,
} from "./ingameChatFrameLayout.js"

// 타이머 켜면 메시지 목록 위를 이만큼 내리고 높이도 같은 만큼 줄임 (틀 기준 %)
export const EMBEDDED_TIMER_LIST_OFFSET_FRAME = 12

// 틀 그림 위쪽 타이머 바 자리 (메시지 목록과 겹쳐도 됨)
const EMBEDDED_TIMER_INSET_FRAME = {
  top: 7,
  left: 2 + CONTENT_SHIFT_LEFT_FRAME,
  right: 10,
  height: 12.5,
}

export const EMBEDDED_TIMER_INSET = mapFrameInsetToLayoutBox(
  EMBEDDED_TIMER_INSET_FRAME,
)

// 채팅 틀 안, 메시지 목록 위 층 (글자 크기는 틀 폭 기준)
export const EMBEDDED_TIMER_WRAP_CLASS =
  "pointer-events-none absolute z-[4] min-h-0 [container-type:inline-size]"
