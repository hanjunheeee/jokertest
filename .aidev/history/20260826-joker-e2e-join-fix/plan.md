# E2E 입장 경로 수정 — 방코드 입력 → 공개 방 목록

## 1. 조사 결과 (실제 코드에서 확인한 사실)

### 공개 방 목록 화면
- 라우트는 **`/multiplay`** → `MultiplayEntryPage` (`frontend/src/app/routes/index.jsx:35`).
  `/gameMode`의 "방 찾기" 카드가 이 경로로 보낸다(`GameModePage.jsx:25`).
- `MultiplayEntryPage`는 `usePublicRooms()`의 `rooms`를 `MultiplayRoomListArea` → `RoomListShell` →
  `RoomListPanel` → `RoomListRow`로 내려준다.

### 목록 갱신 방식 (요구서 1의 "목록 갱신 방식은 frontend 소스를 조사해 따른다")
`frontend/src/domains/game/mode/hooks/usePublicRooms.js`
- 마운트 시 소켓이 붙을 때까지 100ms 간격으로 재시도한 뒤 `get_public_rooms` **ack 조회 1회**(`fetchRooms`).
- 이후 서버의 `public_rooms_updated` **브로드캐스트**로 실시간 갱신(`socket.on`), `connect` 재연결 시 재조회.
- 즉 **화면에 들어가는 것만으로 최신 목록을 받는다**. 폴링·새로고침 버튼을 누를 필요가 없고,
  방이 아직 안 보이면 브로드캐스트가 올 때까지 기다리면 된다 → **Playwright 자동 재시도(`toHaveCount`)로 대기**하면 정확히 이 계약을 따른다.
- 입장은 `joinPublicRoom(roomId)` → `join_public_room` emit → 서버가 `room_joined`를 주면
  훅이 직접 `navigate("/game-matching")` 한다. 실패 시 `room_join_failed` → **`alert()`** (→ 기존 `assertNoDialogs`가 잡는다).

### 방을 식별할 셀렉터 (요구서 4)
`RoomListRow.jsx:41-52` — 방 하나가 곧 `<button>`이고 **접근가능한 이름이 aria-label로 완전히 결정된다**:

```
`${stageLabel ? stageLabel+" " : ""}${title}, ${current}/${max}명${isCode ? ", 코드 필요" : ""}${statusLabel ? ", "+statusLabel : ""}`
```

- `title`은 백엔드가 만든다: `` `${user.nickname}의 방` `` (`backend/socket/matchmaking.js:395`), 공개 목록 DTO에 그대로 실린다(`buildPublicRoomList`, 같은 파일 :258).
- `stage`는 공개 목록 DTO에 **없다**(`buildPublicRoomList`가 id/current/max/title/accessType/status만 내려준다) → `STAGE_LABELS[undefined]`가 `undefined`라 접두어가 붙지 않는다. 다만 미래에 붙을 수 있으므로 정규식은 **앞을 고정하지 않고 뒤만 고정**한다.
- 내부 텍스트 오버레이는 `aria-hidden="true"`라 `getByText`로는 잡히지 않는다. **role+name(aria-label)이 유일한 접근 경로이며, 이미 존재한다 → frontend에 `data-e2e` 추가는 불필요하다.**
- 목록 패널 자체도 `aria-label="공개 방 목록"`인 `<section>`이다(`RoomListPanel.jsx:32`).

### 입장 버튼 (row 클릭만으로는 입장되지 않는다)
`RoomListShell.jsx:57-118`
- row 클릭은 **선택 토글**일 뿐이다(`handleSelectRoom`).
- 실제 입장은 하단 버튼이며 `aria-label`은 상태에 따라 바뀐다:
  입장 가능 → **`"선택한 방 입장"`**, 그 외 `"입장 중"` / `"코드 필요"` / `"마감"`.
- `enterDisabled = !selectedRoom || accessType==="code" || status==="full" || isJoining`.

### 치명적 전제 — 방은 반드시 `open`이어야 한다
- `RoomListShell`은 `accessType === "code"` 방의 입장 버튼을 **비활성**시키고,
  서버도 `handleJoinPublicRoom`에서 `room.accessType !== 'open'`이면 `room_join_failed`로 거부한다(`backend/socket/matchmaking.js:486`).
- 그런데 **현재 `ROOM_SETUP_PLAN`은 "코드로만 참가" 체크박스를 켠다**(`e2e/lib/scenarioPlan.js:172-175`)
  → `buildCreateRoomPayload`가 `accessType: "code"`로 만든다(`frontend/.../buildCreateRoomPayload.js:22`).
  이 상태로는 **공개 목록 입장이 구조적으로 불가능하다.** 이 단계를 반드시 제거해야 한다.
  (`GENERAL_GAME_SETUP`의 `private-lobby.defaultChecked === false`이므로, 제거하면 방은 `open`이 된다.)

### 제거 대상
- `readRoomCode`(`actors.js:160`)와 `joinByCode`(`actors.js:183`)의 유일한 호출부는
  `e2e/tests/tenDayScenario.spec.js:73,76` 뿐이다. `ROOM_CODE_LENGTH` 상수도 이 둘만 쓴다.

---

## 2. 변경 계획

### 2-1. `e2e/lib/selectors.js` — 공개 방 row 이름 빌더 추가
파일 성격을 "data 훅 → CSS 셀렉터"에서 "화면 요소를 지목하는 순수 셀렉터 빌더"로 한 줄 넓히고(파일 상단 주석 갱신), 다음을 추가한다.

```js
/** 공개 방 목록 row의 접근가능한 이름 뒤쪽 형태 — RoomListRow의 aria-label 계약이다. */
export function escapeRegExp(value) { ... }          // 닉네임에 정규식 메타문자가 섞여도 깨지지 않게
export function publicRoomTitle(hostNickname) { return `${hostNickname}의 방` }
export function publicRoomRowName(hostNickname) {
  return new RegExp(`${escapeRegExp(publicRoomTitle(hostNickname))}, \\d+/\\d+명$`)
}
```

설계 근거(주석으로 남긴다):
- `title`의 출처는 backend `matchmaking.js`의 `` `${nickname}의 방` `` — frontend 상수가 아니므로 import할 원천이 없다. **파일에 문자열을 적되 출처 경로를 주석으로 고정**한다.
- **뒤만 앵커링**한다: `, n/m명`으로 끝난다는 것은 곧 `", 코드 필요"`·`", 진행중"`·`", 마감"` 접미가 **붙지 않았다** = 지금 입장 가능한 open/waiting 방이라는 뜻이다. 잘못된 방을 고르는 사고를 셀렉터 단계에서 막는다.
- 앞을 열어두어 미래에 `stage` 배지가 생겨도 깨지지 않는다.

### 2-2. `e2e/lib/actors.js` — `joinByCode` → `joinFromRoomList`로 대체, `readRoomCode` 삭제
- **삭제**: `readRoomCode`, `joinByCode`, `ROOM_CODE_LENGTH` 상수. (초대코드 모달·`/roomInvite` 의존이 전부 사라진다 — 요구서 2)
- **추가**: 공개 목록 대기 상한 상수와 새 입장 헬퍼.

```js
/** 방이 공개 목록에 나타날 때까지 기다려주는 상한(소켓 재연결 + 브로드캐스트 왕복 여유). */
const PUBLIC_ROOM_APPEAR_TIMEOUT_MS = 30_000

/**
 * 좌석이 공개 방 목록에서 방장의 방을 찾아 입장한다.
 * @param {object} seat 좌석
 * @param {string} hostNickname 방장(S1) 계정의 닉네임 — 방 제목이 "{닉네임}의 방"이다
 * @flow /multiplay로 이동하면 usePublicRooms가 마운트 즉시 get_public_rooms로 목록을 받고
 *   이후 public_rooms_updated 브로드캐스트로 갱신한다 — 그래서 새로고침 없이 "row가 1개가
 *   될 때까지" 기다리는 것만으로 목록 갱신 계약을 그대로 따른다. row 클릭은 선택일 뿐이라
 *   "선택한 방 입장" 버튼을 눌러야 실제 입장이며, 입장 실패는 alert로만 드러나므로
 *   assertNoDialogs로 마무리한다. 입장 순서가 곧 역할 배정 순서이므로 호출부는 반드시 순차 await로 부른다.
 */
export async function joinFromRoomList(seat, hostNickname) {
  await seat.page.goto("/multiplay")
  const row = seat.page.getByRole("button", { name: selectors.publicRoomRowName(hostNickname) })
  await expect(row, `${seat.label}: "${selectors.publicRoomTitle(hostNickname)}"이(가) 공개 방 목록에 나타나지 않았습니다`)
    .toHaveCount(1, { timeout: PUBLIC_ROOM_APPEAR_TIMEOUT_MS })
  await row.click()

  const enterButton = seat.page.getByRole("button", { name: "선택한 방 입장", exact: true })
  await expect(enterButton, `${seat.label}: 입장 버튼이 활성화되지 않았습니다(코드 전용/마감 방일 수 있습니다)`).toBeEnabled()
  await enterButton.click()

  await seat.page.waitForURL("**/game-matching", { timeout: PUBLIC_ROOM_APPEAR_TIMEOUT_MS })
  assertNoDialogs(seat)
}
```

- `toHaveCount(1)`은 Playwright가 타임아웃까지 재시도하므로 "목록에 방이 아직 없으면 나타날 때까지 대기"(요구서 1)를 그대로 만족하고, 동시에 **동명이방(strict mode 위반)도 그 자리에서 잡는다**.
- `"선택한 방 입장"`이라는 이름 자체가 "코드 필요/마감/입장 중이 아니다"를 뜻하므로 별도 상태 검사가 필요 없다.

### 2-3. `e2e/lib/scenarioPlan.js` — 방을 공개(open)로 만든다
`buildRoomSetupPlan`의 ② 단계를 뒤집는다. 지금은 "체크되어 있지 않으면 켠다"인데, **"체크되어 있으면 끈다"**로 바꾼다.

```js
// ② "코드로만 참가"는 반드시 꺼져 있어야 한다 — 켜면 accessType이 "code"가 되어
//    공개 목록의 입장 버튼이 잠기고(RoomListShell) 서버도 join_public_room을 거부한다
//    (backend/socket/matchmaking.js의 handleJoinPublicRoom). 기본값이 이미 꺼짐이라
//    지금은 조작이 생기지 않지만, 기본값이 뒤집히면 자동으로 끄는 조작이 들어간다.
if (privateLobbyItem.defaultChecked === true) {
  steps.push({ kind: "checkbox", label: privateLobbyItem.label })
}
```
현재 기본값(`defaultChecked: false`)에서 `ROOM_SETUP_PLAN`의 label 순서는
`["최대 플레이어 수", "역할 구성", "광대 인원", "의사 인원", "경비대 인원", "마녀사냥꾼 인원"]`이 된다.
(정원 → CUSTOM 전환 → 역할 인원 순서라는 기존 계약은 그대로다.)

### 2-4. `e2e/tests/tenDayScenario.spec.js` — 입장 단계 갱신
```js
await test.step("S1이 5인 공개 CUSTOM 방을 만들고 S2~S5가 목록에서 순서대로 입장", async () => {
  await actors.createRoom(seats[0])
  // 입장 순서가 곧 역할 배정 순서다 — 절대 병렬로 돌리지 않는다.
  for (const seat of seats.slice(1)) {
    await actors.joinFromRoomList(seat, seats[0].account.nickname)
  }
})
```
- `readRoomCode` 호출과 `roomCode` 지역 변수 제거(요구서 2).
- 순차 `for await` 유지(요구서 3의 S2→S3→S4→S5 순서 보장).
- 파일 상단 주석의 "방 생성·입장" 설명을 공개 목록 경로로 갱신.

### 2-5. 헬퍼 단위 테스트 갱신
- `e2e/lib/__tests__/scenarioPlan.test.js`
  - `"ROOM_SETUP_PLAN은 정원 축소 → 코드로만 참가 → …"` 테스트를 **"코드로만 참가 조작이 들어가지 않는다(방은 공개여야 한다)"**로 갱신: label 배열에서 `"코드로만 참가"` 제거, `ROOM_SETUP_PLAN.some(s => s.kind === "checkbox") === false` 단언 추가.
  - 클릭 횟수 테스트에서 `byLabel["코드로만 참가"].kind` 단언 제거(나머지 스테퍼 단언은 그대로 유지).
- `e2e/lib/__tests__/selectors.test.js`
  - `publicRoomTitle("테스터1") === "테스터1의 방"`
  - `publicRoomRowName("테스터1")`이 `"테스터1의 방, 1/5명"`·`"2단계 테스터1의 방, 3/5명"`에는 매치되고,
    `"테스터1의 방, 5/5명, 마감"`·`"테스터1의 방, 2/5명, 코드 필요"`·`"테스터2의 방, 1/5명"`에는 매치되지 않음
  - `escapeRegExp`로 정규식 메타문자 닉네임(`"닉(네임"`)이 깨지지 않음

### 2-6. `e2e/README.md`
- 개요 문장의 "방 생성·전원 입장"을 공개 목록 입장으로 구체화.
- **"반드시 알아야 하는 함정"에 새 항목 추가**: *"방은 공개(open)여야 한다"* — `코드로만 참가`를 켜면 `accessType: "code"`가 되어 목록 입장 버튼이 잠기고 서버도 거부한다는 사실과 근거 경로(`RoomListShell`, `handleJoinPublicRoom`)를 적는다.
- 목록 갱신 계약(마운트 시 ack 조회 + `public_rooms_updated` 브로드캐스트) 한 줄.

### frontend/backend
**수정하지 않는다.** row 버튼의 `aria-label`(방 제목 + 인원 + 상태)과 입장 버튼의 `aria-label="선택한 방 입장"`이 이미 존재해 접근이 가능하므로, 요구서가 허용한 `data-e2e` 최소 추가 조건에 해당하지 않는다. **추가하는 `data-e2e` 속성 목록: 없음.**

---

## 3. 검증

| 명령 | 기대 |
| --- | --- |
| `npm --prefix e2e run test:helpers` | `env/scenarioPlan/selectors` 단위 테스트 전체 PASS (갱신된 `ROOM_SETUP_PLAN`·새 `publicRoomRowName` 포함) |
| `npm run test:e2e-helpers` (저장소 루트) | 위와 동일 경로로 PASS |
| `npm --prefix frontend test` | 기존 frontend 전체 테스트 PASS (frontend는 무수정이므로 회귀 없음) |
| `node --check e2e/lib/actors.js`, `node --check e2e/tests/tenDayScenario.spec.js` | 브라우저 없이 문법 검증 |

`npm --prefix e2e test`(실제 5창 재생)는 backend(`DEBUG_FIXED_ROLES` 포함)·frontend dev 서버와 실계정 5개가 떠 있어야 하므로 **이 무인 파이프라인에서는 실행하지 않는다** — 위 4개로 검증하고, 실행 필요성은 리포트에 명시한다.

---

## 4. 위험과 대응

| 위험 | 대응 |
| --- | --- |
| **방이 `code`로 만들어져 입장 버튼이 잠긴다** (가장 큰 함정) | 2-3에서 `ROOM_SETUP_PLAN`의 체크박스 단계를 제거. 단위 테스트가 "체크박스 조작 없음"을 고정한다. 그래도 잠기면 `joinFromRoomList`가 `"입장 버튼이 활성화되지 않았습니다(코드 전용/마감 방일 수 있습니다)"`로 즉시 실패한다 |
| 방이 공개되어 **외부인이 끼어들 수 있다** | 구조상 불가피한 교환이다(공개 목록 입장이 요구서의 경로). 좌석이 어긋나면 `confirmRoleReveal`·`assertSelfSeat`가 첫 관문에서 잡는다. README 함정 항목에 "테스트 중 같은 backend에 다른 사람이 붙어 있으면 안 된다"를 명시 |
| 같은 제목의 방이 2개 이상 → strict mode 위반 | `toHaveCount(1)` 단언이 먼저 걸려 명확한 메시지로 실패한다. 실제로는 방장이 이미 방에 있으면 `create_room`이 `"이미 참여 중인 방이 있습니다"` alert로 `createRoom` 단계에서 먼저 멈춘다 |
| 소켓이 아직 안 붙어 목록이 비어 있다 | `usePublicRooms`가 100ms 간격으로 붙을 때까지 재시도하고, `toHaveCount(1)`이 30초까지 재시도한다 |
| 미래에 목록 row에 `stage` 배지가 붙는다 | 정규식을 뒤에만 앵커링해 접두어 변화에 영향받지 않게 했다 |
| 방 제목 형식(`{닉네임}의 방`)이 backend에서 바뀐다 | frontend에 import할 원천이 없어 문자열을 적되, 출처(`backend/socket/matchmaking.js:395`)를 주석으로 고정하고 `publicRoomTitle` 한 곳에만 둔다. 바뀌면 `toHaveCount(1)` 실패 메시지에 기대 제목이 그대로 찍혀 원인이 즉시 드러난다 |
| 5/5가 되는 마지막 좌석(S5)이 "마감"으로 막힌다 | `current`는 S5가 **들어간 뒤** 5가 된다. S5가 볼 때는 4/5이므로 `waiting`이다. 서버 정원 검사도 `handleJoinRoomByCode`가 동일하게 처리한다 |

---

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | e2e/lib/actors.js |  | readRoomCode·joinByCode·ROOM_CODE_LENGTH 제거, 공개 목록 입장 헬퍼 joinFromRoomList 추가 |
| MODIFY | e2e/lib/selectors.js |  | 공개 방 row 이름 빌더(publicRoomTitle·publicRoomRowName·escapeRegExp) 추가 |
| MODIFY | e2e/lib/scenarioPlan.js |  | "코드로만 참가" 조작 제거 — 방을 open으로 만들어 공개 목록 입장이 가능하게 |
| MODIFY | e2e/tests/tenDayScenario.spec.js |  | 입장 단계를 공개 목록 경로로 갱신(S2→S5 순차 유지) |
| MODIFY | e2e/lib/__tests__/scenarioPlan.test.js |  | ROOM_SETUP_PLAN 기대값 갱신(체크박스 조작 없음) |
| MODIFY | e2e/lib/__tests__/selectors.test.js |  | 공개 방 row 이름 빌더 단위 테스트 추가 |
| MODIFY | e2e/README.md |  | 입장 경로·목록 갱신 계약·"방은 공개여야 한다" 함정 문서화 |
| REFERENCE | frontend/src/domains/game/mode/components/roomList/RoomListRow.jsx |  | row 버튼 aria-label 형식(방 제목·인원·상태) |
| REFERENCE | frontend/src/domains/game/mode/components/roomList/RoomListShell.jsx |  | 선택→"선택한 방 입장" 버튼 계약과 비활성 조건 |
| REFERENCE | frontend/src/domains/game/mode/components/roomList/RoomListPanel.jsx |  | 목록 패널 aria-label과 placeholder row 구조 |
| REFERENCE | frontend/src/domains/game/mode/hooks/usePublicRooms.js |  | 목록 갱신·입장 소켓 계약(get_public_rooms / public_rooms_updated / room_joined) |
| REFERENCE | frontend/src/domains/game/mode/pages/MultiplayEntryPage.jsx |  | 공개 목록 화면 조립 지점 |
| REFERENCE | frontend/src/app/routes/index.jsx |  | 공개 목록 라우트 /multiplay 확인 |
| REFERENCE | frontend/src/domains/game/setup/constants/gameSetupOptions.js |  | private-lobby 기본값(defaultChecked=false) |
| REFERENCE | frontend/src/domains/game/setup/utils/buildCreateRoomPayload.js |  | 체크박스 → accessType(open/code) 매핑 |
| REFERENCE | backend/socket/matchmaking.js |  | 방 제목 형식·공개 목록 DTO·join_public_room의 open 강제 |
