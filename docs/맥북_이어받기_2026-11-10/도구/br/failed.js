// 본보기 사본임: <임시 폴더>·<저장소>를 내 컴퓨터 경로로 바꿔 써야 함
// json 결과에서 실패 시험 뽑기. node failed.js a.json → "project file" 줄 / --detail → 실패 자세히(JSON 줄)
const fs = require('fs');
const [file, mode] = process.argv.slice(2);
if (!fs.existsSync(file)) process.exit(0);
const r = JSON.parse(fs.readFileSync(file, 'utf8'));
const out = []; const counts = { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 };
function walk(s, titles) {
  for (const sp of s.specs || []) {
    for (const t of sp.tests) {
      counts.total++;
      const res = t.results[t.results.length - 1] || {};
      const st = t.status; // expected unexpected skipped flaky
      if (st === 'skipped') { counts.skipped++; continue; }
      if (st === 'expected') { counts.passed++; continue; }
      if (st === 'flaky') { counts.flaky++; continue; }
      counts.failed++;
      const err = ((res.errors && res.errors[0] && res.errors[0].message) || (res.error && res.error.message) || res.status || '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').filter(Boolean).slice(0, 2).join(' | ').slice(0, 300);
      const atts = (res.attachments || []).filter(a => a.path).map(a => a.path);
      out.push({ project: t.projectName, file: sp.file, line: sp.line, title: [...titles, sp.title].join(' › '), status: res.status, err, atts });
    }
  }
  for (const c of s.suites || []) walk(c, c.title && !c.title.endsWith('.js') ? [...titles, c.title] : titles);
}
for (const s of r.suites || []) walk(s, []);
if (mode === '--detail') { console.log(JSON.stringify({ counts, stats: r.stats, errors: (r.errors || []).map(e => (e.message || '').slice(0, 300)), fails: out }, null, 1)); }
else {
  // 다시 돌리기 전 CPU 낮아질 때까지 기다림 (80% 아래, 최대 15분) — 감독 지시: CPU 탓 불안정 가리기
  if (out.length) {
    const { execSync } = require('child_process');
    const cpu = () => { try { return Number(execSync('powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average)"').toString().trim()); } catch { return 0; } };
    const t0 = Date.now(); let c = cpu();
    while (c >= 80 && Date.now() - t0 < 15 * 60_000) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20000); c = cpu(); }
    fs.appendFileSync(require('path').join(require('path').dirname(file), 'timeline.txt'), `  (다시 돌리기 전 CPU ${c}, 기다림 ${Math.round((Date.now() - t0) / 1000)}초)\n`);
  }
  const seen = new Set(); for (const f of out) { const k = `${f.project} ${f.file.replace(/\\/g, '/')}`; if (!seen.has(k)) { seen.add(k); console.log(k); } }
}
