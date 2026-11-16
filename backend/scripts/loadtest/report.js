// 부하 시험 결과 찍기 파일, 한 번 돌린 결과 표·단계별 표·DB 문장 모양별 표를 화면에 찍음
// run.js가 판을 다 돌린 뒤 부름 (숫자 계산은 stats.js·dbcount.js·sampler.js)

const pct = (n) => `${(n * 100).toFixed(2)}%`;
const mb = (bytes) => Math.round(bytes / 1024 / 1024);

function printFixed(summary, server, clientMemory, dbLine) {
    const l = summary.latencyMs;
    console.log("\n== 결과 ==");
    console.log(`접속 성공률   ${pct(summary.connect.rate)} (${summary.connect.ok}/${summary.connect.ok + summary.connect.fail})`);
    console.log(`판            시작 ${summary.games.started} · 끝까지 ${summary.games.ended} · 실패 ${summary.games.failed}`);
    console.log(`응답 시간(ms) 평균 ${l.mean} · 95% ${l.p95} · 최대 ${l.max} (요청 ${l.count})`);
    console.log(`오류          ${summary.errorCount} (${pct(summary.errorRate)}) ${JSON.stringify(summary.errors)}`);
    console.log(`규칙 거절     ${JSON.stringify(summary.rejections)}`);
    console.log(`끊김          ${summary.disconnects}`);
    console.log("사건별(ms)    " + Object.entries(summary.byEvent).map(([e, s]) => `${e} ${s.mean}/${s.p95}/${s.max}(${s.count})`).join(" | "));
    console.log(dbLine ?? "DB 질의        (계정 파일로 돌려 DB에 안 붙음 — dbcount.js로 따로 잼)");
    console.log(`시험 쪽 메모리 rss ${mb(clientMemory.rss)}MB`);
    if (server) {
        console.log(`서버          rss 최대 ${server.rssMbMax}MB · heap ${server.heapUsedMbMax}MB · 이벤트 루프 지연 95% 최대 ${server.eventLoopP95MsMax}ms · 접속 최대 ${server.onlineUsersMax} · 판 최대 ${server.gamesMax}`);
        for (const [node, s] of Object.entries(server.byNode ?? {})) {
            console.log(`  ${node}  rss 최대 ${s.rssMbMax}MB · 이벤트 루프 지연 95% 최대 ${s.eventLoopP95MsMax}ms · 접속 최대 ${s.onlineUsersMax} · 판 최대 ${s.gamesMax}`);
        }
    } else console.log("서버          (내부 열쇠 없음 — 서버 숫자 안 봄)");
}

function printStageTable(rows) {
    console.log("\n== 단계별 ==");
    console.log("동시판 | 요청 | 평균ms | 95%ms | 최대ms | 오류율 | 끊김 | 판 끝/실패 | DB 판당 | DB 판당 초당 | 서버rss MB | 루프지연95% ms | 판정");
    for (const r of rows) {
        const s = r.summary;
        console.log([
            String(r.concurrent).padStart(6), s.latencyMs.count, s.latencyMs.mean, s.latencyMs.p95, s.latencyMs.max,
            pct(s.errorRate), s.disconnects, `${s.games.ended}/${s.games.failed}`,
            r.db?.perGame ?? "-", r.db?.perGameSecond ?? "-",
            r.server?.rssMbMax ?? "-", r.server?.eventLoopP95MsMax ?? "-", r.pass ? "통과" : `멈춤(${r.reason})`,
        ].join(" | "));
    }
}

// 문장 모양별 표 (많이 불린 순 위 15줄)
function printStatements(db, games) {
    if (!db?.statements) return;
    const per = games > 0 ? ` · 판 하나당 ${Math.round((db.statementTotal / games) * 10) / 10}번` : "";
    console.log(`DB 문장 모양별 (시험 DB 것만) 전체 ${db.statementTotal}번${per} · 판당 초당 ${db.statementPerGameSecond ?? "-"}`);
    console.log("  횟수 | 판 하나당 | 문장");
    for (const row of db.statements.slice(0, 15)) console.log(`${String(row.count).padStart(6)} | ${String(row.perGame ?? "-").padStart(7)} | ${row.text.slice(0, 150)}`);
}

// 한 번 돌린 결과 판정: 오류 0·실패한 판 0·끊김 0·전원 접속·끝난 판 수 = 돌린 판 수여야 통과
// → { ok: false, line: '[부하] 판정: 실패 — 오류 3, 실패한 판 1' }
function judgeFixed({ summary, accounts, connected, expectedGames }) {
    const problems = [];
    if (summary.errorCount > 0) problems.push(`오류 ${summary.errorCount}`);
    if (summary.games.failed > 0) problems.push(`실패한 판 ${summary.games.failed}`);
    if (summary.games.ended !== expectedGames) problems.push(`끝난 판 ${summary.games.ended}/${expectedGames}`);
    if (summary.disconnects > 0) problems.push(`끊김 ${summary.disconnects}`);
    if (connected !== accounts) problems.push(`접속 ${connected}/${accounts}`);
    const ok = problems.length === 0;
    return { ok, line: ok ? `[부하] 판정: 통과 — 오류 0 · 판 ${expectedGames}/${expectedGames} · 접속 ${connected}/${accounts} · 끊김 0` : `[부하] 판정: 실패 — ${problems.join(", ")}` };
}

module.exports = { pct, printFixed, printStageTable, printStatements, judgeFixed };
