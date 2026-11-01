// 채널 떼기 파일
// leave 실패면 재시도·제외로 막고, 떼는 사이 채널을 다시 가졌으면 되찾기
// index 거쳐 gameSession delivery/broadcast·matchmaking 입장·방 나가기·재접속이 씀
const { tryOr } = require('../common/isolate')
const { MAX_CHANNEL_LEAVE_ATTEMPTS, MAX_RESTORE_DEPTH } = require('./constants')
const {
    createChannelExclusionOwner,
    excludeSocketFromChannel,
    releaseChannelExclusion,
    releaseSocketFromAllChannels,
} = require('./exclusions')

// 채널 떼기: 다 뗄 때까지 이 작업 이름으로 제외 걸어 둠 (지도 02-⑤ · 08-⑨)
// ownership.ownsChannel = 그사이 그 채널을 다시 가졌나, keepsConnection = 다른 소속이 남았나
function detachSocketFromChannel(socket, channelId, logLabel, logFields = {}, ownership = null) {
    if (!socket || typeof socket.leave !== 'function') return
    // 부른 쪽 판단 묻기, 없거나 던지면 '아님'으로 봄
    const ask = (predicate) => {
        if (typeof predicate !== 'function') return false
        return tryOr(false, () => predicate() === true)
    }
    // keepsConnection 안 주면 ownsChannel로 대신 봄
    const ownsChannel = () => ask(ownership?.ownsChannel)
    const keepsConnection = () => ask(ownership?.keepsConnection ?? ownership?.ownsChannel)
    // 이번 떼기 전용 주인 (다른 작업이 건 제외는 안 건드림)
    const socketId = typeof socket.id === 'string' ? socket.id : null
    const detachOwner = createChannelExclusionOwner('detach')

    // 이 떼기 작업 이름으로 제외 걸기·풀기 (소켓 id 없으면 아무것도 안 함)
    const exclude = () => {
        if (socketId) excludeSocketFromChannel(channelId, socketId, detachOwner)
    }
    const release = () => {
        if (socketId) releaseChannelExclusion(channelId, socketId, detachOwner)
    }
    // 떼기 로그: 라벨은 부른 쪽 것, 칸은 코드·채널·덧붙임·부른 쪽 칸 순서
    const report = (code, extraFields = {}) => {
        console.error(logLabel, { code, channelId, ...extraFields, ...logFields })
    }

    // 소켓이 아직 그 채널에 들어 있는지
    const isJoined = () =>
        socket.rooms && typeof socket.rooms.has === 'function' ? socket.rooms.has(channelId) : false

    // 떼는 동안 방송 새지 않게 먼저 제외 (그사이 다시 가졌으면 안 걺)
    if (socketId && !ownsChannel()) exclude()

    // 되찾기 한도 다 씀: 다시 가졌으면 제외 풂, 아니면 채널엔 남은 채 제외만 걸어 둠
    const finishReconcile = () => {
        if (ownsChannel()) {
            release()
            return
        }
        exclude()
        report('CHANNEL_RECONCILE_BUDGET_EXHAUSTED')
    }

    // 다시 넣은 뒤: 아직 가졌으면 제외 풂, 아니면 한도 안에서 한 번 더 뗌
    const settleRestore = (depth) => {
        if (ownsChannel()) {
            release()
            return
        }
        if (depth >= MAX_RESTORE_DEPTH) {
            finishReconcile()
            return
        }
        runLeave(1, depth + 1)
    }

    // 떼는 사이 다시 가졌으면 다시 넣음
    const restoreIfSuperseded = (depth) => {
        if (!ownsChannel()) return
        // 아직 안 빠졌으면 제외만 풂
        if (isJoined()) {
            release()
            return
        }
        // 다시 넣기 실패면 로그만 (걸린 제외는 그대로)
        let rejoined
        try {
            rejoined = socket.join(channelId)
        } catch {
            report('CHANNEL_REJOIN_ERROR')
            return
        }
        if (rejoined && typeof rejoined.then === 'function') {
            Promise.resolve(rejoined).then(
                () => settleRestore(depth),
                () => report('CHANNEL_REJOIN_ERROR'),
            )
            return
        }
        settleRestore(depth)
    }

    // leave 끝남: 그사이 다시 가졌으면 되찾기, 아니면 이미 빠졌으니 제외 풂
    const handleSettled = (depth) => {
        if (ownsChannel()) {
            restoreIfSuperseded(depth)
            return
        }
        release()
    }

    // leave 실패: 다시 가졌으면 떼기 그만두고 되찾기
    const handleFailure = (attempt, depth) => {
        if (ownsChannel()) {
            release()
            restoreIfSuperseded(depth)
            return
        }
        // 다른 소속도 없으면 연결을 끊어서라도 뗌
        if (!keepsConnection()) {
            report('CHANNEL_LEAVE_ERROR')
            exclude()
            try {
                socket.disconnect(true)
            } catch {
                report('CHANNEL_DISCONNECT_ERROR')
                return
            }
            // 끊긴 소켓은 방송 못 받으니 제외 기록 전부 지움
            if (socketId) releaseSocketFromAllChannels(socketId)
            return
        }
        // 다른 소속이 남았으면 연결은 두고 제외 건 채 다시 시도
        exclude()
        if (attempt < MAX_CHANNEL_LEAVE_ATTEMPTS) {
            runLeave(attempt + 1, depth)
            return
        }
        report('CHANNEL_LEAVE_SUPERSEDED_EXCLUDED', { attempts: attempt })
    }

    // leave 한 번 시도, 돌려준 게 Promise면 끝날 때 판단 (어댑터마다 다름)
    function runLeave(attempt, depth) {
        let pending
        try {
            pending = socket.leave(channelId)
        } catch {
            handleFailure(attempt, depth)
            return
        }
        if (pending && typeof pending.then === 'function') {
            Promise.resolve(pending).then(() => handleSettled(depth), () => handleFailure(attempt, depth))
            return
        }
        handleSettled(depth)
    }

    runLeave(1, 0)
}

module.exports = { detachSocketFromChannel }
