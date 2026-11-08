// 시스템 알림 줄 만들기: 참가자 상태가 바뀐 사람마다 알림 한 줄 (처형·사망·끊김)
// useSystemNotices가 씀, 순수 함수라 tests/talk에서 바로 시험

// 상태 값은 데스크톱 INGAME_PLAYER_STATUS와 같음 (순수 함수라 별칭 import 없이 둠)
const ALIVE = "alive"
const DEAD = "dead"
const DISCONNECTED = "disconnected"

// 바뀐 상태 → 알림 문구 (살아 있다가 바뀐 것만)
function noticeText(nickname, nextStatus) {
    if (nextStatus === DEAD) return `${nickname}님이 죽었습니다`
    if (nextStatus === DISCONNECTED) return `${nickname}님의 연결이 끊겼습니다`
    return null
}

// prevPlayers가 없으면(처음 들어옴·새 판) 알림 안 만듦 → 들어오자마자 옛 사망이 쏟아지지 않게
export function diffPlayerNotices(prevPlayers, nextPlayers, at) {
    if (!Array.isArray(prevPlayers) || !Array.isArray(nextPlayers)) return []

    const prevStatusById = new Map(prevPlayers.map((player) => [player.id, player.status]))
    const notices = []
    for (const player of nextPlayers) {
        if (prevStatusById.get(player.id) !== ALIVE) continue
        const text = noticeText(player.nickname ?? "", player.status)
        if (text) notices.push({ id: `${player.id}-${player.status}-${at}`, at, text })
    }
    return notices
}
