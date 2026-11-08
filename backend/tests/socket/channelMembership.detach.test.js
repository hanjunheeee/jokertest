// 채널 떼기 늦은 실패 시험 (BE-053), 끊김 정리 뒤 leave 실패가 와도 죽은 소켓 제외 기록이 안 쌓이는지
// socket/channelMembership 떼기·제외 목록을 가짜 소켓으로 봄
const test = require('node:test')
const assert = require('node:assert/strict')

const channelMembership = require('../../socket/channelMembership')

// leave가 돌려준 약속을 시험이 직접 거절하는 가짜 소켓
function createDeferredLeaveSocket(id) {
    const rejecters = []
    const socket = {
        id,
        connected: true,
        rooms: new Set(['ch-1']),
        leave: () => new Promise((_, reject) => { rejecters.push(reject) }),
        join: () => {},
        disconnect: () => { socket.connected = false },
    }
    return { socket, rejectLeave: () => rejecters.shift()?.(new Error('leave 실패(시험 주입)')), leaveCalls: () => rejecters.length }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test.beforeEach(() => channelMembership.__resetChannelExclusionsForTests())

test('BE-053: 끊김 정리 뒤 늦게 온 leave 실패는 제외를 다시 걸지 않고 다시 떼기도 안 함', async (t) => {
    t.mock.method(console, 'error', () => {})
    const { socket, rejectLeave, leaveCalls } = createDeferredLeaveSocket('sock-late')
    channelMembership.detachSocketFromChannel(socket, 'ch-1', '[시험]', {}, {
        ownsChannel: () => false,
        keepsConnection: () => true,
    })
    assert.equal(channelMembership.isSocketExcludedFromChannel('ch-1', 'sock-late'), true, '떼는 동안은 제외')

    // 소켓 끊김 처리: 제외 기록 전부 풂
    socket.connected = false
    channelMembership.releaseSocketFromAllChannels('sock-late')

    rejectLeave()
    await flush()
    assert.equal(channelMembership.isSocketExcludedFromChannel('ch-1', 'sock-late'), false, '죽은 소켓 제외가 다시 쌓임')
    assert.equal(leaveCalls(), 0, '끊긴 소켓에 leave를 다시 시도함')
})

test('BE-053: 연결된 소켓은 그대로 — leave 실패면 제외 건 채 다시 시도', async (t) => {
    t.mock.method(console, 'error', () => {})
    const { socket, rejectLeave, leaveCalls } = createDeferredLeaveSocket('sock-live')
    channelMembership.detachSocketFromChannel(socket, 'ch-1', '[시험]', {}, {
        ownsChannel: () => false,
        keepsConnection: () => true,
    })
    rejectLeave()
    await flush()
    assert.equal(channelMembership.isSocketExcludedFromChannel('ch-1', 'sock-live'), true)
    assert.equal(leaveCalls(), 1, '다시 시도 안 함')
})
