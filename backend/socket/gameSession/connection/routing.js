// 판 채널 다시 넣기 파일
// 재접속·새로고침 때 판 채널 다시 넣기 (같은 범위 작업 하나로 묶기·늦은 작업 되돌리기), socket.js·스냅샷 핸들러가 씀
const gameSessionCore = require('../../../game-core/gameSession')
const { hasOnlineUsersRegistry, isCurrentSocketForUuid } = require('./ownership')
const { cancelDisconnectGrace } = require('./grace')
const { detachFromGameChannel } = require('../delivery/broadcast')

// 판 채널 다시 넣기 작업: 소켓마다 진행 중 작업 하나 + activeGameId를 어느 작업이 썼는지 (늦은 작업이 덮어쓰지 않게)
let sessionRoutingWorkSeq = 0
const routingWorkBySocket = new WeakMap()
const gameIdOwnerBySocket = new WeakMap()

// 재접속·새로고침 때 판 채널 다시 넣기: 같은 범위 작업은 하나로 묶고, join 사이 바뀌었으면 되돌림 (지도 08-⑨)
function resyncSessionRouting(socket, uuid) {
    // 들어가 있는 판 없으면 넣을 채널 없음
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (!routing) return Promise.resolve()

    // 기권한 사람은 판 채널 다시 안 넣음
    if (gameSessionCore.isForfeitedFromSession(routing.gameId, uuid)) return Promise.resolve()

    // 접속 목록 있으면 지금 그 계정 소켓일 때만 (옛 탭 막기)
    if (hasOnlineUsersRegistry() && !isCurrentSocketForUuid(uuid, socket)) return Promise.resolve()

    // 판·채널·계정·소켓·참가 id가 같으면 같은 범위 작업으로 봄
    const session = gameSessionCore.getActiveSessionForDeparture(uuid, routing.gameId) ?? null
    const membershipId = session?.players?.get(uuid)?.membershipId ?? null
    const socketId = socket?.id ?? null
    const scopeKey = `${routing.gameId}\u0000${routing.channelId}\u0000${uuid}\u0000${socketId ?? ''}\u0000${membershipId ?? ''}`

    // 같은 범위 작업이 이미 돌고 있으면 그 약속 같이 기다림
    const inFlight = routingWorkBySocket.get(socket)
    if (inFlight && inFlight.scopeKey === scopeKey) return inFlight.promise

    // 새 작업 표 (join 뒤 비교용으로 그때 판·참가 id 적어 둠)
    sessionRoutingWorkSeq += 1
    const token = {
        id: sessionRoutingWorkSeq, scopeKey, socket, socketId, uuid, routing, session, membershipId, ready: false,
    }

    // 실제 작업: 유예 풀고 판 id 적고 채널 join, join 뒤 그대로인지 다시 봄
    const run = async () => {
        // 다시 붙었으니 끊김 유예 풂 (유예 만료로 이탈 처리 안 되게)
        cancelDisconnectGrace(routing.gameId, uuid)

        // 판 id는 join 전에 적음 (join 기다리다 끊겨도 끊김 처리가 이 판 찾게), 누가 썼는지 남김
        socket.data.activeGameId = routing.gameId
        gameIdOwnerBySocket.set(socket, token)
        // 아직 채널 밖이면 join, 이미 안이면 바로 끝
        if (!socket.rooms.has(routing.channelId)) {
            await socket.join(routing.channelId)

            // join 기다리는 사이 추방·이탈·유예 만료·새 탭 교체가 없었는지 다시 봄 (지도 08-⑨)
            const current = gameSessionCore.getActiveSessionRoutingInfo(uuid)
            const stillLatest = routingWorkBySocket.get(socket)?.token === token
            const stillSameSession =
                gameSessionCore.getActiveSessionForDeparture(uuid, routing.gameId) === token.session
            const stillMine = stillLatest
                && stillSameSession
                && current !== null
                && current.gameId === routing.gameId
                && current.channelId === routing.channelId
                && !gameSessionCore.isForfeitedFromSession(routing.gameId, uuid)
                && isCurrentSocketForUuid(uuid, socket)
                && socket.id === token.socketId
                && (token.session?.players?.get(uuid)?.membershipId ?? null) === token.membershipId
            if (stillMine) {
                token.ready = true
                return
            }

            // 더 나중 재가입이 있으면 그쪽에 맡김, 내 재가입이 마지막이면 내가 넣은 것만 되돌림
            if (!stillLatest) return

            detachFromGameChannel(
                socket, uuid, routing.channelId, '\x1b[31m[세션 채널 정리 실패]\x1b[0m', { gameId: routing.gameId },
            )
            if (socket.data.activeGameId === routing.gameId && gameIdOwnerBySocket.get(socket) === token) {
                socket.data.activeGameId = current !== null ? current.gameId : null
                gameIdOwnerBySocket.delete(socket)
            }
            return
        }
        token.ready = true
    }

    // 끝나면 진행 중 표시는 내 작업일 때만 지움 (새 작업 표시는 남김)
    const promise = run().finally(() => {
        const current = routingWorkBySocket.get(socket)
        if (current && current.token === token) routingWorkBySocket.delete(socket)
    })
    routingWorkBySocket.set(socket, { scopeKey, token, promise })
    return promise
}

module.exports = {
    resyncSessionRouting,
}
