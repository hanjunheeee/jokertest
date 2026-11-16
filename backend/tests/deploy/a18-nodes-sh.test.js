'use strict';

// Node 하나씩 바꾸기 시험 — 드레인(새 손님 안 받기) 뒤 판·방 0개에서만 새 이미지, 시간 넘기면 멈추고 드레인 다시 끔
// 목록 A18-B-219~220 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --test tests/deploy/a18-nodes-sh.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const NODES_SH = path.join(ROOT, 'deploy', 'ci', 'scripts', 'deploy', 'nodes.sh');
// 진짜 docker·compose 대신 상태 파일로 흉내 내는 가짜 (공용, 읽기만)
const FAKE = path.join(__dirname, 'fixtures', 'fakeCompose.sh');

// 깃 배시 찾기 (윈도우는 PATH 첫 bash가 WSL일 수 있어 git 설치 폴더 것을 씀)
function findBash() {
    if (process.platform !== 'win32') return 'bash';
    const r = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
    const base = r.status === 0 ? path.resolve(r.stdout.trim(), '..', '..', '..') : null;
    const found = [base && path.join(base, 'bin', 'bash.exe'), base && path.join(base, 'usr', 'bin', 'bash.exe')]
        .find((p) => p && fs.existsSync(p));
    assert.ok(found, '깃 배시를 못 찾음');
    return found;
}

// 배시로 돌릴 글: nodes.sh → 가짜 → 기록 붙이기
// - compose를 감싸 드레인 켜기·끄기, 판+방 수 확인, 다시 만들기를 events 파일에 차례로 적음
// - sleep(다음 확인까지 기다림)은 CLEAR_ON_WAIT=1이면 그사이 판·방이 다 끝난 것으로 함
const RUNNER = `
set -u
cd "$WORK"
source "$NODES_SH"
source "$FAKE"
eval "fake_$(declare -f compose)"
compose() {
    if [ "$1" = "exec" ]; then
        local a svc="" path="" body="" nodeid=""
        for a in "$@"; do
            case "$a" in exec|-T) ;; CALL_PATH=*) path="\${a#CALL_PATH=}" ;; CALL_BODY=*) body="\${a#CALL_BODY=}" ;; NODE_ID=*) nodeid="\${a#NODE_ID=}" ;; *) [ -z "$svc" ] && svc="$a" ;; esac
        done
        if [[ "$path" == /internal/nodes/*/drain ]]; then
            if [[ "$body" == *false* ]]; then echo "drain-off $svc" >> "$STATE/events"; else echo "drain-on $svc" >> "$STATE/events"; fi
        elif [ -n "$nodeid" ]; then
            echo "load $svc $(cat "$STATE/$svc.load" 2>/dev/null || echo 0) draining=$([ -f "$STATE/$svc.draining" ] && echo 1 || echo 0)" >> "$STATE/events"
        fi
    fi
    fake_compose "$@"
}
sleep() {
    echo "wait $1" >> "$STATE/events"
    if [ "\${CLEAR_ON_WAIT:-0}" = "1" ]; then for f in "$STATE"/*.load; do echo 0 > "$f"; done; fi
}
roll_to "$NEW_TAG"
`;

// 임시 폴더에 상태 차리기 → 배시로 roll_to → { code, out, events, read(파일) }
function roll(t, { loads, env = {} }) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'b-a18-nodes-'));
    t.after(() => fs.rmSync(work, { recursive: true, force: true }));
    const state = path.join(work, 'state');
    fs.mkdirSync(state);
    for (const [svc, load] of Object.entries(loads)) {
        fs.writeFileSync(path.join(state, `${svc}.image`), 'old-tag\n');
        fs.writeFileSync(path.join(state, `${svc}.load`), `${load}\n`);
    }
    fs.writeFileSync(path.join(state, 'events'), '');
    const runner = path.join(work, 'runner.sh');
    fs.writeFileSync(runner, RUNNER);
    // 배시에 넘기는 경로는 앞으로 빗금 (윈도우 역빗금이 배시에서 깨지지 않게)
    const posix = (p) => p.replace(/\\/g, '/');
    const r = spawnSync(findBash(), [posix(runner)], {
        encoding: 'utf8',
        timeout: 60_000,
        env: {
            ...process.env,
            WORK: posix(work), STATE: posix(state), NODES_SH: posix(NODES_SH), FAKE: posix(FAKE),
            NEW_TAG: 'new-tag', NODE_COUNT: String(Object.keys(loads).length), ...env,
        },
    });
    const read = (name) => (fs.existsSync(path.join(state, name)) ? fs.readFileSync(path.join(state, name), 'utf8').trim() : null);
    return { code: r.status, out: `${r.stdout}${r.stderr}`, events: read('events').split('\n').filter(Boolean), read };
}

test('A18-B-219 Node 2개, n1 판+방 2 → 다음 확인 0 → 드레인 켠 뒤 0개에서만 새 이미지, 새 n1 드레인 꺼짐, n2도 같은 차례', (t) => {
    const r = roll(t, { loads: { backend: 2, 'backend-n2': 0 }, env: { CLEAR_ON_WAIT: '1' } });
    assert.equal(r.code, 0, r.out);
    const at = (line) => r.events.indexOf(line);
    // n1: 드레인 켬 → 2개 봄(드레인 켜진 채) → 기다림 → 0개 봄 → 다시 만들기
    assert.ok(at('drain-on backend') >= 0, r.events.join('\n'));
    assert.ok(at('drain-on backend') < at('load backend 2 draining=1'), r.events.join('\n'));
    assert.ok(at('load backend 2 draining=1') < at('load backend 0 draining=1'), r.events.join('\n'));
    assert.ok(at('load backend 0 draining=1') < at('recreate backend'), r.events.join('\n'));
    assert.equal(r.read('backend.image'), 'new-tag');
    assert.equal(r.read('backend.draining'), null, '새 n1이 드레인 켜진 채');
    // n2: n1 끝난 뒤 같은 차례
    assert.ok(at('recreate backend') < at('drain-on backend-n2'), r.events.join('\n'));
    assert.ok(at('drain-on backend-n2') < at('load backend-n2 0 draining=1'), r.events.join('\n'));
    assert.ok(at('load backend-n2 0 draining=1') < at('recreate backend-n2'), r.events.join('\n'));
    assert.equal(r.read('backend-n2.image'), 'new-tag');
    assert.equal(r.read('backend-n2.draining'), null);
});

test('A18-B-220 n1 판+방 2가 DRAIN_MAX_MINUTES 넘도록, DRAIN_FORCE 없음 → 실패로 멈춤, n1 이미지 그대로, 드레인 다시 꺼짐', (t) => {
    const r = roll(t, { loads: { backend: 2, 'backend-n2': 0 }, env: { DRAIN_MAX_MINUTES: '0' } });
    assert.notEqual(r.code, 0, r.out);
    assert.equal(r.read('backend.image'), 'old-tag');
    assert.equal(r.read('backend.draining'), null, 'n1 드레인이 켜진 채 남음');
    assert.ok(r.events.indexOf('drain-on backend') < r.events.indexOf('drain-off backend'), r.events.join('\n'));
    assert.equal(r.events.some((e) => e.startsWith('recreate')), false, r.events.join('\n'));
});
