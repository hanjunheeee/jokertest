// 카톡형 채팅 틀(574×779)·입력줄(405×77) 위 텍스트·보내기 자리

export const TALK_CHAT_FRAME_ROOT_CLASS =
    "relative flex h-full min-h-0 w-full flex-col overflow-visible [container-type:inline-size]"

// 틀 그림: 아래 맞춤·높이 확장으로 위쪽 잘림 방지 (목록 inset은 그대로)
export const TALK_CHAT_FRAME_IMAGE_CLASS =
    "pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[108%] w-full origin-bottom scale-y-[0.965] select-none object-fill object-top"

// 틀 나무 안쪽 (양피지) — 비율은 모바일 채팅입력프레임.png 기준
export const TALK_CHAT_LIST_INSET_CLASS =
    "absolute inset-x-[6.5%] top-[13.8%] bottom-[7.2%] z-[1] flex min-h-0 flex-col"

// 채팅 틀 우측 상단(나무 장식 쪽) — 플레이어 목록·직업 행동
export const TALK_CHAT_ROSTER_BTN_CLASS =
    "absolute right-[5%] top-[3.4%] z-[2] flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none active:scale-95"

// 채팅 틀 좌측 상단 — 최후의 변론(재판) 시트 열기 (버튼(미선택) 그림 + 글자)
export const TALK_CHAT_TRIBUNAL_BTN_CLASS =
    "absolute left-[6.2%] top-[2%] z-[2] flex h-16 w-[clamp(5.5rem,30cqi,7.5rem)] shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none active:scale-95"

export const TALK_CHAT_TRIBUNAL_BTN_IMG_CLASS =
    "pointer-events-none block h-full w-full select-none object-contain"

export const TALK_CHAT_TRIBUNAL_BTN_LABEL_CLASS =
    "pointer-events-none absolute inset-0 flex items-center justify-center px-[8%] text-center font-subheading text-[clamp(0.64rem,3cqi,0.84rem)] font-bold leading-tight text-white translate-y-[clamp(0.05rem,0.35cqi,0.12rem)] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const TALK_CHAT_COMPOSER_BAR_CLASS =
    "relative w-full shrink-0 overflow-hidden transition-transform duration-150 ease-out aspect-[405/77] [container-type:inline-size]"

export const TALK_CHAT_COMPOSER_ROW_CLASS =
    "absolute inset-y-[14%] left-[5.5%] right-[4%] flex items-center gap-[clamp(0.1rem,1.2cqi,0.35rem)]"

// 리소스(입력줄 그림)는 그대로, 실제 textarea만 오른쪽 (cqi는 바에 container-type 필요)
export const TALK_CHAT_TEXTAREA_WRAP_CLASS = "relative min-w-0 flex-1"

export const TALK_CHAT_TEXTAREA_OFFSET_CLASS =
    "!pl-[clamp(0.55rem,5.5cqi,1.05rem)]"

export const TALK_CHAT_SEND_BTN_CLASS =
    "relative flex aspect-[83/37] h-[min(100%,2.45rem)] w-auto max-h-full shrink-0 -translate-x-[clamp(0.3rem,3cqi,0.65rem)] cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform duration-200 ease-out active:scale-[0.99]"

export const TALK_CHAT_SEND_IMG_CLASS = "block h-full w-auto max-h-full select-none"