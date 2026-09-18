/**
 * F-21(AC-05/AC-06): 방송 채널에서 소켓을 떼는 **단일 소유 경계**.
 *
 * 대기방(socket/matchmaking.js)과 진행 중 세션(socket/gameSession.js)이 각자 같은 로직을
 * 복사해 두면 한쪽만 고쳐져 조용히 갈라진다. 이탈 정리는 비동기 완료·거부·재진입이 얽히는
 * 자리라 그 갈라짐이 바로 "배제된 계정이 방송을 계속 받는다"가 된다. 그래서 두 계층이 이
 * 모듈 하나만 쓴다.
 *
 * ── 이 모듈이 지키는 세 가지 ─────────────────────────────────────────────────
 *
 * 1. **완료 후에도 소유권을 다시 묻는다.** socket.leave도 socket.join도 adapter에 따라
 *    Promise다. 시작 시점의 소유권 판정은 그 Promise가 풀릴 때쯤이면 이미 과거의 사실일 수
 *    있다 — 옛 이탈이 끝나며 되돌린 가입(restore)이 완료되는 사이 그 새 소속마저 추방되면,
 *    가입만 남고 권한은 없는 소켓이 생긴다. 그래서 leave 완료·join 완료 **양쪽 모두**에서
 *    다시 묻는다.
 * 2. **세 질문을 섞지 않는다.** "지금 이 채널의 정상 소속인가"(ownsChannel)와 "지금 살아 있는
 *    소속이 있는가"(keepsConnection)는 서로 다른 질문이고, 실패 처리는 **둘을 순서대로** 묻는다.
 *      - ownsChannel이면: 같은 채널로 정당하게 다시 들어온 소속이다. 옛 leave의 거부는 그 새
 *        소속을 부정하는 근거가 아니다 — 제외하지도, 다시 떼지도, 끊지도 않는다.
 *      - ownsChannel은 아니지만 keepsConnection이면: **다른** 채널의 새 소속이다. 연결을 끊지
 *        않되 이 채널의 전달에서는 뺀다.
 *      - 둘 다 아니면: 남은 근거가 없다 — 연결을 끊는다.
 * 3. **떼지 못한 채널은 전달에서 제외하고, 그 제외는 사라지지 않는다.** leave가 실제로 실패했는데
 *    그 연결을 끊을 수 없는 경우, 제한된 횟수만 다시 시도하고 그래도 실패하면 그 (채널, 소켓)
 *    쌍을 전달 제외 목록에 넣는다. 이 목록은 **용량을 이유로 축출하지 않는다** — 축출은 곧
 *    "권한을 잃은 소켓이 다시 방송을 받는다"이고, 그것이 이 목록이 존재하는 이유 자체다.
 *    해제 근거는 사실뿐이다: leave가 끝내 성공했거나, 그 채널의 정상 소속이 됐거나, 연결이
 *    끝났거나(onDisconnect → releaseSocketFromAllChannels). 목록의 크기는 그 생명주기가
 *    묶어 준다 — 살아 있는 소켓 하나가 자기가 들어갔던 채널 수만큼만 항목을 가질 수 있다.
 * 4. **제외할 수 없으면 보내지 않는다(fail-closed).** adapter가 except을 지원하지 않으면 채널
 *    구성원을 직접 훑어 허용된 소켓에게만 개별 전달한다. 그것조차 할 수 없으면 그 방송을
 *    **버린다** — 놓친 정상 참가자는 재조회(get_current_room·get_session_snapshot)로 회복하지만,
 *    배제된 소켓에 한 번 흘러간 방송은 회수할 수 없다.
 *
 * 어떤 함수도 던지지 않는다 — 전부 이미 확정된 커밋 뒤의 best-effort 정리이고, 여기서 새는
 * 예외는 뒤따르는 다른 통지를 멈춘다.
 */

/** leave 실패 시 다시 시도하는 최대 횟수(최초 시도 포함). 무한 재시도를 만들지 않는다. */
const MAX_CHANNEL_LEAVE_ATTEMPTS = 3

/**
 * 되돌린 가입(restore)이 완료된 뒤 소유권을 잃은 경우 다시 떼는 깊이 상한.
 *
 * leave → restore → leave가 서로를 부르므로 상한이 없으면 두 비동기 경로가 핑퐁할 수 있다.
 * 1이면 "되돌린 가입은 최대 한 번만 다시 뗀다"는 뜻이고, 그 마지막 정리는 restore를 다시
 * 걸지 않는다.
 */
const MAX_CHANNEL_RESTORE_DEPTH = 1

/**
 * channelId → socketId → Set<ownerToken> — **떼지 못한/아직 확정되지 않은** 채널 구독의 전달 제외.
 *
 * ── F-23(AC-04): 왜 소유 토큰이 필요한가 ──────────────────────────────────────
 *
 * 예전에는 channelId → Set<socketId>였고, 해제는 (채널, 소켓) **쌍 전체**를 지웠다. 그래서
 * 서로 다른 두 흐름이 같은 (채널, 소켓)에 대해 동시에 제외를 들고 있으면, 먼저 끝난 쪽의
 * 해제가 아직 유효한 다른 쪽의 제외까지 함께 지웠다.
 *
 * 실제로 그런 구간이 있다. 초대 수락(handleAcceptGameInvite)은 채널에 join한 **뒤에** publish와
 * durable 영수증을 기다리는데, 그 대기 동안 이 입장자는 아직 확정 참가자가 아니므로 방송을
 * 받으면 안 된다. 그 사이 옛 이탈 정리(detachSocketFromChannel)의 leave가 끝나면, 쌍 전체
 * 해제가 "확정 전 입장" 제외까지 지워 미확정 입장자가 그 방의 방송을 받기 시작했다.
 *
 * 토큰은 그 둘을 분리한다 — 각 흐름은 **자기 토큰만** 해제하고, 남은 토큰이 하나라도 있으면
 * 그 소켓은 여전히 전달에서 빠진다. 해제 근거는 여전히 사실뿐이다(성공적인 이탈·정당한
 * 재소유·확정·소켓 종료).
 */
const channelExclusions = new Map()

/** 소유자를 밝히지 않은 옛 호출부의 기본 토큰(쌍 전체 해제와 같은 의미를 유지한다). */
const DEFAULT_EXCLUSION_OWNER = '__default__'

/** 이 시도만의 제외 소유 토큰을 만든다(초대 입장·채널 이탈이 각각 자기 것을 들고 있는다). */
let exclusionOwnerSeq = 0
function createChannelExclusionOwner(label = 'owner') {
    exclusionOwnerSeq += 1
    return `${label}#${exclusionOwnerSeq}`
}

/**
 * 경보 수위. **축출 기준이 아니다** — 이 값을 넘어도 항목은 하나도 버리지 않는다.
 *
 * 이전 구현은 여기서 가장 오래된 항목을 버렸다. 그 축출은 곧 "떼지도 끊지도 못한 소켓이 다시
 * 그 채널의 방송을 받는다"였고, 배제 기록이 많을수록(=장애가 클수록) 더 많은 무단 전달이
 * 열리는 역방향 안전성이었다. 지금은 넘어서면 **기록만** 남긴다: 목록의 크기는 용량이 아니라
 * 생명주기가 묶는다(살아 있는 소켓 × 그 소켓이 들어갔던 채널 수, 그리고 onDisconnect가
 * 모든 소켓에서 releaseSocketFromAllChannels를 부른다).
 */
const CHANNEL_EXCLUSION_ALARM_ENTRIES = 1024
let channelExclusionCount = 0
/** 수위 경보를 넘을 때 한 번만 기록하기 위한 표식(로그 폭주를 만들지 않는다). */
let channelExclusionAlarmRaised = false

/**
 * 그 소켓을 그 채널의 방송 대상에서 뺀다. 같은 소유자가 이미 걸어 둔 제외면 아무 일도 하지
 * 않는다. **다른** 소유자의 제외는 서로 독립적으로 쌓인다(하나가 풀려도 나머지는 남는다).
 */
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
    // 유효한 배제는 하나도 버리지 않는다. 수위를 넘으면 관측 가능한 경보만 남긴다 —
    // "떼지도 끊지도 못한 연결"이 이만큼 쌓였다는 사실 자체가 운영 신호다.
    if (!channelExclusionAlarmRaised && channelExclusionCount > CHANNEL_EXCLUSION_ALARM_ENTRIES) {
        channelExclusionAlarmRaised = true
        console.error('[채널 전달 제외 수위 초과]', {
            code: 'CHANNEL_EXCLUSION_OVER_CAPACITY',
            entries: channelExclusionCount,
            alarmAt: CHANNEL_EXCLUSION_ALARM_ENTRIES,
        })
    }
}

/** 수위 아래로 내려오면 경보를 다시 무장한다(다음 초과도 관측될 수 있게 한다). */
function rearmExclusionAlarm() {
    if (channelExclusionAlarmRaised && channelExclusionCount <= CHANNEL_EXCLUSION_ALARM_ENTRIES) {
        channelExclusionAlarmRaised = false
    }
}

/**
 * **자기 토큰만** 푼다(이탈이 끝내 성공했거나 정당한 소속이 됐거나 입장이 확정됐을 때).
 *
 * 다른 흐름이 같은 (채널, 소켓)에 대해 아직 제외를 들고 있으면 그 소켓은 계속 빠져 있다 —
 * 쌍 전체를 지우던 이전 동작이 곧 "아직 확정되지 않은 입장자가 방송을 받는" 구멍이었다.
 */
function releaseChannelExclusion(channelId, socketId, owner = DEFAULT_EXCLUSION_OWNER) {
    const bySocket = channelExclusions.get(channelId)
    const owners = bySocket?.get(socketId)
    if (!owners || !owners.delete(owner)) return
    channelExclusionCount -= 1
    if (owners.size === 0) bySocket.delete(socketId)
    if (bySocket.size === 0) channelExclusions.delete(channelId)
    rearmExclusionAlarm()
}

/**
 * 그 소켓의 모든 채널 제외를 푼다(연결이 끝나면 더 뺄 대상 자체가 없다).
 *
 * 이것이 목록 크기의 **실제 상한**이다 — socket/matchmaking.js의 onDisconnect가 모든 소켓에서
 * 이 함수를 부르므로, 항목은 살아 있는 연결보다 오래 남지 못한다. 연결이 실제로 끝났다는
 * 사실은 소유자와 무관하므로 여기서만 그 소켓의 토큰을 전부 비운다.
 */
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

/** 지금 그 채널의 전달에서 빠져 있는 소켓 id들(없으면 빈 배열). */
function getChannelExclusions(channelId) {
    const bySocket = channelExclusions.get(channelId)
    return bySocket ? [...bySocket.keys()] : []
}

function isSocketExcludedFromChannel(channelId, socketId) {
    return (channelExclusions.get(channelId)?.get(socketId)?.size ?? 0) > 0
}

/**
 * 채널 구성원을 직접 훑어 **허용된 소켓에게만** 개별 전달한다.
 *
 * except을 제공하지 않는 adapter의 fail-closed 대체 경로다. 실제 Socket.IO의 BroadcastOperator는
 * except을 제공하므로 이 경로는 단일 노드 fake/커스텀 adapter에서만 쓰인다 — 그래서 원격 노드의
 * 소켓을 열거하지 못하는 한계는 이 경로의 문제가 아니다(그 환경은 except 경로를 탄다).
 *
 * @returns {boolean} 구성원을 실제로 열거할 수 있었는가. false면 호출부가 방송을 **버린다**.
 */
function emitToChannelMembersIndividually(io, channelId, event, payload, skipSocketIds) {
    const registry = io?.sockets?.sockets
    if (!registry || typeof registry.values !== 'function') return false
    for (const member of registry.values()) {
        const memberId = typeof member?.id === 'string' ? member.id : null
        if (!memberId || skipSocketIds.has(memberId)) continue
        const rooms = member.rooms
        if (!rooms || typeof rooms.has !== 'function' || !rooms.has(channelId)) continue
        if (typeof member.emit !== 'function') continue
        try {
            member.emit(event, payload)
        } catch (err) {
            // 한 수신자의 전달 실패가 나머지 수신자를 멈추지 않는다(기존 개별 전달 관례).
            console.error('[채널 개별 전달 실패]', {
                code: 'CHANNEL_EMIT_RECIPIENT_ERROR', channelId, event,
            })
        }
    }
    return true
}

/**
 * 채널 방송의 유일한 경계. 제외 목록이 비어 있으면 기존 방송과 **완전히 같다**(정상 경로의
 * 동작·기록을 바꾸지 않는다). 제외가 있으면 그 소켓들에게는 **어떤 경우에도** 보내지 않는다.
 *
 * @param {object} [options]
 * @param {object} [options.senderSocket] - 주면 `senderSocket.to(channelId)`로 보낸다 —
 *   "채널 전체에서 발신자만 빼고"라는 기존 `socket.to(room).emit` 의미를 그대로 보존한다.
 * @param {string[]} [options.exceptSocketIds] - 이 방송에서만 추가로 빼는 소켓들.
 *
 * 절대 던지지 않는다 — 호출부는 이미 각자 예외를 격리하고 있지만, 방송 하나의 실패가 커밋
 * 결과를 되돌리지 않는다는 계약을 이 함수도 스스로 지킨다.
 */
function emitToChannel(io, channelId, event, payload, options = null) {
    try {
        const senderSocket = options?.senderSocket ?? null
        // 소유 토큰이 하나라도 남아 있는 소켓은 전부 제외 대상이다.
        const denied = getChannelExclusions(channelId)
        const extra = (Array.isArray(options?.exceptSocketIds) ? options.exceptSocketIds : [])
            .filter((id) => typeof id === 'string' && id.length > 0)

        const operator = senderSocket
            ? senderSocket.to?.(channelId)
            : io?.to?.(channelId)
        if (!operator || typeof operator.emit !== 'function') return

        // 정상 경로: 이 채널에 배제된 소켓이 없다. 발신자 제외는 senderSocket.to()가 이미
        // 수행하므로 기존 호출과 완전히 같은 한 번의 방송이다.
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

        // except을 제공하지 않는 adapter다. 그대로 보내면 배제된 소켓에게 흘러간다 —
        // 구성원을 직접 훑어 허용된 소켓에게만 보낸다.
        const skipSet = new Set(skip)
        if (senderSocket && typeof senderSocket.id === 'string') skipSet.add(senderSocket.id)
        if (emitToChannelMembersIndividually(io, channelId, event, payload, skipSet)) {
            console.error('[채널 전달 제외 우회]', {
                code: 'CHANNEL_EXCLUDE_FALLBACK', channelId, event, excluded: skipSet.size,
            })
            return
        }

        // 제외할 수도, 구성원을 훑을 수도 없다. **보내지 않는다** — 놓친 정상 참가자는
        // 재조회로 회복하지만 배제된 소켓에 흘러간 방송은 회수할 수 없다(fail-closed).
        console.error('[채널 전달 제외 불가 · 방송 폐기]', {
            code: 'CHANNEL_EMIT_DROPPED_FAIL_CLOSED', channelId, event, excluded: skipSet.size,
        })
    } catch (err) {
        console.error('[채널 방송 실패]', { code: 'CHANNEL_EMIT_ERROR', channelId, event })
    }
}

/**
 * 제거된 소켓을 방송 채널에서 뗀다.
 *
 * @param {object} socket
 * @param {string} channelId
 * @param {string} logLabel
 * @param {object} [logFields] - 로그에 함께 남길 맥락(gameId 등).
 * @param {object} [ownership]
 * @param {() => boolean} [ownership.ownsChannel] - "이 소켓이 **지금** 그 채널의 정상 소속인가".
 *   참이면 이 정리는 이미 지난 소속의 것이므로 떼어낸 가입을 되돌린다.
 * @param {() => boolean} [ownership.keepsConnection] - "이 소켓이 지금 살아 있는 소속을
 *   가졌는가"(기본값: ownsChannel). 참이면 실패해도 연결을 끊지 않는다.
 */
function detachSocketFromChannel(socket, channelId, logLabel, logFields = {}, ownership = null) {
    if (!socket || typeof socket.leave !== 'function') return
    const ask = (predicate) => {
        if (typeof predicate !== 'function') return false
        try { return predicate() === true } catch (err) { return false }
    }
    const ownsChannel = () => ask(ownership?.ownsChannel)
    const keepsConnection = () => ask(ownership?.keepsConnection ?? ownership?.ownsChannel)
    const socketId = typeof socket.id === 'string' ? socket.id : null
    /**
     * F-23(AC-04): 이 정리 흐름만의 제외 소유 토큰.
     *
     * 이 함수가 거는 제외와 푸는 제외는 전부 이 토큰 하나에 묶인다 — 그래서 이 leave가 끝나도
     * 같은 (채널, 소켓)에 대해 **다른** 흐름(확정 전 입장 대기 등)이 들고 있는 제외는 남는다.
     */
    const detachOwner = createChannelExclusionOwner('detach')

    const isJoined = () =>
        socket.rooms && typeof socket.rooms.has === 'function' ? socket.rooms.has(channelId) : false

    /**
     * **떼기를 시작하기 전에 먼저 전달에서 뺀다.**
     *
     * socket.leave는 adapter에 따라 Promise다. 예전에는 그 Promise가 풀릴 때까지 아무 제외도
     * 없었다 — 그 사이에 나가는 커밋 이후의 공개 방송(player_left_room·player_eliminated·
     * session_participation_changed…)은 아직 채널에 남아 있는 이 소켓에게 그대로 갔다. 서버는
     * 이미 소속을 지웠는데 배제된 계정이 그 방/판의 방송을 받는 구간이 열려 있었던 것이다.
     *
     * 지금 소속이 아닐 때만 뺀다 — 이 정리가 이미 지난 소속의 것이고 지금은 정당한 새 소속인
     * 경우(ownsChannel)까지 빼면 방금 들어온 참가자가 자기 채널의 방송을 잃는다.
     *
     * 이 제외는 **사실로만** 풀린다: leave가 실제로 끝났거나(handleSettled), 그 채널의 정당한
     * 소속이 됐거나, 연결이 끝났을 때(releaseSocketFromAllChannels).
     */
    if (socketId && !ownsChannel()) excludeSocketFromChannel(channelId, socketId, detachOwner)

    /**
     * 되돌린 가입이 **완료된 뒤** 소유권을 다시 묻는다.
     *
     * 이 재검사가 없으면: 옛 이탈이 끝나며 새 소속의 가입을 되돌리는 join을 걸고, 그 join이
     * 완료되기 전에 그 새 소속마저 추방/이탈하면, 마지막에 완료된 join이 **권한을 잃은**
     * 소켓을 채널에 다시 남긴다(그 뒤 아무도 치우지 않는다).
     */
    /**
     * 왕복 예산이 끝난 자리의 **마지막 판정**. 어떤 경우에도 다시 leave/restore를 부르지 않는다.
     *
     * 이전 구현은 상한에서 `runLeave(1, MAX_CHANNEL_RESTORE_DEPTH)`를 불렀고, 그 leave가 끝나면
     * 다시 `restoreIfSuperseded` → `settleRestore` → 또 같은 상한 분기로 돌아왔다 — 상한이
     * 있는데도 실제 작업은 무한히 재진입할 수 있었다. 예산은 여기서 **끝난다**:
     *
     *   - 지금 정당한 소속이면: 가입을 남기고 제외를 푼다. 여기서 또 떼면 방금 성립한 참가자가
     *     자기 채널을 잃는다(더 새로운 같은 채널·다른 채널 소속을 보존한다는 계약).
     *   - 소속이 아니면: 가입이 남아 있을 수 있으므로 **전달 제외를 유지한 채** 끝낸다. 제외는
     *     즉시 효력이 있고 연결 종료까지 남으므로 방송이 새지 않는다(fail-closed).
     */
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
            // 정당한 소속이 다시 채널을 가졌다 — 전달 제외가 남아 있으면 푼다.
            if (socketId) releaseChannelExclusion(channelId, socketId, detachOwner)
            return
        }
        if (depth >= MAX_CHANNEL_RESTORE_DEPTH) {
            // 예산이 끝났다 — 되돌린 가입을 그대로 두되 전달에서는 뺀 채로 종료한다.
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
        // 옛 이탈이 늦게 끝나면서 새 소속의 채널 가입까지 함께 떼어냈다 — 되돌려 놓는다.
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
        // 정상적으로 떨어졌다 — 전달 제외가 남아 있으면 더 이상 필요 없다.
        if (socketId) releaseChannelExclusion(channelId, socketId, detachOwner)
    }

    const handleFailure = (attempt, depth) => {
        // ① **같은 채널의 정당한 새 소속**인가. 추방된 계정이 그 방/판에 다시 정상 입장한
        //    경우다 — 옛 leave의 거부는 그 새 소속을 부정하는 근거가 아니다. 여기서 제외하거나
        //    다시 떼면 방금 성립한 정상 참가자가 자기 채널의 방송을 잃는다. keepsConnection만
        //    먼저 물으면(이전 구현) 이 경우도 "다른 소속"과 똑같이 제외돼 버린다.
        if (ownsChannel()) {
            if (socketId) releaseChannelExclusion(channelId, socketId, detachOwner)
            // leave가 부분적으로 적용됐을 수 있으니 가입만 되돌려 놓는다(끊지 않는다).
            restoreIfSuperseded(depth)
            return
        }
        // ② 이 채널의 소속은 아니지만 **다른** 살아 있는 소속이 있는가. 있으면 연결을 끊지
        //    않는다 — 그 새 소속의 피해는 끊기와 같다.
        if (!keepsConnection()) {
            console.error(logLabel, { code: 'CHANNEL_LEAVE_ERROR', channelId, ...logFields })
            // **끊긴 것을 확인한 뒤에만** 제외를 푼다. 예전에는 disconnect보다 먼저 전부 풀었고,
            // 그래서 disconnect가 던지면(= 연결이 그대로 남으면) 떼지도 끊지도 못한 소켓이
            // 아무 제외 없이 채널에 남아 방송을 계속 받았다. 순서를 뒤집으면 실패는 fail-closed다.
            if (socketId) excludeSocketFromChannel(channelId, socketId, detachOwner)
            try {
                socket.disconnect(true)
            } catch (err) {
                // 끊지 못했다 — 제외를 남긴 채로 끝낸다(여기서 푸는 것은 근거가 없다).
                console.error(logLabel, { code: 'CHANNEL_DISCONNECT_ERROR', channelId, ...logFields })
                return
            }
            if (socketId) releaseSocketFromAllChannels(socketId)
            return
        }
        // ③ 그렇다고 옛 채널을 그대로 두면 배제된 계정이 그 방송을 계속 받는다. 전달에서 먼저
        //    빼고(즉시 효력), 제한된 횟수만 다시 떼어 본다.
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

/** 테스트 전용: 전달 제외 목록을 비운다(모듈 싱글턴이라 스위트 사이에 남지 않게 한다). */
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
