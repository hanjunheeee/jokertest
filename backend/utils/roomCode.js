const crypto = require('crypto')

// 오인 방지 문자(I, O, 0, 1)를 제외한 집합
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** 6자리 랜덤 방 코드 생성 */
function generateRoomCode() {
    let code = ''
    const bytes = crypto.randomBytes(6)
    for (const byte of bytes) {
        code += CHARS[byte % CHARS.length]
    }
    return code
}

module.exports = { generateRoomCode }
