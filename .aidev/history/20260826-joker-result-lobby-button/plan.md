# 결과 페이지 로비 복귀 버튼 (frontend) — 구현 계획

## 1. 현재 코드 확인 결과

**`frontend/src/domains/game/result/page/GameResultPage.jsx:20-37`** — 훅 4개(`useNavigate`/`useSearchParams`/`useGameResultData`/`useGameResultPreview`)를 분기 없이 호출하고, `view`가 없으면 `navigate("/multiplay", { replace: true })`, 있으면 `<GameResultShell {...view} />` 하나만 렌더한다. 버튼이 들어갈 자리는 이 return 안뿐이다(`components/**`는 수정 금지).

**`frontend/src/domains/game/ingame/utils/createSessionEndFinalizer.js:10-16`** — `clearGame()` → `clearRoom()` → `navigate("/multiplay", { replace: true })`. 주석이 명시하듯 "명시적 이탈 ack 성공 · game_ended · 자신의 disconnect" **세 경로가 모두 이 함수 하나만 거치게** 해 결과를 동일하게 보장하는 단일 choke point이고, 재호출도 안전하다(멱등). → **그대로 재사용한다.**

**`frontend/src/domains/game/ingame/utils/createLeaveGameSessionRequest.js:12-29`** — 재사용 불가로 판정한다. 이유 두 가지:
- `if (response?.ok) finalize()` — 즉 **성공 ack에서만 finalize**한다. JSDoc이 "오직 '지금 이 gameId에 대한' 성공 ack만 finalize를 트리거한다"를 명시적 계약으로 못박고 있어, 실패에도 navigate하도록 바꾸면 인게임 나가기/뒤로가기 계약이 함께 깨진다.
- 콜백형 `socket.emit(..., cb)`이라 **timeout 개념 자체가 없다**. ack가 유실되면 콜백이 영영 오지 않고 유저는 결과 페이지에 갇힌다 — 요구 2가 막으려는 바로 그 상태다.

**`frontend/src/domains/game/ingame/store/ingameStore.js:238`** — `clearGame: () => set({ gameId: null, state: null, error: null, nightPrivateResult: null })`. `winResult`는 `state.winResult`(`useGameResultData:16`가 그렇게 읽는다)이므로 `state: null`로 **winResult까지 함께 정리된다**. 별도 액션은 필요 없다.

**소켓 ack 관례** — 저장소 전역에서 `socket.timeout(MS).emitWithAck(event, payload)` + `try/catch {}`가 확립된 형태다(`useInGameRoleRevealAck.js:113`, `useInGameNightActionSubmit.js:104`, `useMatchingRoom.js:423` 등). 타임아웃 상수는 예외 없이 **5000ms**(`ACK_TIMEOUT_MS`/`SEND_TIMEOUT_MS`/`SUBMIT_TIMEOUT_MS`/`DAY_VOTE_ACK_TIMEOUT_MS` 전부 5000). 이벤트명은 상수 파일 없이 raw string `"leave_game_session"`을 쓴다(`createLeaveGameSessionRequest.js:20`).

**빨간 버튼 에셋/컴포넌트** — `frontend/public/button/버튼(취소 및 부정).png`가 붉은 프레임 버튼이다(`버튼(수락 및 긍정).png`는 녹색). 이미 `roomInviteAssets.cancelButton`, `gameMatchingAssets.deleteRoomButton`(방 삭제/방 나가기)로 쓰이는 "부정/이탈" 계열 에셋이다. 이 위에 글자를 올리는 공통 컴포넌트는 **`frontend/src/domains/game/mode/components/LabelledActionButton.jsx`** 하나뿐이고(`RoomInvitePage.jsx:51`의 "취소"/"참여하기"가 사용), `{ src, label, onClick, className, variants }`를 받아 `motion.button` + `PublicAsset` + label span을 그린다. `variants` 없이도 동작한다(framer-motion에서 undefined variants는 무시). → **새 버튼 스타일을 만들지 않고 이 컴포넌트 + 이 에셋을 그대로 쓴다.**
- 폭은 `ROOM_CODE_ACTION_BTN_CLASS = "interactive-scale relative w-[clamp(11.4rem,19%,15.25rem)] shrink-0 leading-none"` — preferred가 부모 대비 `19%`다. 부모 래퍼를 좁게(`w-[11.4rem]`) 주면 19%가 min 아래로 떨어져 **항상 11.4rem으로 고정**된다. 결정적이고 예측 가능한 크기다.

**테스트 하네스** — `frontend/package.json:11` `node --experimental-test-module-mocks --test src/**/__tests__/*.test.js`. **`.test.js`만 수집한다(.jsx 없음)**. `.jsx`는 로더가 없어 직접 렌더할 수 없어서, 이 저장소는 `GameResultPage.productionSource.test.js`처럼 **raw source 검증**을 확립된 대체 수단으로 쓴다. `zustand` 스토어는 순수 create라 node 테스트에서 직접 import해 쓸 수 있다(`matchingStore.js`도 persist 없음).

**기존 `GameResultPage.productionSource.test.js`의 제약(반드시 지킬 것)** — `assert.doesNotMatch(source, /players\s*[:=]/)`, `/mvp\s*[:=]/`, `<GameResultShell` 등장 정확히 1회, `<GameResultShell {...view} />` 형태 유지, `navigate("/multiplay", { replace: true })` 문자열 유지. 새로 넣는 코드에 `players:`/`mvp:` 같은 토큰이 들어가면 기존 테스트가 깨진다.

---

## 2. 파일별 변경 내용

### (A) CREATE `frontend/src/domains/game/result/utils/createGameResultExitRequest.js`

이번 슬라이스의 유일한 로직. React·라우터·소켓 싱글턴에 의존하지 않는 순수 factory라 그대로 단위 테스트한다.

```js
export const LEAVE_GAME_SESSION_ACK_TIMEOUT_MS = 5000

export function createGameResultExitRequest({
  getSocket,
  getCurrentGameId,
  finalize,
  timeoutMs = LEAVE_GAME_SESSION_ACK_TIMEOUT_MS,
}) {
  let pending = false

  return async () => {
    if (pending) return
    pending = true
    try {
      const gameId = getCurrentGameId()
      const socket = gameId ? getSocket() : null

      if (socket && gameId) {
        try {
          await socket.timeout(timeoutMs).emitWithAck("leave_game_session", { gameId })
        } catch {
          // ack 실패·유실·timeout을 여기서 삼킨다.
        }
      }

      finalize()
    } finally {
      pending = false
    }
  }
}
```

JSDoc으로 남길 계약:
- **finalize는 어느 경로에서든 정확히 한 번 호출된다** — ack `{ok:true}`, ack `{ok:false}`(reject가 아니라 정상 resolve), timeout/네트워크 오류(reject), gameId 없음(preview), socket 없음. 이탈 실패가 유저를 결과 페이지에 가두면 안 된다는 요구 2가 이 무조건성의 근거다.
- **ack 실패를 삼켜도 되는 이유**: backend `handleLeaveGameSession`은 멱등이라 이미 정리된 세션에도 `{ ok: true }`를 주고, 직전 슬라이스에서 ENDED 세션 재접속 자동 정리까지 들어갔다. 즉 클라이언트가 재시도할 이유가 없다.
- **gameId가 없으면 `getSocket()`조차 부르지 않는다**(요구 4). `gameId ? getSocket() : null`의 단락 평가가 그 계약이고, 테스트가 `getSocket` 호출 횟수 0으로 못박는다.
- `pending` 가드: 연타로 leave가 두 번 나가는 것을 막는다. finalize가 navigate까지 하므로 실질적으로는 첫 클릭 이후 화면이 사라지지만, ack를 기다리는 5초 동안은 버튼이 살아 있으므로 필요하다.
- `createLeaveGameSessionRequest`의 "늦게 도착한 ack가 바뀐 세션의 store를 건드리는 것"을 막는 gameId 재조회 가드는 **여기서는 필요 없다** — 결과 페이지는 게임이 이미 끝난 화면이라 그 사이 새 세션이 들어올 경로가 없고, finalize는 await 직후 곧바로 실행되어 navigate로 화면을 떠난다. 이 판단을 주석으로 남긴다.

### (B) CREATE `frontend/src/domains/game/result/hooks/useGameResultLobbyExit.js`

배선만 하는 얇은 훅(로직 없음). `useGameResultData.js`가 이미 `../../ingame/store/ingameStore.js`를 import하는 선례가 있어 result→ingame 참조는 이 도메인의 기존 관례다.

```js
import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { getSocket } from "@/shared/socket/socketClient.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "../../ingame/store/ingameStore.js"
import { createSessionEndFinalizer } from "../../ingame/utils/createSessionEndFinalizer.js"
import { createGameResultExitRequest } from "../utils/createGameResultExitRequest.js"

export function useGameResultLobbyExit() {
  const navigate = useNavigate()

  return useMemo(
    () =>
      createGameResultExitRequest({
        getSocket,
        getCurrentGameId: () => useInGameStore.getState().gameId,
        finalize: createSessionEndFinalizer({
          clearGame: () => useInGameStore.getState().clearGame(),
          clearRoom: () => useMatchingStore.getState().clearRoom(),
          navigate,
        }),
      }),
    [navigate],
  )
}
```

- `useInGameExit:26-35`의 배선을 그대로 복제한다 — 다른 점은 `createExitConfirmController`(확인 대화상자)를 끼우지 않는다는 것뿐이다. 게임이 이미 끝난 화면이라 "정말 나가시겠습니까?"로 물을 대상이 없다. 이 판단을 주석으로 남긴다.
- `useBlocker`(POP 가로채기)도 붙이지 않는다 — 결과 페이지에서 뒤로가기를 막는 것은 요구 범위 밖이고, `useInGameExit`을 그대로 가져오면 인게임 전용 confirm까지 딸려온다.
- `useMemo([navigate])`로 요청 함수를 한 번만 만들어 (A)의 `pending` 가드가 리렌더를 건너 유지되게 한다.

### (C) MODIFY `frontend/src/domains/game/result/constants/gameResultAssets.js`

`GAME_RESULT_ASSETS`에 키 하나를 추가한다. 파일 관례대로 한글 경로에 `.normalize("NFD")`를 붙인다(macOS 파일명 정규화 대응 — 이 저장소 전역 관례).

```js
lobbyButton: "/button/버튼(취소 및 부정).png".normalize("NFD"),
```

기존 키·`resolve*` 함수는 건드리지 않는다.

### (D) MODIFY `frontend/src/domains/game/result/constants/gameResultLayout.js`

파일 끝에 래퍼 클래스 상수 하나를 추가한다(버튼 스타일 자체는 `LabelledActionButton`이 갖고 있으므로 **위치만** 정의한다).

```js
/** 로비 복귀 버튼 — 결과 화면 우하단 고정(버튼 자체 스타일은 LabelledActionButton 재사용) */
export const GAME_RESULT_LOBBY_BUTTON_WRAP_CLASS =
  "fixed bottom-[clamp(1rem,3.2vh,2.25rem)] right-[clamp(1.25rem,4vw,3rem)] z-20 flex w-[11.4rem] justify-center"
```

- `fixed`: 이 래퍼는 `GameResultShell`의 형제라서 `GAME_RESULT_PAGE_CLASS`(relative)의 자식이 아니다. 오버레이류가 전부 `fixed inset-0 z-[…]`를 쓰는 저장소 관례와 같은 선택이다.
- `z-20`: `GAME_RESULT_SHELL_CLASS`가 `z-10`이므로 그 위. 인게임 오버레이들이 쓰는 z-45 이상 대역과는 겹치지 않는다(결과 페이지에는 오버레이가 없다).
- `w-[11.4rem]`: 앞서 계산한 대로 `ROOM_CODE_ACTION_BTN_CLASS`의 `19%`를 min으로 떨어뜨려 버튼 폭을 11.4rem으로 고정한다.

### (E) MODIFY `frontend/src/domains/game/result/page/GameResultPage.jsx` (symbol `GameResultPage`)

훅 하나를 추가하고(다른 훅과 같은 무조건 호출 위치), return을 fragment로 감싼다.

```jsx
  const requestLobbyExit = useGameResultLobbyExit()
  ...
  if (!view) return null

  return (
    <>
      <GameResultShell {...view} />
      <div className={GAME_RESULT_LOBBY_BUTTON_WRAP_CLASS}>
        <LabelledActionButton
          src={GAME_RESULT_ASSETS.lobbyButton}
          label="로비로"
          onClick={requestLobbyExit}
        />
      </div>
    </>
  )
```

- 버튼은 `if (!view) return null` **아래**, 즉 실데이터·preview 어느 쪽으로 그려지든 항상 함께 렌더된다(요구 4의 "preview 모드에서도 버튼이 보이되").
- `<GameResultShell {...view} />`는 문자열 그대로 1회 유지 → 기존 테스트 4개가 그대로 통과한다.
- 파일 상단 JSDoc(`@flow`)에 "로비 복귀 버튼은 leave ack의 성패와 무관하게 항상 같은 /multiplay 경로로 나간다"를 한 줄 추가한다.
- `players`/`mvp` 토큰을 새로 도입하지 않는다(기존 `doesNotMatch` 단언 보호).

**설계 판단 — 정리와 navigate의 순서.** 요구 3의 문면은 "navigate 후 정리"지만, `createSessionEndFinalizer`는 `clearGame → clearRoom → navigate` 순이다. 그럼에도 이 finalizer를 그대로 재사용한다. 근거:
- 요구 3 자체가 "기존 clearGame/세션 정리 액션이 있으면 재사용한다"를 지시하고 있고, 이 함수는 그 정리를 담은 **유일한** 함수다. 순서를 뒤집으려면 세 이탈 경로가 공유하는 choke point를 우회하는 네 번째 경로를 만들어야 하는데, 그 파일의 JSDoc이 명시한 불변식("세 경로 중 어느 것이 먼저 도착해도 결과가 동일")을 깨뜨린다.
- 관측 가능한 차이가 없다. `clearGame()`의 zustand set과 `navigate()`는 같은 동기 구간에서 연달아 실행되어 React 19가 한 번의 렌더로 배치한다. 설령 배치되지 않아도 중간 렌더는 `view === null`이라 `return null`(빈 화면 한 프레임)이고, 그 경우 페이지의 기존 effect가 **같은 목적지** `/multiplay`로 replace 이동시킨다. 도착점과 최종 store 상태(winResult 제거 포함)가 완전히 동일하다.
- 테스트는 두 효과(정리·navigate)가 각각 정확히 한 번 일어나는지를 검증하고, 호출 순서는 단언하지 않는다.

### (F) CREATE `frontend/src/domains/game/result/utils/__tests__/createGameResultExitRequest.test.js`

요구 "검증" 4항목을 그대로 덮는 동작 테스트. fake socket은 기존 테스트의 형태(`timeout(){ return socket }` + `emitWithAck`)를 따른다.

```js
function createFakeSocket() {
  const calls = []
  const socket = {
    timeoutCalls: [],
    timeout(ms) { socket.timeoutCalls.push(ms); return socket },
    emitWithAck(event, payload) {
      let settle
      const promise = new Promise((resolve, reject) => { settle = { resolve, reject } })
      calls.push({ event, payload, ...settle })
      return promise
    },
  }
  return { socket, calls }
}
```

테스트 목록:
1. **gameId 있음 → leave emit 후 navigate.** `emitWithAck`가 `("leave_game_session", { gameId: "g-1" })`로 정확히 1회, `timeout(5000)`이 선행. ack resolve 전에는 `finalize` 호출 0회(성급한 이동 없음), `{ ok: true }` resolve 후 정확히 1회.
2. **ack 실패(`{ ok: false }`) → 그래도 navigate.** resolve 후 finalize 1회.
3. **ack reject(timeout) → 그래도 navigate.** `reject(new Error("operation has timed out"))` 후 finalize 1회, 그리고 반환 Promise가 reject하지 않는다(`assert.doesNotReject`) — 클릭 핸들러에서 unhandled rejection이 새지 않음을 못박는다.
4. **gameId 없음(preview) → emit 없이 navigate.** `getCurrentGameId: () => null`. `getSocket` 호출 0회, `emitWithAck` 0회, finalize 1회.
5. **socket 없음(미연결) → emit 없이 navigate.** `getSocket: () => null`, gameId는 있음. finalize 1회.
6. **연타 가드.** ack 미도착 상태에서 두 번째 호출 → `emitWithAck` 여전히 1회, finalize 0회. 이후 resolve하면 finalize 1회.
7. **navigate 후 winResult 정리(실제 store 연동).** 실 `useInGameStore`에 `setGamePayload({ gameId: "g-1", state: { id: "g-1", phase: "ENDED", players: [], winResult: {...} } })`로 상태를 세팅하고, 실 `createSessionEndFinalizer`(clearGame=실 store 액션, clearRoom=spy, navigate=spy)를 물려 요청을 실행한다. ack resolve 후 검증: `navigate`가 `("/multiplay", { replace: true })`로 1회, `useInGameStore.getState().state === null` **이고** `state?.winResult`가 접근 불가 = winResult 정리됨, `gameId === null`, `clearRoom` 1회. 테스트 간 오염을 막기 위해 각 테스트 끝에 `useInGameStore.getState().clearGame()`으로 되돌린다.

### (G) CREATE `frontend/src/domains/game/result/hooks/__tests__/useGameResultLobbyExit.test.js`

훅은 React 컨텍스트(`useNavigate`) 없이는 실행할 수 없으므로, 이 저장소가 이미 쓰는 **raw source 검증**으로 "버튼 → 실제 소켓/스토어/finalizer" 배선을 못박는다(`readFile` + `assert.match`). 단언:
- `createGameResultExitRequest`를 `../utils/createGameResultExitRequest.js`에서 import해 쓴다.
- `finalize`로 `createSessionEndFinalizer`를 쓴다(이탈 정리 경로를 새로 만들지 않았음).
- `getCurrentGameId`가 `useInGameStore.getState().gameId`를 읽는다(요구 2의 "store의 gameId").
- `clearGame`/`clearRoom`이 각각 ingame/matching store의 기존 액션이다(요구 3의 재사용).
- `getSocket`을 `@/shared/socket/socketClient.js`에서 가져온다.
- 파일 상단에 "왜 렌더 테스트가 아니라 source 검증인가"를 `GameResultPage.productionSource.test.js:7-12`와 같은 톤으로 남긴다.

### (H) MODIFY `frontend/src/domains/game/result/page/__tests__/GameResultPage.productionSource.test.js`

기존 5개 테스트는 손대지 않고 아래를 추가한다:
- 페이지가 `useGameResultLobbyExit`를 import·호출하고 그 반환값을 버튼 `onClick`에 넘긴다.
- `<LabelledActionButton`이 정확히 1회 등장하고 `src={GAME_RESULT_ASSETS.lobbyButton}`, `label="로비로"`를 받는다 — 새 버튼 마크업/스타일을 직접 만들지 않았음(공통 컴포넌트 재사용)을 못박는다.
- 버튼 마크업이 `if (!view) return null` **뒤**에 온다(문자열 index 비교) → preview·실데이터 양쪽에서 렌더된다.
- 페이지가 `"leave_game_session"`을 직접 emit하지 않는다(`assert.doesNotMatch(source, /leave_game_session/)`) — 이탈 로직이 페이지가 아니라 util에 있음을 고정한다.

---

## 3. 검증

```
cd frontend && npm test        # node --experimental-test-module-mocks --test src/**/__tests__/*.test.js
cd frontend && npm run build   # vite build
```
추가로 `npm run lint`, `npm run check:utf8`(신규 파일이 한글 주석·한글 에셋 경로를 포함하므로 UTF-8 저장 필수).

기준: 신규 테스트 전부 PASS + 기존 frontend 테스트 전부 PASS(회귀 0) + build PASS. backend는 이번 슬라이스에서 한 줄도 건드리지 않는다.

수동 확인(선택, dev 서버): `/gameresult?outcome=win` — 우하단 붉은 "로비로" 버튼이 보이고, 클릭 시 emit 없이 즉시 `/multiplay`.

---

## 4. 위험 요소와 대응

| 위험 | 판단 / 대응 |
| --- | --- |
| **기존 `GameResultPage.productionSource.test.js` 회귀** | `doesNotMatch(/players\s*[:=]/)`·`/mvp\s*[:=]/`, `<GameResultShell` 1회, `<GameResultShell {...view} />` 리터럴, `navigate("/multiplay", { replace: true })` 리터럴 — 네 가지 모두 변경 후에도 성립하도록 (E)를 fragment 추가로만 구성한다. 추가 코드에 `players`/`mvp` 토큰을 넣지 않는다. |
| **정리→navigate 순서가 요구 3 문면과 반대** | 위 (E)의 "설계 판단" 참고. 관측 가능한 차이가 없고(같은 동기 구간·같은 목적지), `createSessionEndFinalizer`의 단일 choke point 불변식을 지키는 편이 이득이 크다. 테스트는 순서가 아니라 두 효과의 발생을 검증한다. |
| **clearGame 직후 페이지의 기존 effect가 중복 navigate** | 둘 다 `/multiplay` + `replace`라 히스토리 오염도 목적지 차이도 없다. 실데이터 경로에서만 발생 가능하고(preview는 `view`가 계속 non-null), replace 두 번은 멱등이다. |
| **`?outcome=` preview인데 store에 gameId가 남아 있는 경우** | 요구 2·4의 우선순위대로 gameId가 있으면 emit한다(요구 4의 조건은 "gameId가 없으면"). 실제 게임 직후 개발자가 `?outcome=`로 진입한 상황이며, 멱등한 서버에 이탈을 알리는 것이 맞다. |
| **ack를 5초 기다리는 동안 유저가 갇힌 것처럼 느낌** | `LabelledActionButton`이 `disabled`를 전달하지 않으므로 시각적 비활성화는 하지 않는다(mode 도메인 공통 컴포넌트를 이번 슬라이스에서 고치지 않기 위한 선택). 대신 factory의 `pending` 가드로 중복 emit만 막는다. 정상 경로에서 서버 ack는 즉시 오고 실패해도 5초 뒤 반드시 이동한다. |
| **버튼이 MVP 패널과 겹칠 수 있음** | 우하단 고정 + `z-20`. MVP 패널은 `justify-start`로 상단 정렬이라 하단부가 비어 있고, 좁은 화면에서 일부 겹쳐도 콘텐츠를 가리지 않는다. 중앙 하단은 두 패널 사이 gap(최대 6rem)이 버튼 폭(11.4rem)보다 좁아 오히려 양쪽 패널을 덮으므로 채택하지 않는다. |
| **한글 에셋 경로 정규화** | `gameResultAssets.js`의 기존 모든 한글 경로가 `.normalize("NFD")`를 붙인다. 새 키도 동일하게. 빠뜨리면 특정 OS에서 404. |
| **금지 영역 침범** | `backend/**`, `domains/game/result/components/**`(파일 추가 포함), `killReveal`, `useInGameResultNavigation` — 어느 것도 손대지 않는다. `createLeaveGameSessionRequest`/`createSessionEndFinalizer`/`useInGameExit`도 **읽기만** 하고 수정하지 않는다(인게임 나가기 계약 보존). `LabelledActionButton`도 무수정 재사용. |

---

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| CREATE | frontend/src/domains/game/result/utils/createGameResultExitRequest.js |  | leave emit(ack+timeout) 후 성패 무관 finalize |
| CREATE | frontend/src/domains/game/result/hooks/useGameResultLobbyExit.js |  | 소켓·store·finalizer 배선만 담당하는 훅 |
| CREATE | frontend/src/domains/game/result/utils/__tests__/createGameResultExitRequest.test.js |  | ack 성공/실패/timeout/gameId 없음/연타/store 정리 검증 |
| CREATE | frontend/src/domains/game/result/hooks/__tests__/useGameResultLobbyExit.test.js |  | 훅 배선 raw source 검증 |
| MODIFY | frontend/src/domains/game/result/page/GameResultPage.jsx | GameResultPage | 로비 복귀 버튼 배치와 onClick 배선 |
| MODIFY | frontend/src/domains/game/result/constants/gameResultAssets.js |  | 빨간 버튼 에셋 키(lobbyButton) 추가 |
| MODIFY | frontend/src/domains/game/result/constants/gameResultLayout.js |  | 로비 버튼 래퍼 위치 클래스 추가 |
| MODIFY | frontend/src/domains/game/result/page/__tests__/GameResultPage.productionSource.test.js |  | 버튼 렌더·재사용·훅 배선 source 검증 추가 |
| REFERENCE | frontend/src/domains/game/ingame/utils/createSessionEndFinalizer.js |  | 재사용하는 세션 정리 finalizer 계약 |
| REFERENCE | frontend/src/domains/game/ingame/utils/createLeaveGameSessionRequest.js |  | 재사용 불가 판정 근거(성공 ack 전용·timeout 없음) |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useInGameExit.js |  | 기존 나가기 배선 형태 |
| REFERENCE | frontend/src/domains/game/ingame/store/ingameStore.js |  | gameId/clearGame, winResult 위치(state.winResult) |
| REFERENCE | frontend/src/domains/game/matching/store/matchingStore.js |  | clearRoom 액션 |
| REFERENCE | frontend/src/domains/game/mode/components/LabelledActionButton.jsx |  | 재사용하는 공통 이미지 버튼 컴포넌트 |
| REFERENCE | frontend/src/domains/game/mode/constants/roomCodeFrameStyles.js |  | 버튼 폭(19%) 계산 근거 |
| REFERENCE | frontend/src/shared/socket/socketClient.js |  | getSocket 및 timeout().emitWithAck() 관례 |
| REFERENCE | frontend/package.json |  | 테스트/빌드 실행 스크립트 |
