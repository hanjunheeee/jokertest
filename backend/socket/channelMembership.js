const MAX_CHANNEL_LEAVE_ATTEMPTS = 3

const MAX_CHANNEL_RESTORE_DEPTH = 1

const channelExclusions = new Map()

const DEFAULT_EXCLUSION_OWNER = '__default__'

let exclusionOwnerSeq = 0
function createChannelExclusionOwner(label = 'owner') {
    exclusionOwnerSeq += 1
    return `${label}#${exclusionOwnerSeq}`
}

const CHANNEL_EXCLUSION_ALARM_ENTRIES = 1024
let channelExclusionCount = 0
let channelExclusionAlarmRaised = false

function excludeSocketFromChannel(channelId, socketId, owner = DEFAULT_EXCLUSION_OWNER) {
    if (typeof channelId !== 'string' || !channelId) return
    if (typeof socketId !== 'string' || !socketId) return
    let bySocket = channelExclusions.get(channelId)
    if (!bySocket) {
        bySocket = new Map()
        channelExclusions.set(channelId, bySocket)
    }
    let owners = bySocket.get(socketId)
    if (!owners) {
        owners = new Set()
        bySocket.set(socketId, owners)
    }
    if (owners.has(owner)) return
    owners.add(owner)
    channelExclusionCount += 1
    if (!channelExclusionAlarmRaised && channelExclusionCount > CHANNEL_EXCLUSION_ALARM_ENTRIES) {
        channelExclusionAlarmRaised = true
        console.error('[채널 전달 제외 수위 초과]', {
            code: 'CHANNEL_EXCLUSION_OVER_CAPACITY',
            entries: channelExclusionCount,
            alarmAt: CHANNEL_EXCLUSION_ALARM_ENTRIES,
        })
    }
}

function rearmExclusionAlarm() {
    if (channelExclusionAlarmRaised && channelExclusionCount <= CHANNEL_EXCLUSION_ALARM_ENTRIES) {
        channelExclusionAlarmRaised = false
    }
}

function releaseChannelExclusion(channelId, socketId, owner = DEFAULT_EXCLUSION_OWNER) {
    const bySocket = channelExclusions.get(channelId)
    const owners = bySocket?.get(socketId)
    if (!owners || !owners.delete(owner)) return
    channelExclusionCount -= 1
    if (owners.size === 0) bySocket.delete(socketId)
    if (bySocket.size === 0) channelExclusions.delete(channelId)
    rearmExclusionAlarm()
}

function releaseSocketFromAllChannels(socketId) {
    if (typeof socketId !== 'string' || !socketId) return
    for (const [channelId, bySocket] of [...channelExclusions]) {
        const owners = bySocket.get(socketId)
        if (!owners) continue
        channelExclusionCount -= owners.size
        bySocket.delete(socketId)
        if (bySocket.size === 0) channelExclusions.delete(channelId)
    }
    rearmExclusionAlarm()
}

function getChannelExclusions(channelId) {
    const bySocket = channelExclusions.get(channelId)
    return bySocket ? [...bySocket.keys()] : []
}

function isSocketExcludedFromChannel(channelId, socketId) {
    return (channelExclusions.get(channelId)?.get(socketId)?.size ?? 0) > 0
}

function emitToChannelMembersIndividually(io, channelId, event, payload, skipSocketIds, recipientFilter = null) {
    const registry = io?.sockets?.sockets
    if (!registry || typeof registry.values !== 'function') return false
    for (const member of [...registry.values()]) {
        const memberId = typeof member?.id === 'string' ? member.id : null
        if (!memberId || skipSocketIds.has(memberId)) continue
        const rooms = member.rooms
        if (!rooms || typeof rooms.has !== 'function' || !rooms.has(channelId)) continue
        if (typeof member.emit !== 'function') continue
        if (typeof recipientFilter === 'function') {
            let allowed = false
            try { allowed = recipientFilter(member) === true } catch (err) { allowed = false }
            if (!allowed) continue
        }
        try {
            member.emit(event, payload)
        } catch (err) {
            console.error('[채널 개별 전달 실패]', {
                code: 'CHANNEL_EMIT_RECIPIENT_ERROR', channelId, event,
            })
        }
    }
    return true
}

function emitToChannel(io, channelId, event, payload, options = null) {
    try {
        const senderSocket = options?.senderSocket ?? null
        const recipientFilter = typeof options?.recipientFilter === 'function'
            ? options.recipientFilter : null
        const denied = getChannelExclusions(channelId)
        const extra = (Array.isArray(options?.exceptSocketIds) ? options.exceptSocketIds : [])
            .filter((id) => typeof id === 'string' && id.length > 0)

        const operator = senderSocket
            ? senderSocket.to?.(channelId)
            : io?.to?.(channelId)

        if (recipientFilter) {
            const skipSet = new Set([...denied, ...extra])
            if (senderSocket && typeof senderSocket.id === 'string') skipSet.add(senderSocket.id)
            if (emitToChannelMembersIndividually(io, channelId, event, payload, skipSet, recipientFilter)) return
            console.error('[채널 전달 재검사 불가 · 방송 폐기]', {
                code: 'CHANNEL_EMIT_DROPPED_FAIL_CLOSED', channelId, event, excluded: skipSet.size,
            })
            return
        }

        if (!operator || typeof operator.emit !== 'function') return

        if (denied.length === 0 && extra.length === 0) {
            operator.emit(event, payload)
            return
        }

        const skip = [...denied, ...extra]
        if (typeof operator.except === 'function') {
            const narrowed = operator.except(skip)
            if (narrowed && typeof narrowed.emit === 'function') {
                narrowed.emit(event, payload)
                return
            }
        }

        const skipSet = new Set(skip)
        if (senderSocket && typeof senderSocket.id === 'string') skipSet.add(senderSocket.id)
        if (emitToChannelMembersIndividually(io, channelId, event, payload, skipSet)) {
            console.error('[채널 전달 제외 우회]', {
                code: 'CHANNEL_EXCLUDE_FALLBACK', channelId, event, excluded: skipSet.size,
            })
            return
        }

        console.error('[채널 전달 제외 불가 · 방송 폐기]', {
            code: 'CHANNEL_EMIT_DROPPED_FAIL_CLOSED', channelId, event, excluded: skipSet.size,
        })
    } catch (err) {
        console.error('[채널 방송 실패]', { code: 'CHANNEL_EMIT_ERROR', channelId, event })
    }
}

function detachSocketFromChannel(socket, channelId, logLabel, logFields = {}, ownership = null) {
    if (!socket || typeof socket.leave !== 'function') return
    const ask = (predicate) => {
        if (typeof predicate !== 'function') return false
        try { return predicate() === true } catch (err) { return false }
    }
    const ownsChannel = () => ask(ownership?.ownsChannel)
    const keepsConnection = () => ask(ownership?.keepsConnection ?? ownership?.ownsChannel)
    const socketId = typeof socket.id === 'string' ? socket.id : null
    const detachOwner = createChannelExclusionOwner('detach')

    const isJoined = () =>
        socket.rooms && typeof socket.rooms.has === 'function' ? socket.rooms.has(channelId) : false

    if (socketId && !ownsChannel()) excludeSocketFromChannel(channelId, socketId, detachOwner)

    const finishReconcile = () => {
        if (ownsChannel()) {
            if (socketId) releaseChannelExclusion(channelId, socketId, detachOwner)
            return
        }
        if (socketId) excludeSocketFromChannel(channelId, socketId, detachOwner)
        console.error(logLabel, {
            code: 'CHANNEL_RECONCILE_BUDGET_EXHAUSTED', channelId, ...logFields,
        })
    }

    const settleRestore = (depth) => {
        if (ownsChannel()) {
            if (socketId) releaseChannelExclusion(channelId, socketId, detachOwner)
            return
        }
        if (depth >= MAX_CHANNEL_RESTORE_DEPTH) {
            finishReconcile()
            return
        }
        runLeave(1, depth + 1)
    }

    const restoreIfSuperseded = (depth) => {
        if (!ownsChannel()) return
        if (isJoined()) {
            if (socketId) releaseChannelExclusion(channelId, socketId, detachOwner)
            return
        }
        let rejoined
        try {
            rejoined = socket.join(channelId)
        } catch (err) {
            console.error(logLabel, { code: 'CHANNEL_REJOIN_ERROR', channelId, ...logFields })
            return
        }
        if (rejoined && typeof rejoined.then === 'function') {
            Promise.resolve(rejoined).then(
                () => settleRestore(depth),
                () => console.error(logLabel, { code: 'CHANNEL_REJOIN_ERROR', channelId, ...logFields }),
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
        if (socketId) releaseChannelExclusion(channelId, socketId, detachOwner)
    }

    const handleFailure = (attempt, depth) => {
        if (ownsChannel()) {
            if (socketId) releaseChannelExclusion(channelId, socketId, detachOwner)
            restoreIfSuperseded(depth)
            return
        }
        if (!keepsConnection()) {
            console.error(logLabel, { code: 'CHANNEL_LEAVE_ERROR', channelId, ...logFields })
            if (socketId) excludeSocketFromChannel(channelId, socketId, detachOwner)
            try {
                socket.disconnect(true)
            } catch (err) {
                console.error(logLabel, { code: 'CHANNEL_DISCONNECT_ERROR', channelId, ...logFields })
                return
            }
            if (socketId) releaseSocketFromAllChannels(socketId)
            return
        }
        if (socketId) excludeSocketFromChannel(channelId, socketId, detachOwner)
        if (attempt < MAX_CHANNEL_LEAVE_ATTEMPTS) {
            runLeave(attempt + 1, depth)
            return
        }
        console.error(logLabel, {
            code: 'CHANNEL_LEAVE_SUPERSEDED_EXCLUDED', channelId, attempts: attempt, ...logFields,
        })
    }

    function runLeave(attempt, depth) {
        let pending
        try {
            pending = socket.leave(channelId)
        } catch (err) {
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

function __resetChannelExclusionsForTests() {
    channelExclusions.clear()
    channelExclusionCount = 0
}

module.exports = {
    detachSocketFromChannel,
    emitToChannel,
    createChannelExclusionOwner,
    excludeSocketFromChannel,
    releaseChannelExclusion,
    releaseSocketFromAllChannels,
    getChannelExclusions,
    isSocketExcludedFromChannel,
    MAX_CHANNEL_LEAVE_ATTEMPTS,
    CHANNEL_EXCLUSION_ALARM_ENTRIES,
    __resetChannelExclusionsForTests,
}
