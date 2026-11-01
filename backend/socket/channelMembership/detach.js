// 채널 떼기 파일
// leave 실패면 재시도·제외로 막고, 떼는 사이 채널을 다시 가졌으면 되찾기, socket gameSession·matchmaking이 씀
const { tryOr } = require('../common/isolate')
const { MAX_CHANNEL_LEAVE_ATTEMPTS, MAX_CHANNEL_RESTORE_DEPTH } = require('./constants')
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
    const ask = (predicate) => {
        if (typeof predicate !== 'function') return false
        return tryOr(false, () => predicate() === true)
    }
    const ownsChannel = () => ask(ownership?.ownsChannel)
    const keepsConnection = () => ask(ownership?.keepsConnection ?? ownership?.ownsChannel)
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

    const isJoined = () =>
        socket.rooms && typeof socket.rooms.has === 'function' ? socket.rooms.has(channelId) : false

    if (socketId && !ownsChannel()) exclude()

    // 되찾기 한도까지 갔는데도 못 가졌으면 제외 건 채로 끝
    const finishReconcile = () => {
        if (ownsChannel()) {
            release()
            return
        }
        exclude()
        report('CHANNEL_RECONCILE_BUDGET_EXHAUSTED')
    }

    const settleRestore = (depth) => {
        if (ownsChannel()) {
            release()
            return
        }
        if (depth >= MAX_CHANNEL_RESTORE_DEPTH) {
            finishReconcile()
            return
        }
        runLeave(1, depth + 1)
    }

    // 떼는 사이 다시 가졌으면 다시 넣음
    const restoreIfSuperseded = (depth) => {
        if (!ownsChannel()) return
        if (isJoined()) {
            release()
            return
        }
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

    const handleSettled = (depth) => {
        if (ownsChannel()) {
            restoreIfSuperseded(depth)
            return
        }
        release()
    }

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
