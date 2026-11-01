// 결과 화면 대기 시간·결과 없음 안내 상수
// page/GameResultPage가 씀

// 새로고침 직후 판 상태를 받아 오는 동안 빈 화면으로 기다리는 최대 시간
export const BOOTSTRAP_HOLD_MS = 6000

// 결과가 없을 때 쓰는 글자 버튼
export const PLAIN_BTN_CLASS =
  "cursor-pointer border-0 bg-transparent p-0 font-subheading app-text-scaled [--app-text-size:clamp(0.85rem,1.2vw,1.05rem)] font-semibold text-[#f5e6c8] underline decoration-dotted underline-offset-4 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

// 결과 없음 안내
export const UNAVAILABLE_WRAP_CLASS =
  "absolute inset-0 z-10 flex flex-col items-center justify-center gap-[1.1rem] px-[clamp(1rem,5vw,3rem)] text-center"
export const UNAVAILABLE_TITLE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(1.05rem,2vw,1.6rem)] font-bold text-[#f5e6c8] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"
export const UNAVAILABLE_BODY_CLASS =
  "max-w-[36rem] font-subheading app-text-scaled [--app-text-size:clamp(0.82rem,1.25vw,1rem)] leading-relaxed text-[#f0e0c8]/85"

export const RESULT_UNAVAILABLE_TITLE = "게임 결과를 확인할 수 없습니다"
export const RESULT_UNAVAILABLE_BODY =
  "이 판의 결과는 화면이 종료까지 받아 둔 값으로만 보여드립니다. 새로고침 등으로 그 값이 사라졌거나 이 계정의 참가 자격이 이미 정리된 경우에는 다시 불러올 수 없습니다."
