// 화면 맨 아래 광고 한 줄 (바닥 버튼 줄 아래, 위로 8px 띄움)
// MobileShell이 게임 바깥 화면에서만 그림, 광고 없음·실패면 줄째 접힘
import { useState } from "react"
import AdSlot from "@m/shared/ads/AdSlot.jsx"
import { slotMode } from "@m/shared/ads/adConfig.js"
import { AD_CONFIG, AD_IS_DEV } from "@m/shared/ads/currentAdConfig.js"

// 높이·띄움은 index.css의 .mobile-ad-banner (fixed 뒤로 버튼이 --mobile-ad-h만큼 올라감)
export default function AdBanner() {
    const [empty, setEmpty] = useState(false)
    const mode = slotMode(AD_CONFIG, "banner", AD_IS_DEV)

    if (mode === "off" || empty) return null

    return (
        <aside className="mobile-ad-banner" aria-label="광고">
            <AdSlot name="banner" mode={mode} onEmpty={() => setEmpty(true)} />
        </aside>
    )
}
