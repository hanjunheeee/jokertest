const test = require('node:test')
const assert = require('node:assert/strict')
const { generateUniqueRoomCode } = require('../roomCode')

test('충돌이 없으면 첫 시도의 코드를 그대로 반환한다', () => {
    const code = generateUniqueRoomCode(new Map(), { generator: () => 'AAAAAA' })
    assert.equal(code, 'AAAAAA')
})

test('첫 코드가 충돌하면 재시도해 다음 코드를 반환한다', () => {
    const existing = new Map([['room-1', { code: 'AAAAAA' }]])
    const sequence = ['AAAAAA', 'BBBBBB']
    const generator = () => sequence.shift()
    const code = generateUniqueRoomCode(existing, { generator })
    assert.equal(code, 'BBBBBB')
})

test('재시도를 모두 소진하면 null을 반환한다', () => {
    const existing = new Map([['room-1', { code: 'AAAAAA' }]])
    const code = generateUniqueRoomCode(existing, { retry: 3, generator: () => 'AAAAAA' })
    assert.equal(code, null)
})

test('충돌 시 기존 방을 덮어쓰지 않는다', () => {
    const existingRoom = { code: 'AAAAAA' }
    const existing = new Map([['room-1', existingRoom]])
    generateUniqueRoomCode(existing, { retry: 3, generator: () => 'AAAAAA' })
    assert.equal(existing.get('room-1'), existingRoom)
    assert.equal(existing.size, 1)
})

test('socket.join 대기 중 생성된 다른 방도 코드 비교 대상에 포함된다', () => {
    // generateUniqueRoomCode는 호출 시점의 Map을 그대로 스캔하므로, 호출 직전에 다른
    // 방이 새로 커밋됐다면 그 방의 코드와도 자연히 비교된다(별도 캐시를 갖지 않음).
    const existing = new Map()
    const first = generateUniqueRoomCode(existing, { generator: () => 'CCCCCC' })
    existing.set('room-1', { code: first })
    const second = generateUniqueRoomCode(existing, { generator: () => 'CCCCCC' })
    assert.equal(second, null) // 재시도해도 같은 코드만 나오는 극단 상황을 흉내낸 것
})
