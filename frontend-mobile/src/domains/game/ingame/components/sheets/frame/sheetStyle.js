// 인게임 시트 공통 모양 (뒤판·양피지 틀·머리 판·움직임·닫기 버튼·층)
// sheets/frame/Sheet.jsx·CloseButton.jsx가 씀, 그림·시간은 데스크톱 옆 창 상수 그대로
import { PANEL_ASSETS } from "@/domains/game/ingame/constants/controls/ingameSidePanelAssets.js"
import { PANEL_TRANSITION } from "@/domains/game/ingame/constants/controls/ingameSidePanelLayout.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

// 데스크톱 옆 창과 같은 시간·곡선
export const SHEET_TRANSITION = PANEL_TRANSITION

// 층: 기본 시트(설정·기록) 위에 겹 창(추방·방 코드)이 뜸 → 뒤판·판 z값 짝
export const SHEET_LAYERS = {
  base: { backdrop: "z-[60]", panel: "z-[61]" },
  top: { backdrop: "z-[64]", panel: "z-[65]" },
}

// 화면 틀이 container라서 fixed가 틀에 갇힘 → body로 portal 뒤 이 층에 띄움 (덮개 진하기는 데스크톱 옆 창과 같음)
export const BACKDROP_CLASS = "fixed inset-0 cursor-default border-0 bg-black/25 p-0"

// 데스크톱 옆 창 틀(친구목록 틀) 그림을 border-image로 깔아 모서리 장식이 안 늘어나게 함
export const PANEL_FRAME_STYLE = {
  borderStyle: "solid",
  borderWidth: "30px 18px 26px",
  borderImage: `url("${publicAsset(PANEL_ASSETS.panelFrame)}") 44 28 40 28 fill / 30px 18px 26px stretch`,
}

// 폰은 화면 폭 전체, 태블릿·가로는 가운데 폭 제한
export const PANEL_CLASS =
  "fixed inset-x-0 bottom-0 mx-auto flex max-h-[88svh] w-full flex-col overflow-hidden text-[#1a1008] shadow-[0_-10px_30px_rgba(0,0,0,0.6)] md:max-w-xl land:max-w-lg land:max-h-[96svh]"

// 닫기 버튼 (누르는 자리 44px, 머리 판 오른쪽)
export const CLOSE_BTN_CLASS =
  "-mr-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none active:scale-95"

export const CLOSE_IMG_CLASS = "block h-10 w-10 select-none object-contain"

// 머리 판 그림 위 제목 (데스크톱 HEADER_TITLE_CLASS 글꼴·색)
export const SHEET_TITLE_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[12%] font-display app-text-scaled [--app-text-size:1.25rem] font-medium leading-none text-[#f5f0e6] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 제목 아래 설명 한 줄 (데스크톱 옆 창 머리 설명, 양피지 위 짙은 글자)
export const SHEET_SUBTITLE_CLASS =
  "mt-1.5 text-center font-subheading app-text-scaled [--app-text-size:0.85rem] font-bold leading-snug text-[#1a1008]"

// 데스크톱 옆 창 그림 (닫기·머리 판)
export const CLOSE_BUTTON_SRC = PANEL_ASSETS.closeButton
export const HEADER_PLATE_SRC = PANEL_ASSETS.headerPlate
