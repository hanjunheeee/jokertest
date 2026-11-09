# cluster — Node 여러 개 기반 (조각 1)

계획: `docs/노드_여러개_계획_2026-11-09.md` 4장 약속을 코드로 옮긴 것. 다른 조각은 `require("../cluster")` 하나만 씀.

## 1. 두 모드

| | 단일 모드 | Redis 모드 |
|---|---|---|
| 조건 | `REDIS_URL` 비었음 | `REDIS_URL` 있음 |
| `state()` | `'off'` | `'up'` / `'down'` |
| 버스·RPC | 보내기 늘 `false`, RPC는 나 자신만 | Redis pub/sub |
| 디렉터리 | 읽기 `{available:false}`, 쓰기 `false` | Redis |
| 카운터 | Node 메모리 | Redis (down이면 메모리) |
| 어댑터 | 안 붙임 (지금과 같음) | `@socket.io/redis-adapter`, 키 `${prefix}:sio` |
| `/health` | 예전과 똑같이 `{ok}` (SERVER_ID 넣었으면 `serverId·redis:'off'·draining` 더함) | `{ok, serverId, redis, draining}` |

- 켜기: `backend/index.js`가 DB 확인 뒤 `cluster.init({ io, bootEpoch, statsProvider })`, 그다음 포트 열기
- 끄기: `processLifecycle`이 소켓 닫은 뒤 `cluster.close()` (하트비트 지움 → 다른 Node가 바로 죽음으로 봄)
- 같은 `SERVER_ID`가 살아 있으면 `DUPLICATE_SERVER_ID`로 시작 거부. 죽은 옛 흔적이면 한 주기 기다린 뒤 이어받음
- `bootEpoch`는 `socket/kickReceiptStore`의 `BOOT_EPOCH`와 같은 값 (초대·입장 시도·loc·하트비트가 한 값)

## 2. 내보내는 것 (`require("../cluster")`)

init 전에 붙인 처리기(bus.on·rpc.register·onStateChange·onResync)도 init 뒤 Node로 그대로 이어짐 → require 때 붙여도 됨.

| 이름 | 모양 | 뜻 |
|---|---|---|
| `init(opts)` / `close()` | `→ Promise` | index.js만 부름 (시험은 `backend` 넘겨 메모리로) |
| `serverId()` `bootEpoch()` | `→ string` | 이 Node |
| `mode()` | `'off' \| 'redis' \| 'memory'` | memory는 시험 |
| `state()` | `'off' \| 'up' \| 'down'` | |
| `isEnabled()` | `→ bool` | REDIS_URL 있음 (down이어도 true) |
| `isShared()` | `→ bool` | 지금 Node끼리 나눠 쓸 수 있음 (up) |
| `onStateChange(fn)` | `fn(next, prev)` → 떼는 함수 | up/down 바뀔 때 |
| `onResync(fn)` | `fn()` (async 가능) → 떼는 함수 | **Redis가 다시 살아남·비었음** → 내 loc·room·code·game·conn 다시 쓰기 (0.5초 묶어 한 번) |
| `bus.publish(type, payload)` | `→ Promise<bool>` 던지지 않음 | 다른 Node에만 감 (나는 안 받음 → 내 일은 먼저 직접) |
| `bus.on(type, fn)` | `fn(msg)`, msg = `{v:1,type,from,at,...payload}` → 떼는 함수 | 처리기 없는 type·다른 v·틀린 모양은 버림 |
| `rpc.register(method, fn)` | `fn(args, {from}) → 값` (JSON) → 떼는 함수 | 같은 이름은 덮어씀 |
| `rpc.call(node, method, args, {timeoutMs})` | `→ Promise<값>` 또는 code 달린 오류 | 나 자신이면 Redis 안 거침 |
| `rpc.callAll(method, args)` | `→ {results:[{node,ok,value}\|{node,ok:false,code}], partial}` | down이면 나만 + `partial:true` |
| `nodes.list()` | `[{id,bootEpoch,startedAt,draining,games,rooms,online,loopP95,version,lastSeen,alive,self}]` | 나는 늘 첫째, down이면 나만 |
| `nodes.isAlive(id, bootEpoch?)` | `→ bool` | bootEpoch 주면 그 부팅까지 같아야 true |
| `nodes.setDraining(bool)` / `isDraining()` | | 하트비트에 바로 실음 |
| `nodes.refresh()` | `→ Promise` | 목록은 하트비트마다(3초) 다시 읽음, 바로 필요하면 |
| `directory.keys()` | `{loc,conn,connseq,room,roomcode,startedcode,game,roomsNode,lock}` 함수 묶음 | 키 이름은 이것만 써서 만들기 (prefix 붙음) |
| `directory.read(key)` | `→ {available, value}` | value: JSON이면 객체, 없으면 null |
| `directory.locate(key)` | `→ {available, value, node, alive, self}` | 값의 `node`(글자 값이면 그 글자)와 살아 있음 |
| `directory.write(key, value, {ttlMs, nx})` | `→ bool` | nx = 없을 때만 (방 코드 잡기). 켤 때 정리 목록에 남음 |
| `directory.removeIfOwned(key)` | `→ bool` | 값의 node가 나(+bootEpoch 같음)일 때만 (CAS) |
| `directory.removeIfValue(key, expected)` | `→ bool` | 값이 같을 때만 (roomcode) |
| `directory.nextSeq(key, ttlMs)` | `→ number \| null` | connseq |
| `directory.available()` | `→ bool` | |
| `counters.hit(key, windowMs)` | `→ {count, ttlMs, shared}` | key는 앞머리 뺀 `rl:<이름>:<키>`·`wrong:pw:<uuid>`·`join:<uuid>` |
| `counters.peek(key)` / `counters.reset(key)` | | |
| `fetchSockets(channel)` | `→ {sockets, partial}` | 강제 끊기·탈퇴 끊기용 대체 동작 포함 |
| `adapterStats()` | `{published, publishFailed, forcedLocal} \| null` | 판 방송이 Redis를 안 타는지 시험용 |
| `CODES` `BUS_TYPES` `TTL` | 상수 | |

오류 code: `CLUSTER_UNAVAILABLE`(Redis 못 씀) · `NODE_UNAVAILABLE`(그 Node 없음/죽음) · `RPC_TIMEOUT` · `RPC_UNKNOWN_METHOD` · `RPC_FAILED`(처리기가 던짐, `remoteCode`에 처리기 오류 code) · `DUPLICATE_SERVER_ID`. 오류에 `node`·`method`도 달림.

## 3. 대체 동작 (Redis down)

- 판정: 2초마다 쓰기 확인(1초 시간 초과), 2번 연달아 실패면 down (한 번 실패면 0.5초 뒤 다시 봄). 연결 끊김은 바로 down. 명령·구독 연결 둘 다 ready + 확인 성공이면 up
- down 동안: 버스 `false` · RPC `CLUSTER_UNAVAILABLE`(기다리던 것도 바로 끝냄) · callAll 나만 `partial` · 디렉터리 `available:false`/`false` · 카운터 메모리(`shared:false`) · 어댑터는 내 Node만 · `fetchSockets` 내 Node만 `partial:true`
- OOM 같은 쓰기 실패도 그 호출은 down과 같은 대체 동작, 상태 확인이 쓰기라 2번 실패면 down
- 살아남(down→up): `onResync` 처리기 부름. 내 하트비트가 Redis에서 사라졌으면(재시작·비움) 다시 맞추기 + 버스 `cluster.resync`로 다른 Node도 다시 맞춤
- 켤 때 Redis 없음: 서버는 켜짐(down), 로그 한 줄, 뒤에서 계속 다시 붙음

## 4. 위험 2번 실측 (redis:7.4-alpine, ioredis 5.11.1, @socket.io/redis-adapter 8.3.0, Node 24)

Node 2개 + 사용자 소켓 1개, Redis 앞 TCP 중계로 죽음(kill: 연결 끊고 거절)·멈춤(freeze: 연결 둔 채 응답 없음)을 만듦. 방송 50번.

| 설정 | 상황 | 처리 안 된 거절 | 내 Node 전송 | fetchSockets | 살아난 뒤 노드 넘는 전송 |
|---|---|---|---|---|---|
| 감싸기 없음, ioredis 기본값 | 죽음 | **50 (방송마다 1)** | 50/50 그대로 | **9.4초 뒤 거절** (재시도 20번) | 됨 |
| 감싸기 없음, ioredis 기본값 | 멈춤 | (재지 못함) | | **200초 넘게 안 끝남** | |
| 감싸기 없음, 오프라인 줄 끔+1초 | 죽음 | **50** | 50/50 | 0ms 거절 | 됨 |
| 감싸기 없음, 오프라인 줄 끔+1초 | 멈춤 | **50** | 50/50 | 1.0초 뒤 거절 | 됨 |
| **지금 코드** (오프라인 줄 끔+1초 + 감싸기) | 죽음 | **0** | 50/50 + 판정 전 틈 20/20 | 내 Node만 즉시 (`partial`) | 됨 |
| **지금 코드** | 멈춤 | **0** | 50/50 + 틈 20/20 | 내 Node만 즉시 | 됨 |

- 결론: 어댑터는 `pubClient.publish()` 결과를 안 기다려서 실패마다 처리 안 된 거절이 생김. 로컬 전송은 publish와 따로라 막히지 않음
- 그래서 (1) 보내기 연결 `publish`에 거절 처리기를 달고(같은 Promise 돌려줌), (2) down이면 어댑터 메서드(broadcast·broadcastWithAck·fetchSockets·addSockets·delSockets·disconnectSockets)에 `local` 표시를 붙여 아예 안 보냄 (`adapter.js`)
- down 판정 시간(실측 3번씩): 죽음 0.015초(연결 끊김 사건) → 풀리면 0.2초 안 up / 멈춤 2.7~4.0초(이론상 최대 약 4.5초, 시험 기준 5초) → 풀리면 1~1.5초 안 up
- 어댑터 `requestsTimeout` = `CLUSTER_RPC_TIMEOUT_MS`(1.5초) → up인데 다른 Node가 늦으면 `fetchSockets`가 1.5초 뒤 내 Node만 + `partial`
- 구독 연결은 오프라인 줄을 켜 둠 (어댑터가 만들 때 부르는 subscribe가 거절로 새지 않음, 다시 붙으면 자동 재구독)
- 끄는 순서: 소켓(io) 먼저 닫고 Redis를 닫아야 함. 반대면 어댑터 unsubscribe가 "Connection is closed" 거절을 냄 (processLifecycle 순서가 맞음)
- 실측에서 찾아 고친 것: RPC가 보내기를 기다리는 동안 시간 초과가 나면 결과 Promise 거절이 새던 것 (보내기를 안 기다리게 바꿈)

## 5. 시험

- 단위(메모리): `cluster/testing/memoryCluster.js` — 진짜 bus·rpc·nodes·directory·counters 코드를 Redis 대신 메모리 위에서 돌림 (ioredis-mock 안 씀)

```js
const cluster = require('../../cluster')
const { createMemoryHub, quietLog } = require('../../cluster/testing/memoryCluster')

test('…', async (t) => {
    const hub = createMemoryHub()                 // Redis 서버 하나 자리
    t.after(() => hub.close())
    await cluster.init({ backend: hub.backend(), env: { SERVER_ID: 'n1' }, log: quietLog })
    t.after(() => cluster.close())                // 뒤로는 단일 모드
    const n2 = await hub.startNode('n2')          // 다른 Node (따로 도는 인스턴스, cluster와 같은 모양)
    await n2.nodes.refresh()
    n2.rpc.register('room.describeForInvite', (args) => ({ … }))
    // 시험할 코드가 cluster.rpc.call('n2', …) 부르면 n2 처리기가 받음
    hub.setDown(true)                             // 모든 Node의 Redis 죽음 (false면 살아남 → onResync)
    hub.flush()                                   // Redis 재시작(빈 데이터)
})
```

- 한 Node만 끊기: `const b = hub.backend(); await cluster.init({ backend: b, … }); b.setDown(true)`
- 시간 줄이기: `hub.startNode('n2', { env: { CLUSTER_HEARTBEAT_MS: '30', NODE_DEAD_AFTER_MS: '120' } })`
- 저장소 들여다보기: `hub.store.map`(키 → 값), 보낸 pub/sub: `hub.published`
- 통합(진짜 Redis): `npm run test:with-redis` → docker `mmc-redis-test`(6380) 없으면 만들고 `tests/cluster/**` 를 `REDIS_URL_TEST`로 돌림. `npm test`에서는 이 시험들이 건너뜀. 도우미 `tests/cluster/helpers/{redisNodes,redisProxy}.js` (Node 2개 한 프로세스, 죽음·멈춤 중계)
- 시험 번호: MN-056·089~094·103·104·106·112·117·118·131~134·138 (`tests/cluster/*.test.js` 이름에 적음)

## 6. 파일

`config/cluster.js`(환경값) · `redis.js`(연결·상태 판정·명령) · `scripts.js`(Lua) · `errors.js` · `bus.js` · `rpc.js` · `nodes.js`(하트비트) · `directory.js` · `counters.js` · `adapter.js` · `node.js`(Node 하나 조립) · `index.js`(입구) · `testing/memoryCluster.js`
