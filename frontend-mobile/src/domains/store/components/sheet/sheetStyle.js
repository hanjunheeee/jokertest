// 상점 시트 공통 모양 (뒤판·양피지 바탕·움직임·닫기 버튼)
// sheet/ 아래 BottomSheet·FullSheet가 씀

// 데스크톱 겹창과 같은 움직임 값
export const SHEET_TRANSITION = { duration: 0.32, ease: [0.22, 1, 0.36, 1] }

// 화면 틀이 layout containment라서 fixed가 틀에 갇힘 → body로 portal 뒤 이 층에 띄움
export const BACKDROP_CLASS =
    "fixed inset-0 z-[60] cursor-default border-0 bg-[#1a0f0a]/62 p-0 backdrop-blur-[4px]"

// 데스크톱 겹창 테두리·그림자 그대로 (바탕색은 시트마다: 전체 시트는 폰에서 비침 없이)
export const PARCHMENT_CLASS =
    "border border-[#b83232]/40 ring-1 ring-[#c43c3c]/14 backdrop-blur-[6px] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.48),0_-8px_32px_rgba(26,15,10,0.36)]"

// 닫기 버튼 (누르는 자리 44px, 그림은 그 안)
export const CLOSE_BTN_CLASS =
    "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none active:scale-95"

export const CLOSE_IMG_CLASS = "block h-9 w-9 select-none object-contain"

export const SHEET_TITLE_CLASS =
    "min-w-0 flex-1 truncate font-display app-text-scaled [--app-text-size:1.2rem] font-medium text-[#3d1810]"
