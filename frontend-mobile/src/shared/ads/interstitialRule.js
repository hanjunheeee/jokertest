// 한 판 끝 광고 판정: 어느 판 번호로 기억할지, 지금 띄울지, 닫기까지 몇 초 남았는지
// useInterstitialAd·InterstitialAd가 씀 (순수 함수만)

// 닫기 버튼 나오기까지 기다리는 초
export const INTERSTITIAL_WAIT_SEC = 5

// 결과 화면 첫 연출(본체·버튼 나타나기 0.64초 + 여유)이 끝난 뒤 띄우는 늦춤
export const INTERSTITIAL_OPEN_DELAY_MS = 1500

// 기억할 판 번호: 실제 판은 gameId, 개발 미리보기(?outcome=)는 "preview:승패", 둘 다 아니면 null
export function pickGameKey({ gameId, isPreview = false, outcome = null, isDev = false }) {
    if (typeof gameId === "string" && gameId.trim().length > 0) return gameId.trim()
    if (isDev && isPreview && outcome) return `preview:${outcome}`
    return null
}

// 지금 띄울지: 결과 단계 + 광고 자리 켜짐 + 판 번호 있음 + 이 판에 안 띄움
export function shouldOpenInterstitial({ stage, mode, gameKey, seen }) {
    if (stage !== "result") return false
    if (mode === "off") return false
    if (!gameKey) return false
    return !(Array.isArray(seen) && seen.includes(gameKey))
}

// 닫기까지 남은 초 (올림, 0 아래로 안 내려감)
// 예: secondsLeft(1000, 2100, 5) → 4 (1.1초 지남 → 3.9초 남음 → 올림 4)
export function secondsLeft(startedAt, now, totalSec = INTERSTITIAL_WAIT_SEC) {
    const passedMs = Math.max(0, now - startedAt)
    return Math.max(0, Math.ceil(totalSec - passedMs / 1000))
}
