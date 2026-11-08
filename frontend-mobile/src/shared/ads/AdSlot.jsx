// 광고 칸 하나: 진짜 AdSense 칸 또는 개발용 회색 "광고 자리" 상자
// AdBanner(하단 줄)·InterstitialAd(한 판 끝 창)가 씀, 스크립트 실패·광고 없음이면 onEmpty로 알림
import { useEffect, useRef } from "react"
import { AD_CONFIG } from "@m/shared/ads/currentAdConfig.js"
import { loadAdScript, requestAdFill } from "@m/shared/ads/loadAdScript.js"

// 자리별 크기: 하단은 320×50 고정, 한 판 끝은 폭 맞춤·높이 250 이상
const SIZE = {
    banner: {
        box: "h-[50px] w-[320px] max-w-full",
        ins: { display: "inline-block", width: "320px", height: "50px" },
        responsive: false,
    },
    interstitial: {
        box: "h-[250px] w-full",
        ins: { display: "block", width: "100%", minHeight: "250px" },
        responsive: true,
    },
}

const PLACEHOLDER_CLASS =
    "flex items-center justify-center border border-dashed border-[#8a8a8a] bg-[#4a4a4a] font-subheading text-xs font-semibold tracking-wide text-[#d8d8d8] select-none"

// mode: "live" | "placeholder" (off는 부모가 아예 안 그림)
export default function AdSlot({ name, mode, onEmpty }) {
    const size = SIZE[name] ?? SIZE.banner
    const insRef = useRef(null)
    const emptyRef = useRef(onEmpty)

    useEffect(() => {
        emptyRef.current = onEmpty
    }, [onEmpty])

    // 진짜 칸: 스크립트 넣기 → 채워 달라고 알림, AdSense가 "unfilled" 표시하면 접기
    useEffect(() => {
        if (mode !== "live") return undefined
        let cancelled = false
        const markEmpty = () => {
            if (!cancelled) emptyRef.current?.()
        }
        const ins = insRef.current
        const observer = new MutationObserver(() => {
            if (ins?.getAttribute("data-ad-status") === "unfilled") markEmpty()
        })
        if (ins) observer.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] })
        loadAdScript(AD_CONFIG.client)
            .then(() => {
                // 이미 채운 칸(개발 때 effect 두 번 등)이면 다시 안 부름
                if (cancelled || !ins || ins.getAttribute("data-adsbygoogle-status")) return
                if (!requestAdFill()) markEmpty()
            })
            .catch(markEmpty)
        return () => {
            cancelled = true
            observer.disconnect()
        }
    }, [mode])

    if (mode === "placeholder") {
        return (
            <div className={`${PLACEHOLDER_CLASS} ${size.box}`} data-ad-placeholder={name}>
                광고 자리 (개발 화면만)
            </div>
        )
    }

    return (
        <ins
            ref={insRef}
            className="adsbygoogle"
            style={size.ins}
            data-ad-client={AD_CONFIG.client}
            data-ad-slot={AD_CONFIG.slots[name]}
            {...(size.responsive ? { "data-ad-format": "auto", "data-full-width-responsive": "true" } : {})}
        />
    )
}
