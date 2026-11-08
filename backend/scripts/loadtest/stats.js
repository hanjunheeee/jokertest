// 부하 시험 숫자 모으기 파일, 응답 시간·오류·거절·끊김·접속 성공 세기 + 평균/95%/최대 계산
// run.js·bot.js가 씀 (단계마다 새로 만들어 단계별 표를 따로 냄)

// 정렬한 값에서 p% 자리 (가장 가까운 순위)
const percentile = (sorted, p) => {
    if (sorted.length === 0) return 0;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[index];
};

const round1 = (n) => Math.round(n * 10) / 10;

function summarize(values) {
    if (values.length === 0) return { count: 0, mean: 0, p95: 0, max: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    return { count: sorted.length, mean: round1(sum / sorted.length), p95: round1(percentile(sorted, 95)), max: round1(sorted[sorted.length - 1]) };
}

class Stats {
    constructor() {
        this.latencies = [];
        this.byEvent = new Map();
        this.errors = new Map();
        this.rejections = new Map();
        this.connectOk = 0;
        this.connectFail = 0;
        this.disconnects = 0;
        this.gamesStarted = 0;
        this.gamesEnded = 0;
        this.gamesFailed = 0;
    }

    // 요청 하나 응답 시간 (ms)
    latency(event, ms) {
        this.latencies.push(ms);
        if (!this.byEvent.has(event)) this.byEvent.set(event, []);
        this.byEvent.get(event).push(ms);
    }

    // 오류: 서버 문제로 볼 것 (시간 초과·500·연결 실패·INTERNAL_ERROR)
    error(kind) { this.errors.set(kind, (this.errors.get(kind) ?? 0) + 1); }

    // 거절: 규칙대로 거절한 것 (늦은 표·차례 아님 등, 서버 문제 아님)
    rejection(code) { this.rejections.set(code, (this.rejections.get(code) ?? 0) + 1); }

    get errorCount() { return [...this.errors.values()].reduce((a, b) => a + b, 0); }
    get requestCount() { return this.latencies.length + this.errorCount; }
    get errorRate() { return this.requestCount === 0 ? 0 : this.errorCount / this.requestCount; }
    get connectRate() {
        const total = this.connectOk + this.connectFail;
        return total === 0 ? 1 : this.connectOk / total;
    }

    summary() {
        return {
            latencyMs: summarize(this.latencies),
            byEvent: Object.fromEntries([...this.byEvent].map(([event, values]) => [event, summarize(values)])),
            requests: this.requestCount,
            errors: Object.fromEntries(this.errors),
            errorCount: this.errorCount,
            errorRate: this.errorRate,
            rejections: Object.fromEntries(this.rejections),
            connect: { ok: this.connectOk, fail: this.connectFail, rate: this.connectRate },
            disconnects: this.disconnects,
            games: { started: this.gamesStarted, ended: this.gamesEnded, failed: this.gamesFailed },
        };
    }
}

module.exports = { Stats, summarize, percentile };
