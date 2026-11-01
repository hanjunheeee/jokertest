// 밤 확정 지켜보는 시험용 관찰자 파일
// 운영에선 비어 있음, 시험이 __setNightCommitObserverForTests로 끼워 넣음

// 시험이 끼운 관찰자 함수, 운영은 null
let observer = null
// 관찰자 도는 중인지 (도는 중에 밤 확정 또 들어오면 막기)
let busy = false

// 관찰자한테 알림, 관찰자가 터져도 게임은 계속
function observeNightCommit(event, detail) {
    // 끼운 관찰자 없으면 아무것도 안 함
    if (typeof observer !== 'function') return
    // 도는 동안 표시 켜 둠, 끝나면 꼭 끔
    busy = true
    try {
        observer(event, detail)
    } catch (err) {
        // 관찰자 오류는 일부러 삼킴
    } finally {
        busy = false
    }
}

// 관찰자 도는 중인지 묻기, 밤 확정·끊김 탈락이 맨 앞에서 확인
function isObserverBusy() {
    return busy
}

// 관찰자 끼우기·빼기 (null이면 뺌), 시험 초기화 때도 사용
function setObserver(fn) {
    // 함수 아니면 뺌, 도는 중 표시도 같이 초기화
    observer = typeof fn === 'function' ? fn : null
    busy = false
}

module.exports = { observeNightCommit, isObserverBusy, setObserver }