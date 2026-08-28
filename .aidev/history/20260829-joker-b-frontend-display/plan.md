# joker-B · 프론트 표시·정보 전달 수정 — 구현 계획

베이스 커밋 `c3aa548` 기준으로 실제 코드를 읽고 확인한 사실만 담았다. 요구 4건을 순서대로 다룬다.

---

## 0. 현재 코드에서 확인한 사실 (계획의 근거)

**(1) 색상 배정**
- `frontend/.../utils/assignInGamePlayerThemeIndices.js:8` — `Math.random()` Fisher-Yates. 클라이언트마다 다른 순열이 나온다.
- 호출부는 `buildInGamePreviewPlayers.js:16` 하나뿐이고, 이 함수는 `useInGamePlayerSession.js:26`의 `useMemo` 안에서 `sourcePlayers` 참조가 바뀔 때마다 다시 호출된다. `InGamePlayerSessionProvider.jsx:17`이 `buildPlayerSessionSourceFromGameState`를 memo 없이 매 렌더 호출해 매번 새 배열을 만들므로, **지금은 같은 클라이언트 안에서도 렌더마다 색이 재추첨된다**.
- 서버 payload: `backend/game-core/gameSession.js:707`이 `players`를 `{ uuid, nickname }`만으로 만든다. 색상 정보는 아예 없다.
- `buildGameStartedPayload`는 **참가자 1명당 1회씩** 호출된다(`backend/socket/matchmaking.js:872`). 따라서 이 함수 안에서 `Math.random()`을 쓰면 뷰어마다 색이 갈린다 → 배정은 **session.id에서 결정적으로 유도**해야 "payload 한 곳만" 제약과 "모든 클라이언트 동일" 조건을 동시에 만족한다.
- 재접속 경로 주의: `store/applySessionSnapshot.js:195`가 `players`를 `{uuid,nickname,alive,isConnected}`로 **새로 조립**한다. 여기서 themeIndex를 이어받지 않으면 재접속 하이드레이션마다 색 정보가 사라진다(그 밖의 store 액션 — `applyNightResultAppliedPayload`/`applyTribunalResolvedPure` — 은 전부 `{...p}` 스프레드라 필드가 보존된다).

**(2) 개인 밤 결과**
- `useInGameResolveNight.js:107-113` `handleApplied`가 `invalidate()`를 부르고, `computeResolveNightInvalidatePatch`가 `nightActionResult: null`을 준다 → DAY 전이 순간 결과가 사라진다.
- 더 나아가 **dayIndex 폐기 기준 자체가 깨져 있다.** 서버는 `night_action_result.dayIndex = prepared.resolution.dayIndex`(commit 전 = 그 NIGHT의 dayIndex, `backend/socket/gameSession.js:759`)를, `night_result_applied.dayIndex`는 commit 후 +1된 값을 싣는다. 그런데 `:111`이 `appliedNightDayIndexRef`에 **DAY의 dayIndex(N+1)** 를 넣고, `:99`가 private result를 `payload.dayIndex <= ref`로 거른다. 다음 밤은 dayIndex가 그대로 N+1이므로(`applyDayVoteResolvedToPhase`의 TIE/ABSTAINED→NIGHT 전이는 dayIndex를 올리지 않는다) **둘째 밤부터의 개인 결과가 전부 폐기된다.** `:32-35`의 주석이 선언한 계약("이미 DAY로 적용된 가장 최근 NIGHT의 dayIndex")과 코드가 어긋나 있다.
- 표시 위치: `InGameActionPanel.jsx:323-333`의 개인 결과 문단은 `:267`의 `phase === "NIGHT"` 블록 **안**에 있다. 상태만 보존해서는 "다음 낮에 화면에서 확인"이 성립하지 않으므로 렌더 위치도 함께 옮겨야 한다.

**(3) 사망자 밤 채팅**
- `inGameChatChannel.js:12` `DEAD_CHAT_PHASES = {NIGHT, DAY, TRIBUNAL}` → 사망자가 밤에 전송 가능.
- `:41-45` 보기 채널은 사망자면 phase와 무관하게 항상 `DEAD` → 밤에도 열람 가능.
- 열람 차단은 이 한 함수로 끝난다: `shouldAcceptGameChatMessage.js:28`이 `currentViewChannel` falsy면 수신을 버리고, `gameChatReducer.js:202`의 `selectGameChatView`가 알 수 없는 채널이면 `MASKED_VIEW`(빈 목록·빈 초안)를 준다. `setDraft`도 `isKnownChannel` 게이트에 걸려 무시된다.
- 광대 특례: `isJokerNightChatEligible.js:17`이 `selectInGameSelfAlive(state) === true`를 요구해 **죽은 광대는 지금 JOKER 채널이 닫힌다**. 요구 3의 확정 스펙(죽은 광대는 JOKER 열람·전송 가능)을 만족하려면 이 생존 조건을 빼야 한다. 서버(`backend/game-core/gameSession.js:2039`, `:215`)는 아직 죽은 JOKER를 막고 있다 — 아래 "위험" 참조.

**(4) 명칭**
- `경비대`: `setup/constants/roleComposition.js:22`(라벨), `:30`(주석), `ingame/constants/roleReveal/ingameRoleRevealData.js:21`(라벨).
- `경호원`: `ingame/constants/nightTurn/ingameNightTurnAnnouncement.js:24`(사용자 노출 문구), `:7`(주석), `hooks/useInGameOverlayStack.js:14`(주석), 테스트 4곳(`useInGameNightTurnAnnouncement.test.js:234,293,306,338`, `useInGameOverlayStack.nightTurn.test.js:206`).
- 이미 "경비원"인 곳(`shared/constants/playerPortraitAssets.js`의 에셋 파일명, `result/constants/gameResultPreviewData.js`, 백엔드 주석)은 건드리지 않는다.

---

## 1. 요구 1 — 플레이어 색상 배정을 백엔드로 이관

### 1-1. `backend/game-core/gameSession.js`
- 상수 추가: `const PLAYER_THEME_PALETTE_SIZE = 10`. 주석으로 프런트 `INGAME_PLAYER_THEME_PALETTE`(10색)와 수동 동기화 대상임을 명시 — 이 저장소의 기존 관례(`ROLE_TEAMS` 복제 주석)와 같은 형식. `MAX_SUPPORTED_PLAYERS(:46) === 10 === 팔레트 크기`이므로 한 세션 안에서 색은 항상 서로 다르다.
- 순수 헬퍼 신설 `buildPlayerThemeIndices(session)`:
  - `session.id` 문자열을 FNV-1a 32bit로 접어 seed를 만들고, mulberry32류 결정적 PRNG로 `[0..PALETTE_SIZE-1]`을 Fisher-Yates 셔플해 돌려준다.
  - `Math.random()`을 쓰지 않는 이유를 주석으로 남긴다: 이 함수는 참가자 수만큼 반복 호출되는 payload 빌더 안에서 불리므로, 뷰어마다 다른 값이 나오면 요구가 깨진다. session.id는 `crypto.randomUUID()`(`:377`)라 게임마다 사실상 무작위이고, 같은 게임 안에서는 모든 뷰어가 같은 순열을 얻는다.
- `buildGameStartedPayload`(`:699`): `players` 매핑을 `({ uuid, nickname }, index) => ({ uuid, nickname, themeIndex: order[index % PLAYER_THEME_PALETTE_SIZE] })`로 바꾼다. `session.players`는 Map이라 순회 순서가 모든 뷰어에게 동일하다. `self`와 그 외 필드는 손대지 않는다(role 비밀 계약 불변).
- **다른 payload는 건드리지 않는다** — `buildSessionSnapshot`/`buildNightResultAppliedPayload` 등은 그대로.

### 1-2. `backend/game-core/__tests__/gameSession.test.js`
- 기존 키 계약 테스트 2곳을 새 계약으로 갱신: `:3701`, `:4601`의 `['nickname','uuid']` → `['nickname','themeIndex','uuid']`.
- 신규 테스트:
  - 같은 세션에서 서로 다른 뷰어로 만든 payload의 `uuid→themeIndex` 매핑이 완전히 동일하다.
  - 10인 세션의 themeIndex 집합이 `0..9`의 순열이다(중복 없음).
  - gameIdFn을 다른 문자열로 고정한 두 세션의 배정 순서가 서로 다르다(무작위성의 최소 증거).
  - themeIndex가 정수이고 `0 <= i < 10`이다.

### 1-3. 프런트 배선
- **`utils/assignInGamePlayerThemeIndices.js` 삭제.** import는 `buildInGamePreviewPlayers.js` 한 곳뿐임을 확인했다(테스트 없음).
- `utils/buildInGamePreviewPlayers.js`: `themeIndices` 호출을 제거하고 `const themeIndex = index % INGAME_PLAYER_THEME_PALETTE_SIZE`로 결정적 배정. 프리뷰(더미)는 서버 값이 없을 때만 쓰이는 fallback이므로 무작위일 이유가 없다는 점을 주석에 남긴다. 파일 상단 JSDoc의 "매 호출 시 팔레트 셔플" 문구도 함께 고친다.
- `utils/buildPlayerSessionSourceFromGameState.js`: `players[]` 루프에 `themeIndex` 검증을 추가한다(`Number.isInteger` && `0 <= v < INGAME_PLAYER_THEME_PALETTE_SIZE`, 아니면 기존 규칙대로 `EMPTY_RESULT`). 이 함수가 실제로 쓰는 필드가 됐으므로 이 파일이 선언한 "검증 대상 필드" 계약에 포함되는 게 맞다. `sourcePlayers` 항목에 `themeIndex`를 싣는다(모든 참가자 공통 필드 — role/team처럼 조건부가 아니다).
- `utils/mergeSourcePlayerWithPreview.js`: `Object.hasOwn(player, "themeIndex")`일 때만 `themeIndex`와 `theme: resolveInGamePlayerTheme(player.themeIndex)`를 preview 값 위에 덮어쓴다(role/team/isAlly와 동일한 조건부 복사 관례). 서버 값이 없는 프리뷰 경로는 preview의 값을 그대로 유지한다.
- `store/applySessionSnapshot.js`: `nextPlayers` 조립(`:195`)에서 `current.state.players`의 uuid→themeIndex를 이어받는다. roster uuid 집합 일치는 `:64-68`에서 이미 강제되므로 누락이 생길 수 없고, 이전 항목에 유효한 정수가 없으면 키를 만들지 않는다(그러면 위 검증이 fail-closed로 프리뷰 fallback). 스냅샷 payload는 여전히 색상을 싣지 않는다는 사실과 그래서 여기서 이어받는다는 이유를 주석으로 남긴다.
- `store/ingameStore.js`: `setGamePayload`의 payload 계약 주석(`:27-29`)에 "themeIndex는 백엔드가 배정해 내려주므로 정규화 없이 그대로 통과시킨다"를 추가한다(코드는 `{...p, alive:true}`로 이미 통과시키므로 동작 변경 없음 — 계약 문서화만).

### 1-4. 프런트 테스트
- `utils/__tests__/buildPlayerSessionSourceFromGameState.test.js`: fixture에 `themeIndex` 추가, 기대 객체에 `themeIndex` 반영, themeIndex 누락/범위 밖/비정수면 `EMPTY_RESULT`라는 케이스 추가.
- `utils/__tests__/mergeSourcePlayerWithPreview.test.js`: 서버 themeIndex가 preview를 덮어쓰고 `theme.color`가 그 인덱스의 팔레트 색과 같다 / themeIndex 키가 없으면 preview 값이 유지된다.
- `store/__tests__/applySessionSnapshot.test.js`: 기존 `:82` deepEqual은 fixture에 themeIndex가 없으면 그대로 통과한다(조건부 이어받기). themeIndex를 가진 current로 스냅샷을 적용하면 색이 보존된다는 테스트를 추가한다.
- **신규** `utils/__tests__/buildInGamePreviewPlayers.test.js`: 같은 count로 두 번 호출한 결과의 themeIndex 배열이 동일하다(무작위 셔플 제거의 회귀 방지).

---

## 2. 요구 2 — 개인 밤 결과가 낮 전환에서 지워지지 않게

### 2-1. **신규** `utils/computeResolveNightDayTransitionPatch.js`
`computeResolveNightInvalidatePatch`와 같은 형태(mounted가 아니면 `null`)지만 `{ status: "idle", error: null }`만 돌려준다 — `nightActionResult`는 이 패치의 대상이 아니다. 두 패치가 왜 갈라지는지(게임/소켓 전환은 결과까지 폐기, 낮 전이는 잠금만 해제) 주석으로 남긴다. 기존 `computeResolveNightInvalidatePatch.js`는 그대로 둔다(disconnect·gameId 변경 경로가 계속 쓴다).

### 2-2. `hooks/useInGameResolveNight.js`
- `invalidateForDayTransition()`을 `invalidate()` 옆에 추가: `versionRef.current += 1`, `ackingRef.current = false` 후 위 패치로 `status`/`error`만 되돌린다.
- `handleApplied`(`:107`)가 `invalidate()` 대신 이 함수를 호출한다.
- **dayIndex 기준 정정**: `handleApplied`에서 `const resolvedNightDayIndex = payload.dayIndex - 1`을 계산해 단조 비교와 ref 갱신에 모두 쓴다. 그러면 ref는 주석(`:32-35`)이 원래 선언한 대로 "이미 DAY로 적용된 가장 최근 **NIGHT**의 dayIndex"가 되고, `handleResult`의 `payload.dayIndex <= ref` 폐기 규칙이 의도대로 동작한다 — 첫 밤(dayIndex 1) 결과는 그대로 받고, 적용 후 늦게 도착한 같은 밤의 중복은 계속 버리며, 둘째 밤(dayIndex 2) 결과는 더 이상 잘못 폐기되지 않는다.
- `:104-106`, `:93-99`의 주석을 새 규칙(NIGHT 기준 비교, 결과는 낮 동안 보존)으로 갱신한다.
- `phase !== "DAY"`(ENDED 포함) payload를 무시하는 기존 가드는 유지 — 종료 방송은 ref도 상태도 건드리지 않는다.

### 2-3. `components/actions/InGameActionPanel.jsx`
개인 결과 문단(`:323-333`)을 NIGHT 블록 밖으로 꺼내, `nightActionResult`가 있으면 phase와 무관하게 렌더되는 독립 섹션으로 옮긴다(NIGHT 섹션 바로 뒤). 어느 밤의 결과인지 알 수 있도록 `nightActionResult.dayIndex`를 라벨에 노출한다(`개인 결과(제 N일 밤)`), 본문에서 `gameId`/`dayIndex`를 걸러내는 기존 방식은 유지. 밤 턴 UI(오버레이·타이머·대상 선택)는 건드리지 않는다.

### 2-4. 테스트
- **신규** `utils/__tests__/computeResolveNightDayTransitionPatch.test.js`: mounted면 `{status:'idle', error:null}`이고 `nightActionResult` 키 자체가 없다 / mounted가 아니면 `null`.
- **신규** `hooks/__tests__/useInGameResolveNight.test.js`: `useInGameGameChatSession.test.js:1-57`의 jsdom + `mock.module("../../../../../shared/socket/socketClient.js")` 하네스를 그대로 따른다. 케이스:
  1. `night_action_result`(dayIndex 1) 수신 후 `night_result_applied`(DAY, dayIndex 2)가 와도 `nightActionResult`가 남고 `status`는 `idle`로 풀린다.
  2. 그 다음 밤의 `night_action_result`(dayIndex 2)가 반영된다(회귀 방지 — 현재 코드에서는 폐기된다).
  3. 이미 적용된 밤의 늦은 `night_action_result`(dayIndex 1)는 폐기된다.
  4. disconnect / gameId 변경에서는 `nightActionResult`가 여전히 `null`로 초기화된다.

---

## 3. 요구 3 — 사망자의 밤 채팅 차단 (죽은 광대 JOKER 채널만 예외)

### 3-1. `utils/inGameChatChannel.js`
- `DEAD_CHAT_PHASES`에서 `"NIGHT"`를 뺀다(`{DAY, TRIBUNAL}`) → 사망자는 밤에 전송 불가. 낮의 DEAD 전송 가능 여부는 이 슬라이스에서 바꾸지 않는다(S4).
- `resolveInGameChatViewChannel`: 사망자는 `phase === "NIGHT"`이면 `null`을 반환한다. 생존자 경로와 `alive === null` fail-closed는 그대로.
- 서버 `DEAD_CHAT_PHASES`(`backend/game-core/gameSession.js:106`)와 값이 갈리게 되므로, "밤 차단은 프런트 표시 계층이 먼저 적용하는 규칙이고 서버 라우팅은 이 슬라이스 범위 밖"임을 주석에 명시해 다음 슬라이스가 동기화 지점을 놓치지 않게 한다.
- 결과적으로 밤의 사망자는: 수신은 `shouldAcceptGameChatMessage`가 버리고, 화면은 `selectGameChatView`가 마스킹해 빈 목록이 되며, 입력·전송은 채널이 없어 no-op이 된다. 낮에 쌓인 DEAD 메시지는 reducer 상태에 남아 다음 낮에 다시 보인다(열람 차단은 밤 동안만).

### 3-2. `utils/isJokerNightChatEligible.js`
`selectInGameSelfAlive(state) === true` 요구를 `!== null`로 바꾼다 — NIGHT·JOKER 진영이면 생사와 무관하게 자격을 주되, 생존 여부를 알 수 없는 상태는 계속 fail-closed. 주석을 확정 스펙(죽은 광대만의 특례, 다른 직업에는 해당 없음)과 그 근거로 다시 쓴다. 이 한 함수가 `useInGameJokerChatSession`의 리스너 등록(`:60`)·전송(`:75`)과 `InGameChatShell.jsx:26`의 화면 선택을 동시에 지배하므로, 여기만 고치면 열람·전송·표시가 함께 열린다.

### 3-3. `components/chat/InGameChatShell.jsx`
파일 상단 주석의 "생존한 JOKER의 NIGHT이면" 문구를 새 규칙(생사와 무관한 JOKER의 NIGHT)으로 고친다. 채널 구조·컴포넌트 구성은 변경 없음(직업별 채널 추가 금지 — S4).

### 3-4. 테스트
- **신규** `utils/__tests__/inGameChatChannel.test.js`: 생존자 DAY→DAY/DAY, 생존자 NIGHT→view DAY·send null, 사망자 NIGHT→view null·send null, 사망자 DAY/TRIBUNAL→DEAD 유지, alive 미확정→둘 다 null.
- `utils/__tests__/selectOwnedGameChatContext.test.js`: `:29-30`의 "사망자 NIGHT → DEAD/DEAD" 기대를 `null/null`로 갱신(테스트 이름·주석도 함께).
- `utils/__tests__/isJokerNightChatEligible.test.js`: `:37-39`의 "사망한 JOKER는 false" 케이스를 "사망한 JOKER도 true(확정 특례)"로 뒤집고, alive 미확정 fail-closed 케이스(`:41-53`)는 그대로 유지하되 주석의 서버 근거 문장을 정정한다.

---

## 4. 요구 4 — GUARD 표기 "경비원" 통일

| 파일 | 변경 |
| --- | --- |
| `frontend/src/domains/game/setup/constants/roleComposition.js` | `:22` 라벨 `경비대`→`경비원`, `:30` 주석 |
| `frontend/src/domains/game/ingame/constants/roleReveal/ingameRoleRevealData.js` | `:21` `name` |
| `frontend/src/domains/game/ingame/constants/nightTurn/ingameNightTurnAnnouncement.js` | `:24` 안내 문구 `경호원의 시간입니다`→`경비원의 시간입니다`, `:7` 주석 |
| `frontend/src/domains/game/ingame/hooks/useInGameOverlayStack.js` | `:14` 주석 |
| `frontend/.../hooks/__tests__/useInGameNightTurnAnnouncement.test.js` | `:338` 기대 문자열(필수), `:234`·`:293`·`:306` 주석·테스트명 |
| `frontend/.../hooks/__tests__/useInGameOverlayStack.nightTurn.test.js` | `:206` 주석 |

`.aidev/history/**`(요구서·이전 플랜)는 파이프라인 기록물이라 대상에서 제외한다. 검증 grep도 `node_modules`와 `.aidev`를 제외하고 돌린다.

---

## 5. 검증

```
npm run test:game-core --prefix backend           # buildGameStartedPayload themeIndex 계약
node --test socket/__tests__/matchmaking.test.js  # (backend 디렉터리에서) game_started 전달 경로 회귀
npm test --prefix frontend                        # ingame utils/store/hooks 전체
npm run lint --prefix frontend
npm run check:utf8 --prefix frontend              # 한글 문자열을 고치므로 반드시
rg -n "경호원|경비대" --glob '!node_modules/**' --glob '!.aidev/**'   # 0건이어야 한다
rg -n "Math.random" frontend/src/domains/game/ingame                 # 0건이어야 한다
```

성공 조건 대조:
- 8.9/11.5 — 백엔드 테스트의 "뷰어별 payload 매핑 동일" + 프런트 `buildInGamePreviewPlayers` 결정성 테스트.
- 4.2.3/6.2 — `useInGameResolveNight.test.js` 케이스 1·2 + 패널 렌더 위치 이동.
- 7.4/7.6(프론트) — `inGameChatChannel.test.js` + `isJokerNightChatEligible.test.js` + `selectOwnedGameChatContext.test.js`.
- 5.6 — 위 rg 0건.

수동 확인(선택): `npm run dev`로 두 브라우저 세션을 붙여 같은 참가자 카드의 테두리·닉네임 색이 일치하는지, 경비원으로 조사 후 낮에 개인 결과 문단이 남는지, 사망자 클라이언트의 밤 채팅창이 비고 입력이 무시되는지 본다.

---

## 6. 위험과 판단

1. **죽은 광대 JOKER 채널이 프런트에서만 열린다.** 서버는 아직 `prepareJokerChatMessage`(`:2039`)와 `getChatRecipientUuids`(`:215`)에서 죽은 JOKER를 막는다. 요구는 이 항목을 "확정 스펙 · 7.4/7.6 **프론트 측**"으로 못박고 백엔드 변경을 game_started payload 한 곳으로 제한했으므로, 계획대로 프런트만 연다. 그 결과 죽은 광대는 입력창이 열리지만 전송 시 서버가 `NOT_ELIGIBLE`을 돌려주고 수신도 되지 않는다(오류 문구가 상태줄에 뜬다). 백엔드 대응은 후속 슬라이스 몫이며, `isJokerNightChatEligible.js` 주석에 이 불일치를 명시적으로 남긴다.
2. **themeIndex 검증을 fail-closed로 둔 대가.** 서버가 themeIndex를 빠뜨리면 보드 전체가 더미 프리뷰(닉네임 "플레이어 N")로 떨어진다. 이 파일의 기존 계약(검증 필드 하나라도 어긋나면 부분 목록 대신 프리뷰)을 따른 결과이며, 색을 클라이언트마다 임의로 채워 넣는 대안은 이 슬라이스가 고치려는 버그를 되살린다. 백엔드·프런트를 같은 커밋에서 바꾸고 양쪽 테스트로 계약을 고정한다.
3. **재접속 스냅샷에는 여전히 색이 없다.** `applySessionSnapshotPure`가 기존 store 값을 이어받아 해결한다. 전체 새로고침(F5)은 store의 `gameId` 자체가 사라져 `useInGameSessionSnapshotSync`도 동작하지 않으므로 이 슬라이스로 새로 생기는 회귀는 아니다. 스냅샷 payload에 색을 싣는 것은 범위 밖(백엔드는 payload 한 곳만).
4. **개인 결과의 잔존 구간.** 낮 동안 보존이 요구이므로, 다음 밤에 새 결과가 오기 전까지 이전 밤 결과가 화면에 남는다. dayIndex 라벨을 함께 표시해 오해를 줄인다. phase 기반 만료는 이 훅이 store phase를 구독하지 않는 구조라 범위 밖으로 둔다.
5. **패널 렌더 위치 이동이 "밤 턴 UI" 금지에 걸리는가.** 걸리지 않는다고 판단했다. 금지 대상은 밤 턴 진행 UI(오버레이·안내·대상 선택)이고, 여기서 옮기는 것은 개발용 액션 패널의 결과 문단 한 개다. 이동 없이는 "다음 낮에 화면에서 확인" 성공 조건이 성립하지 않는다.

---

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | backend/game-core/gameSession.js |  | 팔레트 크기 상수·session.id 결정적 셔플 헬퍼 추가, game_started players[]에 themeIndex |
| MODIFY | backend/game-core/__tests__/gameSession.test.js |  | player 키 계약 갱신, 뷰어 간 동일·순열·게임별 상이 테스트 |
| MODIFY | frontend/src/domains/game/ingame/utils/assignInGamePlayerThemeIndices.js |  | Math.random 셔플 유틸 삭제 |
| MODIFY | frontend/src/domains/game/ingame/utils/buildInGamePreviewPlayers.js |  | 프리뷰 테마를 index 기반 결정적 배정으로 교체 |
| MODIFY | frontend/src/domains/game/ingame/utils/buildPlayerSessionSourceFromGameState.js |  | themeIndex 검증·sourcePlayers 전달 |
| MODIFY | frontend/src/domains/game/ingame/utils/mergeSourcePlayerWithPreview.js |  | 서버 themeIndex 조건부 덮어쓰기와 theme 재계산 |
| MODIFY | frontend/src/domains/game/ingame/store/applySessionSnapshot.js |  | 스냅샷 재조립 시 themeIndex 이어받기 |
| MODIFY | frontend/src/domains/game/ingame/store/ingameStore.js |  | setGamePayload payload 계약 주석에 themeIndex 명시 |
| MODIFY | frontend/src/domains/game/ingame/utils/__tests__/buildPlayerSessionSourceFromGameState.test.js |  | themeIndex fixture·검증 실패 케이스 |
| MODIFY | frontend/src/domains/game/ingame/utils/__tests__/mergeSourcePlayerWithPreview.test.js |  | themeIndex 덮어쓰기·미존재 케이스 |
| MODIFY | frontend/src/domains/game/ingame/store/__tests__/applySessionSnapshot.test.js |  | 하이드레이션 후 색 보존 테스트 |
| CREATE | frontend/src/domains/game/ingame/utils/__tests__/buildInGamePreviewPlayers.test.js |  | 프리뷰 테마 결정성 회귀 테스트 |
| CREATE | frontend/src/domains/game/ingame/utils/computeResolveNightDayTransitionPatch.js |  | 낮 전이 전용 패치(status/error만 초기화) |
| CREATE | frontend/src/domains/game/ingame/utils/__tests__/computeResolveNightDayTransitionPatch.test.js |  | 낮 전이 패치 계약 테스트 |
| MODIFY | frontend/src/domains/game/ingame/hooks/useInGameResolveNight.js |  | night_result_applied에서 개인 결과 보존, NIGHT 기준 dayIndex 폐기 |
| CREATE | frontend/src/domains/game/ingame/hooks/__tests__/useInGameResolveNight.test.js |  | 결과 보존·다음 밤 수신·늦은 결과 폐기·무효화 |
| MODIFY | frontend/src/domains/game/ingame/components/actions/InGameActionPanel.jsx |  | 개인 결과 문단을 NIGHT 블록 밖 독립 섹션으로 이동 |
| MODIFY | frontend/src/domains/game/ingame/utils/inGameChatChannel.js |  | 밤 DEAD 채널 열람·전송 차단 |
| MODIFY | frontend/src/domains/game/ingame/utils/isJokerNightChatEligible.js |  | 죽은 광대 JOKER 채널 특례 허용(미확정은 fail-closed) |
| MODIFY | frontend/src/domains/game/ingame/components/chat/InGameChatShell.jsx |  | 채널 선택 규칙 주석 정정 |
| CREATE | frontend/src/domains/game/ingame/utils/__tests__/inGameChatChannel.test.js |  | 생존/사망 × phase별 view·send 채널 테스트 |
| MODIFY | frontend/src/domains/game/ingame/utils/__tests__/isJokerNightChatEligible.test.js |  | 죽은 광대 기대값 반전 |
| MODIFY | frontend/src/domains/game/ingame/utils/__tests__/selectOwnedGameChatContext.test.js |  | 사망자 NIGHT 기대값을 null/null로 갱신 |
| MODIFY | frontend/src/domains/game/setup/constants/roleComposition.js |  | GUARD 라벨·주석 경비원 통일 |
| MODIFY | frontend/src/domains/game/ingame/constants/roleReveal/ingameRoleRevealData.js |  | GUARD name 경비원 |
| MODIFY | frontend/src/domains/game/ingame/constants/nightTurn/ingameNightTurnAnnouncement.js |  | GUARD 밤 안내 문구·주석 경비원 |
| MODIFY | frontend/src/domains/game/ingame/hooks/useInGameOverlayStack.js |  | 주석 경비원 표기 |
| MODIFY | frontend/src/domains/game/ingame/hooks/__tests__/useInGameNightTurnAnnouncement.test.js |  | GUARD 문구 기대값·테스트명 갱신 |
| MODIFY | frontend/src/domains/game/ingame/hooks/__tests__/useInGameOverlayStack.nightTurn.test.js |  | 주석 경비원 표기 |
| REFERENCE | frontend/src/domains/game/ingame/constants/ingamePlayerTheme.js |  | 팔레트 10색·크기 상수 원천 |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useInGamePlayerSession.js |  | themeIndex 소비 지점 |
| REFERENCE | frontend/src/domains/game/ingame/utils/computeResolveNightInvalidatePatch.js |  | 기존 무효화 패치(변경 없음) |
| REFERENCE | frontend/src/domains/game/ingame/utils/selectOwnedGameChatContext.js |  | 채널 유도 호출부 |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useInGameGameChatSession.js |  | view/send 채널 소비·수신 게이팅 |
| REFERENCE | backend/socket/matchmaking.js |  | 참가자별 game_started payload 생성 지점 |
| REFERENCE | backend/socket/gameSession.js |  | night_action_result/night_result_applied dayIndex 원천 |
