# 상단 day/phase 인디케이터에 현재 턴 표기 통합 (frontend) — 구현 계획

## 0. 현재 코드가 실제로 하는 일 (확인한 사실)

**인디케이터의 정체는 `InGameTimebar`다.** 우상단(`INGAME_TIMEBAR_POSITION_CLASS = "absolute top-… right-… z-10 …"`,
`ingameTimebarLayout.js:8`)에 "제 N일" 라벨 + 4개 phase 노드(밤/결과발표/토론/추방투표) + 지시화살표를
그리는 컴포넌트가 정확히 이것이다(`components/timebar/InGameTimebar.jsx:53`). "제 N일" 문자열은
`InGameTimebar.jsx:60`의 `const dayLabel = \`제 ${day}일\``가 유일한 출처다.
(우하단 컨트롤 패널 `InGameActionPanel.jsx:220`에도 "제 N일" 타이틀이 있지만 그건 좌하단 행동 패널이지
요구서가 말하는 "상단 day/phase 인디케이터"가 아니다 — 손대지 않는다.)

- **프레젠테이셔널이다.** 스토어를 직접 읽지 않고 `day` / `activePhaseId` 두 prop만 받는다. 값을 만드는
  쪽은 호출부다: `InGamePage.jsx:93-96`가 `day={gameState?.dayIndex}`,
  `activePhaseId={mapGamePhaseToTimebarPhaseId(gameState?.phase)}`를 계산해 넘긴다.
  같은 배선이 `components/InGamePlayArea.jsx:16-19`에도 복제돼 있다(현재 어디서도 import되지 않는
  잔존 파일이지만 배선이 갈라지지 않게 함께 맞춘다).
- **바깥 래퍼가 이미 "세로 스택"이다.** `INGAME_TIMEBAR_STACK_CLASS = "flex flex-col items-stretch gap-…"`
  (`ingameTimebarLayout.js:12`)이고 주석도 "시간바와 선택적 투표 현황 버튼을 세로로 쌓는 래퍼"라고 적혀
  있다 — 프레임 아래에 한 줄을 더 얹는 것이 이 컴포넌트의 원래 설계된 확장 지점이다. 프레임 이미지
  내부(`DAY_LABEL_INSET` 2.8~21.8%, `TRACK_INSET` 25~96.5%)에는 문구가 들어갈 빈 공간이 없다.
- **밤 턴 문구 상수와 파생 로직이 이미 있다.**
  - `constants/nightTurn/ingameNightTurnAnnouncement.js:21` — `INGAME_NIGHT_TURN_ANNOUNCEMENTS`
    (`JOKER→"광대의 시간입니다"`, `DOCTOR→"의사의 시간입니다"`, `GUARD→"경호원의 시간입니다"`,
    `WITCH_HUNTER→"마녀사냥꾼의 시간입니다"`)와 `getInGameNightTurnAnnouncement(role, dayIndex)`.
  - `utils/selectInGameNightTurnRole.js:23` — **"지금 canonical하게 어느 밤 역할 턴인가"의 유일한 출처**.
    파일 주석이 명시하듯 프런트에 커서·인덱스·자동진행이 없고, `state.phase`/`state.dayIndex`/
    `state.nightTurnRole`만 읽는 순수 함수다. day 0의 마녀사냥꾼처럼 canonical하게 건너뛰는 턴은 null.
  - 이 둘을 그대로 쓰면 요구 1(문구 재사용)과 요구 2(store canonical 값에서만 파생, 별도 소켓 구독 금지)가
    구조적으로 보장된다. `state.nightTurnRole`은 `ingameStore.js:200-213`의 `applyNightTurnChanged`
    (`night_turn_changed` 방송)로만 움직이므로 **밤 턴이 바뀌면 문구도 저절로 따라간다.**
- **오버레이는 건드릴 필요가 없다.** `useInGameNightTurnAnnouncement`(오버레이 표시 상태)와 우리가 만들
  파생은 같은 canonical 입력(`selectInGameNightTurnRole`)을 각자 읽을 뿐 서로를 참조하지 않는다.
  오버레이를 닫아도 store는 움직이지 않으므로 인디케이터 문구는 그대로 남는다 — 이것이 요구서가 원하는
  "닫혀도 화면에 남는 현재 턴"이다.

### 사전 결정 세 가지 (가정 명시)

1. **NIGHT인데 canonical 턴이 없으면 문구를 그리지 않는다(null).** `night_turn_changed`는
   `nightTurnRole: null`(그 밤의 모든 턴 종료, 판정 대기)도 방송한다(`ingameStore.test.js:370`).
   이때 "밤" 같은 새 문구를 발명하면 요구 1의 "문구를 새로 만들지 않는다"를 어기므로 비운다.
   day 0 마녀사냥꾼처럼 건너뛰는 턴도 같은 이유로 null이다.
2. **ROLE_REVEAL도 null이다.** 요구 1이 지정한 phase는 NIGHT/DAY/TRIBUNAL/ENDED뿐이다. 노드 매핑
   (`mapGamePhaseToTimebarPhaseId`)이 ROLE_REVEAL을 discussion으로 임시 매핑하는 것과 무관하게,
   지정되지 않은 phase에 낮 문구를 붙이면 거짓 안내가 된다.
3. **문구는 프레임 이미지 아래 줄에 붙이고 색은 어두운 배경용 크림색으로 간다.** 프레임 안 "제 N일"은
   양피지 위라 `text-[#2a1810]`이지만, 새 줄은 게임 배경(어두움) 위에 놓인다. 이 저장소의 어두운 배경
   텍스트 관례(`text-[#f5e8c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]` —
   `ingameVoteLayout.js:47`, `ingamePlayerRecordListLayout.js:92`)와 폰트 관례(`font-subheading`,
   `cqi` 기반 clamp)를 그대로 따른다. **시각 판단이라 테스트로 증명되지 않는 유일한 항목**이므로 §3에 리스크로 남긴다.

---

## 1. 파일별 변경 내용

### 1-1. `frontend/src/domains/game/ingame/utils/selectInGameTimebarStatusMessage.js` (CREATE — 허용된 파생 유틸 1개)

`utils/selectInGameNightTurnRole.js` 바로 옆, 같은 관례(순수 함수 + 입력은 canonical state 하나).

```
selectInGameTimebarStatusMessage(state) -> string | null
```

- `state`가 객체가 아니면 `null`.
- `state.phase === "NIGHT"`: `selectInGameNightTurnRole(state)`로 canonical 턴 역할을 얻고
  (**밤 턴 안내가 쓰는 바로 그 파생 로직 재사용 — 요구 2**),
  `getInGameNightTurnAnnouncement(role, state.dayIndex)?.message ?? null`
  (**밤 턴 안내 문구 상수 재사용 — 요구 1**). 역할이 null이면 null(§0-1).
- `state.phase === "DAY"` → `INGAME_TIMEBAR_DAY_STATUS_MESSAGE`.
- `state.phase === "TRIBUNAL"` → `INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE`.
- `"ENDED"`·`"ROLE_REVEAL"`·그 외 알 수 없는 값 → `null`.
- 소켓 구독·타이머·store 구독을 이 파일에 두지 않는다(요구 2). 스펙 주석에 "이 함수는 canonical state
  외의 어떤 입력도 받지 않으며, 오버레이의 열림/닫힘과는 완전히 무관하다"를 명시한다.

### 1-2. `frontend/src/domains/game/ingame/constants/timebar/ingameTimebarAssets.js` (MODIFY)

인디게이터 전용 문구 상수 2개를 추가한다(이 파일은 이미 에셋 외에 `mapGamePhaseToTimebarPhaseId`
같은 인디케이터 파생 계층을 갖고 있다 — 파일 상단 주석에 "phase 상태 문구 상수도 여기 산다"를 덧붙인다).

```
export const INGAME_TIMEBAR_DAY_STATUS_MESSAGE = "낮 — 토론과 투표"
export const INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE = "재판 진행 중"
```

밤 문구는 **여기에 복제하지 않는다** — `ingameNightTurnAnnouncement.js`가 유일한 출처로 남는다.
기존 export(`INGAME_TIMEBAR_ASSETS`, `INGAME_DAY_TIMEBAR_PHASES`, `INGAME_TIMEBAR_PREVIEW_DAY`,
`mapGamePhaseToTimebarPhaseId`)는 한 글자도 바꾸지 않는다(요구의 "기존 day/phase 표시 로직 수정 금지").

### 1-3. `frontend/src/domains/game/ingame/constants/timebar/ingameTimebarLayout.js` (MODIFY)

문구 한 줄의 텍스트 스타일 상수 1개를 추가한다(§0-3의 관례를 따름):

```
/** 프레임 아래 한 줄 — 현재 phase·밤 역할 턴 상태 문구 */
export const INGAME_TIMEBAR_STATUS_CLASS =
  "pointer-events-none self-end truncate text-right font-subheading text-[clamp(0.62rem,3.1cqi,0.86rem)] font-bold leading-none tracking-wide text-[#f5e8c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
```

`pointer-events-none`은 필수다 — 인디케이터 래퍼가 `z-10 absolute`라 새 줄이 아래 보드의 클릭을
가로채면 안 된다. 기존 상수는 변경하지 않는다.

### 1-4. `frontend/src/domains/game/ingame/components/timebar/InGameTimebar.jsx` (MODIFY)

- prop `statusMessage = null`을 추가한다(기본값 null = 프리뷰/미연결 시 지금과 완전히 동일한 화면).
- 스택 래퍼(`INGAME_TIMEBAR_STACK_CLASS`)의 **두 번째 자식**으로 한 줄을 추가한다. 프레임 이미지·
  `dayLabel` span·노드 트랙 블록과 `aria-label`은 **한 글자도 건드리지 않는다**:
  ```jsx
  {typeof statusMessage === "string" && statusMessage.length > 0 ? (
    <p className={INGAME_TIMEBAR_STATUS_CLASS}>{statusMessage}</p>
  ) : null}
  ```
- 문구가 없으면(ENDED·ROLE_REVEAL·턴 없는 밤) 노드 자체를 그리지 않아 스택이 지금과 동일한 1자식
  구조로 돌아간다 → 요구 1의 "ENDED에서는 문구 없이 기존 표시 유지"가 레이아웃까지 그대로 지켜진다.
- 컴포넌트 헤더 주석의 "단계명 텍스트는 추후"를 실제 동작으로 갱신하고, "이 컴포넌트는 문구를 직접
  파생하지 않는다(호출부가 canonical state에서 계산해 넘긴다)"를 남긴다.

### 1-5. `frontend/src/domains/game/ingame/pages/InGamePage.jsx` (MODIFY)

`day`/`activePhaseId`와 **같은 자리에서 같은 방식으로** 파생값을 넘긴다(새 훅·새 구독 없음):

```jsx
<InGameTimebar
  day={gameState?.dayIndex}
  activePhaseId={mapGamePhaseToTimebarPhaseId(gameState?.phase)}
  statusMessage={selectInGameTimebarStatusMessage(gameState)}
/>
```

`gameState`는 이미 `useInGameStore((s) => s.state)`로 구독 중이므로 새 구독이 생기지 않는다
(`nightTurnRole`은 그 state 객체 안에 있고, `applyNightTurnChanged`가 새 참조를 만들므로 리렌더가 일어난다).

### 1-6. `frontend/src/domains/game/ingame/components/InGamePlayArea.jsx` (MODIFY)

현재 어디서도 import되지 않는 잔존 파일이지만 `InGamePage`와 동일한 타임바 배선을 복제하고 있다.
같은 prop 한 줄을 추가해 배선이 갈라지지 않게 한다(동작 변화 없음 — 마운트되는 경로가 없다).

---

## 2. 검증 계획

### 2-0. 이 저장소의 실측 제약 — "인디케이터 DOM 테스트"의 한계 (숨기지 않고 명시)

프런트 테스트는 `node --experimental-test-module-mocks --test src/**/__tests__/*.test.js`로 **변환기 없이**
돈다(`frontend/package.json:11`). `InGameTimebar.jsx`는 (a) JSX 문법이라 node가 파싱조차 못 하고
(b) `@/shared/ui/PublicAsset`(vite alias, 게다가 `.jsx`)을 import해 resolve도 안 된다.
`InGameTimebar.productionSource.test.js:8`·`InGamePlayerCard.playerColor.test.js:9`·
`InGamePage.productionSource.test.js:8` 주석이 모두 같은 제약을 기록하고 있다.
**즉 인디케이터 컴포넌트를 그대로 `render()`하는 테스트는 이 저장소에서 물리적으로 불가능하다.**
가능하게 만들려면 `.js`+`createElement`로 개종해야 하는데 그건 (i) 사실상 새 컴포넌트 파일 생성이라
요구 4 위반이고 (ii) alias/`PublicAsset.jsx` 체인 때문에 개종해도 여전히 렌더되지 않는다.

그래서 검증을 **실제로 렌더 가능한 최하위 이음매 + 프로덕션 소스 배선** 두 겹으로 나눈다. 요구서의
"NIGHT 턴 변경 시 문구 갱신"은 (B)에서 **실제 React 렌더 + 실제 zustand store + 실제
`applyNightTurnChanged` 방송 반영**으로 그대로 증명되고, 그 값이 인디케이터 DOM에 실제로 꽂히는
경로는 (C)가 소스로 못박는다.

### (A) 파생 함수 단위 테스트 — CREATE `utils/__tests__/selectInGameTimebarStatusMessage.test.js`

- NIGHT × 턴 조합: `nightTurnRole` 명시 `JOKER/DOCTOR/GUARD/WITCH_HUNTER`(dayIndex 1) →
  각각 "광대의 시간입니다"/"의사의 시간입니다"/"경호원의 시간입니다"/"마녀사냥꾼의 시간입니다".
  문자열 리터럴을 테스트에 다시 쓰지 않고 `INGAME_NIGHT_TURN_ANNOUNCEMENTS`에서 뽑아 비교해
  "문구를 새로 만들지 않았음"까지 함께 고정한다.
- NIGHT × `nightTurnRole` 미지정 → 그 밤의 시작 턴("광대의 시간입니다") — 기존 파생 로직 재사용 증명.
- NIGHT × dayIndex 0 × `WITCH_HUNTER` 명시 → `null`(canonical하게 건너뛰는 턴).
- NIGHT × `nightTurnRole: null` × dayIndex 유효 → 시작 턴 문구(선언이 없을 때의 경로),
  NIGHT × dayIndex 비정수/음수 → `null`.
- DAY → "낮 — 토론과 투표", TRIBUNAL → "재판 진행 중" (상수와 동일 비교 + 리터럴 1회 정확 비교).
- **ENDED → `null`**, ROLE_REVEAL → `null`, 알 수 없는 phase → `null`, `null`/`undefined`/배열/문자열
  입력 → `null`(throw 없음).

### (B) canonical 갱신 렌더 테스트 — CREATE `utils/__tests__/selectInGameTimebarStatusMessage.store.test.js`

jsdom + `@testing-library/react`의 `renderHook`(`useInGameControlPanelLayout.test.js:1-36`과 동일한
부트스트랩)으로, **인디케이터가 값을 얻는 것과 완전히 같은 경로**
`useInGameStore((s) => selectInGameTimebarStatusMessage(s.state))`를 구독시킨다.

- `setGamePayload`로 NIGHT(dayIndex 1, `nightTurnRole: "JOKER"`) 시드 → "광대의 시간입니다".
- `act(() => applyNightTurnChanged({ gameId, phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" }))`
  → **문구가 "의사의 시간입니다"로 갱신됨**(요구 검증의 "NIGHT 턴 변경 시 문구 갱신").
  이어서 `GUARD` → "경호원의 시간입니다"까지 연쇄 확인.
- `nightTurnRole: null` 방송 → 문구가 사라짐(null).
- state를 DAY/TRIBUNAL/ENDED로 갈아끼우면 각각 "낮 — 토론과 투표"/"재판 진행 중"/`null`.
- **다른 게임의 stale 방송은 문구를 흔들지 않는다**(store가 no-op → 같은 문구 유지).
- 언마운트까지 소켓 리스너·타이머가 전혀 관여하지 않음(소켓 모듈을 import하지 않고도 전부 통과한다는
  사실 자체가 요구 2의 "별도 소켓 구독·타이밍 로직 금지"를 증명).

### (C) 인디케이터·페이지 프로덕션 배선 테스트(소스 레벨)

- MODIFY `components/timebar/__tests__/InGameTimebar.productionSource.test.js` — 기존 2개 단언은 그대로 두고 추가:
  - `statusMessage` prop을 받고, `INGAME_TIMEBAR_STATUS_CLASS`를 쓴 `<p>`로 **그 값을 그대로** 렌더한다
    (문구를 컴포넌트가 만들지 않음: `시간입니다`·`낮 —`·`재판` 리터럴이 소스에 없음, `useInGameStore`·
    `socket` import도 없음).
  - 빈 문구일 때 노드를 그리지 않는 조건부 렌더가 존재한다(ENDED에서 레이아웃 유지).
  - 기존 표시가 살아 있다: `` const dayLabel = `제 ${day}일` ``,
    `INGAME_DAY_TIMEBAR_PHASES.map`, `active={phase.id === activePhaseId}`가 그대로 있다
    (= "기존 day/phase 표시 로직 수정 금지"의 회귀 방지).
- MODIFY `pages/__tests__/InGamePage.productionSource.test.js` — 기존 단언(특히 `<InGameTimebar[\s\S]*?\/>`
  블록 매칭)을 깨지 않게 두고, 그 블록이
  `statusMessage={selectInGameTimebarStatusMessage(gameState)}`를 넘기며 `day`/`activePhaseId` 배선이
  그대로임을 확인한다.

### (D) 회귀

- `cd frontend && npm test` 전체 PASS(새 export만 추가하고 기존 export/문자열을 바꾸지 않으므로
  `ingameTimebarAssets.test.js`·`useInGameNightTurnAnnouncement.test.js` 등 기존 스위트는 무수정 통과가 목표).
- `cd frontend && npm run build` PASS, `npm run lint` PASS, `npm run check:utf8` PASS(한글 문구·주석 추가).
- **backend/**, e2e/** 는 한 줄도 건드리지 않는다.** 밤 턴 안내 오버레이(`InGameNightTurnAnnouncementOverlay`,
  `useInGameNightTurnAnnouncement`, `reduceInGameNightTurnAnnouncement`)도 손대지 않는다.

---

## 3. 잘못될 수 있는 것 (리스크)

| 리스크 | 내용 | 대응 |
| --- | --- | --- |
| **"인디케이터 DOM 테스트"를 문자 그대로 못 한다** | `.jsx` + vite alias라 node:test가 컴포넌트를 렌더할 수 없다(§2-0, 저장소 전반의 기존 제약) | 실제 React 렌더+실제 store 갱신(B)로 "턴 변경 시 문구 갱신"을 증명하고, 그 값이 DOM에 꽂히는 배선은 소스 테스트(C)로 못박는다. 한계를 위장하지 않고 명시 |
| **문구 색이 배경에 묻힌다** | 새 줄은 프레임 밖(어두운 배경) — "제 N일"의 다크 브라운을 그대로 쓰면 안 보인다 | §0-3의 저장소 어두운-배경 텍스트 관례(크림 + 그림자)를 따른다. 테스트 불가 항목이므로 별도 지시로 클래스 상수 한 줄만 바꾸면 되도록 `INGAME_TIMEBAR_STATUS_CLASS` 하나에 격리 |
| **긴 문구가 바 폭을 밀어낸다** | "마녀사냥꾼의 시간입니다"가 가장 길다. 래퍼가 `w-[clamp(18rem,38cqw,30rem)]` 고정폭이라 폭은 안 변하지만 좁은 화면에서 줄바꿈이 날 수 있다 | `truncate` + `leading-none` + `cqi` 스케일로 한 줄 유지. 래퍼 폭·프레임 비율은 손대지 않아 기존 골격이 흔들리지 않는다 |
| **NIGHT인데 문구가 빈다** | `nightTurnRole: null`(판정 대기)·day0 마녀사냥꾼 구간에서는 문구가 사라진다 | §0-1의 명시적 결정(새 문구 발명 금지). (A)에서 이 동작을 테스트로 고정해 "버그처럼 보이는 의도"임을 남긴다 |
| **오버레이와 문구 중복 노출** | 밤 턴 안내 오버레이가 떠 있는 동안 같은 문구가 인디케이터에도 보인다 | 요구서가 원하는 동작 자체다(닫힌 뒤에도 남아야 함). 오버레이는 backdrop으로 위를 덮으므로 시각 충돌이 아니라 자연스러운 이어짐 |
| **e2e 텍스트 셀렉터 충돌** | 같은 문구가 화면에 둘이 되면 page-scoped `getByText`가 strict mode로 깨질 수 있다 | 실측 확인: 밤 턴 안내는 `getByRole("dialog", …)`(`e2e/lib/actors.js:346`), 사망 문구는 overlay-scoped(`:249`), 진입 연출 문구는 "낮이 되었습니다"/"밤이 되었습니다"로 새 문구와 다르다. "낮 — 토론과 투표"/"재판 진행 중"은 e2e에 존재하지 않는 문자열이다 → 충돌 없음 |
| **`InGamePlayArea.jsx` 미사용 파일** | 손대는 의미가 없어 보일 수 있다 | 동일 배선의 복제본이라 방치하면 다음 사람이 갈라진 두 배선을 보게 된다. 마운트 경로가 없어 동작 위험은 0 |

---

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| CREATE | frontend/src/domains/game/ingame/utils/selectInGameTimebarStatusMessage.js |  | canonical state → 인디케이터 상태 문구 파생 순수 함수(NIGHT 턴 문구 재사용, ENDED/ROLE_REVEAL은 null) |
| MODIFY | frontend/src/domains/game/ingame/constants/timebar/ingameTimebarAssets.js |  | DAY/TRIBUNAL 상태 문구 상수 추가(기존 에셋·phase 매핑은 불변) |
| MODIFY | frontend/src/domains/game/ingame/constants/timebar/ingameTimebarLayout.js |  | 상태 문구 한 줄의 텍스트 스타일 상수 추가 |
| MODIFY | frontend/src/domains/game/ingame/components/timebar/InGameTimebar.jsx |  | statusMessage prop을 스택 두 번째 자식으로 렌더(빈 값이면 미렌더, 기존 day/phase 표시 불변) |
| MODIFY | frontend/src/domains/game/ingame/pages/InGamePage.jsx |  | 인디케이터에 canonical state에서 파생한 statusMessage 전달 |
| MODIFY | frontend/src/domains/game/ingame/components/InGamePlayArea.jsx |  | 복제된 타임바 배선을 동일하게 맞춤(미마운트 잔존 파일) |
| CREATE | frontend/src/domains/game/ingame/utils/__tests__/selectInGameTimebarStatusMessage.test.js |  | phase×밤 턴 조합별 문구·ENDED null·무효 입력 단위 테스트 |
| CREATE | frontend/src/domains/game/ingame/utils/__tests__/selectInGameTimebarStatusMessage.store.test.js |  | 실제 렌더+실제 store로 NIGHT 턴 변경 시 문구 갱신·DAY/TRIBUNAL/ENDED 검증 |
| MODIFY | frontend/src/domains/game/ingame/components/timebar/__tests__/InGameTimebar.productionSource.test.js |  | 문구 렌더 배선과 기존 day/phase 표시 유지에 대한 소스 단언 추가 |
| MODIFY | frontend/src/domains/game/ingame/pages/__tests__/InGamePage.productionSource.test.js |  | 페이지가 파생 함수 결과를 statusMessage로 넘기는 배선 단언 추가 |
| REFERENCE | frontend/src/domains/game/ingame/constants/nightTurn/ingameNightTurnAnnouncement.js |  | 재사용할 밤 턴 문구 상수·조회 함수(변경 없음) |
| REFERENCE | frontend/src/domains/game/ingame/utils/selectInGameNightTurnRole.js |  | 재사용할 canonical 밤 턴 파생 로직(변경 없음) |
| REFERENCE | frontend/src/domains/game/ingame/store/ingameStore.js |  | phase·dayIndex·nightTurnRole canonical 갱신 경로(applyNightTurnChanged) 확인 |
