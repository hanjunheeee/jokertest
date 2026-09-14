# F-16 · 생산자 → 사건 ID → 수신자 → 소비처

기준 HEAD 30432445. **이 문서는 연결 설계의 기록이며 시험 통과·실제 청음 증거가 아니다.**
현재 배포 manifest는 모든 항목이 미검토라 아래 모든 사건은 "무음 + 사유 기록"으로 끝난다
(`frontend/src/shared/audio/sfxManifest.js`, AC-02).

## 이번 슬라이스에서 실제로 연결한 사건

| kind | 생산자(실제 코드 위치) | 안정 사건 ID | 수신자 | 프런트 소비처 |
| --- | --- | --- | --- | --- |
| `ui-click` | 브라우저 click(물리 입력) | `ui-click:<seq>` | 본인 | `useSfxRuntime.js` document capture 단일 소유자 |
| `ui-confirm` / `ui-cancel` | `data-sfx-kind` 표식 · `data-sfx-owner="explicit"` 제어 · form submit 경계 · native confirm 반환 경계 | `ui-confirm:<seq>` / `ui-cancel:<seq>` | 본인 | 같음. 제어별 전수 표는 `ui-ownership.md` |
| `day-vote-submitted` | `backend/socket/gameSession.js::handleSubmitDayVote` 성공 ACK | `game:<id>:day:<d>:round:<r>:actor:<uuid>:vote:<revision>` | 요청자 본인(ACK) | `useInGameDayVoteSubmit.js` (controller의 성공 정착 뒤 `onAccepted`) |
| `tribunal-vote-submitted` | `…::handleCastTribunalVote` 최초 성공 ACK | `game:<id>:day:<d>:actor:<uuid>:tribunal-submitted` | 요청자 본인(ACK) | `useInGameTribunalVoteSubmit.js` (`settleSuccess` 통과 뒤) |
| `friend-request-received` | `backend/controller/friend.controller.js::sendFriendRequest` | `friend-request:<requestId>:received` | `emitToUser(receiverId, …)` | `useFriendSocketEvents.js` |
| `friend-request-accepted` | `…::acceptRequest` | `friend-request:<requestId>:accepted` | `emitToUser(requesterId, …)` | 같음 |
| `friend-request-declined` | `…::declineRequest` | `friend-request:<requestId>:declined` | `emitToUser(requesterId, …)` | 같음 |
| `game-invite` | `backend/service/gameInvite.service.js::createInvite`의 커밋 후 `emitInviteReceived` (F-19에서 추가) | `game-invite:<inviteId>:received` | `emitToUser(receiverId, 'game_invite_received', …)` | `useFriendSocketEvents.js::playGameInviteSfx` (커서 경계는 `gameInvite.store.js::consumeInviteSound`, 표시 설정은 **"게임 초대"**) |
| `achievement-granted` | `backend/services/achievementService.js::notifyAchievementGranted` (각 commit 직후) | `achievement:<definitionId>:granted` | `emitToUser(userId, …)` | `useSfxRuntime.js`의 `achievement_granted` 구독 |
| `room-ready-changed` | `backend/socket/matchmaking.js::handleSetReady` (실제 변경에만, revision 증분) | `room:<roomId>:ready:<uuid>:<revision>` | 방송(요청자 제외) + 요청자 ACK | `useMatchingRoom.js` `handlePlayerReadyChanged` / `setReady` 성공 ACK |
| `game-started` | `backend/socket/matchmaking.js::handleStartGame`의 참가자별 `game_started` | `game:<gameId>:started` | 참가자 각자 | `useMatchingRoom.js` `handleGameStarted` |
| `game-phase-changed` | `game_phase_changed` 방송 | `game:<id>:phase:<phase>:<dayIndex>` | 세션 channel | `useGameSessionSocketEvents.js` (store 반영 성공 시에만) |
| `day-phase-changed` | `day_phase_changed` 방송 | `game:<id>:day:<d>:dayphase:<dayPhase>` | 세션 channel | 같음 |
| `night-turn-started` | `night_turn_started` 방송 | `game:<id>:day:<d>:nightturn:<role>` | 세션 channel | 같음 |
| `day-vote-resolved` | `day_vote_resolved` 방송 | `game:<id>:day:<d>:round:<r>:day-resolved` | 세션 channel | 같음 |
| `tribunal-vote-resolved` | `tribunal_vote_resolved` 방송 | `game:<id>:day:<d>:tribunal-resolved` | 세션 channel | 같음 |
| `night-private-result` | `backend/socket/gameSession.js::handleResolveNight` 수신자별 emit (INVESTIGATE·CONFIRM) | `game:<id>:night:<d>:<actionType>` | `recipientSocket` 1인 | 같음 (`parseInGameNightPrivateResultPayload` 통과 후) |
| `night-private-failure` | 같은 경계 (ASSASSINATE `success:false`) | `game:<id>:night:<d>:ASSASSINATE` | 같음 | 같음 — 실패를 성공음으로 바꾸지 않는다 |
| `player-eliminated` | `backend/socket/gameSession.js::expireDisconnectGrace` | `game:<id>:day:<d>:victim:<uuid>:eliminated` | 세션 channel | `useGameSessionSocketEvents.js` (신규 소비처) |
| `game-result` | terminal 반영 경로 3종(밤 결과·재판 판정·끊김 사망) | `game:<id>:result` | 세션 channel | 같음 — 한 게임에 ID 하나라 경로가 달라도 1회 |

### 소리를 만들지 **않는** 경로 (A-05 복구/조회)

`fetchIncomingRequests` · `fetchFriends` · `removeSentRequest` · `getStatusForUser` ·
`get_current_room` · `get_session_snapshot`(`useInGameSessionSnapshotSync` →
`bootstrapSessionSnapshot`/`applySessionSnapshot`) · `GameResultPage` 진입 ·
`?outcome=` 미리보기 · `friend_status_change` · `game_ended`(세션 정리 전용).

## 후속 담당으로 남긴 미완료 (F-16에서 구현하지 않음)

| 항목 | 담당 | 상태 |
| --- | --- | --- |
| 신규 시스템 알림 연결 | F-17 (SFX-DEFER-17=BB) | **미완료** — 실 DB 시험과 실제 외부 Chrome은 수행됐으나(아래 F-17 절), 브라우저에서 재현된 시각 결함의 보수분 재확인과 실제 청음이 남았다 |
| 실제 게임 초대 | F-19 (SFX-DEFER-19=BD) | **미완료** — 격리 DB 공식 실행과 **실제 외부 Chrome 다중 계정 초대 흐름**이 이전 후보(`efb443d6`)에서 실제로 수행돼 통과했다(아래 F-19 검증 기록). 이 보수 후보의 재실행·해당 Chrome 재확인과 **실제 청음**이 남았다 |
| 전체 개인 능력 영상 동기 · 승인 MOV 5개 내장음 실제 연결 | F-27 (SFX-DEFER-27=BL) | 미완료 |
| 통합 인수 | F-28 (SFX-INTEGRATION-28=BN) | 미완료 |

F-16이 F-27에 제공하는 것은 `claimAudio(event, { mode: 'embedded' })` · `getMix()` ·
`subscribeMix()` 계약뿐이다. MOV 실제 변환·청음·동기 연결은 여기서 검증하지 않았고
완료로 기록하지 않는다. 최대 2초 길이 제한은 **별도 SFX 전용**이며 4~5초 내장음에는
적용하지 않는다.

## F-17(SFX-DEFER-17) 이관 증거 — 신규 시스템 알림

**상태: 미완료.** 아래 연결은 자동 시험으로 확인했고, 실제 생산·수신·화면은 운영자의 실제
외부 Chrome에서도 확인됐다(후보 `0c2cfe87`, `docs/test-evidence/f17/browser-2026-09-13.md`).
그러나 **실제 청음은 아니다** — 배포 manifest의 `system-notification`은 여전히 미검토라
매체를 만들지 않는다. 아래 "재생 1회"는 전부 시험 전용 fixture + 주입 매체의 `playCalls`
기록이고, 이것을 실제 청음 증거로 기록하지 않는다. 브라우저에서 재생 횟수를 센 기록도 없다.
그 Chrome 확인에서 **긴 목록 시각 결함 1건이 재현**됐고, 보수 후 **재확인이 아직 남아 있다.**

| 항목 | 값 |
| --- | --- |
| kind | `system-notification` (scope=account, notificationKey=`system-notification`) |
| 생산자 | `backend/service/notification.service.js::ensureSystemWelcome` |
| 생산 트리거 | `backend/socket/socket.js::registerNotificationHandlers`의 `notifications_ready` (세션 가드 통과 + `onlineUsers`의 현재 소켓 일치일 때만) |
| 준비 신호 조건 | 수신 훅이 **그 접속에서** 목록 복원을 마쳤을 때만 1회. 접속 세대별로 재동기화하고, ACK가 없으면 제한 시간 뒤 최대 3회까지만 재시도한다(`useNotificationSocketEvents.js`) |
| 안정 사건 ID | `notification:<notifications.id>` — 서버가 저장한 행 id (원본 중복 키는 `UNIQUE(user_id, source_key)`의 `system:notifications-available:v1`) |
| 수신자 | `emitToUser(<검증된 계정 uuid>, 'notification_created', …)` |
| 프런트 수신 | `frontend/src/domains/notifications/hooks/useNotificationSocketEvents.js` |
| 최종 소비처 | `useNotificationsStore` → `NotificationModal.js` 목록 · `NotificationEntryButton.js` 미확인 수 |
| 자산/무음 사유 | `sfxManifest.js`의 `pendingAsset` — `asset-unreviewed`, "자산 파일과 이용 조건 검토가 아직 제공되지 않았다" |
| 실 DB 시험 | 운영자 공식 VERIFY-11..15의 격리 DB 직렬 backend **1546 PASS 0 skip**(후보 `0c2cfe87`) — `f17-notifications.integration.test.js` 27건 포함 |
| 실제 Chrome | 운영자 수행, 2026-09-13(후보 `0c2cfe87`) — 기능 13항목 통과 · 시각 결함 1건 재현 → `docs/test-evidence/f17/browser-2026-09-13.md` |
| 담당 상태 | **미완료** — 실제 청음 없음(자산 미검토), 화면 결함 보수분의 브라우저 재확인 미수행 |

### 소리 소유권(한 사건에 한 번)

- 친구·업적의 `notification_created`에는 서버가 **sfxEvent를 싣지 않는다** — 그 소리는 기존
  `friend_request_received` · `achievement_granted`가 계속 소유한다. 알림 쪽은 목록만 바꾼다.
- 세 종류 모두 `useNotificationsStore.consumeSoundEvent(accountId, sourceKey)`를 통과한다.
  SFX 봉투의 `eventId`가 곧 서버 `source_key`와 같은 문자열이라 별도 매핑이 없다
  (`friend-request:<id>:received` · `achievement:<id>:granted` · `notification:<행 id>`는
  시스템만 행 id를 쓴다 — 시스템의 원본 키 소모는 `source_key`로 한다).
- **목록 upsert는 소리 표식을 소모하지 않는다.** 그래야 친구 알림 행이 먼저 도착해도
  뒤이은 `friend_request_received`가 최초 소리를 잃지 않는다.

### 소리를 만들지 **않는** 경로 (F-17)

`GET /notifications` · 초기 복원 · 복원 전 버퍼 병합 · 재접속 재동기화(그 구간에 도착한
알림 사건 포함) · `PATCH …/read` · `notifications_ready` 재시도 · 표시 설정 재활성화.

복원 경계는 **알림 행으로 남는 사건 키**(`friend-request:<id>:received` ·
`achievement:<id>:granted` · `system:*`)에만 적용한다. 알림 행이 없는 기존 사건
(`friend-request:<id>:accepted|declined` 등)은 복원이 알 수 없으므로 그 구간에도 최초
소리를 잃지 않는다(`notifications.store.js::isNotificationBackedSourceKey`).

**복원 실패도 해소가 아니다(CODEX-2 보수).** 예전 구현은 `loadSnapshot`의 catch에서
`restorePending`을 내렸다 — 그러면 서버 목록을 **한 번도 받지 못한** 상태인데도 경계가
풀려서, 그 뒤 늦게 배달된 **과거** 업적·친구 수신 사건이 `useSfxRuntime` ·
`useFriendSocketEvents`를 통해 다시 울렸다(알림 훅 자체는 `liveBuffer`가 막으므로 이
구멍은 그 두 기존 소비처로만 드러난다). 실패한 GET의 "목록에 없음"은 새 사건의 증거가
아니므로, 이제 `restorePending`은 **성공한 복원만** 내린다. 영구 무음은 아니다 — 화면의
재시도가 성공하면 해소되고, snapshot에 담긴 과거 키는 `soundSeen`으로 확정되며, 그 뒤의
진짜 새 사건은 정상적으로 1회 울린다. 수락·거절 같은 알림 행 없는 제어 사건은 애초에 이
경계의 대상이 아니라 조회 실패와 무관하게 최초 소리를 유지한다. 이 경계는 소리 적격성에만
쓰이므로 읽음·이동·닫기·재시도를 잠그지 않는다.

### 화면 결함 보수 (2026-09-13 실제 Chrome 재현분)

운영자의 실제 Chrome(1920×855, 알림 4행)에서 모달을 열면 초점이 맨 아래 닫기 버튼으로 가고
**안쪽 영역 전체**가 `scrollTop 270`까지 끌려 내려가, 제목과 가장 새 알림이 화면 위로 밀리고
행들이 양피지 그림 밖에 그려졌다(`scrollHeight 743 / clientHeight 427`).

고친 것은 **알림 레이아웃뿐**이다. 소리 경계·읽음·이동·계정 정리 계약은 건드리지 않았다.

- `NotificationModal.js` — 제목(고정) · 목록(`min-h-0 flex-auto overflow-y-auto` 단독 스크롤) ·
  닫기(고정)의 3단 구조. 스크롤하는 상자가 목록 하나뿐이라 초점 이동이 바깥을 끌어내리지 못한다.
- `ingameParchmentModalVariants.js` — **알림 variant만** 자기 안쪽 영역 치수를 갖는다
  (`inset-x-[15%] inset-y-[13.5%] overflow-hidden`). 공용 `py-[17%]`는 CSS 규칙상 세로 여백도
  프레임 **가로폭**의 17%라 3:2 그림에서 높이의 25.5%를 먹었다 — inset은 높이 기준이라 같은
  안전 영역을 지키면서 실제로 쓸 수 있는 높이가 늘어난다. 프레임은 역할 공개와 같은 48rem급.
- `InGameParchmentModalBase.js` / `InGameParchmentPanelBase.js` — variant가 준 안쪽 영역 기본
  클래스를 전달한다. **넘기지 않는 다른 모달 4종은 기존 공용 기본값 그대로**다(시험으로 고정).
  클래스를 덧붙이는 방식으로는 못 고친다 — `overflow`·`inset`·`padding`은 Tailwind 생성 순서가
  승자를 정해서 문자열 뒤에 붙여도 이기지 않는다(기존 `justify-start`가 실제로 무시되고 있었다).

회귀 시험 4건을 `NotificationModal.test.js`에 추가했다(6행 목록에서 제목·닫기가 스크롤 영역
**밖**의 형제인지, 6행 전부가 스크롤 영역 안인지, 초점이 스크롤되지 않는 닫기에 있고 목록이
맨 위인지, 이미지 실패 대체 패널도 같은 3단 구조인지, 다른 variant가 그대로인지).
브라우저 재확인은 운영자 관문으로 **남아 있다.**

### 검증 기록 (누가 · 언제 · 무엇을)

같은 명령이라도 **누가 어느 커밋에서 돌렸는지**를 구분해 남긴다. 앞선 성공 기록은 그
시점의 코드에 대한 것이고, 이후 변경을 검증하지 않는다.

| 주체 / 시점 | 대상 | 결과 |
| --- | --- | --- |
| 구현자(worker), 최초 구현 세션 | `npm test --prefix frontend` | 1704 PASS |
| 구현자(worker), 최초 구현 세션 | `npm test --prefix backend` | 1371 PASS · **154 skip**(격리 DB 없음) |
| 구현자(worker), 최초 구현 세션 | `npm run build --prefix frontend` | PASS |
| **운영자 공식 VERIFY-1..5, 01:21–01:33 KST, 후보 `0b04970f6d7c34b89a6000750e9b5e36a6774a75`** | 설치 2건 · frontend · build · 격리 DB 직렬 backend | frontend **1704 PASS 0 skip** · build **PASS** · backend **1525 PASS 0 skip**(698914ms) |
| 구현자(worker), 이번 보수 세션(R-IMPL #1~#6) | `npm test --prefix frontend` | **1736 PASS 0 skip** |
| 구현자(worker), 이번 보수 세션 | `npm run build --prefix frontend` | **PASS** |
| 구현자(worker), 이번 보수 세션 | `npm test --prefix backend` | **1385 PASS · 161 skip**(격리 DB 없음) |
| **운영자 공식 VERIFY-6..10, 후보 `e259a538`** | frontend · build · 격리 DB 직렬 backend | frontend **1736 PASS 0 skip** · build **PASS** · backend **1546 PASS 0 skip** |
| 구현자(worker), CODEX-2 보수 세션(복원 실패 경계) | `npm test --prefix frontend` | **1737 PASS 0 fail 0 skip** |
| 구현자(worker), CODEX-2 보수 세션 | `npm run build --prefix frontend` | **PASS** (`✓ built`) |
| 구현자(worker), CODEX-2 보수 세션 | 변이 검사(고친 줄을 되돌려 봄) | 새 마운트 시험이 `playCalls: ['/fixture/achievement-granted.wav']`로 **실패** — 경계가 실제로 들리는 회귀를 잡는다 |
| **운영자 공식 VERIFY-11..15, 후보 `0c2cfe87`** | 설치 2건 · frontend · build · 격리 DB 직렬 backend | 설치 **PASS** · frontend **1737 PASS 0 fail 0 skip** · build **PASS** · backend **1546 PASS 0 fail 0 skip** |
| **운영자, 실제 외부 Chrome, 2026-09-13 09:45–10:05 KST, 후보 `0c2cfe87`** | 실제 Vite 5183 · API 4183 · 격리 `pluto_f01_20260909_al` | 기능 관찰 13항목 통과 · **시각 결함 1건 재현**(아래) — `docs/test-evidence/f17/browser-2026-09-13.md` |
| 구현자(worker), 화면 결함 보수 세션(2026-09-13) | `npm test --prefix frontend` | **1741 PASS 0 fail 0 skip**(직전 1737 → 긴 목록·초점·대체 패널·다른 variant 불변 시험 4건 추가) |
| 구현자(worker), 화면 결함 보수 세션 | `npm run build --prefix frontend` | **PASS** (`✓ built`) — 새 임의값 유틸리티(`inset-y-[13.5%]` 등)가 실제 산출 CSS에 생성된 것까지 확인 |
| 구현자(worker), 화면 결함 보수 세션 | 변이 검사(`parchmentContentBaseClass`를 되돌려 봄) | 새 시험 2건이 "안쪽 영역 자체는 스크롤하지 않는다"·"알림만 자기 치수를 갖는다"로 **실패** — 결함 구조를 실제로 잡는다 |

- 운영자 VERIFY-6..10의 결과는 **후보 `e259a538`의 코드**에 대한 것이다. CODEX-2 보수에서
  바뀐 `notifications.store.js`와 시험 2건은 그 실행에 포함되지 않았다 — 운영자가 격리 DB
  래퍼로 다시 돌리기 전까지 그 부분은 **미검증**이다. backend는 이번 보수에서 **바뀌지
  않았다**(변경 파일 3개 전부 frontend).
- 운영자 VERIFY의 backend 1525 PASS 0 skip은 **후보 0b04970f의 코드**를 검증한 것이다.
  이번 보수 세션에서 바뀐 코드와 새로 추가한 DB 시험 7건은 그 실행에 포함되지 않았다 —
  다시 돌리기 전까지 **미검증**이다.
- **위 worker skip 기록(154·161건)은 그 시점 작업 환경의 역사적 사실로 남긴다** — worker
  환경에는 `F01_TEST_DATABASE_URL`이 없어 `f17-notifications.integration.test.js` 27건
  (기존 20 + 신규 7)이 skip이었다. 그 27건은 실제 세션 가드 경로
  (`wrapSocketWithSessionGuard` → `registerNotificationHandlers`,
  `registerConnectionHandlers`)와 0012 verify의 인덱스 컬럼·FK 거부를 실제 MySQL에서
  확인한다. **운영자 공식 VERIFY-11..15(후보 `0c2cfe87`)의 격리 DB 직렬 실행에서 backend
  1546건이 0 skip으로 통과했으므로 그 27건은 실제로 실행됐다** — "한 번도 실행되지 않았다"는
  더 이상 현재 상태가 아니다.
- 다만 그 공식 실행은 **후보 `0c2cfe87`의 코드**에 대한 것이다. 그 뒤 화면 결함 보수에서 바뀐
  파일(frontend 4 + 시험 1)은 포함되지 않았다 — 운영자가 다시 돌리기 전까지 그 부분은
  **미검증**이다. 이번 보수에서 backend는 **바뀌지 않았다**.

### 이번에 확인한 것 / 확인하지 못한 것

- 확인함(자동 시험, 격리 DB 불필요):
  `frontend/src/domains/notifications/hooks/__tests__/notificationSocketEvents.test.js`
  (실제 훅을 마운트해 connect/disconnect·접속 세대·늦은 ACK·ACK timeout 상한·소켓 교체·
  cleanup·실제 `dispatchSfxEvent` 경로를 확인, **14건** — CODEX-2 보수로 "초기 복원 실패 →
  늦게 배달된 과거 업적 사건" 1건 추가. 이 시험은 `useNotificationSocketEvents`와 **실제
  업적 소리 소유자인 `useSfxRuntime`을 함께 마운트**하고 `socketClient.setSocket`으로 전송만
  꽂아, 핸들러를 복제하지 않고 실제 라우팅을 태운다),
  `.../hooks/__tests__/notificationRuntime.test.js`(store·재생기 계약, 40건 — 복원 실패 뒤
  과거 키 거절·반복 지연 배달·수락/거절 제어 사건 유지·재시도 성공 후 억제 및 신규 1회를
  한 시험에서 순서대로 확인),
  `frontend/src/domains/lobby/hooks/__tests__/lobbyNotificationPanels.test.js`
  (실제 모달·진입 버튼을 마운트한 계정 전환·지연 PATCH·같은 대상 재진입, 6건),
  `.../components/__tests__/NotificationModal.test.js`,
  `frontend/src/shared/audio/__tests__/sfxPlayer.test.js`의 F-17 절,
  `backend/__tests__/notifications.migration.test.js`(0012 verify의 인덱스 컬럼·FK·
  NULL 계약 거부와 데이터 보존, 14건), `backend/services/achievementService.test.js`의 F-17 절.
- **worker 환경에서 확인하지 못함**: `backend/tests/db/f17-notifications.integration.test.js`
  27건. `F01_TEST_DATABASE_URL`이 없어 skip이었다. **운영자 공식 VERIFY-11..15가 격리 DB에서
  이 27건을 포함해 backend 1546건을 0 skip으로 통과시켰다**(후보 `0c2cfe87`).
- **운영자가 실제 외부 Chrome을 수행했다**(2026-09-13, 후보 `0c2cfe87`) —
  `docs/test-evidence/f17/browser-2026-09-13.md`. 실제 시스템 안내 생산·수신, 친구 요청과
  대상 이동·수락, 새로고침 없는 live 배지 갱신, 업적 지급 후 즉시 표시와 서고 이동,
  조회 실패·읽음 실패 화면, 표시 off/mute와 **원본 데이터 보존**, 계정 경계까지 실제 화면에서
  확인됐다. 동시에 **시각 결함 1건이 재현**됐다(긴 목록에서 초점이 안쪽 영역 전체를
  `scrollTop 270`으로 끌어내려 제목·최신 행이 밀리고 닫기 버튼이 화면 밖으로 나감).
  이번 보수는 그 결함만 고쳤다(알림 variant 치수 + 고정 제목/닫기 + 단독 스크롤 목록).
  **고친 화면의 브라우저 재확인(같은 뷰포트·확대 글자)은 아직 수행되지 않았다** — 그 전까지
  브라우저 확인을 완료로 기록하지 않는다.
- **확인하지 못함**: 실제 자산 청음(자산 자체가 미검토다). 브라우저에서 Audio 생성·재생
  횟수를 센 기록도 없다. 단위·통합 시험 통과를 청음으로 기록하지 않는다.
- 위 "재생 1회" 기록은 전부 **시험 전용 승인 fixture + 주입 매체의 `playCalls`**다. 배포
  manifest의 `system-notification`은 여전히 `needs-review`이며, 그 상태에서는 Audio 생성 0·
  재생 0·`asset-unreviewed` 사유 기록으로 끝난다는 것을 별도 시험으로 확인했다.
  모의 재생을 실제 청음으로 기록하지 않는다. **SFX-DEFER-17은 계속 미완료다.**

## 투표 제출 사건의 중복 규칙 (AC-04)

- **낮 투표**: `backend/game-core/gameSession.js`의 세션 안에 actor별
  `{dayIndex, round, targetId, revision, eventId}`를 둔다. revision은 **최초 제출(기권 null
  포함)과 대상 변경**에만 오른다 — 같은 대상 재요청은 같은 eventId라 소리가 0이다.
  A→B→A는 revision 1·2·3의 서로 다른 실제 변경이다(uuid+target 키였다면 세 번째가 첫 번째와
  같은 키로 묻힌다). 재투표(새 round)와 다음 날은 각각 별도 범위이고 revision이 1부터 다시
  시작한다. 실패한 제출은 `dayVotes`와 마찬가지로 이 메타데이터도 건드리지 않는다.
- **소켓 캡처 순서**: 핸들러는 core 성공 **직후·DB await 이전**에 봉투를 캡처한다. 그 뒤
  같은 actor가 다시 제출해도 game-core가 새 불변 객체로 교체하므로, 늦게 끝난 DB 응답이
  다음 제출의 ID를 싣지 않는다. **DB 실패 ACK(`VOTE_PERSIST_FAILED`)에는 봉투가 없다.**
- **F-11 DB 참여 집계와 별개다** — 2라운드 이상의 제출은 집계에 기여하지 않지만 사건은 있다.
- **재판 투표**: 중복은 `TRIBUNAL_VOTE_ALREADY_SUBMITTED` 실패이므로 최초 성공 1회뿐이고
  revision이 필요 없다. 실패 ACK에는 봉투를 붙이지 않는다.
- **프런트 재검증**: 두 훅 모두 성공 정착 뒤 ACK echo(gameId/dayIndex) · 소켓 identity·
  connected · 현재 인증 계정 == 봉투 accountId · 최신 `getState()`의 게임/날짜/라운드/phase/
  actor 본인/생존을 다시 확인한 뒤에만 dispatch한다. 어긋나면 **투표 상태의 의미는 그대로,
  소리만 0**이다.
- 봉투에는 투표 대상·투표 내용·역할을 담지 않는다(AC-05).

2026-09-13 operator update: corrected candidate ea9fbd2e actual external Chrome long-list/text3/text5/focus/Close recheck completed; see f17/browser-2026-09-13.md final section. Earlier corrected-layout pending statement is superseded for tested cases. SFX-DEFER-17 acceptance still awaits fresh normal independent reviews; F28 integration and audible unreviewed assets are not claimed complete.

## F-19(SFX-DEFER-19) 이관 증거 — 실제 게임 초대

**상태: 미완료.** 다만 남은 항목이 이전 기록보다 **좁아졌다**. 실제로 수행된 것은 둘이다:

1. **격리 MySQL 공식 실행** — 운영자, 후보 `caf79fa1`에서 F-19 DB 26/26 PASS, 후보
   `efb443d6`에서 **격리 MySQL 직렬 backend 전체 1639 PASS · 0 fail · 0 skip**(763361ms,
   900초 상한 이내). 같은 후보의 frontend 1817 PASS·build PASS.
2. **실제 외부 Chrome 다중 계정 초대 흐름** — 운영자, 2026-09-13 22:03–22:14 KST, 후보
   `efb443d6`(`.pluto/monitor/BD-CHROME-EFB443D6.md`). 서로 다른 loopback origin의 두 실제
   계정이 **같은** API·DB·소켓·방 권한을 쓰며 실제 클릭으로 초대 발송 → 수신 → 수락 →
   양쪽 대기방 2인 일치 → 새로고침 복원 → 이탈 후 방장 1인, 즐겨찾기 지속, 종료된 발송
   뒤 새 의도적 초대, 차단으로 대기 초대 무효화, 해제+새로고침 뒤 부활 0을 확인했다.

아직 **남아 있는 것**은 셋이다:

- **이 보수 후보의 재검증.** 위 두 기록은 모두 이번 CODEX-2 보수 **이전** 후보(`efb443d6`)의
  것이다. 이번 후보의 격리 DB 직렬 실행과 해당 Chrome 흐름 재확인은 다시 필요하다.
- **실제 청음.** 배포 manifest의 `game-invite`는 여전히 미검토라 매체를 하나도 만들지
  않는다. 아래 "재생 1회"는 전부 시험 전용 fixture + 주입 매체 기록이고 청음 증거가 아니다.
  Chrome에서 확인된 것은 배지·알림 수·화면 전이이며, **소리 1회·무음 복원·설정 off/on은
  측정되지 않았다**(BD-CHROME-EFB443D6.md "Still not established").
- **Chrome에서 아직 태우지 않은 경합** — 전체 수락 부분 실패, 가득 참·시작된 방 입장 경합,
  계정 전환·새로고침을 가로지르는 응답 유실. 자동 회귀와 독립 심사가 대신하지 않는다.

| 항목 | 값 |
| --- | --- |
| kind | `game-invite` (scope=account, notificationKey=`game-invite`) |
| 생산자 | `backend/service/gameInvite.service.js::createInvite` — 커밋 **이후** `emitInviteReceived` |
| 생산 권한 근거 | 전부 서버가 확인한다: 발송자의 현재 방 소속·방 인스턴스(matchmaking이 주입한 registry), 친구 관계, 양방향 차단 없음, 수신자 활성·수신 가능. 클라이언트가 보낸 방 코드·발송자·수신자는 권한 근거가 아니다(A-05) |
| 멱등 키 | `UNIQUE(sender_id, creation_key)` — 같은 키 재시도는 기존 행을 돌려주고 `created=false`라 **어떤 사건도 재발행하지 않는다**. 같은 키에 다른 대상·방이면 409 충돌 |
| 논리 발송 번호 | 키는 `${roomId}:${receiverId}:${n}`이고 `n`은 `gameInvite.store.js`가 소유한다. 결과를 확정하지 못한 재시도(네트워크·무응답)는 **같은 번호**, 서버가 결과를 답한 뒤(성공 또는 status 있는 거부)에만 다음 번호. 매 시도마다 난수 키를 쓰지 않는다 |
| 중복 PENDING 방어 | 새 키로 다시 눌러도 같은 방 인스턴스에 살아 있는 PENDING이 있으면 `createInvite`가 그 행을 돌려준다(`created=false`) — 두 번째 알림·두 번째 소리가 생기지 않는다 |
| 방 재확인 경계 | 발송자의 현재 방은 **정렬 계정 잠금 취득 직후**와 INSERT 직전에 각각 다시 읽는다. 트랜잭션 전 preflight 한 번은 권한 근거가 아니다(registry는 소켓 콜백이 동기적으로 바꾼다) |
| 안정 사건 ID | `game-invite:<inviteId>:received` — 알림 `source_key`와 **같은 문자열** (`notification.service.js::gameInviteSourceKey`) |
| 수신자 | `emitToUser(receiverId, 'game_invite_received', { invite, sfxEvent })` |
| 프런트 수신 | `frontend/src/domains/lobby/hooks/useFriendSocketEvents.js` — 앱 전역 한 곳 |
| 소리 판정 소유자 | `gameInvite.store.js::consumeInviteSound` **한 경계뿐** |
| 최종 소비처 | `FriendListPanel.jsx` → `friendList/invite/GameInviteTab.jsx` (로비·대기방 **같은** 패널) |
| 알림 경로 | 같은 트랜잭션의 `notifications` 행 → `/lobby?gameInviteId=<id>` → `useLobbyNotificationPanels` → `FriendListPanel targetInviteId` → 해당 행 강조. **자동 수락하지 않는다** |
| 자산/무음 사유 | `sfxManifest.js`의 `pendingAsset` — `asset-unreviewed`, "자산 파일과 이용 조건 검토가 아직 제공되지 않았다" |
| 복원 경계 | `loadSnapshot`은 authoritative하다 — snapshot에 없는 과거 PENDING은 목록에서 내리고(유령 초대 제거), 종료 이력과 커서 이후 신규는 남긴다. 복원 중 버퍼에 담긴 **커서 이후** 사건은 `soundCandidates`로 돌려받아 `useFriendSocketEvents`가 정확히 한 번 판정한다(사건을 재발행하지 않는다) |
| 담당 상태 | **미완료** — 다중 계정 외부 Chrome 초대 흐름은 후보 `efb443d6`에서 **수행돼 통과했고**(BD-CHROME-EFB443D6.md), 이 보수 후보의 격리 DB 재실행·해당 Chrome 재확인·실제 청음(자산 미검토)이 남았다 |

### review5 보수(이 후보에서 바뀐 것) — 아직 화면 재확인 전

이 라운드에서 고친 것은 **네 가지**다. 전부 실패를 먼저 재현한 뒤 고쳤고, 재현 전/후 기록은
`.pluto/progress.md`에 있다. **아래 어느 것도 앱 내 브라우저에서 다시 확인하지 않았다.**

| # | 고친 것 | 화면에서 달라지는 것 |
| --- | --- | --- |
| 1 | `matchmaking.js` — 기한이 지나도 `phase='published'` 시도를 버리지 않고, publication 소유자 등록부로 되돌림 소유권을 확인한다 | 영수증 없는 입장이 "정상 소속"으로 보이지 않는다(pending 유지). 늦게 깨어난 옛 시도가 더 새로운 확정 소속을 지우거나 없는 이탈을 방송하지 않는다 |
| 2 | `matchmaking.js` — 늦게 커밋된 수락 결정을 기다렸다가 보상한다 | 아무도 입장하지 않은 시도가 `ACCEPTED/UNCONFIRMED`로 굳지 않는다. 조건부 UPDATE는 그대로라 새 시도·확정 영수증은 덮지 않는다 |
| 3 | `gameInvite.store.js` — 재조회(`restorePending`) 중 도착한 신규 초대의 **소리 봉투**를 보관한다 | 패널 열기·새로고침 도중에 온 진짜 신규 초대가 영원히 무음이 되지 않는다. 목록 반영은 그대로 즉시 |
| 4 | `sfxManifest.js` · `notifications.store.js` — 게임 초대가 **"게임 초대"** 설정을 따른다 | 설정의 "게임 초대"를 끄면 실제로 조용해지고, "친구 초대"만 꺼도 게임 초대는 울린다 |
| 6 | `gameInvite.store.js` — 같은 커서의 두 응답을 처리 가능 집합의 **교집합**으로 합친다 | 서버가 역순으로 읽어도 취소된 초대가 수락 버튼과 함께 되살아나지 않는다 |

**#4의 화면 관찰 주의:** 배포 자산이 여전히 미검토라 `asset-unreviewed`가 설정보다 **먼저**
판정된다. 그래서 앱 내 브라우저의 진단 계수(적격 1 · 청음 0 · `asset-unreviewed`)는 이 수정
**전후가 같다**. 바뀐 것은 "어느 설정 항목이 이 소리를 지배하는가"이고, 그 독립성은 실제
재생기 경로의 자동 회귀(`friendInviteRuntime.test.js`)가 확인한다. 설정 분기만 따로 눈으로
보려면 자산 검토가 먼저 끝나야 한다 — 그 전까지 "게임 초대 off를 화면에서 확인했다"고 적지
않는다.

### 아직 재현하지 못한 심사 가설(이 워커의 한계)

`review5`의 가설 **#5(차단 경합)**·**#7(0013 이관 순서)**은 **보호된 격리 MySQL이 있어야**
재현된다. 이 작업본에는 `F01_TEST_DATABASE_URL`이 없어 DB 스위트 196건이 전부 skip이다 —
**skip은 통과가 아니라 미검증이다.** 소스 판독 결과만 아래에 남기고, 증거 없이 제품 코드를
바꾸지 않았다(상세·재현 절차는 `.pluto/progress.md`).

### 소리 소유권(한 사건에 한 번)

- 초대 알림의 `notification_created`에는 **sfxEvent를 싣지 않는다**(`emitNotificationCreated`는
  시스템 알림에만 봉투를 붙인다). 그래서 `notification_created` → `game_invite_received`든
  그 반대 순서든 신규 후보는 **한 번**이다.
- 초대는 `useNotificationsStore.consumeSoundEvent`를 **쓰지 않는다.** 친구·업적과 달리 초대는
  "커서 이하 = 과거"라는 서버 순번 판정이 필요하고 그 커서는 초대 store만 알고 있다 — 두
  경계가 각자 판정하면 같은 inviteId에 소리가 두 번 난다.
- 커서는 **종료된 초대까지 포함한** 수신자 전체 최대 `creation_seq`다. PENDING만의 최댓값을
  쓰면 이미 끝난 과거 초대가 "커서 이후"로 보여 새 사건으로 오인된다.
- snapshot과 생성이 **같은 수신자 User 행 잠금**을 공유하므로(A-09) "커서 이하인데 나중에
  커밋되는" 사건이 존재하지 않는다.
- 후보로 인정하는 순간 표식을 **소모**한다 — 알림 off·mute여도 그렇다. 그래야 설정을 다시
  켰을 때 과거 사건이 울리지 않는다.

### 소리를 만들지 **않는** 경로 (F-19)

`GET /friends/invites`(snapshot 복원) · 복원 전 버퍼 병합 · 재접속 재동기화(`beginResync`) ·
`game_invite_updated`(거절·만료·차단 취소·방 소멸) · `POST …/decline` · 수락 ACK ·
`get_game_invite_result` 재조회 · **방 코드 입장(`room_joined`)** · 만료된 초대 ·
다른 계정·다른 수신자의 사건 · 복원 실패 구간(실패는 해소가 아니다).

### 입장은 소리와 무관하다(AC-07)

`playGameInviteSfx`는 던지지 않고 재생 완료를 기다리지 않는다. 재생이 throw하거나 영원히
pending이어도 수락 ACK·거절 ACK·상태 갱신·대기방 이동이 그대로 완료된다는 것을
`friendInviteRuntime.test.js`가 실제 재생기와 실제 훅으로 확인한다.

### 자동 시험

| 파일 | 무엇을 |
| --- | --- |
| `frontend/src/domains/lobby/hooks/__tests__/friendInviteRuntime.test.js` (26건) | 실제 `useFriendSocketEvents`를 JSDOM에 마운트 + 실제 `createSfxPlayer` + 실제 invite store. 복원 보류·커서 경계·중복·역순 terminal·만료·계정 전환·off/mute 표식 소모·이동 단일 소유자·재생 실패/영구 대기·리스너 수명·`room_joined` 무관. 배포 manifest의 `game-invite` 미검토 무음과 **매체 생성 0**을 따로 확인 |
| ↳ 2026-09-13 보수분 | **버퍼 drain을 사건 재발행 없이** 확인(복원이 끝나는 순간 커서 이후 버퍼 사건이 정확히 1회), snapshot이 취소된 과거 PENDING을 내리고 종료 이력·커서 이후 신규는 남김, ACK 유실 → 같은 시도 durable 결과 복구, 재조회 pending = 모름, 현재 소속 불일치·연결 교체 시 이동 0, 발송 멱등 키 전이 |
| `frontend/src/domains/lobby/store/__tests__/friendStoreOrdering.test.js` (13건, 2026-09-13 신규) | 같은 계정 안의 조회/확정 변경 순서: 조회가 서버 확정 즐겨찾기를 덮지 않음, 오래된 목록 조회·실패가 최신 결과를 덮지 않음, 처리된 요청 부활 0, 공용 처리 잠금이 화면 교체에서 중복 처리 차단, 계정 전환 시 잠금·집계 초기화. **CODEX-2 보수분 3건**: 밀려난(superseded) 호출이 "지금 반영된 최신 사실"을 그대로 돌려준다 — 최신도 실패면 실패, 최신이 실패면 오래된 성공도 최신으로 주장하지 않음, 최신이 성공이면 오래된 실패를 성공으로 보고(대조군) |
| `frontend/src/domains/lobby/hooks/__tests__/friendListSyncDeferred.test.js` (8건) | 실제 훅 마운트 + 실제 store. 단건/전체 수락의 A→B→A 소유 대조, 결과 조회 대기 중 계정 전환, 정상 해제. **CODEX-2 보수분 1건**: 전체 수락의 재조회가 더 최신 **실패**에 밀리면 재조회 오류를 그대로 안내(낡은 목록을 최신으로 안내하지 않음) |
| `backend/socket/__tests__/matchmaking.gameInvite.test.js` (25건) | 예약·두 Map·실제 채널·영수증·정원·`canStart`/`start_game`·cleanup·canonical 교체·boot epoch·방 인스턴스·상태표 1·3·4·5·6. 2026-09-13 보수분: **JOIN_TIMEOUT 뒤 늦게 성공한 socket.join 정리**(유령 청취자 제거 / 더 새로운 확정 소속 보존 / 교체된 소켓 보존). **CODEX-2 보수분 1건**: 교체 소켓이 같은 방의 **확정 참가자**가 돼도 옛 소켓의 늦은 가입은 정리된다(`playerRoom`은 계정 값이라 "누구의 연결이 그 소속을 만들었는가"를 말해 주지 않는다) |
| `backend/service/friend.service.test.js` | 2026-09-13 보수분: `unblockUser`가 정렬 계정 잠금 → 같은 트랜잭션의 owner 한정 삭제 순서로 동작하고, 해제 경로가 취소된 요청을 되살리는 쓰기를 하지 않음 |
| `backend/tests/db/f19-friends-invites.integration.test.js` (31건) | **격리 MySQL 전용.** 0013 재실행 멱등·이력 1건, 거절→재신청→재거절 terminal 2행, 교차 PENDING 1건, 결과 조회 권한, 즐겨찾기 멱등·권한, 차단 양방향 거부·소유자 해제, 차단 무효화와 Friendship/즐겨찾기 보존, 초대 생성 멱등(행·알림·사건 각 1), 키 충돌, 커서, 만료 멱등, 거절 멱등, 수락 결정 ↔ 영수증 2단계, 차단 개입 INTERRUPTED, boot epoch, 방 소멸. 2026-09-13 보수분 4건: 잠금 취득 후 방 변경 시 생성 거부, 살아 있는 PENDING의 중복 초대·중복 알림·중복 소리 0, 차단↔초대 생성 경합, 차단↔해제 경합에서 부활 0 |

### 검증 기록 (누가 · 언제 · 무엇을)

| 주체 / 시점 | 대상 | 결과 |
| --- | --- | --- |
| 구현자(worker), BD F-19 세션(2026-09-13) | `npm test --prefix frontend` | **1790 PASS · 0 fail · 0 skip** (기준선 1772) |
| 구현자(worker), 같은 세션 | `npm run build --prefix frontend` | **PASS** (`✓ built in 1.22s`) |
| 구현자(worker), 같은 세션 | `npm test --prefix backend` | **1412 PASS · 0 fail · 181 skip** (기준선 1385 PASS · 161 skip) |
| 운영자(보호된 격리 MySQL), 후보 `caf79fa1` | F-19 DB 케이스 전체 | **26/26 PASS · 0 fail · 0 skip** (106615ms) — 이전 "미수행" 기록을 이 실측이 대체한다 |
| 운영자 공식 VERIFY, 후보 `9ef9174f` | 격리 MySQL 직렬 backend 전체 | **1628 PASS · 0 fail · 0 skip** (882742ms, 900초 상한 이내) |
| 구현자(worker), 교차 검토 보수 세션(2026-09-13) | `npm test --prefix frontend` | **1805 PASS · 0 fail · 0 skip** |
| 구현자(worker), 같은 세션 | `npm run build --prefix frontend` | **PASS** (`✓ built in 1.34s`) |
| 구현자(worker), 같은 세션 | `npm test --prefix backend` | **1444 PASS · 0 fail · 192 skip** |
| **운영자 공식 VERIFY, 후보 `efb443d6`** | 격리 MySQL 직렬 backend 전체 · frontend · build | backend **1639 PASS · 0 fail · 0 skip**(763361ms, 900초 상한 이내) · frontend **1817 PASS** · build **PASS** |
| **운영자, 실제 외부 Chrome, 2026-09-13 22:03–22:14 KST, 후보 `efb443d6`** | 두 실제 계정(업적검증 / 초보검증), 같은 API 4183 · DB `pluto_f01_20260909_al` · 소켓 · 방 권한 | 초대 발송→수신→수락→**양쪽 대기방 2인 일치**, 새로고침 복원 2인, 이탈 후 방장 1인, 즐겨찾기 계정별 지속, 종료된 발송 뒤 새 의도적 초대 생성, 차단으로 대기 초대 무효화, 해제+새로고침 뒤 부활 0 — `.pluto/monitor/BD-CHROME-EFB443D6.md` |
| 구현자(worker), CODEX-2 보수 세션(2026-09-13) | `npm test --prefix frontend` | **1824 PASS · 0 fail · 0 skip**(직전 1817 → 보수 회귀 7건 추가) |
| 구현자(worker), 같은 세션 | `npm run build --prefix frontend` | **PASS** (`✓ built in 2.23s`) |
| 구현자(worker), 같은 세션 | `npm test --prefix backend` | **1445 PASS · 0 fail · 195 skip** |
| 구현자(worker), 같은 세션 | 변이 검사 5건(고친 줄을 되돌려 봄) | 보수 회귀 5건이 각각 **실패** — superseded 의미·snapshot 지식·snapshot 순번·수락 잠금 범위·늦은 가입 소유 대조를 실제로 잡는다 |
| 구현자(worker), RESULT-3 보수 세션(2026-09-14) | `npm test --prefix frontend` | **1845 PASS · 0 fail · 0 skip**(직전 1824 → 보수 회귀 + 진단 시험 21건 추가) |
| 구현자(worker), 같은 세션 | `npm run build --prefix frontend` | **PASS** (`✓ built in 2.43s`) |
| 구현자(worker), 같은 세션 | `npm test --prefix backend` | **1445 PASS · 0 fail · 196 skip** — skip 196에는 이번에 추가한 F-19 DB 회귀 1건이 포함되며 **미검증**이다 |
| 운영자 / VERIFY | **이 보수 후보**의 격리 DB 직렬 backend · 위 Chrome 흐름 재확인 | **남아 있음** — 위 운영자 PASS·Chrome은 이 보수 **이전** 후보(`efb443d6`)의 것이라 이 후보의 근거가 아니다 |

- worker의 `npm test --prefix backend` skip 195건은 `F01_TEST_DATABASE_URL`이 없어서다
  (기존 + F-19 31). **skip은 통과가 아니라 미검증이다.**
- **실제 Chrome에서 이미 확인된 것**(운영자 관측): 위 `efb443d6` 초대 흐름 전부, 그리고
  `BD-CHROME-QA-20260913.md` · `BD-CHROME-REPAIR-FINDINGS.md` · `BD-CHROME-470f704a.md`의
  친구 신청·수락, 오프라인 행 표시, 즐겨찾기 저장 후 새로고침·재로그인 복원, 대기방에서
  같은 즐겨찾기 공유, 마우스 조작·차단 진입 보수 확인.
- **실제 Chrome에서 발견된 결함과 이번 보수**: 대기방 친구 버튼이 사운드 볼륨 슬라이더
  (`aria-label="배경음 볼륨"`)에 덮여 마우스로 눌리지 않았다 →
  `MatchingPageControls`에 우측 조작 슬롯을 만들어 로비와 같은 한 열로 합쳤다(겹침 제거,
  사운드는 그대로). 받은 요청의 거절·차단이 같은 이미지였다 → 거절은 취소/부정 버튼
  자산으로 분리하고 둘 다 설명(title)을 붙였다. 이미 친구인 사람의 차단 진입이 없었다 →
  `FriendListRow`에 차단 버튼을 추가해 폴더·즐겨찾기·검색 결과 모든 목록에 연결했다.
  **이 세 보수의 브라우저 재확인은 `BD-CHROME-470f704a.md`에서 수행돼 통과했다.**
- 실제 외부 Chrome의 다중 계정 초대 흐름(A 대기방 생성 → 친구 B 초대 수신 → 수락 → 실제
  참가자 일치, 새로고침 복원, 이탈, 차단·해제)은 후보 `efb443d6`에서 **수행돼 통과했다**.
  아직 Chrome에서 태우지 않은 것은 **거절·만료·가득 참·방 삭제/시작·연결 끊김·off/mute와
  전체 수락 부분 실패**다.
- 모의 재생을 청음으로 기록하지 않는다. 배포 manifest의 `game-invite`는 여전히 미검토라
  실제 청음 자체가 불가능하다(무음 + 사유 유지가 계약). Chrome에서 본 배지·알림 수 변화는
  **소리 증거가 아니다** — 소리 1회·무음 복원·설정 off/on은 측정되지 않았다.


## Operator current-production-candidate rerun

# F19 review 2 repair — actual external Chrome

2026-09-13 22:50–22:59 KST. Production candidate b28309067a48884bb41feda436be55711bd625ad. Operator personally drove external Chrome using the supported Chrome browser-client. No browser-store injection, fake participant insertion, mocked business response, or source alteration.

## Environment and measured precondition

- Existing implementation finished and official scope gate was idle before QA.
- Protected actual MySQL F19 integration file: 31 PASS, 0 FAIL, 0 SKIP, 30012.0725ms. Complete output BD-db-suite-review2-console.log.
- Actual BD API4183 and QA-only second-origin proxy4184, UI5183. Both real accounts use the SAME backend, DB, sockets and room state. Isolated DB is pluto_f01_20260909_al only.
- API38744 and UI28724 were started for this run and stopped after checking their exact script command lines. DB test finished before API startup; no concurrent worker/full verification/DB QA.

## Personally observed actual UI

1. Normal login via email/password input for veteran (업적검증) on 127.0.0.1 and rookie (초보검증) on localhost. Both distinct account names shown simultaneously.
2. Host searched the other account using the friend-add screen and sent a real friend request. Guest used **전부 수락**. Result **1건 수락**, incoming list empty; host friendship appeared. This covers the successful bulk path, not forced newer-fetch failure.
3. Host created a default room through game mode → room list → settings → create. Actual party count was 1. Waiting-room friend control responded to real mouse clicks.
4. Host sent a real game invite. Guest's already-open invite panel received exactly one actionable row with sender 업적검증 and badge 1. Guest clicked accept. Both actual pages settled at **파티 인원 2명**, host had delete and guest had leave. Screenshot personally inspected: two actual visible player portraits and count 2.
5. Guest navigated to the same current game-matching URL to perform a full page reload. Actual settled room restored 2. Guest then left: public list showed host room 1/10 and host showed party1.
6. Host sent a new intentional invite after completed acceptance/leave. Guest saw badge1, then blocked host through the existing-friend row. Pending badge disappeared and visible friend count became0.
7. Guest unblocked host from the block list. Game invite list remained empty. Guest full reloaded, logged-in account restored normally, then reopened invites: **받은 게임 초대가 없습니다.** Host reopened friend panel and after the real refresh settled, friendship returned1/1.
8. A new intentional send after unblock produced one new actionable row; old cancelled invite did not reappear. Guest clicked decline: no room navigation, no pending badge/accept button, terminal message **이미 거절한 초대입니다.**
9. Host sent another new invite; guest saw badge1 and one actionable row. Host deleted the QA room through actual UI. Public room list emptied, guest pending badge/accept button disappeared, terminal message **더 이상 유효하지 않은 초대입니다.**

## Limits and observed presentation detail

- The terminal rows after decline/delete display **알 수 없는 사용자** instead of preserving the previously shown sender name. Actionability and terminal status were correct. Record for independent review; do not describe sender-name persistence as passed.
- This run does not simulate delayed old PENDING delivery, competing HTTP failures, deferred ACK/replaced socket race, full-capacity/start race, cross-account lost response, or TTL expiry in actual Chrome. Their controlled regressions and independent review remain separate evidence.
- Audible SFX once/off/restore remains unmeasured; production game-invite asset is intentionally unreviewed/muted. Badge changes and screen transitions are not audio evidence. No mute-policy exception introduced.
- Current-candidate full serial 900sec backend/frontend/build and both independent verdicts remain required. Previous efb443d6 full1639 PASS cannot be claimed as this candidate's full PASS.


## RESULT-3 보수 — AC-07 소리 증거를 실제로 셀 수 있게 하는 QA 진단

배포 `game-invite` 자산은 여전히 **미검토**라 실제 청음이 불가능하다. 그래서 운영자가 귀로
"신규 1회 / 복원 0회"를 셀 수 없었고, 화면에도 그 판정이 드러나지 않아 AC-07의 남은 증거를
만들 방법 자체가 없었다. 이번에 **읽기 전용 관찰 화면**을 추가해 그 병목을 푼다.

### 무엇인가 (그리고 무엇이 아닌가)

| 항목 | 값 |
| --- | --- |
| 모듈 | `frontend/src/domains/lobby/diagnostics/inviteSfxDiagnostics.js` |
| 화면 | `frontend/src/domains/lobby/components/friendList/diagnostics/InviteSfxDiagnosticsPanel.jsx` (친구 패널 안쪽, 모든 탭에서 보임) |
| 켜지는 조건 | **개발 번들**(`import.meta.env.DEV`) **그리고** URL에 `?qaInviteSfx=1` — 둘 다여야 한다 |
| 관찰 지점 | `useFriendSocketEvents.js::playGameInviteSfx` — 이미 내려진 판정을 옮겨 적을 뿐이다 |
| 보여주는 것 | 수신 건수 · **적격 판정(dispatch 시도)** · **실제 청음(played)** · 무음 사유별 집계 · 최근 관찰 목록(초대 id·사유) |

**하지 않는 것(계약):** 초대를 만들거나 사건을 합성하지 않는다 · store를 바꾸지 않는다(소리
표식도 소모하지 않는다) · `Audio`를 대체하지 않는다 · 자산을 승인하지 않는다 · 인증을
우회하지 않는다 · 토큰·비밀값을 담지 않는다 · 판정 게이트 순서를 증거를 위해 바꾸지 않는다.
기록이 실패해도 수락·거절·입장으로 전파되지 않는다(전부 try로 감싸고, 꺼져 있으면 기록할
값을 만들지도 않는다).

**적격 판정과 실제 청음을 절대 합산하지 않는다.** `sfxPlayer` 계약상 `status: accepted`는
"재생 시도를 시작했다"일 뿐이고 실제 결과는 `completion`(played|failed|timed-out|stopped)이
말한다. 지금처럼 자산이 미검토면 dispatch가 매체를 만들기 전에 `asset-unreviewed`로 거부하므로
**적격 1 · 청음 0 · 사유 `asset-unreviewed`** 가 정상이고, 이것을 1회 청음으로 적지 않는다.

계정이 바뀌거나 로그아웃하면 관찰을 통째로 버린다. 현재 계정 밖의 관찰은 "다른 계정"이라는
사실만 남기고 초대 id·사건 id를 담지 않는다. 보관 상한은 40건이다.

### 운영자 Chrome 절차 (실제 두 계정)

두 계정 모두 같은 백엔드·DB·소켓을 쓰고, 수신자 쪽 탭만 `?qaInviteSfx=1`을 붙여 연다
(예: `http://127.0.0.1:5183/lobby?qaInviteSfx=1`). 친구 패널을 열면 아래쪽에
**"QA 진단 · 읽기 전용"** 상자가 보인다. 개발 서버가 아니면 나타나지 않는다.

1. **신규 수신 1회** — 발신 계정이 대기방에서 초대를 보낸다. 수신 탭에서 `수신 +1`,
   `적격 판정 +1`, `재생 완료 0`, 사유 `asset-unreviewed +1`을 확인한다.
   → 미검토 자산이므로 **소리는 나지 않는 것이 정상**이다. 들렸다고 적지 않는다.
2. **복원 0회** — 수신 탭을 새로고침(또는 연결을 끊었다 잇는다). 목록에는 그 초대가 다시
   보이지만 `적격 판정`은 **0**이어야 한다(새로고침으로 기록이 비워지므로 0에서 시작한다).
   같은 초대를 다시 배달받아도 사유가 `already-consumed` 또는 `at-or-below-cursor`로 남고
   적격 판정은 늘지 않는다.
3. **off/mute** — 설정에서 해당 알림을 끄거나 음소거한 뒤 **새 초대**를 받는다. 적격 판정은
   1회 그대로이고 사유는 자산 미검토가 먼저 기록된다(자산 제한이 설정보다 앞선다). 설정을
   다시 켜도 **과거 초대가 다시 적격이 되지 않는다**.
4. **계정 전환** — 다른 계정으로 로그인하면 진단 상자의 관찰이 즉시 비고 관찰 계정이 바뀐다.
5. **업무 경로 불변** — 위 전 과정에서 수락·거절·입장이 평소와 똑같이 동작하는지 확인한다.
   진단은 어떤 버튼도 막지 않는다.

기록할 것: 각 단계의 `수신 / 적격 판정 / 재생 완료` 세 수와 사유 집계, 서버의 inviteId와의
대응. **청음은 자산 검토가 제공되기 전까지 외부 자산 한계로 남는다** — 진단이 보여주는
`재생 완료 0`은 그 한계의 증거이지 결함이 아니다.

### 자동 시험

| 파일 | 무엇을 |
| --- | --- |
| `frontend/src/domains/lobby/diagnostics/__tests__/inviteSfxDiagnostics.test.js` (9건, 신규) | production 번들 제외(표식이 있어도 꺼짐) · 표식 없으면 기록 값 생성 자체가 0 · 개발+표식일 때만 켜짐 · 계정 전환/로그아웃 시 관찰 폐기 · 범위 밖 관찰의 식별자 제거 · 적격≠청음 · 사유 집계 보존 · 기록/구독자 예외가 호출자로 전파되지 않음 · 상한과 스냅샷 참조 안정성 |
| `frontend/src/domains/lobby/hooks/__tests__/friendInviteRuntime.test.js` (신규 2건) | **배포 manifest 그대로** 실제 훅·store·재생기를 태워 `적격 1 · 청음 0 · asset-unreviewed 1`을 확인, 중복 전달은 `already-consumed`로 적격 0, 커서 이하는 `at-or-below-cursor`, 진단을 켠 채로 거절 ACK가 정상 완료. 진단이 꺼져 있으면 관찰 0이고 초대 처리는 동일 |

### 같은 라운드의 경합 보수 (RESULT-3 1~4)

| # | 대상 | 고친 것 | 회귀 |
| --- | --- | --- | --- |
| 1 | `backend/service/gameInvite.service.js::recordEntryInterrupted` | 읽고-확인-쓰기를 **조건부 UPDATE 한 문장**으로 합쳤다(`id`+`attempt_id`+`entry_outcome='UNCONFIRMED'`). 확정 커밋과 겹쳐도 PUBLISHED를 덮지 않고, 교체된 attempt도 건드리지 않는다 | `f19-friends-invites.integration.test.js` — 열린 트랜잭션으로 경합 창을 만들어 재현 + 정상 보상·멱등·attempt 교체 대조군 |
| 2 | `friend.store.js::setFavorite` / `fetchFavorites` | 한 명의 확정 저장이 즐겨찾기 **목록 전체**의 순번을 올리던 것을 멈추고, 조회 결과와 한 명 단위 확정을 화해시킨다 — 다른 친구들의 저장된 별을 잃지 않는다 | `friendStoreOrdering.test.js` 신규 3건(두 친구 + 지연 최초 조회, 해제 확정, 나중 조회 대조군) |
| 3 | `friend.store.js::removeIncomingRequest` | 한 행의 제거를 "전체 조회 성공"으로 기록하던 `bumpSeq`를 제거 표식으로 바꿨다 — 겹쳐 실패한 재조회가 성공으로 보고되지 않는다 | `friendStoreOrdering.test.js` 신규 3건(실패 재조회 안내 유지 / 성공 재조회 보고 유지 / 제거 뒤 조회 대조군) |
| 4 | `gameInvite.store.js::loadSnapshot` | 순서 기준을 요청 **시작 순서**에서 서버가 확정한 **커서**로 바꿨다. 뒤처진 응답은 커서·지식을 되돌리지 않으면서 복원 보류는 해소하고, catch 경로도 더 새로운 성공을 오류로 덮지 않는다 | `friendInviteRuntime.test.js` 신규 3건(역전된 서버 읽기 순서 / 뒤처진 응답 후 신규 1회 / 오래된 실패가 최신 성공을 덮지 않음) |



### Operator follow-up before review (2026-09-14)

The diagnostic UI label is 재생 완료, a player completion report, never proof of audible output. Physical audibility remains unmeasured. Protected F19 DB on acf13e2c:32PASS0FAIL0SKIP29067.177ms. Operator found beginResync resets snapshotLoaded while preserving cursor50; a later snapshot20 must not roll it back. Added a mounted runtime regression that fails before the monotonic-cursor repair, then checks no old invitation revival and one new eligible dispatch. No live Chrome observation is claimed: the supported Chrome transport remains unavailable despite valid extension/native host and documented reconnect.


## Latest operator UI evidence — user-authorized in-app browser

# F19 current candidate — actual in-app browser verification

2026-09-14 KST. Production candidate `cd33c9051314efd48b6ea2a8cabc0efc2ca58d50`.

The user explicitly changed the browser requirement in this task: “아아 그냥 챗gpt앱에서 열어서 체크하라고”. This run uses the supported Codex/ChatGPT in-app browser, not external Chrome. It is actual interactive UI evidence on the current production candidate, not a mock or a claim that Chrome transport recovered.

## Environment

- Existing batch unchanged: batch-0ea6f89b-9d6d-4a1d-a3ca-432c303afdcb, 18/32 completed, BD idle VERIFY/error R-SCOPE before QA.
- Existing Pluto daemon preserved, PID27316/9500. No new daemon, batch, automation, or review model changes.
- Existing bd-browser-server.cjs and bd-two-origin-vite.mjs: actual BD API4183, localhost proxy4184, Vite5183. Two independent hostnames share the same unmodified backend, sockets, and protected MySQL database `pluto_f01_20260909_al`.
- Normal email/password login through the actual UI for the existing isolated veteran and rookie QA accounts. No browser state injection, synthetic invite, mocked business response, Audio replacement, authentication alteration, or asset approval.
- No schema reset. API fixture startup only uses its existing isolated QA account initialization. No simultaneous implementation/full DB test. QA process identity and shutdown are recorded separately.
- Raw observed DOM checkpoints: `.pluto/monitor/BD-IAB-20260914-DOM.json` in the main project.

## Actual observations

1. Both accounts were visibly signed in as 업적검증 and 초보검증. Host searched by nickname and Enter, sent a real friend request; receiver used 전부 수락. Settled result: **1건 수락**, no remaining friend requests.
2. Host created a real default room. Waiting-room friend button opened normally; actual initial party count1, friend row online, real game invite button actionable.
3. New invitation `f097a45a-ee82-44d5-b8b5-c2a1659e1333`: receiver diagnostics **received1 / eligible1 / player-completed0**, `asset-unreviewed ×1`. The actual invitation had accept/decline controls.
4. Receiver full reload: old pending invitation restored with accept/decline controls, diagnostics **0/0/0**. No old eligible dispatch. Receiver declined it normally.
5. Receiver unchecked **게임 초대** in General settings; unchecked state independently observed again on returning to settings. A new actual invitation `c4fe792d-75ba-43eb-8ec9-cf1ee792819a` yielded **1/1/0**, asset-unreviewed1. This is the current contract: asset approval is checked before settings. Rechecking 게임 초대 and browser Back to the existing flagged lobby preserved the same observation and **1/1/0**, without another dispatch of the old invitation. Decline completed normally.
6. Receiver checked **효과음 음소거** in Sound settings. Browser Back retained the same document/runtime. New invitation `c669adae-10d7-4902-9d68-ad32bb9e9785` advanced cumulative diagnostics to **2/2/0**, asset-unreviewed2. The checked mute setting was observed again before unchecking it. Browser Back after unmute retained **2/2/0** and the same two invite IDs; no old replay.
7. Receiver accepted the actionable invitation. Both actual pages settled at **파티 인원 2명**. Screenshot visually inspected: two player portraits and 2 participants. Receiver full reload restored2; clicking 방 나가기 restored the host to1 and public room list to1/10.
8. New invitation `c0ee25a8-1489-4049-90ef-118e594f9a21` received normally. Receiver blocked host using the friend row; settled block list showed host and pending badge disappeared. Unblock then full reload showed **받은 게임 초대가 없습니다**, diagnostics0/0/0. Host reopened friends: friendship preserved1/1.
9. Fresh invitation after unblock `cf418cc9-cba3-45d7-b3e1-3ddaa54b4f99` yielded1/1/0 and one pending row. Host deleted the disposable QA room through UI. Room list emptied; receiver accept/decline controls disappeared and terminal text became **더 이상 유효하지 않은 초대입니다**.
10. Receiver normally logged out and signed into the other existing QA account in the same tab. Reopening the flagged diagnostic URL showed account suffix changed from …291027 to …11ef7b, **0/0/0** and no previous invite IDs. This includes a full document navigation to restore the diagnostic flag; it does not independently measure the immediate hidden reset timing during logout. Automated account-reset regressions remain separate evidence.

## Boundaries and encountered UI state

- Physical audibility is unmeasured. The shipped game-invite asset remains unreviewed and silent. Eligible dispatch and player completion are never claimed as one audible play. Off/mute observations do not isolate a settings-specific suppression branch because asset-unreviewed has precedence.
- Turning settings on/off via ordinary Settings → back button drops the QA URL flag. For the paired off/on and mute/unmute measurements, browser Back restored the prior flagged SPA entry and preserved the counters. The initial off run was started after reopening the QA URL; its baseline was zero.
- Switching the receiver tab into the account still open on the host caused an alert in the earlier host tab. During that alert, receiver friend-control actions produced no visible change. The supported getJsDialog/dismiss API closed the actual host alert; receiver panel then opened normally. No source was altered, and this is not recorded as an application-code repair or a proven root cause beyond the observed association.
- Terminal cancelled/declined invitation rows still display **알 수 없는 사용자**, already noted in previous reviews. Pending sender names were correct. No sender-name persistence PASS is claimed.
- Controlled delayed-response races, instant hidden logout reset, full-capacity/start/expiry races, and physical audio are not newly asserted as browser observations. Existing focused/whole-suite regressions and independent review remain the evidence for those boundaries.
- Operator automatic results on this production candidate already recorded: frontend1846PASS/0FAIL/0SKIP; buildPASS; protected F19 DB32PASS/0FAIL/0SKIP; full protected backend1641PASS/0FAIL/0SKIP697985.6092ms. They do not replace normal official gates or either independent review.

Next: stop the exact QA processes, attach this evidence with the prior 62-file scope audit, request official rescope, and let normal verification and both independent reviewers decide. No manual PASS, requirement weakening, or merge override.

