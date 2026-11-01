// 상점 가운데 창 틀 모양 둘 (일괄구매 확인·스킨 전신), 바깥 틀은 공용 shared/ui/modal/CenterModal
// bulk/BulkModal·zoom/SkinZoomModal이 씀, 색·테두리·그림자는 데스크톱 storeBulkPurchaseLayout·storeSkinZoomLayout 값, 폭만 폰 화면 비율

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
