// 대기방·매칭 상수 파일
// 부팅 번호·보관 시간·입장 대기 기본값, matchmaking 안 파일들이 사용
const kickReceiptStore = require('../../kickReceiptStore')

// 서버 켤 때마다 바뀌는 부팅 번호 (옛 서버 영수증 구분)
const BOOT_EPOCH = kickReceiptStore.BOOT_EPOCH

// 다음 방 우편함 30분 보관
const PARTY_MATCHING_ROOM_TTL_MS = 30 * 60 * 1000

// 끊긴 사람 방에서 빼기 전 기다리는 15초
const ROOM_RECONNECT_GRACE_MS = 15 * 1000

// 초대 입장 단계별 대기 기본 5초
const ADMISSION_DEFAULT_STEP_TIMEOUT_MS = 5 * 1000

// 초대 입장 전체 대기 기본 15초
const ADMISSION_DEFAULT_TOTAL_TIMEOUT_MS = 15 * 1000

module.exports = {
    BOOT_EPOCH,
    PARTY_MATCHING_ROOM_TTL_MS,
    ROOM_RECONNECT_GRACE_MS,
    ADMISSION_DEFAULT_STEP_TIMEOUT_MS,
    ADMISSION_DEFAULT_TOTAL_TIMEOUT_MS,
}
