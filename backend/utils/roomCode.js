const crypto = require('crypto')

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateRoomCode() {
    let code = ''
    const bytes = crypto.randomBytes(6)
    for (const byte of bytes) {
        code += CHARS[byte % CHARS.length]
    }
    return code
}

function generateUniqueRoomCode(existingRoomsMap, { retry = 5, generator = generateRoomCode, isReserved } = {}) {
    for (let attempt = 0; attempt < retry; attempt += 1) {
        const code = generator()
        const taken = [...existingRoomsMap.values()].some((room) => room.code === code)
        if (taken) continue
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
