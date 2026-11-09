// 지켜보는 Map 파일, 넣기·빼기·비우기 때 붙은 듣는 함수에 알려 줌 (나머지는 보통 Map과 똑같음)
// 판 장부(registry/state.js)·대기방 장부(matchmaking/core/state.js)가 씀, 듣는 쪽은 socket/connection/locationSync.js
// cluster에 기대지 않음 (game-core 안에서도 Redis 몰라도 되게)

// 알림 모양
// - { type:'set', key, value, prev }: 새로 넣음·값 바뀜 (같은 값 다시 넣기는 안 알림)
// - { type:'delete', key, prev }: 있던 것 뺌 (없는 키 빼기는 안 알림)
// - { type:'clear', entries }: 비움, entries = 비우기 전 [키, 값] 목록 (빈 Map 비우기는 안 알림)
class ObservableMap extends Map {
    #listeners = new Set()

    // super()에 목록을 안 넘김: Map 생성자가 set을 부를 때 #listeners가 아직 없어서
    constructor(entries) {
        super()
        if (entries) for (const [key, value] of entries) super.set(key, value)
    }

    // 듣는 함수 붙이기 → 떼는 함수 돌려줌
    onChange(fn) {
        if (typeof fn !== 'function') return () => {}
        this.#listeners.add(fn)
        return () => this.#listeners.delete(fn)
    }

    // 듣는 함수 오류는 삼킴 (장부 쓰기가 듣는 쪽 때문에 깨지면 안 됨)
    #notify(change) {
        for (const fn of [...this.#listeners]) {
            try { fn(change) } catch { /* 듣는 쪽 문제는 장부와 따로 */ }
        }
    }

    set(key, value) {
        const had = super.has(key)
        const prev = had ? super.get(key) : undefined
        super.set(key, value)
        if (!had || !Object.is(prev, value)) this.#notify({ type: 'set', key, value, prev })
        return this
    }

    delete(key) {
        if (!super.has(key)) return false
        const prev = super.get(key)
        super.delete(key)
        this.#notify({ type: 'delete', key, prev })
        return true
    }

    clear() {
        if (super.size === 0) return
        const entries = [...super.entries()]
        super.clear()
        this.#notify({ type: 'clear', entries })
    }
}

module.exports = { ObservableMap }
