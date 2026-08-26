# 방 목록 입장 버튼 / 사운드 컨트롤 겹침 해소 — 구현 계획

## 1. 현재 구조 (읽고 확인한 사실)

레이아웃 계산의 기준이 되는 실제 배치는 다음과 같다.

- `frontend/src/app/index.css:105` `.viewport-shell__game` 은 `width: min(100%, var(--game-viewport-max-width))` + `container-type: inline-size` 다. `frontend/src/shared/layouts/constants/viewportLayout.js:3` 의 `GAME_VIEWPORT_MAX_WIDTH_PX = 1192` 가 이 변수로 들어간다. 즉 1280×720 뷰포트에서 **게임 화면 열의 실제 폭은 1192px**이고, `container-type: inline-size`(= `contain: layout … `)라서 페이지 안의 모든 `absolute`는 이 1192px 열을 기준으로 잡힌다. 반면 `vw` 단위는 여전히 뷰포트(1280) 기준이다.
- `MultiplayEntryPage.jsx:18` — `<div className="absolute inset-0 z-10">` 안에 목록 셸과 `ModePageControls`가 형제로 들어간다.
- 셸: `roomListLayout.js:3` `ROOM_LIST_SHELL_CLASS` = `absolute left-1/2 top-[52%] z-10 … w-[min(60rem,80vw)] … px-[clamp(0.35rem,0.9vw,0.65rem)]`.
- 입장 버튼: `RoomListShell.jsx:107-118` 이 `ROOM_LIST_FOOTER_CLASS`(`roomListLayout.js:99`, `flex shrink-0 items-center justify-end`) 안에서 `ROOM_LIST_ENTER_BTN_CLASS`(`roomListLayout.js:120`) 버튼 하나를 오른쪽 끝에 붙인다.
- 사운드: `ModePageControls.jsx:15` — `<div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6">` 안의 `SoundControl`. 폭은 `soundControlLayout.js:3-12` 기준 아이콘 `clamp(2.85rem,3.9vw,3.5rem)` 의 84%(`-mr-[16%]`) + 바 `clamp(10.75rem,14.8vw,13.5rem)` 이다.

### 1280×720 실측 계산

| 값 | 계산 | px (열 좌표) |
| --- | --- | --- |
| 게임 열 폭 | `min(1280, 1192)` | 1192 |
| 셸 폭 | `min(960, 0.8·1280=1024)` | 960 |
| 셸 내용 오른쪽 경계 | `(1192+960)/2 − clamp(5.6, 11.52, 10.4)` | 1065.6 (열 오른쪽에서 **126.4**) |
| 사운드 폭 | `0.84·49.92 + 189.44` | 231.4 |
| 사운드 왼쪽 경계 | `1192 − 24 − 231.4` | 936.6 (열 오른쪽에서 **255.4**) |

입장 버튼은 `[1065.6−W, 1065.6]` 구간이고 `min-w`가 `clamp(6.25rem,11vw,7.75rem)`=124px 이므로, 폭 W가 258px 이하인 한 **버튼 중앙(=Playwright 클릭 좌표)이 사운드 컨트롤 박스 안에 들어간다**. 가로 겹침량은 `255.4 − 126.4 = 129px`. 세로로도 셸 하단이 694.4px(뷰포트 높이 720 기준), 사운드는 하단 24px에서 위로 약 50px이라 겹친다. 즉 재현 조건이 계산과 정확히 일치한다.

가로채기가 실제로 성립한 이유(부가 확인): `ModePageControls`의 사운드 래퍼는 z-index가 `auto`라 스태킹 컨텍스트를 만들지 않는다. 그래서 `SoundControl` 내부의 `relative z-10` 버튼과 `absolute z-20` range input이 부모 `z-10 inset-0` 컨텍스트로 그대로 올라와, `z-10`인 목록 셸보다 위에 그려진다. (`MatchingPageControls`/`GameSetupPageControls`의 래퍼는 `z-30`이라 내부 z가 갇힌다.)

## 2. 선택한 접근과 근거

요구사항이 제시한 세 후보 중 **footer 우측 여백**을 택한다.

- *사운드 래퍼 이동*: `ModePageControls`는 `/gameMode`, `/multiplay`, `/roomInvite` 가 공유한다. 위치를 바꾸면 겹치지도 않는 화면 두 곳의 시각이 함께 바뀐다.
- *z-order만 조정*: 클릭은 통해도 그림은 여전히 겹쳐 보인다. 요구사항 1은 "겹치지 않게 한다"이므로 미달이다. (래퍼에 `isolate`/`z`를 주면 반대로 footer 빈 박스가 볼륨 슬라이더 왼쪽 끝을 덮어, 수정 금지 조항인 "볼륨 input의 pointer-events 유지"를 해친다.)
- *세로로 띄우기*(셸을 위로/짧게): 720px 높이에서 셸 하단 여유가 25.6px뿐이라 48px 이상 올려야 하는데, 셸 상단이 화면 밖으로 나간다. 게다가 6행 그리드 높이 튜닝(`roomListLayout.js:25-36`)을 되돌리는 셈이라 시각 변화가 가장 크다.

**footer 우측 여백만 주면 /multiplay의 버튼 하나만 왼쪽으로 이동한다.** 다른 화면·다른 요소는 픽셀 하나 바뀌지 않는다.

### 여백 값: `pr-[11rem]`(176px) 고정

필요 여백 = `사운드 폭 + 24 − 126.4`. 게임 열 폭이 1192px로 고정이라 넓은 화면일수록(=`vw` 기반 사운드 폭이 커질수록) 필요 여백이 **커지고**, 아이콘·바 clamp 상한(3.5rem/13.5rem)에 도달하는 약 1460px부터 `263 + 24 − 126.4 ≈ 160.6px`에서 멈춘다.

| 뷰포트 | 사운드 폭 | 필요 여백 | 11rem(176px) 여유 |
| --- | --- | --- | --- |
| 1280 | 231.4 | 129.0 | 47.0 |
| 1366 | 247.0 | 144.6 | 31.4 |
| 1440 | 260.1 | 157.7 | 18.3 |
| 1536+ | 263.0 | 160.6 | 15.4 |
| 1024(열 축소) | 210.3 | 134.7 | 41.3 |
| 768(열 축소) | 210.3 | 163.7 | 12.3 |

한 값으로 전 구간을 덮으므로 반응형 분기 없이 `pr-[11rem]` 하나면 된다. 남는 폭도 충분하다(1280에서 footer 내용폭 939.2px − 176 = 763.2px, 버튼은 124px대).

### 부수 조치: footer 빈 영역의 pointer-events 비우기

여백을 줘도 footer **박스 자체**(border-box)는 여전히 열 오른쪽 1076px까지 뻗어 사운드 컨트롤 위를 지난다. 지금은 슬라이더 input의 `z-20`이 이겨서 문제가 없지만, 이는 위에서 본 "z가 새어 나오는" 우연에 기대는 상태다. `ROOM_LIST_FOOTER_CLASS`에 `pointer-events-none`, `ROOM_LIST_ENTER_BTN_CLASS`에 `pointer-events-auto`를 넣으면 빈 영역이 어떤 클릭도 가로채지 않는다(같은 패턴이 `matchingPopupStyles.js:26-32`에 이미 있다). 이는 수정 금지 조항인 "음소거 버튼·볼륨 input의 pointer-events 유지"를 코드 쪽에서 보장하는 방향이고, 시각 변화는 0이다. 두 상수는 반드시 함께 바뀌어야 한다(footer만 `none`으로 두면 버튼이 죽는다).

## 3. 요구사항 2 — 다른 두 컨트롤 확인 결과 (수정 없음)

두 화면 모두 사운드 컨트롤은 오른쪽 아래(`absolute bottom-4 right-4 z-30 sm:bottom-6 sm:right-6`)에 있고, 열 왼쪽 기준 사운드 왼쪽 경계는 1280에서 936.6px이다.

- **GameSetupPage** — 주 조작 버튼은 `GameSetupCreateButton.jsx:5` 의 `게임 만들기`(`mx-auto block w-[clamp(13.5rem,20vw,17.5rem)]`)이고, `GameSetupPanel.jsx:31` 의 `flex … items-center` 패널(`scale-[0.82]`, `left-1/2` 중앙) 안에 있다. 1280 기준 폭 256px × 0.82 = 210px, 중심 596px → **491~701px**. 사운드 왼쪽 936.6px과 235px 떨어져 있다. 겹치지 않음 → 수정하지 않는다.
- **GameMatchingPage** — 주 조작 버튼(준비완료/게임시작/방 삭제하기·방 나가기)은 `matchingPopupStyles.js:26-36` 의 `MATCHING_START_GAME_BTN_AREA_CLASS`(`inset-x-0 … items-center`) + `MATCHING_ACTION_BTN_ROW_CLASS`(`mx-auto … justify-center max-w-[min(92%,36rem)]`) 안에서 가운데 정렬된다. 1280 기준 버튼 3개(180px)+간격 2개(13.6px)=567.2px, 패널 `scale-[0.92]` 적용 시 521.8px, 중심 596px → **335~857px**. 사운드 왼쪽까지 79.6px 여유가 있고, `group-hover:scale-[1.1]`이 걸려도(오른쪽으로 약 8px) 여전히 여유가 있다. `초대코드 공유` 버튼은 패널 상단 오른쪽(`top-[clamp(0.1rem,0.65vh,0.45rem)]`)이라 하단 사운드와 세로로 만나지 않는다. 겹치지 않음 → 수정하지 않는다.

두 파일의 래퍼 `z-30`도 그대로 둔다. 이 화면들에서는 겹침이 없고, `z-30`이 스태킹 컨텍스트를 만들어 내부 z가 새지 않으므로 /multiplay 같은 문제가 발생하지 않는다.

## 4. 파일별 변경 내용

### (1) `frontend/src/domains/game/mode/constants/roomListLayout.js` — MODIFY

`ROOM_LIST_FOOTER_CLASS`(현재 99행)와 `ROOM_LIST_ENTER_BTN_CLASS`(현재 120행) 두 상수만 바꾼다.

```js
// 셸 레벨 하단 영역입니다. 페이지네이션이 목록 패널 내부로 이동했으므로,
// 이제는 입장하기 버튼만 담아 우측에 둡니다.
//
// pr-[11rem]: ModePageControls의 사운드 컨트롤(absolute bottom-4 right-4 sm:bottom-6
// sm:right-6)이 차지하는 자리를 비워 두기 위한 여백입니다. 게임 열 폭은 1192px 고정
// (viewportLayout.js)인데 사운드 폭은 vw 기반(soundControlLayout.js: 아이콘의 84% + 바)이라
// 화면이 넓을수록 열 안쪽으로 더 들어옵니다 — 1280px에서 129px, clamp 상한에 닿는
// 1460px 이상에서 약 161px이 최대입니다. 그래서 전 구간을 덮는 176px을 고정으로 씁니다.
// 후보 셋(footer 여백 / 사운드 래퍼 이동 / z-order) 중 이 방법을 고른 이유: 사운드 래퍼는
// gameMode·roomInvite 화면도 함께 쓰므로 옮기면 여러 화면이 바뀌고, z-order만 올리면
// 클릭은 되어도 그림은 그대로 겹칩니다(요구사항은 "겹치지 않게").
//
// pointer-events-none: 여백을 준 뒤에도 이 div의 박스는 사운드 컨트롤 위를 지나가므로,
// 빈 영역이 음소거 버튼·볼륨 슬라이더의 클릭을 가로채지 않도록 비워 둡니다.
// 실제 클릭은 아래 ROOM_LIST_ENTER_BTN_CLASS의 pointer-events-auto가 되살립니다.
export const ROOM_LIST_FOOTER_CLASS =
  "pointer-events-none flex shrink-0 items-center justify-end pr-[11rem]"
```

`ROOM_LIST_ENTER_BTN_CLASS`는 맨 앞에 `pointer-events-auto ` 를 붙인다(나머지 문자열은 그대로).

`RoomListShell.jsx`는 이미 이 두 상수를 쓰고 있으므로 JSX 변경은 없다.

### (2) `frontend/src/domains/game/mode/constants/__tests__/roomListLayout.test.js` — CREATE

`node:test` + `node:assert/strict`, 기존 관례(`ingameChatLayout.test.js`의 순수 계산 검증 + `InGameActionPanel.visualPolish.test.js`의 raw source 검증)를 따른다. 양쪽 값을 **하드코딩하지 않고 소스에서 뽑아** 계산하므로, 사운드 폭이나 셸 폭이 나중에 바뀌면 이 테스트가 먼저 깨진다.

- 헬퍼: `resolvePx(expr, viewportWidth)` — `clamp(a,b,c)` / `rem`(×16) / `vw`(×vw/100) / `px` 를 px 수치로 환산.
- 입력 수집:
  - `ROOM_LIST_FOOTER_CLASS`에서 `pr-[…]` 추출 → 여백 px.
  - `ROOM_LIST_SHELL_CLASS`에서 `w-[min(60rem,80vw)]`, `px-[clamp(...)]` 추출 → 셸 폭·좌우 패딩.
  - `SOUND_CONTROL_CLASSES`의 `iconSize`/`barWidth`/`iconOverlap` 파싱 → 사운드 폭.
  - `ModePageControls.jsx`를 `readFile`로 읽어 `bottom-4 right-4 sm:bottom-6 sm:right-6` 래퍼가 있는지 확인하고 `sm:right-6` → 24px 오프셋을 뽑는다.
  - `GAME_VIEWPORT_MAX_WIDTH_PX`(1192)를 `viewportLayout.js`에서 import.
- 검증 1: 뷰포트 `[1280, 1366, 1440, 1536, 1920, 1024, 768]` 각각에 대해
  `버튼오른쪽 = (열폭 + 셸폭)/2 − 셸패딩 − 여백` ≤ `사운드왼쪽 = 열폭 − 24 − 사운드폭` 임을 assert(1280은 실패 메시지에 겹침 px을 함께 출력).
- 검증 2: 남는 footer 폭(`셸폭 − 2·패딩 − 여백`)이 버튼 `min-w` 상한(7.75rem=124px)보다 크다 — 여백 때문에 버튼이 잘리지 않는지.
- 검증 3: `ROOM_LIST_FOOTER_CLASS`에 `pointer-events-none`, `ROOM_LIST_ENTER_BTN_CLASS`에 `pointer-events-auto`가 함께 있다(둘 중 하나만 있으면 버튼이 죽으므로 쌍으로 assert).
- 검증 4(요구사항 2 회귀 방지): `MatchingPageControls.jsx`·`GameSetupPageControls.jsx` raw source에 사운드 래퍼가 `z-30`으로 남아 있고, `MATCHING_ACTION_BTN_ROW_CLASS`/`GameSetupCreateButton`의 주 버튼이 가운데 정렬(`justify-center`/`mx-auto`)이라 오른쪽 아래로 흐르지 않는다는 것을 확인한다. 계산으로 두 화면 주 버튼의 오른쪽 끝이 사운드 왼쪽보다 작음을 assert.

## 5. 검증

1. `cd frontend && npm test` — 기존 79개 테스트 스위트 + 신규 파일 전부 PASS.
2. `cd frontend && npm run build` — vite build PASS.
3. `cd frontend && npm run lint`, `npm run check:utf8` — 상수 파일에 한글 주석을 추가하므로 인코딩 검사도 함께 돌린다.
4. 수동/육안: `/multiplay` 1280×720에서 입장 버튼이 사운드 아이콘 왼쪽에 완전히 떨어져 있고, 음소거 버튼·볼륨 슬라이더가 그대로 조작되는지. (e2e/**는 수정 금지라 스펙은 건드리지 않는다. 기존 join 시나리오의 "선택한 방 입장" 클릭은 이 변경으로 가로채임 없이 성공해야 한다.)

## 6. 위험 요소

- **버튼이 눈에 띄게 왼쪽으로 이동한다(약 176px).** 이는 겹침을 없애기 위한 의도된 시각 변화이고, 세 후보 중 영향 범위가 가장 좁다. 근거는 상수 주석에 남긴다.
- **`pointer-events-none`/`auto` 짝 누락 시 버튼이 완전히 죽는다.** 두 상수를 반드시 같은 커밋에서 바꾸고, 테스트 검증 3이 이를 잡는다.
- **Tailwind가 `pr-[11rem]`을 못 뽑는 경우.** 같은 파일의 다른 arbitrary 클래스가 이미 정상 동작하므로(.js 소스 스캔 확인됨) 가능성은 낮지만, `npm run build` 후 CSS에 `padding-right:11rem`이 포함되는지로 확인한다.
- **아주 좁은 폭(<640px)에서는 여유가 10px대로 줄어든다.** 게임 열이 1192px 고정 설계라 1232px 미만에서는 셸 자체가 이미 가로 넘침 상태이므로 대상 범위 밖으로 본다. 테스트는 768px까지만 보장한다.
- **사운드 컨트롤 폭이 나중에 커지면 다시 겹칠 수 있다.** 신규 테스트가 두 값을 소스에서 읽어 비교하므로 조용히 깨지지 않는다.

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | frontend/src/domains/game/mode/constants/roomListLayout.js |  | footer 우측 여백(pr-[11rem])과 pointer-events 짝 조정, 선택 근거 주석 |
| CREATE | frontend/src/domains/game/mode/constants/__tests__/roomListLayout.test.js |  | 입장 버튼과 사운드 컨트롤 비겹침 계산 회귀 테스트 |
| REFERENCE | frontend/src/domains/game/mode/components/roomList/RoomListShell.jsx |  | footer·입장 버튼 클래스 사용처 확인 |
| REFERENCE | frontend/src/domains/game/mode/components/ModePageControls.jsx |  | 사운드 래퍼 위치·z 컨텍스트 근거 |
| REFERENCE | frontend/src/domains/game/mode/pages/MultiplayEntryPage.jsx |  | 셸과 컨트롤의 형제 배치 구조 |
| REFERENCE | frontend/src/shared/constants/soundControlLayout.js |  | 사운드 컨트롤 폭 산출 근거 |
| REFERENCE | frontend/src/shared/layouts/constants/viewportLayout.js |  | 게임 열 폭 1192px 기준 |
| REFERENCE | frontend/src/app/index.css |  | .viewport-shell__game 폭·containment 확인 |
| REFERENCE | frontend/src/domains/game/matching/components/MatchingPageControls.jsx |  | 요구사항 2 확인 대상(수정 없음) |
| REFERENCE | frontend/src/domains/game/matching/constants/matchingPopupStyles.js |  | 매칭 주 조작 버튼 배치 계산 근거 |
| REFERENCE | frontend/src/domains/game/setup/components/GameSetupPageControls.jsx |  | 요구사항 2 확인 대상(수정 없음) |
| REFERENCE | frontend/src/domains/game/setup/components/GameSetupCreateButton.jsx |  | 게임 만들기 버튼 배치 계산 근거 |
