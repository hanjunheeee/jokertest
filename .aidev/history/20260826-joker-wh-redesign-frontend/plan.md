# 마녀사냥꾼 리디자인 — 사망자 대상 UI (frontend) 구현 계획

## 0. 확인한 현재 상태 (실제 코드 기준)

**backend(직전 slice, 수정 금지)의 canonical 규칙**
- `backend/game-core/gameSession.js:26` — `WITCH_HUNTER: { team:'CITIZEN', nightActionMinDayIndex: 0 }` → **day 하한은 이미 0으로 내려갔다.**
- `:925 isEligibleForNightAction` — `dayIndex >= minDayIndex` **그리고** `role==='WITCH_HUNTER'`면 `hasAnyDeadPlayer(session)`. 즉 "둘째 날부터"가 아니라 "시신이 있는 밤에만".
- `:1066` — `actor.role==='WITCH_HUNTER' && targetPlayer.alive===true` → `INVALID_TARGET`. 대상은 시신뿐.
- `:1085 getLivingNightTurnActorUuids` → eligible 아니면 빈 배열 → `computeCurrentNightTurnRole`이 건너뜀 → `night_turn_changed`에 WITCH_HUNTER가 아예 등장하지 않음.

**frontend의 현재 어긋난 지점**
1. `constants/actions/ingameActionPanel.js:61-66` — `NIGHT_ACTION_MIN_DAY_INDEX = { …, WITCH_HUNTER: 1 }`. backend가 0으로 내린 값의 **낡은 UX 사본**이다.
2. `utils/buildNightActionTargets.js:23-29` — 모든 역할에 대해 동일한 항목을 만들고 `selectable: !player.isAlly`만 계산한다. "생존자만 선택 가능"은 이 파일이 아니라 **picker가** 강제한다.
3. `components/actions/InGameTargetPicker.jsx:59` — `disabled={disabled || !player.alive || !player.connected || player.selectable === false}`. **여기 하드코딩된 `!player.alive`가 사망자 선택을 막는 유일한 지점**이다.
4. `constants/roleReveal/ingameRoleRevealData.js:28` — `"둘째 날 밤부터 한 명을 지목해 광대인지 확인할 수 있습니다."`

**중요한 실행 환경 제약(설계를 강제하는 사실)**
- frontend 테스트 러너는 `node --experimental-test-module-mocks --test src/**/__tests__/*.test.js`뿐이고 **JSX 로더가 없다.** `.jsx`는 import조차 불가하며, 그래서 picker 검증은 이 저장소에서 이미 **raw source 대조**(`InGameActionPanel.presentation.test.js:80`, `InGameActionPanel.visualPolish.test.js:75`)로 굳어져 있다. 두 파일 모두 `:59`의 disabled 식을 **정규식으로 문자 단위 고정**한다 → picker를 고치면 두 테스트를 함께 갱신해야 한다.
- 훅 레벨 DOM 렌더는 가능하다: `hooks/__tests__/useInGameActionPanel.test.js:399 renderActionPanelProbe(contextValue)`가 jsdom + `React.createElement`로 실제 훅을 돌려 `nightActionTargets`를 그대로 꺼내 준다.

## 1. 설계 결정

### 결정 A — `selectable`을 "선택 가능 여부의 단일 출처"로 만들고, picker에서 `!player.alive`를 뺀다

사망자를 선택 가능하게 만들 방법은 picker의 `!player.alive` 항을 없애는 것뿐이다(다른 어떤 필드로도 그 항을 우회할 수 없고, `alive`를 거짓말로 채우면 카드의 "생존/사망" 상태 표시가 틀어진다). 대신 생존 판정을 **빌더로 내린다**:

- `InGameTargetPicker.jsx`: `disabled={disabled || !player.connected || player.selectable === false}`
- `buildNightActionTargets`: `selectable: !player.isAlly && (deadTargetsOnly ? !alive : alive)`

**다른 역할 턴은 관측 가능한 UI가 완전히 불변이다.** JOKER/DOCTOR/GUARD 목록에서 사망자는 예전엔 `alive:false`로, 이제는 `selectable:false`로 잠긴다 — 같은 버튼이 같은 `disabled`를 갖는다. `buildDayVoteTargets`(DAY 투표)는 애초에 사망자를 `filter`로 제거하고 `alive:true`만 만들므로(`buildDayVoteTargets.js:23-28`) `!player.alive` 항이 하는 일이 없었다 → 그 파일은 손대지 않는다. `alive`는 이제 순수 표시용(상태 dot·"생존/사망" 라벨)으로 남는다.

### 결정 B — `NIGHT_ACTION_MIN_DAY_INDEX.WITCH_HUNTER`는 **삭제가 아니라 `0`으로** 내린다

키 자체를 지우면 `isNightActionEligible`이 `undefined`를 만나 `getInGameNightActionType("WITCH_HUNTER", …) === null`이 되어 **마녀사냥꾼이 어떤 밤에도 행동할 수 없게 된다**(요구와 정반대). 이 표는 backend `ROLE_DEFINITIONS.nightActionMinDayIndex`의 UX 사본이고 그 필드는 여전히 존재하며 값만 0이다 — 사본도 값만 0으로 맞춘다. 요구서의 "day0 차단 사본 제거"는 **차단 효과의 제거**이며, 이로써 프런트에는 마녀사냥꾼에 대한 dayIndex 조건이 하나도 남지 않는다.

"사망자가 없는 밤"은 프런트가 판단하지 않는다(프런트는 roster의 status로 알 수 있지만, **판단 주체를 늘리지 않는다**). 턴 표시·안내는 지금처럼 `selectInGameNightTurnRole` → canonical `nightTurnRole`(`night_turn_changed`) 또는 그 밤의 시작 턴 파생만 따르고, backend가 그 밤에 WITCH_HUNTER 턴을 만들지 않으므로 안내는 자연히 뜨지 않는다.

### 결정 C — 역할 규칙은 `ingameActionPanel.js`에 형제 함수로 둔다

`isSelfTargetAllowedForNightAction(role)`(`:95`)과 정확히 같은 관례로 `isDeadTargetOnlyNightActionRole(role)`을 새로 export하고, `useInGameActionPanel`이 두 함수를 나란히 호출해 빌더 옵션을 만든다. 역할 이름 리터럴이 유틸(`buildNightActionTargets`)로 새지 않고, 상수 테스트 한 곳에서 잠긴다.

### 결정 D — 조사 결과 오버레이 문구는 **한 글자도 건드리지 않는다**

`reduceInGameNightPrivateResult.js:49`가 이미 `` `${nickname} 님의 역할은 ${display.name}입니다` ``를 만들고 `display.name`은 `"마녀사냥꾼"` 그대로다(이번에 바꾸는 건 `description`뿐). 요구 4는 **변경 없음이 곧 충족**이며, 회귀 방지는 기존 `InGameNightPrivateResultOverlay.test.js:68,81`이 이미 잡고 있다.

### 결정 E — 역할 설명 문구

`description: "죽은 사람을 지목해 그 직업을 알아냅니다."` — 요구서 인용문 그대로에, 나머지 네 역할 설명과 동일하게 마침표만 붙인다(요구서 문자열은 이 값의 부분문자열이다).

## 2. 파일별 변경 내용

### 2.1 프로덕션

**`constants/actions/ingameActionPanel.js`**
- `:65` `WITCH_HUNTER: 1` → `WITCH_HUNTER: 0`.
- `:58-60`, `:73-74` 주석에서 "day0 WITCH_HUNTER" 차단 서술 삭제 → "네 역할 모두 첫 밤부터 하한을 만족한다. 마녀사냥꾼이 그 밤에 실제로 행동 가능한지(시신 존재)는 backend `isEligibleForNightAction`만이 판정하며, 프런트는 canonical night turn만 따른다"로 교체. `getInGameNightActionType`의 "행동 불가(CITIZEN 전체·day0 WITCH_HUNTER)" 문구도 "CITIZEN"만 남긴다.
- **새 export 추가**(파일 단위 MODIFY 사유):
  ```js
  // 사망자만 대상으로 지정할 수 있는 역할입니다. WITCH_HUNTER(확인)만 해당합니다 — 서버
  // submitNightAction이 살아있는 대상을 INVALID_TARGET으로 거부하는 규칙의 UX 사본이며,
  // isSelfTargetAllowedForNightAction과 동일하게 최종 권위자는 항상 서버입니다.
  export function isDeadTargetOnlyNightActionRole(role) {
    return role === "WITCH_HUNTER"
  }
  ```

**`utils/buildNightActionTargets.js`** (symbol `buildNightActionTargets`)
- 시그니처: `(players, { localPlayerId, selfTargetAllowed, deadTargetsOnly = false } = {})`.
- map 본문에서 `alive`를 한 번만 계산해 `alive`와 `selectable` 양쪽에 쓴다:
  ```js
  .map((player) => {
    const alive = player.status !== INGAME_PLAYER_STATUS.DEAD
    return {
      id: player.id,
      name: player.isAlly ? `${player.nickname} · 동료 JOKER` : player.nickname,
      alive,
      connected: player.status !== INGAME_PLAYER_STATUS.DISCONNECTED,
      selectable: !player.isAlly && (deadTargetsOnly ? !alive : alive),
    }
  })
  ```
- 반환 키 5개(`id/name/alive/connected/selectable`)와 순서·필터 정책(본인만 제거, 동료는 보이되 선택 불가)은 그대로. JSDoc에 "생존/사망 기준 선택 가능 여부는 이 함수가 소유하고 picker는 `selectable`/`connected`만 본다", "`deadTargetsOnly`는 마녀사냥꾼 전용 — 생존자를 목록에서 지우지 않고 선택만 잠근다"를 명시.
- 목록에서 생존자를 **제거하지 않는 이유**: 사망자가 아직 없는 밤에는 목록이 통째로 비어 "패널이 고장난 것처럼" 보인다. 동료 JOKER를 "보이되 선택 불가"로 두는 기존 관례와 같은 선택이다.

**`hooks/useInGameActionPanel.js`** — `isDeadTargetOnlyNightActionRole`을 import에 추가(`:3-7`)하고 `:122-129`의 `useMemo`에 `deadTargetsOnly: isDeadTargetOnlyNightActionRole(myRole)`를 넘긴다(의존성 배열은 `myRole`을 이미 포함해 그대로 둔다). ⚠ 이 파일은 기존 주석 상당수가 이미 깨진 인코딩으로 저장돼 있다 — **파일 전체 재작성 금지**, 해당 두 지점만 국소 편집한다.

**`components/actions/InGameTargetPicker.jsx`** — `:59`를 `disabled={disabled || !player.connected || player.selectable === false}`로. `@param players` JSDoc에 "선택 가능 여부는 빌더가 `selectable`로 확정해 넘긴다(생존/사망 기준 포함) — 이 컴포넌트는 `alive`를 표시(상태 dot·라벨)에만 쓴다"를 추가. 나머지(아바타·상태 dot·E2E 속성·클래스)는 전부 불변.

**`constants/roleReveal/ingameRoleRevealData.js`** — `:28` description → `"죽은 사람을 지목해 그 직업을 알아냅니다."` (`name`/`teamLabel` 및 다른 네 역할은 불변).

**주석만 갱신(동작 변화 없음)** — 제거된 규칙을 근거로 남아 있는 서술을 고치지 않으면 다음 독자가 존재하지 않는 규칙을 사실로 읽는다:
- `constants/nightTurn/ingameNightTurnAnnouncement.js:10-12` — "행동 자체가 불가능한 역할 턴(day 0의 마녀사냥꾼)" → "밤 행동이 없는 역할(CITIZEN). 마녀사냥꾼은 시신이 없는 밤에 backend가 턴을 만들지 않아 애초에 canonical 턴으로 오지 않는다".
- `utils/selectInGameNightTurnRole.js:15-16`, `utils/selectInGameTimebarStatusMessage.js:25`, `hooks/useInGameNightTurnAnnouncement.js:35` — 같은 취지로 "(day 0의 마녀사냥꾼)" 예시 교체.

### 2.2 테스트

**`utils/__tests__/buildNightActionTargets.test.js`** (요구 검증 ①의 단위 축)
- `deadTargetsOnly:true`: 사망자 → `selectable:true`, 생존자 → `selectable:false`, 목록 길이·순서는 `deadTargetsOnly:false`와 동일.
- `deadTargetsOnly:true` + `isAlly:true`인 사망자 → `selectable:false`(동료 규칙이 사망 규칙보다 우선).
- `deadTargetsOnly:true` + DISCONNECTED → `alive:true`이므로 `selectable:false`, `connected:false`.
- 기본값 회귀: 옵션을 안 주면 사망자 `selectable:false`, 생존자 `true`; 반환 키 집합은 여전히 5개(`:71`의 기존 단언이 그대로 통과).

**`constants/actions/__tests__/ingameActionPanel.test.js`**
- `:18` `["WITCH_HUNTER", 0, null]` → `["WITCH_HUNTER", 0, "CONFIRM"]`. 상단 주석의 backend 대조 대상도 갱신(`ROLE_DEFINITIONS.nightActionMinDayIndex`가 네 역할 모두 0).
- `isDeadTargetOnlyNightActionRole`: WITCH_HUNTER만 true, JOKER/DOCTOR/GUARD/CITIZEN·undefined는 false (`isSelfTargetAllowedForNightAction` 테스트와 짝을 이루게).

**`hooks/__tests__/useInGameActionPanel.test.js`** (요구 검증 ①의 통합/렌더 축)
`renderActionPanelProbe`로 `{phase:"NIGHT", dayIndex:1, self:{role}, players:[], events:[]}` + 생존/사망이 섞인 세션 참가자 목록을 넣고 `captured.nightActionTargets`를 단언:
- `role:"WITCH_HUNTER"` → 사망자만 `selectable:true`, 생존자 전원 `selectable:false`, 목록 구성원은 (본인 제외) 그대로.
- `role:"GUARD"`(타 역할 불변 대조군) → 생존자만 `selectable:true`, 사망자 `false`.
- `role:"DOCTOR"` → `selfTargetAllowed` 경로가 그대로여서 본인이 목록에 남는다.
- 참고: 이 probe는 실제 `socketClient`를 쓰지만 기존 테스트들이 이미 `getSocket()` 없는 상태로 DAY/ENDED에서 돌고 있고, NIGHT 경로도 추가 소켓 요구가 없다(`nightActionControlsEnabled`가 false가 될 뿐 `nightActionTargets` 계산에는 영향이 없다).

**`components/actions/__tests__/InGameActionPanel.presentation.test.js:83-86` / `InGameActionPanel.visualPolish.test.js:84`** — disabled 정규식을 `/disabled=\{disabled \|\| !player\.connected \|\| player\.selectable === false\}/`로 교체. presentation 쪽에는 "picker source에 `!player.alive` 게이트가 남아 있지 않다"(= `player.alive`가 `disabled` 식에 등장하지 않는다)는 단언을 한 줄 추가해 회귀를 못 박는다.

**day0 차단 사본 제거로 전제가 사라지는 기존 테스트 3건**
- `hooks/__tests__/useInGameNightTurnAnnouncement.test.js:345-360` — "건너뛰는 역할 턴" 예시를 `nightTurnRole:"CITIZEN"`(밤 행동이 없는 역할)로 교체해 의도를 유지하고, `dayIndex:0 + WITCH_HUNTER`는 **뜬다**는 양성 케이스로 뒤집어 요구 ②를 고정한다. (`applyCanonicalState`는 `setGamePayload`를 쓰므로 파서 화이트리스트를 타지 않아 CITIZEN을 넣을 수 있다.)
- `utils/__tests__/selectInGameTimebarStatusMessage.test.js:51-56` — 동일하게 "day0 마녀사냥꾼 → null"을 "day0 마녀사냥꾼 → `마녀사냥꾼의 시간입니다`"로 뒤집는다. CITIZEN·무효 dayIndex의 음성 케이스는 `:58-66`에 이미 있어 커버리지 손실이 없다.
- `utils/__tests__/selectInGameTimebarStatusMessage.store.test.js:103-119` — store 경로는 `parseNightTurnChangedPayload`(`:1`)가 CITIZEN을 거부하므로 음성 예시를 만들 수 없다. 따라서 이 테스트는 "day0 마녀사냥꾼 턴 방송에도 문구가 뜬다"는 양성 케이스로 재작성한다(테스트 이름도 함께 교체).

**`utils/__tests__/getInGameRoleRevealInfo.test.js`** (요구 검증 ②의 문구 축) — WITCH_HUNTER의 `description`이 정확히 `"죽은 사람을 지목해 그 직업을 알아냅니다."`이고 `"둘째 날 밤부터"`를 포함하지 않는다는 단언 추가. 다른 네 역할 description 불변 단언도 함께.

## 3. 검증 절차

1. `npm --prefix frontend test` — 전체 PASS. 위 3건(§2.2 마지막 묶음)과 picker 정규식 2건이 갱신 없이는 실패하는 것이 이번 변경의 정확한 blast radius다.
2. `npm --prefix frontend run build` — PASS.
3. `npm --prefix frontend run lint`, `npm --prefix frontend run check:utf8` — 인코딩 회귀(특히 `useInGameActionPanel.js`) 확인.
4. `npm --prefix backend run test:game-core` — backend 무변경 증명(참고 실행).

## 4. 위험과 대응

**(중대·범위 밖) `e2e/lib/__tests__/scenarioPlan.test.js:87-90`이 깨진다.**
`witchHunterCanActOn(0) === false`는 `getInGameNightActionType("WITCH_HUNTER", 0)`에 위임돼 있어(`e2e/lib/scenarioPlan.js:101`) 이번 변경으로 `true`가 된다. **e2e/\*\*는 수정 금지**이므로 이 실패는 그대로 남긴다. 요구서의 검증 범위는 "frontend 전체 테스트 + build"이고, e2e helper 테스트는 별도 스크립트(`npm run test:e2e-helpers`)라 frontend 스위트에 섞이지 않는다. 직전 backend slice의 plan(§7)도 e2e 드리프트를 의도된 잔여물로 남겼다 — **후속 e2e slice에서 `scenarioPlan.js`의 마녀사냥꾼 대상 선정(생존 좌석 순환 `witchHunterTargetSeat`)까지 함께 고쳐야 한다**(생존자 지목은 이제 서버가 `INVALID_TARGET`으로 거부하므로 재생 시나리오도 실패한다). `e2e/README.md:121-127`의 서술도 같은 slice에서 갱신 대상이다.

**공유 컴포넌트를 건드리는 위험.** `InGameTargetPicker`는 DAY 투표와 공유된다. `buildDayVoteTargets`가 사망자를 이미 목록에서 제거하고 `alive:true`만 만들기 때문에 `!player.alive` 제거는 DAY에서 no-op이다. 이를 presentation 테스트의 정규식 + 기존 `buildDayVoteTargets.test.js`가 함께 지킨다. 만약 향후 DAY 목록이 사망자를 포함하도록 바뀌면 `buildDayVoteTargets`도 `selectable`을 명시해야 한다 — 그 계약을 picker JSDoc에 남긴다.

**`selectable`의 관측값 변화.** 비-WITCH_HUNTER 목록에서 사망자의 `selectable`이 `true→false`로 바뀐다. 렌더 결과(disabled)는 동일하고, 기존 `buildNightActionTargets.test.js`에는 사망자 `selectable`을 단언하는 테스트가 없어(`:40-47`은 `alive`/`connected`만 본다) 깨지는 기존 단언은 없다.

**시신이 없는 밤의 마녀사냥꾼 화면.** 프런트가 dayIndex로도, 시신 유무로도 막지 않으므로 `nightActionType`은 항상 `"CONFIRM"`이고 "이 밤에는 행동할 수 없습니다." 분기는 마녀사냥꾼에게 더 이상 나타나지 않는다. 대신 그 밤엔 canonical 턴이 오지 않아 `nightActionControlsEnabled === false`로 picker 전체가 잠기고, 사망자가 0명이면 선택 가능한 항목도 0개다 — 요구 ②가 명시한 "canonical night turn을 그대로 따른다"의 직접적 귀결이다.

**인코딩.** `useInGameActionPanel.js`에 이미 깨진 한글 주석이 있다. 편집 도구가 파일을 통째로 다시 쓰면 손상이 번질 수 있으므로 국소 편집 후 `check:utf8`로 확인한다.

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | frontend/src/domains/game/ingame/constants/actions/ingameActionPanel.js |  | WITCH_HUNTER 하한 1→0, day0 주석 정리, isDeadTargetOnlyNightActionRole 신설 |
| MODIFY | frontend/src/domains/game/ingame/utils/buildNightActionTargets.js | buildNightActionTargets | deadTargetsOnly 옵션과 생존/사망 기준 selectable 계산 |
| MODIFY | frontend/src/domains/game/ingame/hooks/useInGameActionPanel.js |  | 역할별 deadTargetsOnly를 빌더에 전달 |
| MODIFY | frontend/src/domains/game/ingame/components/actions/InGameTargetPicker.jsx |  | disabled에서 !player.alive 제거, selectable 위임 명시 |
| MODIFY | frontend/src/domains/game/ingame/constants/roleReveal/ingameRoleRevealData.js |  | 마녀사냥꾼 설명 문구 교체 |
| MODIFY | frontend/src/domains/game/ingame/constants/nightTurn/ingameNightTurnAnnouncement.js |  | day0 마녀사냥꾼 전제 주석 갱신 |
| MODIFY | frontend/src/domains/game/ingame/utils/selectInGameNightTurnRole.js |  | day0 마녀사냥꾼 예시 주석 갱신 |
| MODIFY | frontend/src/domains/game/ingame/utils/selectInGameTimebarStatusMessage.js |  | day0 마녀사냥꾼 예시 주석 갱신 |
| MODIFY | frontend/src/domains/game/ingame/hooks/useInGameNightTurnAnnouncement.js |  | day0 마녀사냥꾼 예시 주석 갱신 |
| MODIFY | frontend/src/domains/game/ingame/utils/__tests__/buildNightActionTargets.test.js |  | 사망자만 선택 가능 / 기본 경로 불변 단위 테스트 |
| MODIFY | frontend/src/domains/game/ingame/constants/actions/__tests__/ingameActionPanel.test.js |  | 자격표 WITCH_HUNTER day0 갱신, 신규 역할 규칙 테스트 |
| MODIFY | frontend/src/domains/game/ingame/hooks/__tests__/useInGameActionPanel.test.js |  | 훅 렌더로 역할별 nightActionTargets selectable 검증 |
| MODIFY | frontend/src/domains/game/ingame/components/actions/__tests__/InGameActionPanel.presentation.test.js |  | picker disabled 배선 정규식 갱신 및 alive 게이트 부재 고정 |
| MODIFY | frontend/src/domains/game/ingame/components/actions/__tests__/InGameActionPanel.visualPolish.test.js |  | picker disabled 배선 정규식 갱신 |
| MODIFY | frontend/src/domains/game/ingame/hooks/__tests__/useInGameNightTurnAnnouncement.test.js |  | 건너뛰는 턴 예시를 CITIZEN으로 교체, day0 WH 안내 양성화 |
| MODIFY | frontend/src/domains/game/ingame/utils/__tests__/selectInGameTimebarStatusMessage.test.js |  | day0 WH 문구 기대값 뒤집기 |
| MODIFY | frontend/src/domains/game/ingame/utils/__tests__/selectInGameTimebarStatusMessage.store.test.js |  | store 경로 day0 WH 문구 기대값 뒤집기 |
| MODIFY | frontend/src/domains/game/ingame/utils/__tests__/getInGameRoleRevealInfo.test.js |  | 마녀사냥꾼 설명 문구 정확 일치 고정 |
| REFERENCE | backend/game-core/gameSession.js |  | canonical 자격·대상 규칙 대조 원본 |
| REFERENCE | frontend/src/domains/game/ingame/components/actions/InGameActionPanel.jsx |  | 밤 행동 섹션의 picker 사용 방식 확인 |
| REFERENCE | frontend/src/domains/game/ingame/utils/buildDayVoteTargets.js |  | DAY 목록이 selectable 변경에 영향받지 않음을 확인 |
| REFERENCE | frontend/src/domains/game/ingame/utils/reduceInGameNightPrivateResult.js |  | 조사 결과 문구 재사용(변경 없음) 확인 |
| REFERENCE | e2e/lib/__tests__/scenarioPlan.test.js |  | 수정 금지 범위에서 깨지는 단언 확인 |
