// AdSense 스크립트를 문서에 한 번만 넣기 (공급자 설정 있을 때만 부름)
// AdSlot이 씀, 실패(광고 막기·인터넷 끊김)면 거절된 약속을 돌려줌

const ADSENSE_SRC = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"

// 같은 페이지에서 여러 자리가 불러도 스크립트는 한 개
let pending = null

// 광고 계정 번호로 스크립트 넣기, 다 받아지면 풀리는 약속
export function loadAdScript(client) {
    if (pending) return pending
    pending = new Promise((resolve, reject) => {
        const script = document.createElement("script")
        script.async = true
        script.crossOrigin = "anonymous"
        script.src = `${ADSENSE_SRC}?client=${encodeURIComponent(client)}`
        script.dataset.mmcAds = "adsense"
        script.onload = () => resolve()
        script.onerror = () => reject(new Error("adsense script failed"))
        document.head.appendChild(script)
    })
    // 실패하면 다음 화면에서 다시 해 볼 수 있게 비움 (넣었던 태그는 지움)
    pending.catch(() => {
        document.querySelector('script[data-mmc-ads="adsense"]')?.remove()
        pending = null
    })
    return pending
}

// 광고 칸 하나 채워 달라고 AdSense에 알림 (이미 채운 칸이면 AdSense가 던지는 오류는 무시)
export function requestAdFill() {
    try {
        window.adsbygoogle = window.adsbygoogle || []
        window.adsbygoogle.push({})
        return true
    } catch {
        return false
    }
}
