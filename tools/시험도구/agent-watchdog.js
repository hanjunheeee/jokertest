// 되살린 도구(2026-11-10 맥북 이어받기 묶음), 경로만 tools/시험도구 기준으로 바꿈 — 쓰는 법은 docs/게임_의도_2026-11-15/준비_시험환경.md
// 에이전트 멈춤 감시: 결과 폴더들의 가장 최근 파일 수정 시각이 N분 넘게 안 바뀌면 한 줄 출력하고 끝남
// 사용: node agent-watchdog.js <분> <폴더1> [폴더2 ...]
const fs = require('fs');
const path = require('path');
const minutes = Number(process.argv[2] || 10);
const dirs = process.argv.slice(3);

function newest(dir) {
  let best = 0;
  const walk = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
      try { best = Math.max(best, fs.statSync(p).mtimeMs); } catch { /* 지워진 파일 */ }
    }
  };
  walk(dir);
  return best;
}

const start = Date.now();
setInterval(() => {
  const latest = Math.max(start, ...dirs.map(newest));
  const idle = (Date.now() - latest) / 60000;
  if (idle >= minutes) {
    console.log(`멈춤 의심: ${idle.toFixed(1)}분 동안 결과 폴더 변화 없음`);
    process.exit(0);
  }
}, 30000);
