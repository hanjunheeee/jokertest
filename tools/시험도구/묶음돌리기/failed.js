// 실패한 시험 모으기: node failed.js a.json b.json … → 실패(마지막 결과가 passed 아님) 시험 "파일:줄" 과 제목 줄
// --titles 를 주면 제목만, --grep 을 주면 playwright --grep 에 넣을 정규식 한 줄 (시험 번호 묶음)
const fs = require('node:fs');
const args = process.argv.slice(2);
const mode = args.includes('--grep') ? 'grep' : args.includes('--titles') ? 'titles' : 'loc';
const files = args.filter((a) => !a.startsWith('--'));
// 같은 시험이 여러 파일에 있으면 뒤에 준 파일 결과가 이김 (다시 돌려 통과하면 빠짐) → 파일은 돌린 차례대로 줌
const seen = new Map();
function walk(suite, file) {
    for (const s of suite.suites ?? []) walk(s, s.file ?? file);
    for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
            const last = t.results?.[t.results.length - 1];
            if (!last) continue;
            const where = spec.file ?? file;
            seen.set(`${t.projectName}|${where}|${spec.line}|${spec.title}`, { file: where, line: spec.line, title: spec.title, status: last.status, project: t.projectName });
        }
    }
}
for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const s of j.suites ?? []) walk(s, s.file);
}
const out = [...seen.values()].filter((o) => o.status !== 'passed' && o.status !== 'skipped');
if (mode === 'grep') {
    const ids = [...new Set(out.map((o) => (o.title.match(/A\d\d-[EH]-\d{3}/) ?? [null])[0]).filter(Boolean))];
    console.log(ids.join('|'));
} else if (mode === 'titles') {
    for (const o of out) console.log(`${o.status}\t${o.title.slice(0, 150)}`);
} else {
    for (const o of out) console.log(`tests/${o.file.replace(/\\/g, '/')}:${o.line}`);
}
console.error(`실패 ${out.length}개`);
