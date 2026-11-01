// 카드 시트 모양 (뒤판·양피지 바탕·움직임·닫기 버튼)
// Sheet가 씀 (상점 시트 모양 값과 같음, 공용으로 올릴 후보)

export const SHEET_TRANSITION = { duration: 0.32, ease: [0.22, 1, 0.36, 1] }

// 화면 틀이 container라 fixed가 틀에 갇힘 → body로 portal 뒤 이 층에 띄움
export const BACKDROP_CLASS =
    "fixed inset-0 z-[60] cursor-default border-0 bg-[#1a0f0a]/62 p-0 backdrop-blur-[4px]"

export const PARCHMENT_CLASS =
    "border border-[#b83232]/40 ring-1 ring-[#c43c3c]/14 backdrop-blur-[6px] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.48),0_-8px_32px_rgba(26,15,10,0.36)]"

// 폰은 화면 폭 전체, 태블릿·가로는 가운데 폭 제한
export const PANEL_CLASS =
    "fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[88svh] w-full flex-col overflow-hidden rounded-t-[1.1rem] bg-[#f5f0e6]/95 md:max-w-xl land:max-w-lg land:max-h-[94svh]"

// 닫기 버튼 (누르는 자리 44px, 그림은 그 안)
export const CLOSE_BTN_CLASS =
    "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none active:scale-95"

export const SHEET_TITLE_CLASS =
    "min-w-0 flex-1 truncate font-display app-text-scaled [--app-text-size:1.2rem] font-medium text-[#3d1810]"
