// 인게임 시트 공통 모양 (뒤판·어두운 판·움직임·닫기 버튼·층)
// sheets/frame/Sheet.jsx·CloseButton.jsx가 씀 (store 시트 틀 복사본, 바탕만 데스크톱 인게임 옆 창처럼 어둡게)

// 데스크톱 옆 창과 비슷한 짧은 움직임
export const SHEET_TRANSITION = { duration: 0.3, ease: [0.22, 1, 0.36, 1] }

// 층: 기본 시트(설정·기록) 위에 겹 시트(추방·방 코드)가 뜸 → 뒤판·판 z값 짝
export const SHEET_LAYERS = {
  base: { backdrop: "z-[60]", panel: "z-[61]" },
  top: { backdrop: "z-[64]", panel: "z-[65]" },
}

// 화면 틀이 container라서 fixed가 틀에 갇힘 → body로 portal 뒤 이 층에 띄움
export const BACKDROP_CLASS =
  "fixed inset-0 cursor-default border-0 bg-black/62 p-0 backdrop-blur-[3px]"

// 데스크톱 옆 창 틀(친구목록 틀)의 짙은 갈색 판·금빛 테두리 느낌
export const PANEL_TONE_CLASS =
  "border-2 border-b-0 border-[#8a6a3e]/70 bg-[#1d1309] text-[#f5f0e6] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_-10px_30px_rgba(0,0,0,0.6)]"

// 폰은 화면 폭 전체, 태블릿·가로는 가운데 폭 제한
export const PANEL_CLASS =
  "fixed inset-x-0 bottom-0 mx-auto flex max-h-[88svh] w-full flex-col overflow-hidden rounded-t-[1.1rem] md:max-w-xl land:max-w-lg land:max-h-[94svh]"

// 닫기 버튼 (누르는 자리 44px, 그림은 그 안)
export const CLOSE_BTN_CLASS =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none active:scale-95"

export const CLOSE_IMG_CLASS = "block h-9 w-9 select-none object-contain"

export const SHEET_TITLE_CLASS =
  "min-w-0 flex-1 truncate font-display app-text-scaled [--app-text-size:1.25rem] font-medium text-[#f5ead2] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 제목 아래 설명 한 줄 (데스크톱 옆 창 머리 설명)
export const SHEET_SUBTITLE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:0.82rem] leading-snug text-[#ebe2cc]/75"

// 데스크톱 옆 창 닫기 그림
export const CLOSE_BUTTON_SRC = "/button/팝업 닫기 버튼.png"
