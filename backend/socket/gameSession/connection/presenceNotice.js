// 끊김·다시 붙음 알림 파일, 판 사람들에게 누가 끊겼나·다시 붙었나 판 채널로 알림 (브라우저 시험 M-2, 2026-11-09)
// handlers/leave.js(끊김)·connection/routing.js·handlers/snapshot.js(다시 붙음)가 부름, 화면은 스냅샷 isConnected와 같은 뜻으로 받음
const { isolate } = require('../../common/isolate')
const { emitToGameChannel } = require('../delivery/broadcast')

// 판 채널 사건 이름, 내용 { gameId, uuid, isConnected }
const PLAYER_CONNECTION_EVENT = 'session_player_connection_changed'

// 판 → 끊겼다고 알린 사람들, 판 객체에 묶어 판이 없어지면 같이 없어짐
// 끊김 알린 사람만 다시 붙음 알림 (첫 접속·새로고침마다 알림 넘치지 않게)
const announcedBySession = new WeakMap()

function emitConnection(io, session, uuid, { isConnected }) {
    isolate('[연결 상태 알림 실패]', { code: 'CONNECTION_NOTICE_ERROR', gameId: session.id },
        () => emitToGameChannel(io, session, PLAYER_CONNECTION_EVENT, { gameId: session.id, uuid, isConnected }))
}

// 끊김 알림: 진행 중 판의 참가자일 때 한 번만
function announceDisconnected(io, session, uuid) {
    if (!session || session.phase === 'ENDED' || !session.players?.has?.(uuid)) return
    let announced = announcedBySession.get(session)
    if (!announced) {
        announced = new Set()
        announcedBySession.set(session, announced)
    }
    if (announced.has(uuid)) return
    announced.add(uuid)
    emitConnection(io, session, uuid, { isConnected: false })
}

// 다시 붙음 알림: 끊겼다고 알린 사람만, 판이 끝났으면 안 보냄
function announceReconnected(io, session, uuid) {
    if (!io || !session) return
    if (!announcedBySession.get(session)?.delete(uuid)) return
    if (session.phase === 'ENDED') return
    emitConnection(io, session, uuid, { isConnected: true })
}

module.exports = {
    PLAYER_CONNECTION_EVENT,
    announceDisconnected,
    announceReconnected,
}
