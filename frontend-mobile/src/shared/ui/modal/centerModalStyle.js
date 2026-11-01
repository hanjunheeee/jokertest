// 밝은 가운데 창 모양 (뒤판·창 자리·닫기 버튼 자리·열고 닫는 움직임)
// CenterModal이 씀, 색·움직임은 데스크톱 상점 겹창·프로필 테두리 확대 창 값 (화면 폴더라 못 불러 옮겨 적음)

// 뒤판 (데스크톱 BACKDROP_CLASS 색), 화면 틀이 container라 body로 띄워 z를 틀 위로
export const BACKDROP_CLASS =
  "fixed inset-0 z-[60] cursor-default border-0 bg-[#1a0f0a]/62 p-0 backdrop-blur-[4px]"

// 창 자리: 가운데, 안전영역 안쪽
export const WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[61] flex items-center justify-center px-[max(1rem,env(safe-area-inset-left,0px))] py-[max(1rem,env(safe-area-inset-top,0px))]"

// 닫기 버튼 자리 (오른쪽 위, 누르는 칸 44px)
export const CLOSE_BTN_CLASS =
  "interactive-scale absolute right-1.5 top-1.5 z-20 flex h-11 w-11 items-center justify-center leading-none"

export const CLOSE_ICON_CLASS = "block h-auto w-[2.35rem] select-none"

// 커지며 떠오름 (데스크톱 겹창과 같은 값), 시간은 창마다 데스크톱 상수로 받음
export const PANEL_MOTION = {
  initial: { opacity: 0, scale: 0.94, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 8 },
}
