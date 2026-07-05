/**
 * @file roomCodeFrameStyles.js
 * @desc RoomCodeFrame·LabelledActionButton이 사용하는 위치(inset)·클래스 스타일 상수 모음
 */

/** RoomCodeFrame 하단 footer(취소·참여·복사 버튼) 영역 inset */
export const ROOM_CODE_FRAME_FOOTER_INSET = {
  paddingLeft: "9.5%",
  paddingRight: "9.5%",
  paddingBottom: "7.5%",
}

/** RoomCodeFrame 중앙 6칸 방코드 입력 슬롯 영역 inset */
export const ROOM_CODE_FRAME_INPUT_INSET = {
  top: "48.4%",
  left: "10.6%",
  right: "12.6%",
  height: "12.8%",
}

/** 방코드 프레임 하단 액션 버튼(취소·참여·복사) 공통 버튼 클래스 */
export const ROOM_CODE_ACTION_BTN_CLASS =
  "interactive-scale relative w-[clamp(11.4rem,19%,15.25rem)] shrink-0 leading-none"

/** 액션 버튼 이미지 위에 겹치는 텍스트 라벨 스타일 */
export const ROOM_CODE_ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(1.05rem,1.55vw,1.3rem)] font-bold tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

/** 방코드 입력 프레임 PNG 이미지 스타일 */
export const ROOM_CODE_FRAME_IMAGE_CLASS =
  "pointer-events-none block h-auto w-full select-none drop-shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
