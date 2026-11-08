// 전적 저장 주입 파일, 재시도 타이머 · 사용자 전송 함수 · 시험용 저장 함수
// persist.js·testing.js가 읽고 index.js가 내보냄, 칸만 바꿔 끼우는 객체라 같은 객체를 매번 읽음

// 바깥 함수 참조 묶음: 재시도 타이머(시험이 교체) + 사용자 전송(socket.js가 socket/gameSession.js 거쳐 넣어 줌)
// 저장 함수는 null이면 진짜 저장소 (시험이 가짜로 바꿔 개발 DB에 안 붙게, BE-019)
const deps = {
    setTimeoutFn: setTimeout,
    clearTimeoutFn: clearTimeout,
    emitToUser: null,
    persistRecord: null,
}

// 사용자 전송 함수 넣기, 함수 아니면 비움 (시험 초기화가 null 넣음)
function setEmitToUser(emit) {
    deps.emitToUser = typeof emit === 'function' ? emit : null
}

// 시험용: 재시도 타이머 함수 갈아끼우기 (없으면 진짜 타이머)
function __setTerminalPersistTimersForTests({ setTimeoutFn, clearTimeoutFn } = {}) {
    deps.setTimeoutFn = setTimeoutFn ?? setTimeout
    deps.clearTimeoutFn = clearTimeoutFn ?? clearTimeout
}

// 시험용: 전적 저장 함수 갈아끼우기 (없으면 진짜 저장소)
function __setGameResultPersistForTests(fn) {
    deps.persistRecord = typeof fn === 'function' ? fn : null
}

module.exports = {
    deps,
    setEmitToUser,
    __setTerminalPersistTimersForTests,
    __setGameResultPersistForTests,
}
