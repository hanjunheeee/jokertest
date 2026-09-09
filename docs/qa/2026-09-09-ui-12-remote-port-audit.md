# UI-12 원격 이식 대조 감사 — components/actions · components/parchment · constants/parchment

AC-01("원격의 모든 관련 파일이 로컬에 이식되고, 차이가 `@/`→상대 경로 치환과 로컬 훅·API 계약
유지 목적의 수정으로만 한정된다")을 확인할 수 있게, **원격 전체 목록**과 **파일별 대조 diff**를
남긴다.

- 원격 기준: `origin/feature/ui-Phase1complete`
- 로컬 기준: 이 브랜치(`pluto/AG`)의 작업본
- merge · cherry-pick · 원격 checkout 덮어쓰기는 하지 않았다. 파일은 `git show`로 읽어 옮겼다.

## 1. 원격 전체 목록 (16개) 과 로컬 존재 여부

목록은 `git show "origin/feature/ui-Phase1complete:<디렉터리>"`(트리 나열)로 얻었다 — 앞선 시도가
쓴 `git diff --name-only`는 **내용이 같은 파일을 아예 출력하지 않아** 전체 목록이 될 수 없다.
실제로 그 방식은 아래 3개(내용 동일)를 빠뜨렸다.

| # | 원격 경로 (frontend/src/domains/game/ingame/ 이하) | 로컬 존재 | 원격과의 차이 |
| --- | --- | --- | --- |
| 1 | components/actions/InGameActionPanel.jsx | O | 로컬 훅 계약 유지 (§2.1) |
| 2 | components/actions/InGameTargetPicker.jsx | O | 주석 1곳 (§2.2) |
| 3 | components/actions/__tests__/InGameActionPanel.controlPanel.test.js | O | 계약 차이 단언 + 로컬 전용 회귀 2개 (§2.3) |
| 4 | components/actions/__tests__/InGameActionPanel.frameAsset.test.js | O | 정규식 줄바꿈 허용 1곳 (§2.3) |
| 5 | components/actions/__tests__/InGameActionPanel.presentation.test.js | O | 섹션 개수 4→5 (§2.3) |
| 6 | components/actions/__tests__/InGameActionPanel.productionSource.test.js | O | 밤 판정 단언 반전 (§2.3) |
| 7 | components/actions/__tests__/InGameActionPanel.visualPolish.test.js | O | phase 배지·주요 액션 개수 (§2.3) |
| 8 | components/parchment/InGameParchmentConfirmButton.js | O | **차이 없음** |
| 9 | components/parchment/InGameParchmentModalAnimated.jsx | O | 주석 1줄 (§2.4) |
| 10 | components/parchment/InGameParchmentModalBase.js | O | 주석 2줄 (§2.4) |
| 11 | components/parchment/InGameParchmentPanel.jsx | O | **차이 없음** |
| 12 | components/parchment/InGameParchmentPanelBase.js | O | **차이 없음** |
| 13 | constants/parchment/ingameParchmentConfirmButton.js | O | **차이 없음** |
| 14 | constants/parchment/ingameParchmentLayout.js | O | `@/`→상대 경로 + 주석 (§2.5) |
| 15 | constants/parchment/ingameParchmentModalMotion.js | O | **차이 없음** |
| 16 | constants/parchment/ingameParchmentModalVariants.js | O | 주석 (§2.5) |

누락 없음: 원격 16개가 모두 로컬에 있다.

재현 명령(각 디렉터리마다 한 번):

```
git show "origin/feature/ui-Phase1complete:frontend/src/domains/game/ingame/components/actions"
git show "origin/feature/ui-Phase1complete:frontend/src/domains/game/ingame/components/actions/__tests__"
git show "origin/feature/ui-Phase1complete:frontend/src/domains/game/ingame/components/parchment"
git show "origin/feature/ui-Phase1complete:frontend/src/domains/game/ingame/constants/parchment"
```

## 2. 파일별 대조 diff

전체 diff 재현:

```
git diff HEAD origin/feature/ui-Phase1complete -- frontend/src/domains/game/ingame/components/actions
git diff HEAD origin/feature/ui-Phase1complete -- frontend/src/domains/game/ingame/components/parchment
git diff HEAD origin/feature/ui-Phase1complete -- frontend/src/domains/game/ingame/constants/parchment
```

`--stat` 요약: actions 7파일(+56/−227), parchment 컴포넌트 2파일(+1/−5), parchment 상수
2파일(+5/−12). 나머지 5파일은 diff에 나타나지 않는다(= 원격과 바이트 단위로 동일).

### 2.1 InGameActionPanel.jsx — 차이는 전부 "로컬 훅·API 계약 유지"

원격에 없고 로컬에만 남긴 것(= 이 저장소의 훅/서버 계약이 실제로 요구하는 것):

| 로컬에 유지한 것 | 유지 사유 (로컬 계약) |
| --- | --- |
| 낮 하위 구간 분기 `dayPhase === "DAY_DISCUSSION"` / `"DAY_VOTE"` | 이 저장소 서버는 토론 중 투표·집계를 `INVALID_DAY_PHASE`로 거부한다. 원격에는 `dayPhase` 개념 자체가 없다 |
| `submitDayReady` · `dayReadyStatus/Error/Count/Required` · `dayReadyControlsEnabled` | 로컬 `useInGameDayDiscussionReady` 계약. 원격 훅은 이 값을 반환하지 않는다 |
| `dayVoteResolveControlsEnabled` | 로컬 훅이 계산해 주는 전용 게이트. 원격은 `interactionBlocked \|\| status !== "idle"`을 화면에서 다시 조립한다 |
| `resolveNight` · `resolveNightStatus/Error` ("밤 종료") | 이 저장소는 여전히 클라이언트가 `resolve_night`을 요청한다(`useInGameResolveNight`). 원격은 서버 자동 진행이라 버튼이 없다 |
| `nightActionAlive` · `isNightTurnActor` · `nightTurnRole` 안내 | 로컬 훅이 돌려주는 값. 원격은 `nightActionControlsEnabled` 하나로 합쳐 반환한다 — 로컬 훅에 그 키가 없다 |
| `nightActionResult` 개인 결과 섹션 | 원격은 전용 오버레이(`InGameNightPrivateResultOverlay`)로 뽑아냈지만 이 슬라이스 범위 밖이라, 기존 표시 위치를 유지했다 |
| `getPlayerDisplayName(gameState.players, …)` (피고인 표시) | 로컬은 uuid 대신 닉네임을 보여주는 표시 계약을 이미 갖고 있다. 원격은 uuid를 그대로 찍는다 |

프레임·레이아웃·섹션 구조·캡션·악센트 바·주요 액션 아웃라인·이벤트 배지 등 **원격의 시각
구조는 그대로 이식**했다.

### 2.2 InGameTargetPicker.jsx

차이는 JSDoc 한 문단뿐이다(로컬 `buildDayVoteTargets`가 생존자만 담는다는 사실을 명시).
`disabled={disabled || !player.connected || player.selectable === false}` 등 실제 동작은 원격과
동일하다.

### 2.3 이식된 5개 테스트

- `controlPanel`: 밤 잠금 단언을 로컬 식(`nightActionsLocked`)으로. 원격에 없는 로컬 전용 회귀
  2개(낮 하위 구간 게이트 · 밤 종료 컨트롤)를 **추가**했다.
- `presentation`: 섹션 캡션/악센트 개수 4→5, 버튼 행 3→4 (로컬에 토론 준비 섹션과 밤 종료 행이
  더 있다).
- `productionSource`: 원격은 "밤 종료 컨트롤이 없다"를 단언하지만 로컬 계약은 정반대라, 그 단언만
  로컬 실제 계약(존재하며 `resolveNightStatus`로 잠긴다)으로 뒤집고 사유를 주석에 남겼다.
- `visualPolish`: phase 배지가 낮 하위 구간까지 비추는 점, 주요 액션 개수 5→7, 건너뛰기 disabled
  식을 로컬 훅 계약으로.
- `frameAsset`: `CONTROL_PANEL_FRAME_WRAP_CLASS` 정규식에 줄바꿈(`\n?\s*`)을 허용한 것 하나뿐.

어느 것도 "기존 동작을 통과시키려 기대값을 낮춘" 변경이 아니다 — 두 브랜치의 계약이 실제로
다른 지점을 로컬 계약 쪽으로 맞추고, 그 사유를 각 파일 상단 주석에 적었다.

### 2.4 parchment 컴포넌트

`InGameParchmentModalAnimated.jsx` · `InGameParchmentModalBase.js`의 차이는 **주석뿐이다**
(로컬에 소비자가 없는 `nightPrivateResult` 언급 제외, "표시 전용" 문장 추가). 실행 코드는 원격과
같다. 나머지 3개(`InGameParchmentConfirmButton.js`, `InGameParchmentPanel.jsx`,
`InGameParchmentPanelBase.js`)는 원격과 완전히 동일하다.

### 2.5 parchment 상수

- `ingameParchmentLayout.js`: `@/shared/constants/customScrollbarStyles.js` →
  `../../../../../shared/constants/customScrollbarStyles.js`. **AC-01이 명시적으로 허용한
  `@/`→상대 경로 치환**이며, 이 파일이 `InGameParchmentPanelBase.js`(.js) import 체인 위에 있어
  변환기 없이 도는 `node --test`가 Vite 별칭을 해석할 수 없기 때문이다. 나머지는 주석.
- `ingameParchmentModalVariants.js`: 주석뿐. `nightPrivateResult` variant는 값을 그대로 두어
  원격 표와 어긋나지 않게 했고, 소비자가 없다는 사실을 주석에 명시했다.

## 3. constants/actions/ingameActionPanel.js — 이식 대상이 아니다

AC-01이 지정한 디렉터리는 `components/actions/*`, `components/parchment/*`,
`constants/parchment/*` 셋이다. `constants/actions/ingameActionPanel.js`는 그 목록에 없고, 계획
메모가 **"표시 라벨·에셋 키 추가만 허용"** 으로 못박은 파일이다.

따라서 이 파일에서는:

- 이식 이전부터 있던 스타일 상수 8개(`PANEL` / `HEADER` / `TITLE` / `META` / `SECTION` /
  `BUTTON` / `TARGET_BUTTON` / `SELECTED_TARGET_BUTTON`)의 **값은 원격이 다시 칠했더라도
  이식하지 않고 이 저장소의 기존 값을 그대로 둔다.**
- 추가만 한다: 라벨 `DAY_DISCUSSION_CAPTION`, 그리고 이식된 두 컴포넌트가 원격과 **같은 이름으로
  import** 하는 신규 표시 상수(`CAPTION` · `BUTTON_ROW` · `STATUS_TEXT` · `ERROR_TEXT` ·
  `ERROR_BANNER` · `TARGET_GRID` · `TARGET_NAME` · `TARGET_STATUS_ROW` · `TARGET_STATUS_DOT_*`).
  이 상수들이 없으면 이식된 컴포넌트의 import가 해석되지 않는다.
- 게임 규칙에 매인 값도 로컬 유지: `NIGHT_ACTION_MIN_DAY_INDEX.WITCH_HUNTER`는 원격의 0이 아니라
  로컬 2다(백엔드 `isEligibleForNightAction`과 짝이고 `ingameActionPanel.test.js`가 고정한다).
  원격의 `isDeadTargetOnlyNightActionRole`은 로컬에서 `buildNightActionTargets`가 이미 소유하므로
  이식하지 않았다.

검증: `git diff 94d44b9 -- frontend/src/domains/game/ingame/constants/actions/ingameActionPanel.js`
가 **추가 라인만** 보여준다(기존 상수 값 수정 0건).

## 4. 보호 대상

`useInGameActionPanel.js` · `utils/*` · `store/*`는 한 줄도 고치지 않았다.
확인: `git diff 94d44b9 --name-only`에 이 경로들이 없다.
