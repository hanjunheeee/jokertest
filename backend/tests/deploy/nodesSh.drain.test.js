// 배포 Node 하나씩 바꾸기(deploy/ci/scripts/deploy/nodes.sh) 드레인 시험, compose·docker를 가짜 셸 함수로 바꿔 끼워 돎
// 드레인 뒤 Node가 드레인 켜진 채 남지 않는지 (같은 태그로 다시 켜기·드레인 시간 넘김), bash 없으면 건너뜀
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const NODES_SH = path.resolve(__dirname, '../../../deploy/ci/scripts/deploy/nodes.sh').replace(/\\/g, '/')
const hasBash = spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' }).stdout?.trim() === 'ok'

// 가짜 compose: 서비스마다 상태 파일 (<svc>.image = 지금 태그, <svc>.draining = 드레인 켜짐, <svc>.load = 판+방 수)
// up -d는 태그가 다르거나 --force-recreate일 때만 다시 만듦 (진짜 compose와 같음) → 새 부팅은 드레인 꺼짐
const FAKE = path.resolve(__dirname, 'fixtures/fakeCompose.sh').replace(/\\/g, '/')

function runScript(t, setup, body) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodes-sh-'))
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
    for (const [name, value] of Object.entries(setup)) fs.writeFileSync(path.join(dir, name), `${value}\n`)
    const state = dir.replace(/\\/g, '/')
    const script = `set -uo pipefail\nsource "${NODES_SH}"\nSTATE="${state}"\nsource "${FAKE}"\n${body}\n`
    const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, NODE_COUNT: '2', MSYS_NO_PATHCONV: '1' } })
    const draining = fs.readdirSync(dir).filter((f) => f.endsWith('.draining')).map((f) => f.replace('.draining', ''))
    return { status: result.status, out: `${result.stdout}${result.stderr}`, draining }
}

test('같은 태그로 하나씩 바꾸기(되돌리기 등)도 드레인한 Node가 드레인 켜진 채 남지 않음', { skip: !hasBash && 'bash 없음' }, (t) => {
    const r = runScript(t, { 'backend.image': 't1', 'backend-n2.image': 't1' }, 'roll_to t1; echo "rc=$?"')
    assert.match(r.out, /rc=0/, r.out)
    assert.deepEqual(r.draining, [], r.out)
})

test('드레인 시간 넘겨 멈추면 그 Node 드레인 다시 끔 (멈춘 채 새 접속을 안 받는 일 없게)', { skip: !hasBash && 'bash 없음' }, (t) => {
    const r = runScript(t, { 'backend.image': 't1', 'backend.load': '3' }, 'DRAIN_MAX_MINUTES=0 drain_node n1 backend; echo "rc=$?"')
    assert.match(r.out, /rc=1/, r.out)
    assert.deepEqual(r.draining, [], r.out)
})

test('드레인 시간 넘겨도 DRAIN_FORCE=1이면 드레인 둔 채 진행 (곧 새 이미지로 다시 켬)', { skip: !hasBash && 'bash 없음' }, (t) => {
    const r = runScript(t, { 'backend.image': 't1', 'backend.load': '3' }, 'DRAIN_MAX_MINUTES=0 DRAIN_FORCE=1 drain_node n1 backend; echo "rc=$?"')
    assert.match(r.out, /rc=0/, r.out)
    assert.deepEqual(r.draining, ['backend'], r.out)
})
