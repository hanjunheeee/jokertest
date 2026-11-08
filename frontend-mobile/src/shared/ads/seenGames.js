// 한 판 끝 광고를 이미 띄운 판 기억 (판 번호 목록, 최근 것만 남김)
// useInterstitialAd가 씀, 저장소는 넘겨받아서 node 시험 가능

export const SEEN_GAMES_KEY = "mmc.ads.seenGames"

// 너무 오래된 판 번호는 버림 (저장소가 끝없이 커지지 않게)
export const SEEN_GAMES_MAX = 30

// 이 판에 이미 띄웠나
export function hasSeenGame(list, gameKey) {
    return Array.isArray(list) && list.includes(gameKey)
}

// 판 번호 하나 더한 새 목록 (같은 번호는 맨 뒤로, 최근 max개만)
// 예: rememberGame(["a", "b"], "a", 30) → ["b", "a"]
export function rememberGame(list, gameKey, max = SEEN_GAMES_MAX) {
    const rest = Array.isArray(list) ? list.filter((key) => key !== gameKey) : []
    return [...rest, gameKey].slice(-max)
}

// 저장소에서 목록 읽기, 막혔거나 깨졌으면 빈 목록
export function loadSeenGames(storage) {
    try {
        const parsed = JSON.parse(storage?.getItem(SEEN_GAMES_KEY) ?? "[]")
        return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : []
    } catch {
        return []
    }
}

// 저장소에 목록 쓰기, 실패(사생활 보호 창 등)는 무시
export function saveSeenGames(storage, list) {
    try {
        storage?.setItem(SEEN_GAMES_KEY, JSON.stringify(list))
    } catch {
        // 못 써도 이번 화면에선 이미 띄웠으니 그냥 둠
    }
}
