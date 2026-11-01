// 상점 가운데 창 모양 (뒤판·창 자리·창 틀 셋·닫기 버튼 자리)
// modal/CenterModal과 상점 창 셋(일괄구매·스킨 전신·테두리 확대)이 씀
// 색·테두리·그림자는 데스크톱 storeBulkPurchaseLayout·storeSkinZoomLayout·profileBorderZoomLayout 값, 폭만 폰 화면 비율

// 뒤판 (데스크톱 BACKDROP_CLASS 색), 화면 틀이 container라 body로 띄워 z를 틀 위로
export const BACKDROP_CLASS =
    "fixed inset-0 z-[60] cursor-default border-0 bg-[#1a0f0a]/62 p-0 backdrop-blur-[4px]"

// 창 자리: 가운데, 안전영역 안쪽
export const WRAP_CLASS =
    "pointer-events-none fixed inset-0 z-[61] flex items-center justify-center px-[max(1rem,env(safe-area-inset-left,0px))] py-[max(1rem,env(safe-area-inset-top,0px))]"

const PANEL_BASE =
    "pointer-events-auto relative flex max-h-[calc(100svh-2rem)] flex-col overflow-hidden border border-[#b83232]/40 backdrop-blur-[6px]"

// 일괄구매 확인 창 (데스크톱 폭 min(36rem,92vw) 그대로)
export const BULK_PANEL_CLASS =
    `${PANEL_BASE} w-[min(36rem,92vw)] rounded-[1.1rem] bg-[#f5f0e6]/84 ring-1 ring-[#c43c3c]/14 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.48),0_16px_42px_rgba(26,15,10,0.36)]`

const ZOOM_SHADOW =
    "ring-1 ring-[#c43c3c]/16 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.48),inset_0_-2px_10px_rgba(42,24,16,0.07),0_14px_40px_rgba(26,15,10,0.34),0_0_28px_rgba(196,60,60,0.12)]"

// 스킨 전신 창 (데스크톱 52vw는 폰에서 너무 좁아 92vw)
export const SKIN_PANEL_CLASS =
    `${PANEL_BASE} w-[min(28rem,92vw)] rounded-[1.25rem] bg-[#f5f0e6]/78 ${ZOOM_SHADOW}`

// 프로필 테두리 확대 창 (데스크톱 46vw → 88vw)
export const BORDER_PANEL_CLASS =
    `${PANEL_BASE} w-[min(24rem,88vw)] rounded-[1.25rem] bg-[#f5f0e6]/78 ${ZOOM_SHADOW}`

// 테두리 확대 창 안쪽 (데스크톱 공용 profileBorderZoomLayout 값, 화면 폴더라 못 불러 옮겨 적음)
export const BORDER_ILLUSTRATION_WRAP_CLASS =
    "relative flex min-h-[min(20rem,46vh)] w-full items-center justify-center bg-[#1a0f0a]/06 px-3 py-4 [box-shadow:inset_0_2px_14px_rgba(26,15,10,0.08)]"
export const BORDER_ILLUSTRATION_CLASS = "block h-[min(18rem,40vh)] w-[min(18rem,40vh)] select-none object-contain"
export const BORDER_TITLE_CLASS =
    "font-subheading border-t border-[#2a1810]/12 px-3.5 py-2.5 text-center app-text-scaled [--app-text-size:0.88rem] font-black leading-snug text-[#120a06] antialiased"

// 닫기 버튼 자리 (오른쪽 위, 누르는 칸 44px)
export const CLOSE_BTN_CLASS =
    "interactive-scale absolute right-1.5 top-1.5 z-20 flex h-11 w-11 items-center justify-center leading-none"
