// 게임 초대 소리 진단 기록을 숫자로 요약하는 계산
// 진단 입구 파일의 요약 함수가 씀

// 도착·소리 허락·실제 재생 수와 막힌 이유별 수를 셈
export function summarize(observations) {
    const summary = {
        arrivals: 0,
        eligibleDispatches: 0,
        audiblePlaybacks: 0,
        suppressedByReason: {},
    };
    for (const entry of observations) {
        if (entry.phase === "received") summary.arrivals += 1;
        if (entry.eligible) summary.eligibleDispatches += 1;
        if (entry.playback === "played") summary.audiblePlaybacks += 1;
        const reason = entry.eligible ? entry.dispatchReason : entry.reason;
        if (typeof reason === "string" && reason.length > 0) {
            summary.suppressedByReason[reason] = (summary.suppressedByReason[reason] ?? 0) + 1;
        }
    }
    return summary;
}
