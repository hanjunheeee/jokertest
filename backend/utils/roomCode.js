// 방 코드 파일, 6자리 방 코드 만들기 + 안 겹치는 코드 고르기
// socket/matchmaking/join의 create.js(안 겹치는 코드)·queue.js(그냥 코드)가 씀
const crypto = require('crypto')

// 헷갈리는 글자(I·O·0·1)는 뺌
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// 무작위 6자리 (글자 32개라 바이트를 나눈 나머지가 고르게 나옴)
function generateRoomCode() {
    let code = ''
    const bytes = crypto.randomBytes(6)
    for (const byte of bytes) {
        code += CHARS[byte % CHARS.length]
    }
    return code
}

// 지금 방들과 안 겹치고 예약도 안 된 코드, retry번 안에 못 찾으면 null
function generateUniqueRoomCode(existingRoomsMap, { retry = 5, generator = generateRoomCode, isReserved } = {}) {
    for (let attempt = 0; attempt < retry; attempt += 1) {
        const code = generator()
        const taken = [...existingRoomsMap.values()].some((room) => room.code === code)
        if (taken) continue
        // 예약 판정이 터지면 예약된 걸로 침 (모르는 코드는 안 씀)
        if (typeof isReserved === 'function') {
            let reserved = true
            try {
                reserved = isReserved(code) === true
            } catch (err) {
                console.error('[방 코드 예약 판정 실패]', err)
            }
            if (reserved) continue
        }
        return code
    }
    return null
}

module.exports = { generateRoomCode, generateUniqueRoomCode }
