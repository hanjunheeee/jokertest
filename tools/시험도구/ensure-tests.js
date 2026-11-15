// 시험 파일이 하나도 없으면 실패(종료 코드 1)시키는 확인 — Node의 node --test는 시험 0개여도 통과로 끝나서 막음
// 사용: node ensure-tests.js <폴더> (package.json의 test 스크립트 앞에서 && 로 이음)
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) {
  console.error('[ensure-tests] 폴더를 안 줌');
  process.exit(1);
}

// 시험 실행기가 집는 이름 규칙(*.test.* / *.spec.*)만 셈
const isTestFile = (name) => /\.(test|spec)\.(js|mjs|cjs|jsx|ts)$/.test(name);

function count(d) {
  let n = 0;
  let entries = [];
  try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    // node_modules·점 폴더는 남의 시험이라 뺌
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) n += count(p);
    else if (isTestFile(e.name)) n += 1;
  }
  return n;
}

const found = count(dir);
if (found === 0) {
  console.error(`[ensure-tests] 실패 — "${dir}" 아래에 시험 파일이 하나도 없음 (시험 0개를 통과로 치지 않음)`);
  process.exit(1);
}
console.log(`[ensure-tests] "${dir}" 시험 파일 ${found}개`);
