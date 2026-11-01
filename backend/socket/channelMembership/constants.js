// 채널 소속 상수 파일
// 채널 떼기 재시도·되찾기 한도 + 제외 목록 기본 주인·경보 수위, channelMembership 폴더가 씀

// leave 실패 때 다시 시도하는 최대 횟수
const MAX_CHANNEL_LEAVE_ATTEMPTS = 3

// 떼는 사이 채널을 다시 가졌을 때 되찾기 깊이 한도 (무한 왕복 막기)
const MAX_CHANNEL_RESTORE_DEPTH = 1

// 주인 안 준 제외 걸기의 주인 이름
const DEFAULT_EXCLUSION_OWNER = '__default__'

// 제외 기록이 이만큼 넘으면 한 번 경보 (새는 곳 찾기용)
const CHANNEL_EXCLUSION_ALARM_ENTRIES = 1024

module.exports = {
    MAX_CHANNEL_LEAVE_ATTEMPTS,
    MAX_CHANNEL_RESTORE_DEPTH,
    DEFAULT_EXCLUSION_OWNER,
    CHANNEL_EXCLUSION_ALARM_ENTRIES,
}
