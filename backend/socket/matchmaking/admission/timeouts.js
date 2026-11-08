// 초대 입장 기다리는 시간 파일, 단계 하나·전체 한도 + 시험용 바꾸기
// admission/accept.js가 읽고, matchmaking/testHooks.js(시험 시도 심기)도 읽음
const { ADMISSION_STEP_MS, ADMISSION_TOTAL_MS } = require('../core/constants')

// 입장 단계 하나 기다리는 시간 (시험이 줄임)
let stepTimeoutMs = ADMISSION_STEP_MS

// 입장 전체 기다리는 시간 (시험이 줄임)
let totalTimeoutMs = ADMISSION_TOTAL_MS

// 값 말고 읽기 함수로 내보냄 (값 복사라 시험이 바꾼 값이 안 보이는 것 막기, BE-035)
const getStepTimeoutMs = () => stepTimeoutMs
const getTotalTimeoutMs = () => totalTimeoutMs

// 시험용: 입장 대기 시간 바꾸기 (숫자 아니면 기본값으로)
function __setAdmissionTimeoutsForTests({ step, total } = {}) {
    stepTimeoutMs = Number.isFinite(step) ? step : ADMISSION_STEP_MS
    totalTimeoutMs = Number.isFinite(total) ? total : ADMISSION_TOTAL_MS
}

module.exports = {
    getStepTimeoutMs,
    getTotalTimeoutMs,
    __setAdmissionTimeoutsForTests,
}
