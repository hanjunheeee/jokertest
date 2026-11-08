// 모든 화면을 감싸는 모바일 틀: 높이 100svh(되면 dvh), 안전영역 안쪽에 페이지 + 바닥 자리 + 하단 광고 줄
// app/routes/index.jsx가 라우터 맨 바깥에서 씀
import { useState } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { SHELL_BOTTOM_SLOT_ID, ShellBottomSlotContext } from "@m/shared/layouts/mobileShellSlots.js"
import AdBanner from "@m/shared/ads/AdBanner.jsx"
import { shouldShowBanner } from "@m/shared/ads/bannerRoutes.js"

export default function MobileShell() {
    // 바닥 자리 요소는 ref 콜백으로 받음 (그려진 뒤 context로 페이지에 넘김)
    const [bottomSlot, setBottomSlot] = useState(null)
    // 게임 바깥 화면만 광고 줄 (인게임·로그인·가입·계정 찾기는 없음)
    const { pathname } = useLocation()

    return (
        <ShellBottomSlotContext.Provider value={bottomSlot}>
            <div className="mobile-shell">
                <main className="mobile-shell__page">
                    <Outlet />
                </main>
                {/* 바닥 줄·화면 전환 버튼 자리. 페이지가 ShellBottom으로 채움, 비면 안 보임 */}
                <div id={SHELL_BOTTOM_SLOT_ID} ref={setBottomSlot} className="mobile-shell__bottom" />
                {/* 바닥 버튼 줄 아래 광고 한 줄, 그만큼 페이지 높이가 줄어듦 */}
                {shouldShowBanner(pathname) ? <AdBanner /> : null}
            </div>
        </ShellBottomSlotContext.Provider>
    )
}
