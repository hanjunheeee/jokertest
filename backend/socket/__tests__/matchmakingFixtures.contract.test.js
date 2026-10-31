'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { createFakeSocket, createFakeIo } = require('./testHelpers/matchmakingFixtures')

function spyOnEmit(socket) {
    const calls = []
    const original = socket.emit.bind(socket)
    socket.emit = (event, payload) => {
        calls.push({ event, payload })
        return original(event, payload)
    }
    return calls
}

test('SPLIT-1: io 방송은 각 수신자의 **현재 emit**을 정확히 한 번 호출하고 received도 한 번만 늘어난다', () => {
    const a = createFakeSocket('a')
    const b = createFakeSocket('b')
    const io = createFakeIo([a, b])
    a.rooms.add('room-1')
    b.rooms.add('room-1')
    const aCalls = spyOnEmit(a)
    const bCalls = spyOnEmit(b)

    io.to('room-1').emit('player_ready_changed', { uuid: 'a' })

    assert.equal(aCalls.length, 1, 'emit spy가 호출되지 않는데 received만 느는 우회는 허용하지 않는다')
    assert.equal(bCalls.length, 1)
    assert.equal(a.countReceived('player_ready_changed'), 1)
    assert.equal(b.countReceived('player_ready_changed'), 1)
})

test('SPLIT-1: 방송 표식(viaBroadcast)은 기록 메타데이터로만 남고 payload는 변형되지 않는다', () => {
    const a = createFakeSocket('a')
    const io = createFakeIo([a])
    a.rooms.add('room-1')
    const payload = { uuid: 'a', nested: { keep: true } }

    io.to('room-1').emit('player_ready_changed', payload)
    a.emit('room_joined', payload)

    const [broadcast, direct] = a.received
    assert.equal(broadcast.viaBroadcast, true, '기존 은폐 시험이 방송과 표적 전달을 계속 구별할 수 있어야 한다')
    assert.equal(direct.viaBroadcast, undefined)
    assert.equal(broadcast.payload, payload)
    assert.deepEqual(Object.keys(payload).sort(), ['nested', 'uuid'])
})

test('SPLIT-1: 중첩 방송이 끝나도 방송 문맥이 복원된다', () => {
    const a = createFakeSocket('a')
    const b = createFakeSocket('b')
    const io = createFakeIo([a, b])
    a.rooms.add('room-1')
    b.rooms.add('room-1')

    let reentered = false
    const originalEmit = a.emit.bind(a)
    a.emit = (event, payload) => {
        const result = originalEmit(event, payload)
        if (!reentered) {
            reentered = true
            io.to('room-1').emit('nested_event', {})
        }
        return result
    }

    io.to('room-1').emit('outer_event', {})
    a.emit('direct_event', {})

    const direct = a.received.find((e) => e.event === 'direct_event')
    assert.equal(direct.viaBroadcast, undefined, '중첩 방송이 문맥을 새게 하면 직접 전송이 방송으로 기록된다')
})

test('SPLIT-1: except은 그 채널의 **현재 구성원 전부**를 뺀다(소켓 id 제외도 같은 의미다)', () => {
    const normal = createFakeSocket('normal')
    const excludedById = createFakeSocket('ex-id')
    const excludedByChannel = createFakeSocket('ex-ch')
    const outsider = createFakeSocket('outsider')
    const io = createFakeIo([normal, excludedById, excludedByChannel, outsider])
    for (const s of [normal, excludedById, excludedByChannel]) s.rooms.add('room-1')
    excludedByChannel.rooms.add('quarantine')

    io.to('room-1').except([excludedById.id, 'quarantine']).emit('player_joined_room', {})

    assert.equal(normal.countReceived('player_joined_room'), 1, '정상 수신자의 양성 대조가 없으면 "아무에게도 안 보냄"을 놓친다')
    assert.equal(excludedById.countReceived('player_joined_room'), 0)
    assert.equal(excludedByChannel.countReceived('player_joined_room'), 0)
    assert.equal(outsider.countReceived('player_joined_room'), 0, '채널 밖 소켓은 애초에 대상이 아니다')
})

test('SPLIT-1: 다른 소켓의 id와 같은 이름의 채널에 가입한 수신자도 그 except에서 함께 빠진다', () => {
    const victim = createFakeSocket('victim')
    const impersonator = createFakeSocket('impersonator')
    const io = createFakeIo([victim, impersonator])
    victim.rooms.add('room-1')
    impersonator.rooms.add('room-1')
    impersonator.rooms.add(victim.id)

    io.to('room-1').except(victim.id).emit('e', {})

    assert.equal(victim.countReceived('e'), 0)
    assert.equal(impersonator.countReceived('e'), 0)
})

test('SPLIT-1: except 체이닝은 앞선 제외를 잃지 않고 정상 수신자도 누락하지 않는다', () => {
    const keep = createFakeSocket('keep')
    const first = createFakeSocket('first')
    const second = createFakeSocket('second')
    const io = createFakeIo([keep, first, second])
    for (const s of [keep, first, second]) s.rooms.add('room-1')

    io.to('room-1').except(first.id).except([second.id]).emit('e', {})

    assert.equal(keep.countReceived('e'), 1)
    assert.equal(first.countReceived('e'), 0)
    assert.equal(second.countReceived('e'), 0)
})

test('SPLIT-1: 발신 소켓의 socket.to는 발신자를 빼고 실제 수신자에게 전달한다(기록은 broadcastTo로만 남는다)', () => {
    const sender = createFakeSocket('sender')
    const peer = createFakeSocket('peer')
    const io = createFakeIo([sender, peer])
    sender.rooms.add('room-1')
    peer.rooms.add('room-1')

    sender.to('room-1').emit('player_joined_room', {})

    assert.equal(peer.countReceived('player_joined_room'), 1)
    assert.equal(sender.countReceived('player_joined_room'), 0, '발신자의 방송 시도 기록을 수신으로 계산하면 안 된다')
    assert.equal(sender.emitted.filter((e) => e.broadcastTo === 'room-1').length, 1)
    assert.ok(io)
})

test('SPLIT-1: socket.to의 발신자 제외는 발신 id **채널의 구성원 전체**에 적용된다', () => {
    const sender = createFakeSocket('sender')
    const peer = createFakeSocket('peer')
    const joinedToSenderChannel = createFakeSocket('shadow')
    const io = createFakeIo([sender, peer, joinedToSenderChannel])
    for (const s of [sender, peer, joinedToSenderChannel]) s.rooms.add('room-1')
    joinedToSenderChannel.rooms.add(sender.id)

    sender.to('room-1').emit('player_ready_changed', {})

    assert.equal(joinedToSenderChannel.countReceived('player_ready_changed'), 0,
        '발신 id를 소켓 id 하나로만 대조하면 fixture가 실제 어댑터보다 더 많이 전달한다')
    assert.equal(sender.countReceived('player_ready_changed'), 0)
    assert.equal(peer.countReceived('player_ready_changed'), 1)
    assert.ok(io)
})

test('SPLIT-1: 같은 객체의 id가 바뀌어 다시 등록되면 옛 키가 사라져 한 방송을 한 번만 받는다', () => {
    const moving = createFakeSocket('moving')
    const peer = createFakeSocket('peer')
    const io = createFakeIo([moving, peer])
    moving.rooms.add('room-1')
    peer.rooms.add('room-1')
    const oldId = moving.id

    moving.id = 'sock-moving-r2'
    io.sockets.sockets.set(moving.id, moving)

    assert.equal(io.sockets.sockets.get(oldId), undefined,
        '옛 키가 남으면 registry 하나에 같은 객체가 두 번 들어간다')
    assert.equal(io.sockets.sockets.get(moving.id), moving)
    assert.equal(io.sockets.sockets.size, 2)

    const movingCalls = spyOnEmit(moving)
    io.to('room-1').emit('player_ready_changed', {})

    assert.equal(movingCalls.length, 1, '같은 객체가 두 키로 남으면 한 방송을 두 번 전달한다')
    assert.equal(moving.countReceived('player_ready_changed'), 1)
    assert.equal(peer.countReceived('player_ready_changed'), 1)
})

test('SPLIT-1: id가 바뀐 뒤 옛 id는 더 이상 canonical 조회에 쓰이지 못한다', () => {
    const moving = createFakeSocket('moving')
    const io = createFakeIo([moving])
    const oldId = moving.id

    moving.id = 'sock-moving-r2'
    io.sockets.sockets.set(moving.id, moving)

    assert.equal(moving.nsp.sockets.get(oldId), undefined,
        '폐기된 옛 id로 자기 자신을 조회할 수 있으면 canonical 판정의 우회로가 된다')
    assert.equal(moving.nsp.sockets.get(moving.id), moving)
})

test('SPLIT-1: 연결이 끊긴 소켓은 방송을 받지 않는다', () => {
    const live = createFakeSocket('live')
    const dead = createFakeSocket('dead')
    const io = createFakeIo([live, dead])
    live.rooms.add('room-1')
    dead.rooms.add('room-1')
    dead.connected = false

    io.to('room-1').emit('e', {})

    assert.equal(live.countReceived('e'), 1)
    assert.equal(dead.countReceived('e'), 0)
})

test('SPLIT-1: 한 수신자의 emit 예외가 뒤의 정상 참가자 수신을 막지 않는다', () => {
    const throwing = createFakeSocket('throwing', { emitShouldThrowOn: 'e' })
    const after = createFakeSocket('after')
    const io = createFakeIo([throwing, after])
    throwing.rooms.add('room-1')
    after.rooms.add('room-1')

    io.to('room-1').emit('e', {})

    assert.equal(throwing.countReceived('e'), 0)
    assert.equal(after.countReceived('e'), 1)
})

test('SPLIT-1(AC-04): io에 등록된 소켓의 nsp.sockets는 io의 registry와 **같은 Map**이다', () => {
    const initial = createFakeSocket('initial')
    const io = createFakeIo([initial])
    assert.equal(initial.nsp.sockets, io.sockets.sockets)

    const dynamic = createFakeSocket('dynamic')
    io.sockets.sockets.set(dynamic.id, dynamic)
    assert.equal(dynamic.nsp.sockets, io.sockets.sockets)

    const replacement = createFakeSocket('dynamic')
    io.sockets.sockets.set(replacement.id, replacement)
    assert.equal(initial.nsp.sockets.get(replacement.id), replacement)
    assert.notEqual(dynamic.nsp.sockets.get(dynamic.id), dynamic)

    io.sockets.sockets.delete(replacement.id)
    assert.equal(replacement.nsp.sockets.get(replacement.id), undefined)
})

test('SPLIT-1(AC-04): io에 등록되지 않은 소켓은 자기 자신만 담은 registry를 가진다', () => {
    const standalone = createFakeSocket('standalone')
    assert.equal(standalone.nsp.sockets.get(standalone.id), standalone)
    assert.equal(standalone.nsp.sockets.size, 1)
})

test('SPLIT-1: io.in(x).socketsLeave는 **그 채널의 구성원에게만** 적용된다', () => {
    const member = createFakeSocket('member')
    const otherChannelOwner = createFakeSocket('other')
    const io = createFakeIo([member, otherChannelOwner])
    member.rooms.add('room-1')
    otherChannelOwner.rooms.add('room-2')

    io.in('room-1').socketsLeave('room-2')

    assert.equal(otherChannelOwner.rooms.has('room-2'), true)
})
