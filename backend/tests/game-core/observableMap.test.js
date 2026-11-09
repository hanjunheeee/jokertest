// 지켜보는 Map 시험 (MN-078), 보통 Map처럼 동작하는지 + 넣기·빼기·비우기 알림
// npm run test:game-core에서 돎, cluster 없이
const test = require('node:test')
const assert = require('node:assert/strict')
const { ObservableMap } = require('../../game-core/core/tools/observableMap')
const registryState = require('../../game-core/core/registry/state')

test('MN-078: set/delete/clear 알림, 같은 값 다시 넣기·없는 키 빼기·빈 Map 비우기는 안 알림', () => {
    const map = new ObservableMap()
    const seen = []
    const off = map.onChange((change) => seen.push(change))

    map.set('u1', 'r1')
    map.set('u1', 'r1')
    map.set('u1', 'r2')
    assert.equal(map.delete('none'), false)
    assert.equal(map.delete('u1'), true)
    map.clear()
    map.set('a', 1).set('b', 2)
    map.clear()

    assert.deepEqual(seen, [
        { type: 'set', key: 'u1', value: 'r1', prev: undefined },
        { type: 'set', key: 'u1', value: 'r2', prev: 'r1' },
        { type: 'delete', key: 'u1', prev: 'r2' },
        { type: 'set', key: 'a', value: 1, prev: undefined },
        { type: 'set', key: 'b', value: 2, prev: undefined },
        { type: 'clear', entries: [['a', 1], ['b', 2]] },
    ])

    off()
    map.set('c', 3)
    assert.equal(seen.length, 6)
})

test('MN-078: 보통 Map과 같음 (생성 목록·instanceof·반복·size·new Map 복사), 생성 목록은 안 알림', () => {
    const map = new ObservableMap([['x', 1], ['y', 2]])
    assert.ok(map instanceof Map)
    assert.equal(map.size, 2)
    assert.deepEqual([...map], [['x', 1], ['y', 2]])
    assert.deepEqual([...map.keys()], ['x', 'y'])
    assert.deepEqual(new Map(map), new Map([['x', 1], ['y', 2]]))
    let count = 0
    map.forEach(() => { count += 1 })
    assert.equal(count, 2)
    assert.equal(map.get('x'), 1)
    assert.equal(map.has('z'), false)
})

test('MN-078: 듣는 함수가 던져도 장부 쓰기는 그대로', () => {
    const map = new ObservableMap()
    map.onChange(() => { throw new Error('boom') })
    const later = []
    map.onChange((c) => later.push(c.type))
    assert.doesNotThrow(() => map.set('k', 'v'))
    assert.equal(map.get('k'), 'v')
    assert.deepEqual(later, ['set'])
})

test('MN-078: 판 장부 gameSessions·playerSession은 지켜보는 Map, roomGameSession은 보통 Map', () => {
    assert.ok(registryState.gameSessions instanceof ObservableMap)
    assert.ok(registryState.playerSession instanceof ObservableMap)
    assert.ok(!(registryState.roomGameSession instanceof ObservableMap))
})
