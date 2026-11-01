// socket gameSession 상수 파일
// 내부 전용 거절 코드 묶음·밤 턴 단계·연출 대기·밤 성공 ACK 값·거절 문구, socket gameSession 폴더 파일들이 씀
const { REPLY_MESSAGES } = require('../../common/replies')

// core 거절 코드 중 밖에 그대로 보이면 안 되는 것 (INTERNAL_ERROR로 바꿔 답함, 지도 03-⑥ · 06-⑨)
const INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT'])

// 위 기본 묶음에 요청별 코드 더하기
function withInternalOnly(...codes) {
    return new Set([...INTERNAL_ONLY_CODES, ...codes])
}

// 조커 채팅 prepare: 시계 값 이상도 내부 사정
const JOKER_CHAT_INTERNAL_ONLY_CODES = withInternalOnly('INVALID_CLOCK_VALUE')

// 낮·죽은 사람 채팅 prepare: 채널·메시지 id 문제도 내부 사정
const GAME_CHAT_INTERNAL_ONLY_CODES = withInternalOnly(
    'INVALID_CLOCK_VALUE',
    'INVALID_CHAT_CHANNEL',
    'ID_GENERATION_ERROR',
    'INVALID_MESSAGE_ID',
)

// 채팅 commit 실패 중 그대로 보여 줘도 되는 것 (나머지는 INTERNAL_ERROR)
const GAME_CHAT_COMMIT_PUBLIC_CODES = new Set(['GAME_ALREADY_ENDED'])

// 위 공개 목록 밖은 전부 내부 사정으로 봄 (has만 쓰는 쪽에 넘기는 모양)
const GAME_CHAT_COMMIT_INTERNAL_CODES = Object.freeze({
    has: (code) => !GAME_CHAT_COMMIT_PUBLIC_CODES.has(code),
})

// 채팅 채널 → 보낼 이벤트 이름
const CHAT_EVENT_BY_CHANNEL = Object.freeze({
    DAY: 'day_chat_message_received',
    DEAD: 'dead_chat_message_received',
})

// 밤 판정·낮 투표 판정 prepare: 대상이 판에 없는 것도 내부 사정 (둘이 같은 묶음 씀)
const RESOLVE_INTERNAL_ONLY_CODES = withInternalOnly('TARGET_NOT_A_PARTICIPANT')

// 재판 표 제출: 재판 상태·문맥 어긋남도 내부 사정
const CAST_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES = withInternalOnly(
    'TRIBUNAL_STATE_NOT_FOUND',
    'TRIBUNAL_CONTEXT_MISMATCH',
    'TRIBUNAL_RESOLUTION_MISMATCH',
)

// 재판 판정 prepare: 재판 상태 없음도 내부 사정
const RESOLVE_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES = withInternalOnly('TRIBUNAL_STATE_NOT_FOUND')

// 밤 판정 commit: 출처 모름·옛 판정도 내부 사정 (지도 06-⑨)
const NIGHT_COMMIT_INTERNAL_ONLY_CODES = withInternalOnly('UNKNOWN_RESOLUTION_SOURCE', 'STALE_RESOLUTION')

// 나가기를 또 보내도 성공으로 답하는 코드 (이미 빠짐, 지도 12-⑥)
const IDEMPOTENT_DEPARTURE_CODES = new Set(['ALREADY_LEFT', 'NOT_A_PARTICIPANT'])

// 밤 턴 run 단계: 제출 받는 중 → 연출 대기 → 다음 턴, 멈추면 STOPPED
const NIGHT_TURN_STAGES = Object.freeze({
    IDLE: 'IDLE',
    SUBMITTING: 'SUBMITTING',
    PRESENTATION_WAIT: 'PRESENTATION_WAIT',
    STOPPED: 'STOPPED',
})

// 연출 대기 상한: 기본 12초, setTimeout 최대값까지만 (지도 05-⑨)
const NIGHT_PRESENTATION_WAIT_DEFAULT_TIMEOUT_MS = 12000
const NIGHT_PRESENTATION_WAIT_MAX_TIMEOUT_MS = 2147483647

// 밤 연출 계약 버전
const NIGHT_PRESENTATION_CONTRACT_VERSION = 1

// 역할 → 밤 성공 사건 종류
const NIGHT_PRESENTATION_EVENT_TYPE_BY_ROLE = Object.freeze({
    JOKER: 'KILL',
    DOCTOR: 'HEAL',
    GUARD: 'INVESTIGATE',
    WITCH_HUNTER: 'CONFIRM',
})

// 사건 받는 쪽 시점 (행동자 / 대상), 이 순서로 보냄
const NIGHT_PRESENTATION_PERSPECTIVES = Object.freeze(['USER', 'TARGET'])

// 밤 성공 완료 ACK: 허용 키·결과 값 (지도 05-⑩)
const NIGHT_SUCCESS_ACK_ALLOWED_KEYS = new Set(['gameId', 'nightDayIndex', 'eventId', 'outcome'])
const NIGHT_SUCCESS_OUTCOMES = new Set(['COMPLETED', 'ERROR', 'SKIPPED'])

// 밤 성공 완료 거절 코드 → 답 문구
const NIGHT_SUCCESS_REJECT_MESSAGES = Object.freeze({
    NOT_ELIGIBLE: REPLY_MESSAGES.REJECTED,
    STALE_EVENT: '더 이상 유효하지 않은 사건입니다.',
})

module.exports = {
    INTERNAL_ONLY_CODES,
    JOKER_CHAT_INTERNAL_ONLY_CODES,
    GAME_CHAT_INTERNAL_ONLY_CODES,
    GAME_CHAT_COMMIT_PUBLIC_CODES,
    GAME_CHAT_COMMIT_INTERNAL_CODES,
    CHAT_EVENT_BY_CHANNEL,
    RESOLVE_INTERNAL_ONLY_CODES,
    CAST_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES,
    RESOLVE_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES,
    NIGHT_COMMIT_INTERNAL_ONLY_CODES,
    IDEMPOTENT_DEPARTURE_CODES,
    NIGHT_TURN_STAGES,
    NIGHT_PRESENTATION_WAIT_DEFAULT_TIMEOUT_MS,
    NIGHT_PRESENTATION_WAIT_MAX_TIMEOUT_MS,
    NIGHT_PRESENTATION_CONTRACT_VERSION,
    NIGHT_PRESENTATION_EVENT_TYPE_BY_ROLE,
    NIGHT_PRESENTATION_PERSPECTIVES,
    NIGHT_SUCCESS_ACK_ALLOWED_KEYS,
    NIGHT_SUCCESS_OUTCOMES,
    NIGHT_SUCCESS_REJECT_MESSAGES,
}
