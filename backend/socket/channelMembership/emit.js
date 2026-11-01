// 채널 방송 파일
// 제외 목록 빼고 채널에 방송 + 못 빼면 소켓마다 직접(그것도 못 하면 폐기), socket gameSession·matchmaking이 씀
const { tryOr } = require('../common/isolate')
const { getChannelExclusions } = require('./exclusions')

// 건너뛸 소켓 id 묶음: 제외 목록 + 보낸 사람 자신
function buildSkipSet(socketIds, senderSocket) {
    const skipSet = new Set(socketIds)
    if (senderSocket && typeof senderSocket.id === 'string') skipSet.add(senderSocket.id)
    return skipSet
}

// 채널 멤버 소켓마다 직접 보냄 (건너뛸 것·재검사 탈락은 뺌), 소켓 목록 없으면 false
function emitToEachMember(io, channelId, event, payload, skipSocketIds, recipientFilter = null) {
    const registry = io?.sockets?.sockets
    if (!registry || typeof registry.values !== 'function') return false
    for (const member of [...registry.values()]) {
        const memberId = typeof member?.id === 'string' ? member.id : null
        if (!memberId || skipSocketIds.has(memberId)) continue
        const rooms = member.rooms
        if (!rooms || typeof rooms.has !== 'function' || !rooms.has(channelId)) continue
        if (typeof member.emit !== 'function') continue
        if (typeof recipientFilter === 'function') {
            const allowed = tryOr(false, () => recipientFilter(member) === true)
            if (!allowed) continue
        }
        try {
            member.emit(event, payload)
        } catch {
            console.error('[채널 개별 전달 실패]', {
                code: 'CHANNEL_EMIT_RECIPIENT_ERROR', channelId, event,
            })
        }
    }
    return true
}

// 채널 방송: 제외 목록·추가 제외는 빼고 보냄, 뺄 수 없으면 아예 안 보냄 (지도 02-⑤)
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

        // 받을 사람 재검사가 있으면 소켓마다 직접 보냄 (못 하면 방송 폐기)
        if (recipientFilter) {
            const skipSet = buildSkipSet([...denied, ...extra], senderSocket)
            if (emitToEachMember(io, channelId, event, payload, skipSet, recipientFilter)) return
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

        // except가 없으면 소켓마다 직접 보내며 제외 (그것도 못 하면 방송 폐기)
        const skipSet = buildSkipSet(skip, senderSocket)
        if (emitToEachMember(io, channelId, event, payload, skipSet)) {
            console.error('[채널 전달 제외 우회]', {
                code: 'CHANNEL_EXCLUDE_FALLBACK', channelId, event, excluded: skipSet.size,
            })
            return
        }

        console.error('[채널 전달 제외 불가 · 방송 폐기]', {
            code: 'CHANNEL_EMIT_DROPPED_FAIL_CLOSED', channelId, event, excluded: skipSet.size,
        })
    } catch {
        console.error('[채널 방송 실패]', { code: 'CHANNEL_EMIT_ERROR', channelId, event })
    }
}

module.exports = { emitToChannel }
