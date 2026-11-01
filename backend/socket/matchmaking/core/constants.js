// 대기방·매칭 상수 파일
// 부팅 번호·보관 시간·입장 대기 기본값, matchmaking 안 파일들이 사용
const kickReceiptStore = require('../../kickReceiptStore')

// 서버 켤 때마다 바뀌는 부팅 번호, 추방 영수증과 같은 값 (옛 서버 초대·방 정보 거르기)
const BOOT_EPOCH = kickReceiptStore.BOOT_EPOCH

// 다음 방 우편함 30분 보관
const PARTY_ROOM_TTL_MS = 30 * 60 * 1000

// 끊긴 사람 방에서 빼기 전 기다리는 15초
const ROOM_RECONNECT_GRACE_MS = 15 * 1000

// 초대 입장 단계별 대기 기본 5초
const ADMISSION_STEP_MS = 5 * 1000

// 초대 입장 전체 대기 기본 15초
const ADMISSION_TOTAL_MS = 15 * 1000

module.exports = {
    BOOT_EPOCH,
    PARTY_ROOM_TTL_MS,
    ROOM_RECONNECT_GRACE_MS,
    ADMISSION_STEP_MS,
    ADMISSION_TOTAL_MS,
}
