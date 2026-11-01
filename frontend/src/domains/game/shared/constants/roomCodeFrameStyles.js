// 방코드 프레임 안쪽 자리와 행동 버튼 className
// mode 방코드 프레임·matching 방코드 모달·행동 버튼(LabelledActionButton)이 씀

// 아래쪽 버튼 줄 여백
export const FOOTER_INSET = {
  paddingLeft: "9.5%",
  paddingRight: "9.5%",
  paddingBottom: "7.5%",
}

// 코드 입력 칸 자리 (틀 그림 기준 %)
export const INPUT_INSET = {
  top: "48.4%",
  left: "10.6%",
  right: "12.6%",
  height: "12.8%",
}

// 행동 버튼·글자 모양
export const ROOM_CODE_ACTION_BTN_CLASS =
  "interactive-scale relative w-[clamp(11.4rem,19%,15.25rem)] shrink-0 leading-none"

export const ROOM_CODE_ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(1.05rem,1.55vw,1.3rem)] font-bold tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 틀 그림 모양
export const IMG_CLASS =
  "pointer-events-none block h-auto w-full select-none drop-shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
