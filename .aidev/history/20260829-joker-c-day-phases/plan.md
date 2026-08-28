# joker-C · 낮 페이즈 분리 (토론 → 투표) 구현 계획

## 0. 현재 코드 확인 결과 (계획의 전제)

읽은 파일과 확인된 사실:

- `backend/game-core/gameSession.js:670` `enterDayPhase(session)` 가 DAY 진입의 **유일한** canonical mutation이다(phase/dayIndex/dayVotes/dayVoteRound/dayVoteExcludedUuids를 한 곳에서 초기화). 진입점은 두 곳 — `acknowledgeRoleReveal`(:815)과 `commitNightResolution`(:1247).
- `submitDayVote`(:1300)는 `session.phase !== 'DAY'` 하나로만 낮 제출을 가른다 → **지금은 토론/투표 구분이 없다**(요구 1이 겨냥한 구멍).
- 재투표(joker-A 5번)는 `commitDayVoteResolution`(:1567 REVOTE 분기)이 **phase를 DAY에 그대로 둔 채** `dayVoteRound`만 올리고 `dayVotes`를 비우는 방식으로 이미 구현돼 있다. → 요구 3은 "REVOTE가 DAY_VOTE 안에 머문다"만 보장하면 된다.
- 전원 기권은 `tallyDayVoteOutcome`(:1391)이 `ABSTAINED`를 내고 `commitDayVoteResolution`의 else 분기(:1573)가 처형 없이 `phase='NIGHT'`로 넘긴다. → **요구 4는 이미 동작한다. 회귀 테스트로 고정만 한다.**
- 처형 직후 승리 재평가는 `commitTribunalVoteResolution`(:1852~1864)이 `defendant.alive=false` 직후 `evaluateWinCondition` → `finalizeGameSession`을 호출하고 NIGHT 전이보다 **먼저** return한다. 밤 사망도 동일(:1239). → **요구 5도 이미 원칙대로 동작한다. 광대 처형 시나리오 테스트로 고정만 한다.**
- 채팅 채널 판정(`resolveGameChatChannel`, :198)은 생존자 공개 채팅을 `session.phase === 'DAY'` 로 연다. `DEAD_CHAT_PHASES`(:112)도 `'DAY'` 문자열을 본다.
- 프런트 진입 연출 identity는 `scope|phase|dayIndex`(`buildInGamePhaseEntranceIdentity.js:30`)뿐이다.
- disconnect는 세션 전체를 즉시 종료한다(`backend/socket/gameSession.js:1375`) → "준비 안 한 유령 참가자" 교착은 구조적으로 생기지 않는다.
- 세션에 host 개념이 없다(`session` 필드에 hostUuid 없음; host는 matchmaking/Room 쪽 개념).

---

## 1. 설계 결정 (요구 2의 "1안")

### 1-1. 하위 페이즈 표현: `session.phase`는 `'DAY'`로 두고 `session.dayPhase`를 새로 둔다

값은 요구서의 이름을 그대로 쓴다 — `'DAY_DISCUSSION'` / `'DAY_VOTE'`.

`session.phase` 자체를 두 값으로 쪼개는 안은 채택하지 않는다. 근거:

- `phase === 'DAY'`는 이미 **채팅 채널 라우팅**(공개 DAY 채팅 + 사망자 채팅), `canIncludeDayTribunalFields`, `computeHasActedThisPhase`, 프런트 `KNOWN_PHASES`·`DAY_VOTE_RESOLVED_PHASES`·`applyDayVoteResolvedToPhase`·진입 연출 identity 등 **낮과 무관한 계약 다수**의 입력이다. 이 문자열을 쪼개면 "투표 페이즈에는 채팅을 허용한다"(요구 1)를 위해 채팅 규칙을 새로 두 번 써야 하고, 진입 연출이 낮 안에서 한 번 더 재생되는 회귀가 생긴다.
- 하위 페이즈는 낮 **안에서만** 의미가 있는 상태다. `phase`(게임 대구간)와 `dayPhase`(낮 하위 구간)를 분리하면 "dayPhase는 phase==='DAY'일 때만 의미를 갖는다"는 한 줄 불변식으로 계약이 닫힌다.
- S1-2(타이머)가 붙을 때 타이머는 `dayPhase` 전이를 트리거하는 또 하나의 입력으로 들어오면 되고, 이 슬라이스가 만드는 `enterDayVotePhase(session)` 단일 mutation을 그대로 재사용한다.

### 1-2. 전환 트리거 1안: **생존자 전원 준비(ready)** — 승인 대상

`ready_for_day_vote` 이벤트를 새로 만든다. 생존 참가자가 각자 한 번 보내고, **생존자 전원**이 보낸 순간 `DAY_DISCUSSION → DAY_VOTE`로 전이한다.

이 안을 고른 이유:

- 저장소에 이미 **똑같은 모양의 검증된 선례**가 있다 — `acknowledgeRoleReveal`(전원 ack → `enterDayPhase`, 마지막 하나만 `transitioned:true`, 이후 요청은 phase 가드로 자동 거부). 그 골격을 그대로 복제하면 동시성/중복/늦은 요청 처리를 새로 설계하지 않아도 된다.
- 호스트 진행 안은 game-core `session`에 host가 없어 Room의 host를 세션으로 승계하는 작업이 선행돼야 한다(슬라이스 범위 밖의 상태 추가). 전원 준비는 `session.players`의 alive만으로 판정된다.
- 타이머(S1-2)가 붙어도 "전원 준비 시 조기 전환"은 그대로 살아남는 규칙이라 버려지는 코드가 아니다.

전환 자격 집합은 `getEligibleDayVoterUuids(session)`(생존자) — 투표 자격과 준비 자격을 같은 함수로 묶어 두 규칙이 어긋날 여지를 없앤다. 사망자의 ready는 `ACTOR_NOT_ALIVE`로 거부한다(submitDayVote와 같은 코드).

**준비 취소(un-ready), 준비 진행률 브로드캐스트, 타이머는 이 슬라이스에 넣지 않는다.** 진행률은 요청자 본인의 ack에 `readyCount/requiredCount`로만 돌려준다(다른 참가자의 준비 여부는 방송하지 않는다 — 새 공개 정보를 만들지 않기 위함).

### 1-3. 재투표(요구 3)

`commitDayVoteResolution`의 REVOTE 분기는 **`dayPhase`를 건드리지 않는다**. 낮에 들어올 때만 `DAY_DISCUSSION`이 되고, 한 번 `DAY_VOTE`가 된 낮은 그 낮이 끝날 때까지 `DAY_VOTE`다 → 재투표는 자동으로 DAY_VOTE 내부 반복이 된다. 준비 집합도 재투표에서 다시 요구하지 않는다.

---

## 2. 파일별 변경 내용

### 2-1. `backend/game-core/gameSession.js` (핵심)

**추가 상수/접근자**

- `const DAY_PHASES = Object.freeze({ DISCUSSION: 'DAY_DISCUSSION', VOTE: 'DAY_VOTE' })`
- `getDayPhase(session)` — `session.dayPhase`가 두 값 중 하나면 그대로, 아니면 **`DAY_DISCUSSION`**(fail-closed: 알 수 없으면 투표를 열지 않는다). `getDayVoteRound`/`getDayVoteExcludedUuids`와 같은 위치·같은 관례.
- `getEligibleDayReadyUuids(session)`는 만들지 않고 `getEligibleDayVoterUuids`를 그대로 쓴다(자격 정의 단일화).

**세션 필드 추가** — `buildSessionCandidate`(:382 객체 리터럴)

- `dayPhase: null` — ROLE_REVEAL에는 낮이 없다는 뜻(주석으로 명시).
- `dayVoteReadyUuids: new Set()` — `roleRevealAcks`/`nightActions`와 같은 이유로 세션 안에 둔다.

`assertValidSessionForCommit`에는 새 가드를 넣지 않는다(커밋 시점 phase는 ROLE_REVEAL 고정이고, 두 필드 모두 고정값만 만들어지는 필드다 — 기존 `dayVoteRound`/`dayVoteExcludedUuids`와 같은 취급).

**`enterDayPhase(session)`(:670) 수정**

```
session.dayPhase = DAY_PHASES.DISCUSSION
session.dayVoteReadyUuids = new Set()
```
두 줄 추가. DAY 진입점이 이 함수 하나뿐이라 "새 낮은 항상 토론부터, 지난 낮의 준비는 이어받지 않는다"가 구조적으로 보장된다. 함수 주석의 초기화 목록에 두 필드를 추가한다.

**신규 `enterDayVotePhase(session)`**

`DAY_DISCUSSION → DAY_VOTE` 전이의 유일한 canonical mutation. `session.dayPhase = DAY_PHASES.VOTE` + `session.dayVoteReadyUuids = new Set()`(전이 후 준비 기록은 의미가 없으므로 비운다). dayVotes/round/excluded는 건드리지 않는다 — `enterDayPhase`가 이미 이 낮의 투표 상태를 세팅했다.

**신규 `acknowledgeDayVoteReady(uuid, gameId)`** — `acknowledgeRoleReveal`(:790)의 골격을 그대로 따른다.

검증 순서: gameId 형태 → `playerSession` 조회·일치 → registry 일관성(`SESSION_NOT_FOUND`/`NOT_A_PARTICIPANT`) → `assertSessionNotEnded` → `phase !== 'DAY'` → `INVALID_PHASE` → `getDayPhase !== DISCUSSION` → `INVALID_DAY_PHASE` → `actor.alive` 아니면 `ACTOR_NOT_ALIVE` → 이미 준비했으면 `{ ok:true, transitioned:false, ... }`(멱등) → Set 추가 → 생존자 전원이 모였으면 `enterDayVotePhase` 후 `{ ok:true, transitioned:true, session, readyCount, requiredCount }`.

`readyCount`는 준비 집합 중 **생존자만** 센다(사망자가 남긴 항목이 카운트를 오염시키지 않게 — `tallyDayVoteOutcome`이 eligible voter만 순회하는 것과 같은 방어).

**신규 `buildDayPhaseChangedPayload(session)`**

`{ gameId, dayIndex, dayPhase, round }` — 참가자 식별·비밀 정보 없음. `round`는 `getDayVoteRound(session)`(재접속/재투표 표시용, 이미 `buildDayVoteResolvedPayload`가 공개하는 값이라 새로 드러나는 정보가 없다).

**`submitDayVote`(:1300) 수정**

`if (session.phase !== 'DAY')`(:1328) 바로 **다음** 줄에 추가:

```
if (getDayPhase(session) !== DAY_PHASES.VOTE) return { ok: false, code: 'INVALID_DAY_PHASE' }
```

`DAY_VOTE_ALREADY_RESOLVED` 검사보다는 뒤, `actor.alive` 검사보다는 앞. 함수 상단 검증 순서 주석(12단계)을 13단계로 갱신한다. → **성공 조건 6.3**.

**`prepareDayVoteResolution`(:1453) 수정**

`if (session.phase !== 'DAY')`(:1480) 다음에 동일한 `INVALID_DAY_PHASE` 가드. 토론 중에는 집계 자체가 열리지 않는다(생존자 1명 세션에서 0표 집계가 통과하는 경로를 막는다).

**`commitDayVoteResolution`(:1550) — REVOTE 분기 주석만 보강**

`dayPhase`를 건드리지 않는다는 사실을 주석으로 명시한다(요구 3의 계약을 코드 옆에 남긴다). TRIBUNAL/TIE/ABSTAINED 분기는 phase가 DAY를 벗어나므로 `dayPhase`는 무의미해진다 — 굳이 null로 되돌리지 않고 "dayPhase는 phase==='DAY'일 때만 읽는다"는 불변식을 주석으로 고정한다(`dayVoteResolution`/`tribunal`을 남겨두는 기존 관례와 동일).

**`computeHasActedThisPhase`(:1909) 수정**

```
case 'DAY':
    return getDayPhase(session) === DAY_PHASES.VOTE
        ? session.dayVotes.has(uuid)
        : session.dayVoteReadyUuids instanceof Set && session.dayVoteReadyUuids.has(uuid)
```
토론 중 "내가 이미 준비를 눌렀는가"를 재접속 클라이언트가 알 수 있어야 한다.

**`buildSessionSnapshot`(:1955) 수정**

`fields`에 `phase === 'DAY'`일 때만 `dayPhase: getDayPhase(session)`을 추가한다(그 외 phase에서는 키 자체를 만들지 않는다 — `nightResult`/`tribunal`의 선택 필드 관례와 동일). 재접속 클라이언트가 토론/투표를 구분하지 못해 그 낮에 갇히는 것을 막는다.

**module.exports 추가**: `acknowledgeDayVoteReady`, `buildDayPhaseChangedPayload`, `DAY_PHASES`. `__testables`에 `enterDayVotePhase`, `getDayPhase` 추가.

### 2-2. `backend/socket/gameSession.js`

- 신규 `handleAcknowledgeDayVoteReady(io, socket, uuid, payload, callback)` — `handleAcknowledgeRoleReveal`(:146)을 그대로 따른다: `isCurrentSocketForUuid` → payload 형태(`gameId` 문자열) → core 호출 try/catch → `INTERNAL_ONLY_CODES` 정규화 → `respond(callback, { ok:true, readyCount, requiredCount })` → `result.transitioned`일 때만 `io.to(session.channelId).emit('day_phase_changed', buildDayPhaseChangedPayload(session))`.
  - `INVALID_DAY_PHASE`/`ACTOR_NOT_ALIVE`는 공개 코드다(클라이언트가 그대로 받는다). `INTERNAL_ONLY_CODES`에 추가하지 않는다.
  - ack와 broadcast는 기존 관례대로 독립 best-effort(respond가 콜백 예외를 삼킨다).
- `registerGameHandlers`(:1341)에 `socket.on('ready_for_day_vote', ...)` 배선 추가.
- `__testables`에 `handleAcknowledgeDayVoteReady` 추가.
- `handleSubmitDayVote`(:785)는 코드 변경 없음 — core가 돌려주는 `INVALID_DAY_PHASE`가 그대로 클라이언트에 전달된다. 함수 주석에 "토론 중 제출은 core가 INVALID_DAY_PHASE로 거부한다" 한 줄만 추가.

### 2-3. `frontend/src/domains/game/ingame/utils/parseDayPhaseChangedPayload.js` (신규)

`day_phase_changed`(신뢰하지 않는 외부 입력)를 검증하는 순수 함수. `parseNightResultAppliedPayload`/`parseDayVoteResolvedPayload`와 같은 관례로, 어긋나면 `null`.

검증: 객체 형태 → `gameId === 활성 gameId` → `Number.isInteger(payload.dayIndex)` 이고 현재 dayIndex와 일치 → `payload.dayPhase === 'DAY_VOTE'`(이 이벤트는 투표 개시만 방송한다 — 되돌리는 전이는 계약에 없다) → `round`가 1 이상 정수. 통과 시 `{ gameId, dayIndex, dayPhase, round }` 반환.

### 2-4. `frontend/src/domains/game/ingame/store/ingameStore.js`

- 신규 액션 `applyDayPhaseChanged(parsed)` — 호출부가 파싱한 값만 받지만 기존 액션들과 동일하게 store에서 독립 재확인: `current.state.phase === 'DAY'`, gameId 일치, dayIndex 일치, `dayPhase === 'DAY_VOTE'`가 아니면 `current` 그대로 반환(참조 보존 no-op). 통과 시 `{ state: { ...current.state, dayPhase: 'DAY_VOTE' } }`.
- `applyPhaseChanged`(:52) — `isFirstDay` 경로에 `dayPhase: "DAY_DISCUSSION"`을 함께 넣는다(legacy first-night 경로는 `dayPhase: null`).
- `applyNightResultAppliedPayload`(:71) — DAY 전이 분기(:114)에 `dayPhase: "DAY_DISCUSSION"` 추가, ENDED 분기(:93)에 `dayPhase: null`.
- `applyDayVoteResolvedToPhase`(:122) — TRIBUNAL/NIGHT 두 분기 모두 `dayPhase: null`(낮을 벗어났다).
- 주석으로 계약 명시: **`dayPhase`는 `phase === 'DAY'`일 때만 의미가 있다.** (그래서 `applyTribunalResolved.js`는 손대지 않는다 — TRIBUNAL→NIGHT/ENDED에서 남는 값은 어떤 게이트에도 입력이 아니고, 다음 낮 진입 시 반드시 덮어써진다.)

### 2-5. `frontend/src/domains/game/ingame/store/applySessionSnapshot.js`

- `KNOWN_DAY_PHASES = new Set(["DAY_DISCUSSION", "DAY_VOTE"])` 추가.
- 검증: `response.phase === "DAY"`이면 `Object.hasOwn(response,"dayPhase")`이고 값이 known이어야 한다(아니면 `current` 반환). `phase !== "DAY"`인데 `dayPhase` 키가 있으면 거부(기존 `winResult` 양방향 불변식과 같은 관례).
- `nextState`에 `dayPhase: response.phase === "DAY" ? response.dayPhase : null` 추가.

### 2-6. `frontend/src/domains/game/ingame/hooks/useGameSessionSocketEvents.js`

`handleDayPhaseChanged` 추가 — 호출 시점에 store에서 `gameId`/`state.dayIndex`를 직접 읽어 `parseDayPhaseChangedPayload`에 넘기고, 통과하면 `applyDayPhaseChanged`. `socket.on/off("day_phase_changed", ...)`를 기존 5개 이벤트와 같은 effect에 등록·해제한다.

### 2-7. `frontend/src/domains/game/ingame/hooks/useInGameDayDiscussionReady.js` (신규)

`useInGameRoleRevealAck.js`의 늦은 응답 방어 패턴(mounted ref / versionRef / ackingRef / socket identity·connected / gameId 일치)을 그대로 복제하되 **자동 발사는 하지 않는다** — 토론을 끝낼지는 사용자가 정한다. 반환: `{ status: 'idle'|'sending'|'ready', error, readyCount, requiredCount, submitReady }`.

무효화 트리거: socket 교체·disconnect·`gameId` 변경·**`dayIndex` 변경**·**`dayPhase` 변경**(새 낮/투표 개시 시 `idle`로 되돌아가야 다음 낮에 다시 누를 수 있다).

### 2-8. `frontend/src/domains/game/ingame/hooks/useInGameActionPanel.js`

- `const dayPhase = useInGameStore((s) => s.state?.dayPhase)` 추가.
- `dayVoteControlsEnabled`(:222)에 `dayPhase === "DAY_VOTE"` 조건 추가 → 토론 중에는 투표/기권 버튼이 잠긴다(서버 거부의 UI 선반영).
- 낮 집계 버튼(`resolveDayVote`) 활성 조건에도 `phase === "DAY" && dayPhase === "DAY_VOTE"`를 요구한다(현재는 `interactionBlocked`/status만 본다 — 토론 중 집계 요청이 나가지 않게 한다).
- `useInGameDayDiscussionReady()`를 호출해 `dayReadyStatus/dayReadyError/dayReadyCount/dayReadyRequired/submitDayReady`와 `dayPhase`를 반환 객체에 추가. 준비 버튼 활성 조건: `!interactionBlocked && !isGameEnded && phase === "DAY" && dayPhase === "DAY_DISCUSSION" && isSessionPlayerAlive(localSessionPlayer) && status === "idle"`.
- **주의**: 이 파일 상단 주석 다수가 이미 깨진 인코딩(mojibake)으로 저장돼 있다. 해당 줄은 **바이트 그대로 두고** 새 주석만 정상 UTF-8 한국어로 추가한다.

### 2-9. `frontend/src/domains/game/ingame/constants/actions/ingameActionPanel.js`

라벨 상수 추가(기존 TRIBUNAL 라벨 블록 옆): `DAY_DISCUSSION_NOTICE = "토론 중입니다. 투표는 아직 열리지 않았습니다."`, `DAY_VOTE_READY_LABEL = "투표 시작 준비"`, `DAY_VOTE_READY_SENDING_LABEL = "준비 중..."`, `DAY_VOTE_READY_DONE_LABEL = "준비 완료"`, `DAY_DEAD_NOTICE = "사망한 참가자는 낮 진행에 참여할 수 없습니다."`. 문자열만 추가하며 기존 export는 건드리지 않는다.

### 2-10. `frontend/src/domains/game/ingame/components/actions/InGameActionPanel.jsx`

`gameState.phase === "DAY"` 블록(:141)을 두 갈래로 나눈다:

- `dayPhase === "DAY_DISCUSSION"`: 안내 문구 + 준비 버튼(+ `준비 n/m` 표시, 에러 문구). 대상 선택기·투표·기권·낮 집계 버튼은 **렌더하지 않는다**.
- `dayPhase === "DAY_VOTE"`: 기존 UI를 그대로(대상 선택기 / 투표 / 기권 / 낮 집계 / 제출·판정 결과 문구). 재투표 라운드 표시는 기존 `dayVoteResolution` 문구를 그대로 쓴다.
- 헤더의 `{gameState.phase} · 제 {dayIndex}일`은 `phase === "DAY"`일 때 `dayPhase`를 함께 보여 준다(예: `DAY_VOTE · 제 1일`).

채팅 영역(`InGameChatShell` 등)은 **손대지 않는다** — 서버가 두 하위 페이즈 모두에서 `phase === 'DAY'` 기준으로 공개 채팅을 열어 두므로 토론·투표 양쪽에서 채팅이 그대로 동작한다(요구 1의 "투표 페이즈에도 채팅 허용").

---

## 3. 테스트

### 3-1. `backend/game-core/__tests__/gameSession.test.js` (MODIFY)

기존 헬퍼를 고쳐 대부분의 호출부를 한 번에 정상화한다:

- `commitTrioSessionAtDay`(:2784) / `commitQuadSessionAtDay`(:3202): DAY 진입 후 **생존자 전원 `acknowledgeDayVoteReady`** 를 돌려 `DAY_VOTE`까지 전진시키고 `assert.equal(session.dayPhase, 'DAY_VOTE')`. 토론 단계를 검증하는 테스트를 위해 `{ advanceToVote = true }` 옵션을 받는다.
- `resolveDayVotes`(:3903): 호출 시점에 `dayPhase`가 아직 DISCUSSION이면 준비를 돌려 전진시킨 뒤 제출한다(밤→낮을 넘긴 뒤 다시 투표하는 스냅샷 시나리오들이 그대로 통과하도록).
- `session.phase = 'DAY'`를 손으로 세팅하는 테스트는 `session.dayPhase = 'DAY_VOTE'`도 함께 세팅한다(`getDayPhase`가 fail-closed이므로 명시 필요).

신규 테스트:

1. `enterDayPhase`는 `dayPhase='DAY_DISCUSSION'`과 빈 `dayVoteReadyUuids`를 만든다(첫 낮·밤→낮 두 경로 모두).
2. **토론 중 `submitDayVote`는 `INVALID_DAY_PHASE`로 거부되고 `session.dayVotes`가 비어 있다** (성공 조건 6.3).
3. 토론 중 `prepareDayVoteResolution`도 `INVALID_DAY_PHASE`.
4. 생존자 일부만 준비하면 `transitioned:false`이고 `dayPhase`는 그대로다; 마지막 한 명이 준비하면 `transitioned:true`·`dayPhase='DAY_VOTE'`.
5. 같은 uuid의 중복 준비는 멱등(`transitioned:false`)이고 두 번째 준비로는 전이가 일어나지 않는다.
6. 사망자의 준비는 `ACTOR_NOT_ALIVE`; **사망자는 준비 정족수에서 빠진다**(4인 중 1명 사망 → 생존 3명 준비로 전이).
7. `DAY_VOTE` 상태에서의 준비 요청은 `INVALID_DAY_PHASE`.
8. **재투표(요구 3)**: 4인 세션 2:2 동점 → `REVOTE` 커밋 후 `dayPhase`가 여전히 `'DAY_VOTE'`이고, 준비 없이 곧바로 2라운드 제출이 `{ok:true}`이며, 제외 대상 투표는 기존대로 `TARGET_EXCLUDED_FROM_REVOTE`.
9. **전원 기권(요구 4)**: DAY_VOTE에서 생존자 전원 null 제출 → `ABSTAINED` → 처형 없음(`players` 전원 alive 유지)·`tribunal === null`·`phase === 'NIGHT'`.
10. 재투표 2라운드에서 전원 기권해도 동일하게 `ABSTAINED → NIGHT`.
11. **광대 처형 직후 승리(요구 5)**: JOKER를 DAY_VOTE에서 지목 → TRIBUNAL → GUILTY 판정 → `commitTribunalVoteResolution`이 `terminal.winner === 'CITIZEN'`을 돌려주고 `session.phase === 'ENDED'`이며 **NIGHT를 거치지 않는다**(`session.nightActions`가 새 Map으로 갈리지 않음도 함께 확인).
12. 새 낮으로 넘어가면 이전 낮의 준비 기록이 이월되지 않는다(밤→낮 후 `dayPhase='DAY_DISCUSSION'`, 준비 집합 비어 있음).
13. `buildSessionSnapshot`: DAY_DISCUSSION/DAY_VOTE 각각에서 `dayPhase`가 실리고, NIGHT/TRIBUNAL/ROLE_REVEAL/ENDED에서는 키 자체가 없다. `hasActedThisPhase`가 토론에서는 준비 여부, 투표에서는 제출 여부를 따른다.
14. 기존 비밀 누출 검사기(FORBIDDEN_PRIVATE_KEYS 재귀 검사)를 `day_phase_changed` payload와 신규 스냅샷 필드에도 적용.

### 3-2. `backend/socket/__tests__/gameSession.test.js` (MODIFY)

- `commitTrioSessionWithSocketsAtDay`(:2644)가 신규 핸들러로 생존자 전원 준비를 돌려 `DAY_VOTE`까지 전진시키도록 수정 → 기존 `cast_day_vote`/`resolve_day_vote` 테스트 다수가 그대로 통과한다.
- 신규: 토론 중 `handleSubmitDayVote` ack가 `{ok:false, code:'INVALID_DAY_PHASE'}`이고 브로드캐스트가 0건.
- 신규: 마지막 준비에서만 `day_phase_changed`가 채널에 **정확히 1회** 방송되고 payload 키가 `[gameId, dayIndex, dayPhase, round]` 뿐이다(role/uuid 없음).
- 신규: 중복 준비·`INVALID_PAYLOAD`(gameId 비문자열)·`STALE_SOCKET`·콜백 throw 시 방송이 계속 진행되는지 — 기존 `acknowledge_role_reveal` 테스트와 같은 표를 복제.

### 3-3. 프런트

- `utils/__tests__/parseDayPhaseChangedPayload.test.js` (CREATE): gameId/dayIndex 불일치, `dayPhase` 미지값, 비정수 round, 배열/`null` payload 전부 `null`; 정상 payload만 통과.
- `store/__tests__/ingameStore.test.js` (MODIFY): `applyDayPhaseChanged`가 phase가 DAY가 아니거나 dayIndex가 다르면 **참조 보존 no-op**; 정상 입력에서 `dayPhase`만 바뀐다. `applyPhaseChanged`/`applyNightResultAppliedPayload`가 DAY 진입 시 `DAY_DISCUSSION`을 세팅한다.
- `store/__tests__/applySessionSnapshot.test.js` (MODIFY): `phase:'DAY'`인데 `dayPhase` 없음/미지값 → 거부; DAY_VOTE 스냅샷 → `state.dayPhase === 'DAY_VOTE'`(재접속해도 투표 화면이 유지된다); `phase:'NIGHT'`인데 `dayPhase` 키가 있으면 거부.
- `hooks/__tests__/useInGameActionPanel.test.js` (MODIFY): `dayPhase='DAY_DISCUSSION'`이면 `dayVoteControlsEnabled === false`, `'DAY_VOTE'`면 기존대로 `true`.

### 3-4. 실행 명령 (구현 단계가 반드시 통과시켜야 할 것)

```
npm run test:game-core --prefix backend
npm test --prefix backend
npm test --prefix frontend
npm run check:utf8 --prefix frontend
npm run lint --prefix frontend
```

---

## 4. 위험 요소와 대응

| 위험 | 대응 |
| --- | --- |
| **기존 DAY 테스트 대량 실패** — game-core 테스트에 `submitDayVote`/`prepareDayVoteResolution` 호출이 162곳, socket 테스트에 23곳 | 세 개의 공유 헬퍼(`commitTrioSessionAtDay`, `commitQuadSessionAtDay`, `resolveDayVotes`)와 socket의 `commitTrioSessionWithSocketsAtDay` 한 개를 고쳐 대부분을 흡수. 남는 것은 `session.phase='DAY'`를 손으로 세팅한 소수 케이스 — 이들은 `dayPhase`도 함께 명시 |
| `getDayPhase` fail-closed 기본값이 손으로 조립한 session을 투표 불가로 만든다 | 의도된 설계(요구 1의 핵심이 "모르면 투표를 열지 않는다"). 테스트 헬퍼에서 명시 세팅으로 흡수하고, 접근자 주석에 이유를 남긴다 |
| **재투표가 토론으로 되돌아가 교착** | `commitDayVoteResolution`의 REVOTE 분기가 `dayPhase`를 건드리지 않음을 코드 주석 + 전용 테스트(신규 8번)로 고정 |
| 새 낮에 이전 낮의 준비가 이월돼 토론 없이 즉시 투표가 열림 | `enterDayPhase`에서 `dayVoteReadyUuids`를 새 Set으로 교체(단일 진입점) + 테스트 12번 |
| 사망자가 준비 정족수를 막아 낮이 진행 불가 | 자격 집합을 `getEligibleDayVoterUuids`(생존자)로 고정 + 테스트 6번. 접속 끊김은 세션 전체 종료라 별도 교착 없음 |
| 프런트 `dayPhase`가 낮 밖으로 새어 나가 오판 | "`dayPhase`는 `phase==='DAY'`일 때만 읽는다" 불변식을 store 주석에 고정하고, 모든 게이트가 `phase === 'DAY' && dayPhase === 'DAY_VOTE'` 두 조건을 함께 본다. 스냅샷 검증은 phase↔dayPhase 양방향 일치를 강제 |
| `useInGameActionPanel.js`의 기존 mojibake 주석을 건드려 `check:utf8` 회귀 | 해당 줄은 수정 금지, 새 주석만 정상 UTF-8로 추가. 커밋 전 `npm run check:utf8 --prefix frontend` 실행 |
| 범위 이탈 | 타이머·자동 전환·밤 페이즈·un-ready·준비 진행률 브로드캐스트는 **구현하지 않는다**. 승리 재평가/전원 기권은 이미 구현돼 있으므로 **로직을 새로 쓰지 않고 테스트로만 고정한다**(불필요한 재작성이 회귀 위험) |

## 5. 성공 조건 ↔ 검증 대응

| 성공 조건 | 검증 |
| --- | --- |
| 토론 중 투표 제출이 거부된다 (6.3) | game-core 테스트 2·3번, socket 테스트 `INVALID_DAY_PHASE` ack, 프런트 `dayVoteControlsEnabled=false` |
| 투표 페이즈 진입 후 정상 집계 + A의 재투표 규칙 유지 | 기존 DAY 투표/재투표 테스트 전체가 헬퍼 수정만으로 통과 + 신규 4·8번 |
| 전원 기권 시 처형 없이 밤으로 | 신규 9·10번 |
| 광대 처형 직후 밤 진입 전 시민 승리 | 신규 11번 |

---

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | backend/game-core/gameSession.js |  | DAY_PHASES·dayPhase/dayVoteReadyUuids 상태, enterDayPhase 초기화, enterDayVotePhase·acknowledgeDayVoteReady·buildDayPhaseChangedPayload 신규, submitDayVote/prepareDayVoteResolution 하위 페이즈 가드, snapshot·hasActedThisPhase 반영 |
| MODIFY | backend/socket/gameSession.js |  | ready_for_day_vote 핸들러 신규·배선, day_phase_changed 방송, INVALID_DAY_PHASE 공개 코드 통과 |
| MODIFY | backend/game-core/__tests__/gameSession.test.js |  | DAY 헬퍼 전진 수정 + 토론 거부·준비 전이·재투표·전원 기권·광대 처형 승리·스냅샷 테스트 |
| MODIFY | backend/socket/__tests__/gameSession.test.js |  | DAY 소켓 헬퍼 전진 수정 + ready ack·day_phase_changed 방송·토론 중 제출 거부 테스트 |
| CREATE | frontend/src/domains/game/ingame/utils/parseDayPhaseChangedPayload.js |  | day_phase_changed payload 검증 순수 함수 |
| CREATE | frontend/src/domains/game/ingame/utils/__tests__/parseDayPhaseChangedPayload.test.js |  | 위 파서의 수락/거부 케이스 |
| CREATE | frontend/src/domains/game/ingame/hooks/useInGameDayDiscussionReady.js |  | ready_for_day_vote 제출 hook(늦은 응답·socket 교체·컨텍스트 변경 방어) |
| MODIFY | frontend/src/domains/game/ingame/store/ingameStore.js |  | applyDayPhaseChanged 신규, DAY 진입·이탈 경로의 dayPhase 세팅 |
| MODIFY | frontend/src/domains/game/ingame/store/applySessionSnapshot.js |  | 스냅샷의 dayPhase 검증·반영(phase↔dayPhase 양방향 불변식) |
| MODIFY | frontend/src/domains/game/ingame/hooks/useGameSessionSocketEvents.js |  | day_phase_changed 구독·파싱·store 위임 |
| MODIFY | frontend/src/domains/game/ingame/hooks/useInGameActionPanel.js |  | dayPhase 노출, 투표·집계 컨트롤 게이트에 DAY_VOTE 조건 추가, 준비 상태 배선 |
| MODIFY | frontend/src/domains/game/ingame/components/actions/InGameActionPanel.jsx |  | DAY 섹션을 토론(준비 버튼)/투표(기존 UI) 두 갈래로 분리 |
| MODIFY | frontend/src/domains/game/ingame/constants/actions/ingameActionPanel.js |  | 토론·준비 관련 라벨 상수 추가 |
| MODIFY | frontend/src/domains/game/ingame/store/__tests__/ingameStore.test.js |  | applyDayPhaseChanged·DAY 진입 시 dayPhase 세팅 테스트 |
| MODIFY | frontend/src/domains/game/ingame/store/__tests__/applySessionSnapshot.test.js |  | dayPhase 검증·반영 테스트 |
| MODIFY | frontend/src/domains/game/ingame/hooks/__tests__/useInGameActionPanel.test.js |  | 토론/투표별 dayVoteControlsEnabled 테스트 |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useInGameRoleRevealAck.js |  | 준비 제출 hook이 복제할 늦은 응답 방어 패턴 |
| REFERENCE | frontend/src/domains/game/ingame/utils/buildInGamePhaseEntranceIdentity.js |  | 진입 연출 identity가 phase+dayIndex뿐임(하위 페이즈 무영향) 확인 근거 |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useInGameDayVoteSubmit.js |  | cast_day_vote 배선 계약(게이트는 패널 쪽, 이 파일은 미변경) |
