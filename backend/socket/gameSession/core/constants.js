// socket gameSession 상수 파일
// 내부 전용 거절 코드 묶음·밤 턴 단계·다시 해 보기 값·끊김 기다림 길이, 핸들러·요청 검사·타이머·밤 단계·끊김 유예가 씀

// core 거절 코드 중 밖에 그대로 보이면 안 되는 것 (INTERNAL_ERROR로 바꿔 답함, 지도 03-⑥ · 06-⑨)
const INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT'])

// 위 기본 묶음에 요청별 코드 더하기
function withInternalOnly(...codes) {
    return new Set([...INTERNAL_ONLY_CODES, ...codes])
}

// 조커 채팅 prepare: 시계 값 이상도 내부 사정
const JOKER_INTERNAL_CODES = withInternalOnly('INVALID_CLOCK_VALUE')

// 낮·죽은 사람 채팅 prepare: 채널·메시지 id 문제도 내부 사정
const CHAT_INTERNAL_CODES = withInternalOnly(
    'INVALID_CLOCK_VALUE',
    'INVALID_CHAT_CHANNEL',
    'ID_GENERATION_ERROR',
    'INVALID_MESSAGE_ID',
)

// 채팅 commit 실패 중 그대로 보여 줘도 되는 것 (나머지는 INTERNAL_ERROR)
const CHAT_PUBLIC_CODES = new Set(['GAME_ALREADY_ENDED'])

// 위 공개 목록 밖은 전부 내부 사정으로 봄 (has만 쓰는 쪽에 넘기는 모양)
const CHAT_NON_PUBLIC_CODES = Object.freeze({
    has: (code) => !CHAT_PUBLIC_CODES.has(code),
})

// 채팅 채널 → 보낼 이벤트 이름
const CHAT_EVENT_BY_CHANNEL = Object.freeze({
    DAY: 'day_chat_message_received',
    DEAD: 'dead_chat_message_received',
})

// 밤 판정·낮 투표 판정 prepare: 대상이 판에 없는 것도 내부 사정 (둘이 같은 묶음 씀)
const RESOLVE_INTERNAL_CODES = withInternalOnly('TARGET_NOT_A_PARTICIPANT')

// 재판 표 제출: 재판 상태·문맥 어긋남도 내부 사정
const CAST_INTERNAL_CODES = withInternalOnly(
    'TRIBUNAL_STATE_NOT_FOUND',
    'TRIBUNAL_CONTEXT_MISMATCH',
    'TRIBUNAL_RESOLUTION_MISMATCH',
)

// 재판 판정 prepare: 재판 상태 없음도 내부 사정
const TRIBUNAL_INTERNAL_CODES = withInternalOnly('TRIBUNAL_STATE_NOT_FOUND')

// 밤 판정 commit: 출처 모름·옛 판정도 내부 사정 (지도 06-⑨)
const NIGHT_INTERNAL_CODES = withInternalOnly('UNKNOWN_RESOLUTION_SOURCE', 'STALE_RESOLUTION')

// 나가기를 또 보내도 성공으로 답하는 코드 (이미 빠짐, 지도 12-⑥)
const IDEMPOTENT_LEAVE_CODES = new Set(['ALREADY_LEFT', 'NOT_A_PARTICIPANT'])

// 밤 턴 run 단계: 제출 받는 중 → 턴 닫힘(바로 다음 턴), 멈추면 STOPPED
const NIGHT_TURN_STAGES = Object.freeze({
    IDLE: 'IDLE',
    SUBMITTING: 'SUBMITTING',
    STOPPED: 'STOPPED',
})

// 역할 공개 10초: 판 시작 때 걸고, 사람 확인 안 기다리고 지나면 무조건 첫 낮으로 (사용자 결정 2026-11-09)
const ROLE_REVEAL_DEADLINE_MS = 10000

// 판 중 산 사람이 끊기면 기다려 주는 시간 60초: 서버가 끊김을 알아챈 때부터 셈, 단계가 바뀌어도 그대로 (사용자 결정 2026-11-16)
const DISCONNECT_GRACE_MS = 60000

// 타이머 쪽 판정·확정 실패 때 다시 해 보기: 1초 간격 최대 5번 (그사이 겹친 요청이 끝나면 풀림)
const PHASE_RETRY_DELAY_MS = 1000
const PHASE_RETRY_MAX = 5

// 판 끝 뒤 시간 값(결과 화면 180초)은 game-core RESULT_SCREEN_MS 하나만 씀 (판 끝 칸 resultClosesAt과 같은 값이어야 해서)

module.exports = {
    INTERNAL_ONLY_CODES,
    JOKER_INTERNAL_CODES,
    CHAT_INTERNAL_CODES,
    CHAT_PUBLIC_CODES,
    CHAT_NON_PUBLIC_CODES,
    CHAT_EVENT_BY_CHANNEL,
    RESOLVE_INTERNAL_CODES,
    CAST_INTERNAL_CODES,
    TRIBUNAL_INTERNAL_CODES,
    NIGHT_INTERNAL_CODES,
    IDEMPOTENT_LEAVE_CODES,
    NIGHT_TURN_STAGES,
    ROLE_REVEAL_DEADLINE_MS,
    DISCONNECT_GRACE_MS,
    PHASE_RETRY_DELAY_MS,
    PHASE_RETRY_MAX,
}
