# 밤 턴 연출을 canonical 제출 진행에 다시 묶는다 — 회귀 수정 계획

## 1. 진단 — 회귀는 어디에 있는가

직전 slice(`bc47cce`)의 변경을 실제 코드로 따라간 결과, **backend는 회귀가 없다.**

- `backend/game-core/gameSession.js:1153 computeCurrentNightTurnRole` — 생존 eligible 배우 전원이 제출해야만 다음 역할로 넘어간다(시간 요소 없음).
- `backend/socket/gameSession.js:355-384` — 제출 후 턴이 실제로 바뀐 경우에만 `night_turn_changed`를 1회 방송하고, 넘길 역할이 없으면 자동 판정한다.
- `backend/socket/__tests__/nightTurnProgression.test.js` 가 이 계약(2명 대기·zero-actor skip·시신 없는 밤의 WITCH_HUNTER skip·자동 판정 1회)을 이미 전부 고정하고 있다.

**시간 경과 진행은 전적으로 frontend의 연출 릴 커서에서 온다.**

- `frontend/src/domains/game/ingame/hooks/useInGameNightTurnAnnouncement.js:132-141` — `hold`가 아니고 마지막 칸이 아니면 **canonical 상태와 무관하게** `INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS`(2600ms)마다 커서를 한 칸 전진시킨다. 이 effect의 deps에는 canonical 턴이 아예 없다.
- 그 커서 값이 `statusRole`로 나가 `InGamePage.jsx:100` → `selectInGameTimebarStatusMessage(gameState, nightTurn.statusRole)`로 상태바 문구가 되고, 오버레이 카드도 같은 커서를 따른다.

그래서 광대가 제출하지 않아도 2.6초마다 "의사의 시간입니다" → "경호원의 시간입니다"가 흘러간다. 반면 **판정은 그대로 제출 기반**이다 — `useInGameActionPanel.js:151-152`의 턴 게이트는 여전히 `selectInGameNightTurnRole`(canonical)을 읽고, 서버 `checkNightTurnGate`도 `NIGHT_TURN_ROLE_MISMATCH`로 막는다. 즉 화면은 "가드의 시간"인데 가드의 확정/건너뛰기 버튼은 잠겨 있고, 광대는 자기 카드가 이미 지나간 뒤에도 혼자만 제출 권한을 쥐고 있다 — 신고된 "제출 불가"가 정확히 이 어긋남이다.

**결론: 고칠 것은 릴 커서의 전진 규칙 하나다.** 릴의 *구성*(어떤 역할 칸이 있는가 — 생사 무관)은 직전 slice의 성과이므로 그대로 두고, *전진*만 canonical 턴에 다시 묶는다.

## 2. 설계 — canonical 턴을 릴의 상한(barrier)으로 쓴다

릴 커서에 **상한**을 도입한다.

```
barrier = 릴에서 canonical 턴 역할이 놓인 칸의 인덱스
커서는 barrier를 절대 넘지 못한다.
커서가 barrier보다 뒤에 있을 때만 2600ms마다 한 칸 전진한다.
```

이 한 줄이 요구사항 네 항목을 그대로 만든다.

| 상황 | canonical 방송 | 릴 커서 | 결과 |
| --- | --- | --- | --- |
| 광대 보유자 생존 | 아직 없음 → `selectInGameNightTurnRole` 폴백 = `JOKER`(0) | barrier 0, 커서 0에 고정 | **제출 전에는 절대 안 넘어감** (요구사항 1) |
| 광대 제출 | `night_turn_changed(DOCTOR)` → barrier 1 | 0 → (2.6s) → 1 | 의사 안내 |
| 의사 보유자 전원 사망 | 광대 제출 시 서버가 의사를 건너뛰어 `GUARD` 방송 → barrier 2 | 0 →(2.6s)→ 1(의사 카드) →(2.6s)→ 2 | **죽은 역할 칸도 안내 1장을 재생하고 자동으로 넘어간다** (요구사항 2·4) |
| 시신 없는 밤의 마녀사냥꾼 | 서버가 턴을 만들지 않음 + 릴이 이미 그 칸을 제외 | — | **기존 규칙 유지** (요구사항 3) |

핵심은 **"릴에서 빠지는 것"과 "릴에서 빨리 지나가는 것"의 구분**이다. 죽은 역할은 릴에서 *빠지지 않고*(그 사실이 비밀), canonical이 그 칸을 건너뛴 결과로 커서가 그 칸을 2.6초 만에 통과한다. 이것이 요구사항이 말한 "conceal의 유일한 시간 기반 진행"이다.

**전진 리듬을 균일하게 둔다(칸마다 2600ms).** barrier가 한 칸 앞으로 움직인 순간 즉시 점프하지 않는다. 즉시 점프를 넣으면 barrier가 두 칸 이상 건너뛴 밤(= 죽은 역할이 낀 밤)에 그 중간 칸이 한 프레임 만에 지워져 은폐 목적 자체가 깨진다. 대신 모든 칸이 동일하게 최소 2.6초를 갖는다 — 살아있는 역할이 제출한 직후에도 그 칸이 2.6초를 채우고 넘어가므로, 전환 리듬이 앞 역할의 생사에 따라 달라지지 않는다.

**릴에 canonical 역할이 없으면 상한을 마지막 칸으로 둔다.** (예: 서버는 시신을 반영했는데 클라이언트 roster가 아직 그 전이라 릴에 `WITCH_HUNTER`가 없는 찰나) 상한을 못 찾았다고 커서를 0에 얼려두면 그 밤 내내 상태바가 첫 역할에 갇힌다. 진행 불능보다 "예전처럼 흘러감"이 안전한 열화(degradation)이므로 마지막 칸을 상한으로 쓴다.

### 함께 고쳐야 하는 잠복 버그 — `cursor.hydrated`

`useInGameNightTurnAnnouncement.js:104`가 세운 `hydrated` 플래그는 커서가 전진해도 그대로 남는다(`:136-138`의 `{...current, index: index+1}`). 지금은 하이드레이션이 항상 **마지막 칸**으로 점프해 더 전진할 칸이 없어 드러나지 않지만, barrier 도입 후에는 복원 지점이 밤 중간이 되어 **그 뒤의 모든 칸이 baseline으로 등록되고 카드가 한 장도 뜨지 않는다**(`reduceInGameNightTurnAnnouncement`의 규칙 2). 전진할 때 `hydrated: false`로 내려야 한다.

## 3. 파일별 변경

### 3.1 `frontend/src/domains/game/ingame/utils/selectInGameNightTurnReel.js` (MODIFY)

새 순수 함수를 추가한다(기존 `selectInGameNightTurnReel`은 무변경 — 릴의 구성은 계속 생사를 보지 않는다).

```js
/**
 * 릴 커서가 지금 도달할 수 있는 마지막 칸(상한). canonical 턴이 놓인 칸이며, 커서는 이 칸을
 * 넘지 못한다 — 보유자가 살아있는 역할의 턴은 그 역할의 제출로 canonical이 움직이기 전까지
 * 절대 넘어가지 않는다는 뜻이다. canonical 역할이 릴에 없으면(구성/시신 판단이 서버와 잠깐
 * 어긋난 창) 마지막 칸을 상한으로 삼는다 — 진행 불능보다 안전한 열화다.
 * @returns {number} 항상 [0, max(길이-1, 0)] 범위의 정수
 */
export function computeInGameNightTurnReelBarrier(reelRoles, canonicalTurnRole)
```

- `reelRoles`가 배열이 아니거나 비면 `0`.
- `canonicalTurnRole`이 비어있지 않은 문자열이고 릴에 있으면 그 인덱스.
- 그 외에는 `reelRoles.length - 1`.

### 3.2 `frontend/src/domains/game/ingame/hooks/useInGameNightTurnAnnouncement.js` (MODIFY)

1. `selectInGameNightTurnRole`과 `computeInGameNightTurnReelBarrier`를 import하고, canonical 턴을 문자열 하나로 구독한다(참조 churn 없음):

```js
const canonicalTurnRole = useInGameStore((s) => selectInGameNightTurnRole(s.state ?? null))
const barrierIndex = computeInGameNightTurnReelBarrier(reelRoles, canonicalTurnRole)
```

2. 전진 타이머(`:132-141`)에 상한 조건을 넣고, 전진 시 `hydrated`를 내린다:

```js
if (hold) return undefined
if (index >= reelRoles.length - 1) return undefined
if (index >= barrierIndex) return undefined   // ← 회귀 수정: 살아있는 역할의 턴은 제출 전까지 멈춘다
const timer = setTimeout(() => {
  setCursor((current) =>
    current.reelId === reelId && current.index === index
      ? { ...current, index: index + 1, hydrated: false }
      : current,
  )
}, INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS)
```
deps에 `barrierIndex`를 추가한다.

3. 하이드레이션 복원 지점(`:99-103`)을 `Math.max(reelRoles.length - 1, 0)` → `barrierIndex`로 바꾼다. 스냅샷에는 canonical 턴이 실리지 않으므로 복원 창은 폴백(그 밤의 시작 역할)에서 다시 시작하고, 다음 `night_turn_changed`부터 정상적으로 따라붙는다 — 이 값은 행동 패널의 턴 게이트가 이미 쓰고 있는 값과 정확히 같아서 한 창 안에서 연출과 판정이 어긋나지 않는다.

4. 훅 상단 주석을 갱신한다: 릴의 **구성**은 여전히 생사를 보지 않고, **전진**만 canonical 턴을 상한으로 따른다는 두 축의 분리를 명시한다.

### 3.3 `frontend/src/domains/game/ingame/constants/nightTurn/ingameNightTurnAnnouncement.js` (MODIFY — 주석만)

`:35-43` `INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS`의 "이 리듬은 판정과 동기화하지 않는다"와 파일 상단 `:13`의 "그 순서를 밟는 리듬만 프런트의 고정 타이머가 만든다"는 이제 사실이 아니다. "칸 하나의 최소 노출 시간이며, 커서는 canonical 턴을 상한으로만 전진한다"로 고친다. 값·함수는 무변경.

### 3.4 `frontend/src/domains/game/ingame/utils/selectInGameNightTurnRole.js` (MODIFY — 주석만)

`:5-8`의 "그 용도는 **판정**뿐이다 … 연출은 이 값을 쓰지 않는다"를 고친다: 연출 릴이 이 값을 **상한**으로 읽되 릴의 **구성원**으로는 절대 쓰지 않는다(그러면 죽은 역할 칸이 사라져 누출된다)는 구분을 명시. 로직 무변경.

### 3.5 backend — 변경 없음

`getEligibleNightActorUuids`·`computeCurrentNightTurnRole`·`checkNightTurnGate`·`prepareNightResolution`·`night_turn_changed` 방송 조건 전부 무변경(수정 금지 범위이자, 이미 올바른 제출 기반 진행이다). `e2e/**`도 손대지 않는다.

## 4. 테스트

### 4.1 `frontend/.../utils/__tests__/selectInGameNightTurnReel.test.js` (MODIFY)

기존 릴 구성 테스트는 그대로 두고 `computeInGameNightTurnReelBarrier` 케이스를 추가한다.

- `(["JOKER","DOCTOR","GUARD"], "JOKER") → 0`, `(…, "DOCTOR") → 1`, `(…, "GUARD") → 2`.
- 릴에 없는 역할·`null`·빈 문자열 → 마지막 칸(`2`).
- 빈 배열·비배열 입력 → `0`(throw 없음).

### 4.2 `frontend/.../hooks/__tests__/useInGameNightTurnAnnouncement.test.js` (MODIFY — 이번 회귀 방어의 핵심)

헬퍼 하나를 추가한다: `advanceCanonicalTurn(role)` = `useInGameStore.getState().applyNightTurnChanged({ gameId, phase:"NIGHT", dayIndex, nightTurnRole: role })` (정상 경로 액션만 사용, 훅 내부 상태 직접 조작 없음).

**추가하는 테스트**

1. **전원 생존 밤 — 제출 전에는 절대 넘어가지 않는다(이번 버그).** 전원 생존 구성에서 `tickReel(5)`를 해도 `statusRole === "JOKER"`, 문구는 "광대의 시간입니다"에서 움직이지 않는다. `advanceCanonicalTurn("DOCTOR")` 후 `tickReel(1)`에서 비로소 의사 칸이 뜨고, 다시 `tickReel(5)`로도 경호원으로 넘어가지 않는다.
2. **행동 역할 1명 사망 밤 — 그 칸은 연출 후 자동 진행.** 구성 `["JOKER","DOCTOR","GUARD"]`에서 광대 제출로 서버가 의사를 건너뛰어 `advanceCanonicalTurn("GUARD")`가 오면, `tickReel(1)`에 "의사의 시간입니다"가 한 장 뜨고 `tickReel(1)`에 "경호원의 시간입니다"로 넘어간 뒤 **거기서 멈춘다**(`tickReel(5)`로도 그대로).
3. **하이드레이션 이후에도 안내가 살아있다(3.2-2의 잠복 버그).** 스냅샷 복원 후 `advanceCanonicalTurn("DOCTOR")` → `tickReel(1)`에서 의사 카드가 실제로 뜬다.
4. 시신이 있는 밤의 마녀사냥꾼 칸은 canonical이 `WITCH_HUNTER`까지 온 뒤에만 재생된다(요구사항 3 유지).

**갱신하는 기존 테스트**(자유 전진을 전제하던 것들)

- "닫기는 릴 커서를 움직이지 않는다 — 다음 칸은 고정 리듬으로만 온다"(`:401`) → 닫기는 커서를 움직이지 않는다는 원래 주장을 유지하되, 다음 칸이 오려면 **canonical 턴이 먼저 넘어가야 한다**로 바꾼다.
- "경호원 보유자가 죽은 밤에도 릴은 광대→의사→경호원 순서로 재생된다"(`:312`) → `night_turn_changed`가 한 번도 오지 않았다는 전제를 뒤집어, 서버가 죽은 역할을 건너뛴 방송을 보내면 그 칸이 재생된다로 바꾼다(은폐 목적은 그대로 검증).
- "릴이 끝나면 상태바가 마지막 역할에 고정된다"(`:352`) → canonical을 마지막 역할까지 전진시킨 뒤 같은 것을 검증.
- "시신이 있는 밤에는 마녀사냥꾼 칸까지 재생된다"(`:442`) → canonical 전진을 함께 태운다.
- "스냅샷 복원은 릴의 마지막 칸에서 이어붙인다"(`:623`) → 복원 지점이 **canonical 상한**(스냅샷에 턴이 없으므로 시작 역할)이라는 새 계약으로 갱신하고, "지나간 안내를 몰아 재생하지 않는다"는 원래 계약은 그대로 유지한다.
- `hold` 관련 두 테스트(`:375`, `:468`)는 barrier와 무관하므로 그대로 통과한다.

### 4.3 `frontend/.../hooks/__tests__/useInGameOverlayStack.nightTurn.test.js` (MODIFY)

- `:314`의 `assert.doesNotMatch(controllerSource, /selectInGameNightTurnRole/)`는 이번 수정과 정면으로 충돌한다(이 단정이 회귀를 고정하고 있었다). **컨트롤러가 릴과 canonical 상한을 둘 다 읽는다**는 새 계약으로 뒤집는다: `assert.match(…, /selectInGameNightTurnReel/)` + `assert.match(…, /computeInGameNightTurnReelBarrier/)`. `getInGameNightTurnAnnouncements`(옛 로컬 큐 API) 부재 단정은 유지한다.
- "'밤이 되었습니다'를 닫기 전에는 릴이 시작하지도 전진하지도 않는다"(`:190`)의 마지막 구간 — 진입 연출을 닫은 뒤 한 tick에 `DOCTOR`가 되는 단정은, 이제 canonical(=`JOKER`)이 상한이므로 `JOKER` 유지로 바꾸고 `applyNightTurnChanged("DOCTOR")` 뒤에 전진하는 것으로 갱신한다. hold 계약 자체(대기 중 리듬이 흐르지 않음)는 그대로 검증한다.
- "역할 턴 안내를 닫아도 릴이 앞당겨지지 않는다"(`:231`)와 "안내는 아래 화면을 잠그지 않는다"(`:264`)는 무변경 통과.

### 4.4 무수정 PASS로 증명하는 것

- `backend/socket/__tests__/nightTurnProgression.test.js`, `backend/game-core/__tests__/gameSession.test.js` — 손대지 않고 통과(판정 경로 무변경).
- `frontend/.../utils/__tests__/selectInGameTimebarStatusMessage.test.js` / `.store.test.js` — 상태바는 `statusRole`을 그대로 받으므로 무변경 통과.
- `frontend/.../hooks/__tests__/useInGameActionPanel.nightTurn.test.js`, `useGameSessionSocketEvents.nightTurn.test.js`, `store/__tests__/applySessionSnapshot.test.js`, `pages/__tests__/InGamePage.productionSource.test.js` — 무변경 통과.

### 4.5 실행 명령

```
npm --prefix backend test
npm --prefix backend run test:game-core
npm --prefix frontend test
```
두 스위트 전체 PASS가 완료 조건이다.

## 5. 위험과 대응

| 위험 | 영향 | 대응 |
| --- | --- | --- |
| **릴의 마지막 칸이 죽은 역할이면 그 카드가 잘린다** (구성 `[JOKER,DOCTOR,GUARD]`에서 GUARD 전원 사망 → 의사가 제출하는 순간 서버가 즉시 판정→DAY) | 그 한 칸에 한해 직전 slice의 은폐가 되살아나지 않는다 | 완전히 막으려면 서버가 판정을 그 칸의 재생 시간만큼 미뤄야 하고, 이는 요구사항이 금지한 판정 로직·타이밍 변경이다. **중간 칸의 은폐는 그대로 보존**되고 요구사항 1·2·3은 전부 충족된다. 아래 6절에 명시적으로 남긴다 |
| 살아있는 역할이 제출한 뒤 다음 안내까지 2.6초 지연 | 체감 반응성 소폭 저하 | 의도된 균일 리듬이다 — 즉시 점프를 넣으면 죽은 역할 칸이 한 프레임에 지워져 은폐가 깨진다(2절) |
| 재접속 창의 상태바가 다음 방송까지 시작 역할을 가리킴 | 그 창만 문구가 뒤처짐 | 스냅샷에 canonical 턴이 없다는 기존 제약이며(`applySessionSnapshot.js`), 같은 창의 **행동 패널이 이미 같은 값을 쓰고 있으므로 연출과 판정이 서로 어긋나지는 않는다**. 다음 `night_turn_changed`에 자동 복구 |
| `cursor.hydrated`가 남아 이후 칸을 전부 baseline으로 삼킴 | 복원 창에 그 밤의 안내가 한 장도 안 뜸 | 3.2-2에서 전진 시 `hydrated:false`로 내리고 4.2-3 테스트로 고정 |
| canonical 역할이 릴에 없는 찰나 | 상한을 못 찾음 | 마지막 칸으로 폴백(진행 불능 없음). 4.1에서 고정 |
| barrier가 뒤로 움직이는 방송(`nightTurnRole: null`) | 커서가 상한보다 앞에 남음 | 커서는 뒤로 가지 않고 멈출 뿐이며, `reduce`의 `seen`이 같은 칸의 재오픈을 막는다 — 기존 계약 그대로 |

## 6. 명시적으로 하지 않는 것

- backend 전부(판정·게이트·방송·payload) 무변경. `getEligibleNightActorUuids`의 생존 필터·판정 로직은 한 글자도 건드리지 않는다.
- `e2e/**` 무변경.
- 릴의 **구성** 규칙 무변경 — 죽은 역할의 칸은 여전히 릴에서 빠지지 않고, 마녀사냥꾼의 시신 규칙도 그대로다.
- 행동 패널의 턴 게이트(`useInGameActionPanel`)·오버레이 우선순위(`useInGameOverlayStack`)·상태바 파생(`selectInGameTimebarStatusMessage`)·스냅샷 store 무변경.
- 밤의 마지막 칸이 죽은 역할일 때 서버 판정을 지연시켜 그 연출까지 재생하는 "턴 클럭": 판정 타이밍을 바꾸므로 이번 범위 밖이다(5절 1행). 필요하면 별도 슬라이스에서 서버 측 턴 클럭으로 다룬다.

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | frontend/src/domains/game/ingame/utils/selectInGameNightTurnReel.js |  | canonical 턴을 릴 커서 상한으로 환산하는 순수 함수 추가 |
| MODIFY | frontend/src/domains/game/ingame/hooks/useInGameNightTurnAnnouncement.js |  | 전진 타이머에 상한 적용·하이드레이션 지점 교정·hydrated 해제 |
| MODIFY | frontend/src/domains/game/ingame/utils/__tests__/selectInGameNightTurnReel.test.js |  | 상한 계산 규칙 검증 |
| MODIFY | frontend/src/domains/game/ingame/hooks/__tests__/useInGameNightTurnAnnouncement.test.js |  | 제출 전 비진행 회귀 테스트·죽은 역할 칸 자동 진행·복원 후 안내 |
| MODIFY | frontend/src/domains/game/ingame/hooks/__tests__/useInGameOverlayStack.nightTurn.test.js |  | 컨트롤러 소스 계약 갱신·진입 연출 이후 리듬 검증 갱신 |
| MODIFY | frontend/src/domains/game/ingame/constants/nightTurn/ingameNightTurnAnnouncement.js |  | 리듬 주석을 상한 기반으로 갱신(동작 무변경) |
| MODIFY | frontend/src/domains/game/ingame/utils/selectInGameNightTurnRole.js |  | 연출이 이 값을 상한으로만 쓴다는 주석 명시(동작 무변경) |
| REFERENCE | frontend/src/domains/game/ingame/store/ingameStore.js |  | applyNightTurnChanged가 상한의 유일한 입력 |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useInGameActionPanel.js |  | 판정 턴 게이트 무변경 확인 |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useInGameOverlayStack.js |  | hold 우선순위 무변경 확인 |
| REFERENCE | frontend/src/domains/game/ingame/utils/reduceInGameNightTurnAnnouncement.js |  | 표시 상태 기계·hydrated 규칙 재사용 |
| REFERENCE | frontend/src/domains/game/ingame/utils/selectInGameTimebarStatusMessage.js |  | 상태바가 statusRole을 그대로 받는 경로 확인 |
| REFERENCE | frontend/src/domains/game/ingame/pages/InGamePage.jsx |  | 배선 무변경 확인 |
| REFERENCE | frontend/src/domains/game/ingame/store/applySessionSnapshot.js |  | 스냅샷에 canonical 턴이 없다는 제약 근거 |
| REFERENCE | backend/socket/gameSession.js |  | 제출 기반 진행·방송이 무변경임을 확인 |
| REFERENCE | backend/game-core/gameSession.js |  | computeCurrentNightTurnRole 생존 필터 무변경 확인 |
| REFERENCE | backend/socket/__tests__/nightTurnProgression.test.js |  | 무수정 PASS로 판정 회귀 없음 증명 |
