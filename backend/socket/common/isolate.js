// 단계 격리 파일
// 한 단계가 던져도 다음 단계는 계속 가게 감싸기 (실패는 로그만), socket 핸들러·타이머가 같이 씀

// 던지면 정해진 로그 한 줄만 찍고 넘어감, 원본 에러는 안 찍음 (비밀 새는 것 막기, 지도 12-⑨)
// 끝까지 갔으면 true, 던졌으면 false
function isolate(label, fields, step) {
    try {
        step()
        return true
    } catch {
        console.error(label, fields)
        return false
    }
}

// 값 돌려주는 단계: 던지면 로그 찍고 대신 값 돌려줌
function isolateOr(fallback, label, fields, step) {
    try {
        return step()
    } catch {
        console.error(label, fields)
        return fallback
    }
}

// 값 돌려주는 단계, 로그 없음: 던지면 대신 값 (실패해도 조용히 기본값으로 가는 자리)
function tryOr(fallback, step) {
    try {
        return step()
    } catch {
        return fallback
    }
}

// 던짐을 결과로 바꾸기: { threw: false, value } 또는 { threw: true } (로그·답은 부른 쪽이 정함)
function attempt(step) {
    try {
        return { threw: false, value: step() }
    } catch {
        return { threw: true }
    }
}

// 원래 원본 에러까지 찍던 자리용: 던지면 라벨 + 에러 그대로 찍음
function isolateWithError(label, step) {
    try {
        step()
    } catch (err) {
        console.error(label, err)
    }
}

// Promise 실패를 로그로만 받는 catch 함수 만들기
function logRejection(label) {
    return (err) => {
        console.error(label, err)
    }
}

module.exports = { isolate, isolateOr, tryOr, attempt, isolateWithError, logRejection }
