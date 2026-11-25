// 시스템 알림 줄 만들기: 참가자 상태가 바뀐 사람마다 알림 한 줄 (처형·사망·끊김)
// useSystemNotices가 씀, 순수 함수라 tests/talk에서 바로 시험

// 상태 값은 데스크톱 INGAME_PLAYER_STATUS와 같음 (순수 함수라 별칭 import 없이 둠)
const DEAD = "dead"
const DISCONNECTED = "disconnected"

// 바뀐 상태 → 알림 문구
function noticeText(nickname, nextStatus) {
    if (nextStatus === DEAD) return `${nickname}님이 죽었습니다`
    if (nextStatus === DISCONNECTED) return `${nickname}님의 연결이 끊겼습니다`
    return null
}

// 살았는지·연결됐는지를 따로 봄: 상태 하나(status)는 끊김을 먼저 보여 줘서 끊긴 사람이 죽으면 변화가 안 잡힘
// alive·connected가 없으면 status로 대신 셈
function lifeOf(player) {
    if (typeof player?.alive === "boolean") {
        return { alive: player.alive, connected: player.connected !== false }
    }
    return { alive: player?.status !== DEAD, connected: player?.status !== DISCONNECTED }
}

// 판 참가자(서버 모양) → 알림 계산용 명단 (연결 여부를 모르면 연결된 것으로 봄)
export function toNoticePlayers(rawPlayers) {
    if (!Array.isArray(rawPlayers)) return null
    return rawPlayers.map((player) => ({
        id: player.uuid,
        nickname: player.nickname ?? "",
        alive: player.alive !== false,
        connected: player.isConnected !== false,
    }))
}

// 한 사람 알림 상태: 죽음이 끊김보다 먼저
function noticeStatus(prev, next) {
    if (prev.alive && !next.alive) return DEAD
    if (next.alive && prev.connected && !next.connected) return DISCONNECTED
    return null
}

// prevPlayers가 없으면(처음 들어옴·새 판) 알림 안 만듦 → 들어오자마자 옛 사망이 쏟아지지 않게
export function diffPlayerNotices(prevPlayers, nextPlayers, at) {
    if (!Array.isArray(prevPlayers) || !Array.isArray(nextPlayers)) return []

    const prevById = new Map(prevPlayers.map((player) => [player.id, lifeOf(player)]))
    const notices = []
    for (const player of nextPlayers) {
        const prev = prevById.get(player.id)
        if (!prev) continue
        const status = noticeStatus(prev, lifeOf(player))
        const text = status ? noticeText(player.nickname ?? "", status) : null
        if (text) notices.push({ id: `${player.id}-${status}-${at}`, at, text })
    }
    return notices
}
