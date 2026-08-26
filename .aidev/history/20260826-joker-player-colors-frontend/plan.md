# 참가자 색상 적용 (frontend) — 구현 계획

## 0. 현재 코드가 실제로 하는 일 (확인한 사실)

색은 이미 "테마(theme)"라는 이름으로 한 곳에 모여 있고, **결정만 프런트가 랜덤으로** 하고 있다.

- `frontend/src/domains/game/ingame/constants/ingamePlayerTheme.js:8` — 고정 10색 팔레트
  `INGAME_PLAYER_THEME_PALETTE`가 이미 존재한다. 즉 요구 1의 "팔레트 상수 한 곳"은 **이미
  이 파일이며, 새로 만들 필요가 없다**. `resolveInGamePlayerTheme(paletteIndex)`가
  `paletteIndex % 10`로 순환 매핑하고 `{ paletteIndex, id, color, styles }`를 돌려준다.
- `frontend/src/domains/game/ingame/utils/assignInGamePlayerThemeIndices.js:8` — **`Math.random()`
  기반 Fisher-Yates 셔플**. 프런트 전체에서 색을 정하는 유일한 랜덤 지점이다
  (`Math.random` grep 결과 프런트에서 색 용도로 쓰이는 곳은 이 파일뿐).
- `buildInGamePreviewPlayers.js:16` 이 그 셔플을 호출해 더미 플레이어에 `themeIndex/theme`를 심고,
  `useInGamePlayerSession.js:30` 이 실제 서버 참가자(`sourcePlayers`)를 그 더미와
  `mergeSourcePlayerWithPreview`로 병합한다 → **서버 참가자의 색이 창마다 랜덤**이 되는 원인.
- 색 소비처는 전부 세션 컨텍스트 한 곳에서 나온다:
  - 카드 테두리·명패: `InGamePlayerBoard.jsx:31`이 `theme={player.theme}` → `InGamePlayerCard.jsx:50`
    (`theme?.styles` → `InGamePlayerFrameStroke` color + 명패 `color`). **theme이 null이면 이미
    스트로크를 안 그리고 명패는 클래스 기본색(`text-[#3a1a0c]`)으로 떨어진다.**
  - 채팅 닉네임: `InGameChatMessageRow.jsx:21` → `getThemeStylesByPlayerId(playerId)`. **null이면
    inline color 없이 기본 타이포 색으로 떨어진다.**
  - 같은 경로를 `InGameVoteStatusRow.jsx:30`, `PlayerRecordListRow.jsx:36`도 쓴다(자동으로 함께 일원화됨).
- backend는 직전 slice에서 `PLAYER_COLOR_COUNT = 10`(`backend/game-core/gameSession.js:41`)로
  `colorIndex`를 배정하고 `buildGameStartedPayload`(`:823`), `buildSessionSnapshot`(`:1910`),
  `buildEndedRoleReveals`(`:270`)에 실어 보낸다. **팔레트 크기 10이 서로 맞는다.**

따라서 이 작업의 본질은 "색을 새로 그리는 것"이 아니라 **색의 출처를 랜덤 → 서버 colorIndex로
갈아끼우고, 없을 때 기존 기본 렌더링으로 떨어지게 하는 것**이다. 카드/채팅 컴포넌트 자체는
손대지 않는다(요구의 "카드·채팅의 색 이외 스타일 수정 금지"를 구조적으로 보장).

### 사전 결정 두 가지 (가정 명시)

1. **팔레트 hex 값은 그대로 둔다.** 요구 1이 "기존 팔레트가 있으면 그것을 이 상수로 승격해
   재사용한다"고 명시했고, 실제로 이미 한 곳에 있다. 다만 현재 10색 중 `#0a4a00`, `#6c0000`,
   `#033856`, `#101e85`는 어두운 배경에서 구분성이 낮고 `id: "pink"`가 `#ffffff`로 잘못 붙어 있다 —
   이는 "어두운 배경 위에서 서로 구분되는 색" 조건과 어긋난다. 색 재조색은 테스트로 검증할 수 없는
   순수 시각 판단이라 이번 slice에서 임의로 바꾸지 않고 **리스크로 보고**한다(원하면 별도 지시로
   hex만 교체하면 되고, 이 계획의 어떤 코드도 hex 값에 의존하지 않는다).
2. **fallback = 기존 기본색 = "테마 없음" 렌더링.** `colorIndex`가 없는 참가자는 `theme: null`이
   되어 카드는 컬러 스트로크 없이 명패 기본색(`text-[#3a1a0c]`), 채팅은 inline color 없이 기본
   타이포 색으로 그려진다 — 지금도 theme이 없을 때 실제로 그렇게 그려지는 경로다. 새 기본 hex를
   발명하지 않으므로 "색 이외 스타일 변경 없음"이 유지된다. 더미(프리뷰) 플레이어만 서버 상태가
   없으므로 `index % 10`의 결정적 색을 계속 갖는다(랜덤만 제거).

---

## 1. 파일별 변경 내용

### 1-1. `frontend/src/domains/game/ingame/constants/ingamePlayerTheme.js` (MODIFY)

- 팔레트가 **backend `PLAYER_COLOR_COUNT`(10)와 1:1 계약**임을 파일 상단 주석에 명시한다
  (프런트/백엔드 공유 상수 모듈이 없어 수동 동기화하는 이 저장소의 기존 관례 —
  `buildPlayerSessionSourceFromGameState.js:1`의 `ROLE_TEAMS` 주석과 같은 형식).
- 새 함수 추가:
  ```
  resolveInGamePlayerThemeByColorIndex(colorIndex)
  ```
  - `Number.isInteger(colorIndex) && colorIndex >= 0`이 아니면 **`null`**(= fallback 신호).
    `undefined`(구세션), `null`, 문자열, 소수, 음수 모두 여기로 떨어진다.
    음수를 걸러야 하는 이유: `-1 % 10 === -1`이라 그대로 넘기면 팔레트 조회가 `undefined`가 되어
    `resolveInGamePlayerTheme`이 터진다(기존 함수의 잠복 결함이기도 하다).
  - 유효하면 기존 `resolveInGamePlayerTheme(colorIndex)`를 그대로 위임 → 범위 밖 인덱스는
    `% 10`으로 순환(10→0, 13→3, 25→5).
- `resolveInGamePlayerTheme` / `resolveInGamePlayerThemeEmphasized` / 팔레트 값 자체는 그대로 둔다.

### 1-2. `frontend/src/domains/game/ingame/utils/assignInGamePlayerThemeIndices.js` (MODIFY = 삭제)

- 파일을 지운다. 요구 4의 "랜덤 색 결정 로직 제거"의 대상이 정확히 이 파일이다.
  import하는 곳은 `buildInGamePreviewPlayers.js` 하나뿐이고(grep으로 확인), 전용 테스트 파일도 없다.

### 1-3. `frontend/src/domains/game/ingame/utils/buildInGamePreviewPlayers.js` (MODIFY)

- `assignInGamePlayerThemeIndices` import·호출 제거.
- 더미 플레이어의 `themeIndex`를 `index % INGAME_PLAYER_THEME_PALETTE_SIZE`로 결정적으로 계산
  (`resolveInGamePlayerTheme(themeIndex)`는 그대로). 서버 상태 없이 화면만 볼 때의 프리뷰 색이
  더 이상 매 렌더마다 흔들리지 않는다.
- 주석의 "매 호출 시 팔레트 셔플" 문구를 실제 동작(슬롯 순서 고정 + 서버 참가자는 colorIndex가
  덮어씀)에 맞게 고친다.

### 1-4. `frontend/src/domains/game/ingame/utils/buildPlayerSessionSourceFromGameState.js` (MODIFY, symbol `buildPlayerSessionSourceFromGameState`)

- **game_started 경로의 파서.** `sourcePlayers` 원소에 `colorIndex`를 실어 보낸다.
- 이 파일의 기존 계약("해당 없는 항목에는 키 자체를 만들지 않는다" — role/team/isAlly와 동일)을
  따라 **유효한 비음수 정수일 때만 `colorIndex` 키를 만든다**:
  `...(Number.isInteger(player.colorIndex) && player.colorIndex >= 0 ? { colorIndex: player.colorIndex } : {})`
- **검증 실패로 전체를 거부하지 않는다.** 색은 순수 표시용이므로, 형태가 이상한 colorIndex 하나가
  참가자 목록 전체를 preview fallback으로 무너뜨리면 안 된다(이 함수의 EMPTY_RESULT 반환 조건은
  uuid/nickname/alive/self 계약 위반으로 한정한다). 이 판단을 함수 스펙 주석에 명시한다.

### 1-5. `frontend/src/domains/game/ingame/utils/mergeSourcePlayerWithPreview.js` (MODIFY, symbol `mergeSourcePlayerWithPreview`)

- **색 일원화가 실제로 일어나는 지점.** 지금은 preview의 랜덤 `themeIndex/theme`를 그대로
  물려받는다 — 이 상속을 끊는다.
  ```
  const theme = resolveInGamePlayerThemeByColorIndex(player.colorIndex)
  return { ...preview, ..., themeIndex: theme ? theme.paletteIndex : null, theme }
  ```
  (`...preview` 뒤에 명시 키로 덮어써서, 서버 참가자는 절대 preview 색을 쓰지 않는다.)
- role/team/isAlly의 조건부 복사 규칙은 건드리지 않는다.
- 스펙 주석에 "colorIndex가 없거나 형태가 어긋나면 theme=null → 소비처가 기존 기본색으로 그린다"를 적는다.

### 1-6. `frontend/src/domains/game/ingame/hooks/useInGamePlayerSession.js` (MODIFY, symbol `useInGamePlayerSession`)

- `getThemeStylesByPlayerId`가 이제 `theme: null`을 만날 수 있으므로 null-safe로 만든다
  (현재 `player.theme.styles`는 그대로 두면 fallback 참가자에서 **TypeError로 인게임 화면 전체가
  터진다** — 이 slice에서 반드시 함께 고쳐야 하는 지점):
  - `options.emphasized`일 때: `themeIndex`가 정수가 아니면 `null` 반환(강조 스타일도 없음).
  - 아니면 `player.theme?.styles ?? null`.
- `getThemeByPlayerId`는 이미 `?? null`이라 그대로.

### 1-7. `frontend/src/domains/game/ingame/store/applySessionSnapshot.js` (MODIFY, symbol `applySessionSnapshotPure`)

- **재접속 유지의 유일한 누락 지점.** 이 함수만 `players`를 화이트리스트로 새로 만들기 때문에
  (`:193`) 지금은 스냅샷을 받는 순간 colorIndex가 사라진다. (`setGamePayload`는 `{...p, alive:true}`,
  `applyNightResultAppliedPayload`/`applyTribunalResolvedPure`는 `{...p, alive}` 전개라 이미 보존된다 —
  확인 완료. 그래서 `ingameStore.js`/`applyTribunalResolved.js`는 코드 변경이 없다.)
- `nextPlayers` 매핑에 1-4와 같은 조건부 키를 추가한다(유효한 비음수 정수일 때만 `colorIndex`).
- roster 검증 루프에서는 colorIndex를 **거부 사유로 삼지 않는다.** 이 파일의 all-or-nothing 관례와
  다른 판단이므로 이유를 주석으로 남긴다: 색은 순전히 표시용이고, 서버가 이상한 색 값 하나를
  보냈다는 이유로 재접속 하이드레이션 전체를 거부하면 사용자가 stale 상태에 갇힌다 —
  잘못된 값은 키를 만들지 않아 기본색으로 떨어지는 것으로 충분하다.

---

## 2. 검증 계획

**중요한 제약(실측):** 이 저장소의 프런트 테스트는 `node --experimental-test-module-mocks --test
src/**/__tests__/*.test.js`로 **변환기 없이** 돈다. `.jsx`는 파싱 자체가 안 되고
(`InGameActionPanel.presentation.test.js:9-14` 주석이 같은 제약을 명시), `InGamePlayerCard.jsx`는
`@/shared/ui/PublicAsset`(vite alias)·`PlayerPortraitFrame.jsx` 등을 타고 들어가 node에서는
resolve조차 되지 않는다. `InGameChatMessageRow.jsx`도 `InGameChatVariantContext.jsx`를 import한다.
**즉 카드/채팅 컴포넌트를 그대로 render하는 DOM 테스트는 이 저장소에서 물리적으로 불가능하다.**
컴포넌트를 createElement `.js`로 개종하는 방법도 위 alias/자식 `.jsx` 체인 때문에 성립하지 않는다.

그래서 "카드·채팅 DOM 테스트"를 두 겹으로 나눠 실제로 렌더 가능한 최하위 이음매에서 증명한다:

**(A) 팔레트 매핑 단위 테스트** — CREATE `constants/__tests__/ingamePlayerTheme.test.js`
- `colorIndex` 0..9 → `INGAME_PLAYER_THEME_PALETTE[i].color`와 정확히 일치.
- 범위 밖 순환: 10→0, 13→3, 25→5 (`paletteIndex`도 순환된 값으로 정규화됨).
- fallback: `undefined`/`null`/`-1`/`1.5`/`"3"` → `null` (throw하지 않음).
- 팔레트 길이가 10(backend `PLAYER_COLOR_COUNT`)이고, 10색의 hex가 서로 중복되지 않음.

**(B) 실제 DOM 렌더 테스트** — CREATE `hooks/__tests__/useInGamePlayerSession.theme.test.js`
(jsdom + `@testing-library/react`의 `renderHook`, `useInGameControlPanelLayout.test.js`와 동일한 부트스트랩)
- `sourcePlayers`에 `colorIndex: 7`인 참가자 → `getThemeByPlayerId(uuid).color === PALETTE[7].color`,
  `getThemeStylesByPlayerId(uuid).color`도 동일 → **카드가 스트로크·명패에 넣는 바로 그 값**이자
  **채팅 닉네임이 inline color로 넣는 바로 그 값**.
- `colorIndex` 없는 참가자 → `getThemeByPlayerId` / `getThemeStylesByPlayerId` 모두 `null`
  (= 카드는 스트로크 없이 명패 기본색, 채팅은 inline color 없음), 그리고 **throw하지 않음**.
- `emphasized: true`도 colorIndex 있으면 같은 색 + 강화 stroke scale, 없으면 `null`.
- 참가자마다 서로 다른 colorIndex → 서로 다른 색(창 간 일관성의 기반).
- 서버 참가자가 preview 색을 상속하지 않음: 같은 인덱스 슬롯의 preview 색과 다른 colorIndex를 줘
  결과가 colorIndex 쪽을 따르는지 확인.

**(C) 카드·채팅 프로덕션 배선 테스트(소스 레벨)** — CREATE
`components/board/__tests__/InGamePlayerCard.playerColor.test.js`,
`components/chat/__tests__/InGameChatMessageRow.playerColor.test.js`
(`InGameActionPanel.*.test.js` / `InGamePage.productionSource.test.js`가 쓰는 `readFile` + 정규식 관례)
- 카드: 테두리 스트로크가 `styles.color`에서만 오고(`InGamePlayerFrameStroke ... color={styles.color}`),
  `styles`가 없으면 스트로크 노드를 아예 그리지 않으며, 명패 색도 `styles.color`에서만 온다.
  즉 카드에 색을 정하는 자체 로직(랜덤/해시/하드코딩 hex)이 없다.
- 채팅: 닉네임 span의 `color`가 `getThemeStylesByPlayerId(playerId)` 결과에서만 오고,
  null이면 inline style을 붙이지 않는다.
- 두 파일 모두 `INGAME_PLAYER_THEME_PALETTE`를 직접 import하지 않는다(= 색 결정은 세션 경로 일원화).

**(D) store 보존 테스트**
- MODIFY `store/__tests__/ingameStore.test.js`: `setGamePayload`가 game_started의 `colorIndex`를
  `state.players`에 그대로 남기고, `alive` 기본값 주입이 그 값을 지우지 않음.
- MODIFY `store/__tests__/applySessionSnapshot.test.js`: 스냅샷 응답의 `colorIndex`가 재접속 후
  `state.players`에 보존됨 / 키가 없는 구세션 응답은 `colorIndex` 키 없이 통과(거부 아님) /
  이상한 값(`-1`, `"3"`, `null`)은 키를 만들지 않되 **스냅샷 자체는 정상 반영**됨.
- MODIFY `utils/__tests__/buildPlayerSessionSourceFromGameState.test.js`: colorIndex 전달 /
  부재 시 키 없음 / 이상한 값이 있어도 목록 전체가 preview fallback으로 무너지지 않음.
- MODIFY `utils/__tests__/mergeSourcePlayerWithPreview.test.js`: colorIndex → `theme.color`가
  팔레트 값 / 부재 시 `theme === null`, `themeIndex === null` / preview의 themeIndex를 상속하지 않음.

**(E) 회귀**
- `cd frontend && npm test` 전체 PASS (기존 테스트 무수정 통과가 목표 — 새 키를 조건부로만
  만들기 때문에 `applySessionSnapshot.test.js:82`의 `deepEqual(players, [...])` 같은 정확 비교가
  깨지지 않는다).
- `cd frontend && npm run build` PASS, `npm run lint` PASS(삭제한 모듈의 잔여 import가 없는지),
  `npm run check:utf8` PASS(한글 주석 추가가 있으므로).
- backend/e2e는 **한 줄도 건드리지 않는다.**

---

## 3. 잘못될 수 있는 것 (리스크)

| 리스크 | 내용 | 대응 |
| --- | --- | --- |
| **런타임 크래시** | `getThemeStylesByPlayerId`의 `player.theme.styles`를 고치지 않은 채 theme=null을 도입하면 채팅/투표/기록 패널이 즉시 TypeError로 터진다 | 1-6을 같은 커밋에서 반드시 함께 반영. (B) 테스트가 이 경로를 직접 잡는다 |
| **구세션 카드가 밋밋해짐** | colorIndex 없는 참가자는 컬러 테두리를 잃는다 | 요구 3의 "기존 기본색 fallback"에 대한 해석(§0-2). 대안(슬롯 인덱스 색 fallback)을 원하면 `mergeSourcePlayerWithPreview` 한 줄만 바꾸면 되도록 격리해 둔다 |
| **DOM 테스트 범위** | 카드·채팅 컴포넌트를 직접 render하는 테스트는 이 저장소에서 불가(§2 제약) | (B) 실제 렌더 + (C) 소스 배선으로 체인 전체를 증명하고, 이 한계를 계획에 명시(위장하지 않음) |
| **팔레트 hex 품질** | 10색 중 4색이 어두운 배경에서 구분이 어렵고 `pink→#ffffff` 라벨이 잘못됨 | 이번 slice에서는 값 불변(기존 팔레트 승격). 별도 지시로 hex만 교체 가능하도록 코드가 hex에 비의존 |
| **backend 팔레트 크기 변경** | backend `PLAYER_COLOR_COUNT`가 10을 벗어나면 색이 조용히 겹친다 | `% PALETTE_SIZE` 순환으로 절대 crash하지 않고, (A)에서 길이 10 계약을 테스트로 못박고 양쪽 파일에 동기화 주석 |
| **결과 화면(winResult.reveals)** | `normalizeWinResult.js`가 다섯 필드만 복사해 reveals의 colorIndex를 버린다 | 요구 3이 "인게임 카드·채팅"만 지정했으므로 **이번 범위 밖**. 결과 페이지 색상은 후속 slice로 남긴다(파일도 건드리지 않음) |
| **eslint** | 삭제한 모듈을 참조하는 잔여 import | `npm run lint`로 확인 |

---

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | frontend/src/domains/game/ingame/constants/ingamePlayerTheme.js |  | 팔레트 상수 단일 출처 + colorIndex→테마 해석 함수 추가(범위 순환·무효값 null) |
| MODIFY | frontend/src/domains/game/ingame/utils/assignInGamePlayerThemeIndices.js |  | 랜덤 색 결정 로직 파일 삭제 |
| MODIFY | frontend/src/domains/game/ingame/utils/buildInGamePreviewPlayers.js | buildInGamePreviewPlayers | 프리뷰 색을 슬롯 인덱스 기반 결정적 배정으로 교체 |
| MODIFY | frontend/src/domains/game/ingame/utils/buildPlayerSessionSourceFromGameState.js | buildPlayerSessionSourceFromGameState | game_started 참가자에 colorIndex를 조건부로 전달 |
| MODIFY | frontend/src/domains/game/ingame/utils/mergeSourcePlayerWithPreview.js | mergeSourcePlayerWithPreview | 서버 colorIndex로 theme 결정, 부재 시 theme=null fallback |
| MODIFY | frontend/src/domains/game/ingame/hooks/useInGamePlayerSession.js | useInGamePlayerSession | theme 부재를 안전하게 다루는 테마 조회(null 반환, 강조 경로 포함) |
| MODIFY | frontend/src/domains/game/ingame/store/applySessionSnapshot.js | applySessionSnapshotPure | 재접속 스냅샷에서 colorIndex 보존(거부 사유로는 삼지 않음) |
| CREATE | frontend/src/domains/game/ingame/constants/__tests__/ingamePlayerTheme.test.js |  | colorIndex→색 매핑·순환·fallback 단위 테스트 |
| CREATE | frontend/src/domains/game/ingame/hooks/__tests__/useInGamePlayerSession.theme.test.js |  | 실제 DOM 렌더로 colorIndex 반영·fallback·preview 미상속 검증 |
| CREATE | frontend/src/domains/game/ingame/components/board/__tests__/InGamePlayerCard.playerColor.test.js |  | 카드 테두리·명패 색이 세션 테마에서만 오고 자체 색 로직이 없음을 증명 |
| CREATE | frontend/src/domains/game/ingame/components/chat/__tests__/InGameChatMessageRow.playerColor.test.js |  | 채팅 닉네임 색이 세션 테마에서만 오고 부재 시 inline 색이 없음을 증명 |
| MODIFY | frontend/src/domains/game/ingame/utils/__tests__/buildPlayerSessionSourceFromGameState.test.js |  | colorIndex 전달·부재·무효값 케이스 추가 |
| MODIFY | frontend/src/domains/game/ingame/utils/__tests__/mergeSourcePlayerWithPreview.test.js |  | theme이 colorIndex에서 오고 부재 시 null임을 검증 |
| MODIFY | frontend/src/domains/game/ingame/store/__tests__/applySessionSnapshot.test.js |  | 재접속 colorIndex 보존·구세션 통과 테스트 추가 |
| MODIFY | frontend/src/domains/game/ingame/store/__tests__/ingameStore.test.js |  | game_started colorIndex 보존 테스트 추가 |
| REFERENCE | frontend/src/domains/game/ingame/components/board/InGamePlayerCard.jsx |  | 테두리·명패 색 소비 구조(변경 없음, 테스트 대상) |
| REFERENCE | frontend/src/domains/game/ingame/components/chat/InGameChatMessageRow.jsx |  | 닉네임 색 소비 구조(변경 없음, 테스트 대상) |
| REFERENCE | frontend/src/domains/game/ingame/store/ingameStore.js |  | setGamePayload가 전개 복사로 colorIndex를 이미 보존함을 확인 |
| REFERENCE | backend/game-core/gameSession.js |  | PLAYER_COLOR_COUNT=10 및 colorIndex payload 계약 |
