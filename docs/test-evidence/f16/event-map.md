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
| 신규 시스템 알림 연결 | F-17 (SFX-DEFER-17=BB) | **미완료** — 코드 연결·자동 시험은 끝났으나 실제 외부 Chrome 증거와 실 DB 시험이 없다(아래 F-17 절) |
| 실제 게임 초대 | F-19 (SFX-DEFER-19=BD) | 미완료 |
| 전체 개인 능력 영상 동기 · 승인 MOV 5개 내장음 실제 연결 | F-27 (SFX-DEFER-27=BL) | 미완료 |
| 통합 인수 | F-28 (SFX-INTEGRATION-28=BN) | 미완료 |

F-16이 F-27에 제공하는 것은 `claimAudio(event, { mode: 'embedded' })` · `getMix()` ·
`subscribeMix()` 계약뿐이다. MOV 실제 변환·청음·동기 연결은 여기서 검증하지 않았고
완료로 기록하지 않는다. 최대 2초 길이 제한은 **별도 SFX 전용**이며 4~5초 내장음에는
적용하지 않는다.

## F-17(SFX-DEFER-17) 이관 증거 — 신규 시스템 알림

**상태: 미완료.** 아래는 이번 슬라이스에서 실제로 연결하고 자동 시험으로 확인한 것이며,
**실제 청음도 외부 Chrome 확인도 아니다.** 배포 manifest의 `system-notification`은 여전히
미검토라 매체를 만들지 않는다 — 아래 "재생 1회"는 전부 시험 전용 fixture + 주입 매체의
`playCalls` 기록이고, 이것을 실제 청음 증거로 기록하지 않는다.

| 항목 | 값 |
| --- | --- |
| kind | `system-notification` (scope=account, notificationKey=`system-notification`) |
| 생산자 | `backend/service/notification.service.js::ensureSystemWelcome` |
| 생산 트리거 | `backend/socket/socket.js::registerNotificationHandlers`의 `notifications_ready` (세션 가드 통과 + `onlineUsers`의 현재 소켓 일치일 때만) |
| 안정 사건 ID | `notification:<notifications.id>` — 서버가 저장한 행 id (원본 중복 키는 `UNIQUE(user_id, source_key)`의 `system:notifications-available:v1`) |
| 수신자 | `emitToUser(<검증된 계정 uuid>, 'notification_created', …)` |
| 프런트 수신 | `frontend/src/domains/notifications/hooks/useNotificationSocketEvents.js` |
| 최종 소비처 | `useNotificationsStore` → `NotificationModal.js` 목록 · `NotificationEntryButton.js` 미확인 수 |
| 자산/무음 사유 | `sfxManifest.js`의 `pendingAsset` — `asset-unreviewed`, "자산 파일과 이용 조건 검토가 아직 제공되지 않았다" |
| 담당 상태 | **미완료** (실제 청음·Chrome 미검증) |

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

`GET /notifications` · 초기 복원 · 복원 전 버퍼 병합 · 재접속 재동기화 · `PATCH …/read` ·
`notifications_ready` 재시도 · 표시 설정 재활성화.

### 이번에 확인한 것 / 확인하지 못한 것

- 확인함(자동 시험): `frontend/src/domains/notifications/hooks/__tests__/notificationRuntime.test.js`,
  `frontend/src/domains/notifications/components/__tests__/NotificationModal.test.js`,
  `frontend/src/shared/audio/__tests__/sfxPlayer.test.js`의 F-17 절,
  `backend/services/achievementService.test.js`의 F-17 절.
  `npm test --prefix frontend` 1704/1704 통과, `npm test --prefix backend` 1371 통과·154 skip,
  `npm run build --prefix frontend` 성공.
- **확인하지 못함**: `backend/tests/db/f17-notifications.integration.test.js`는
  `F01_TEST_DATABASE_URL`이 없어 전부 skip이다 — 실제 MySQL 유일 제약·트랜잭션 롤백·
  권한 404는 **미검증**이다.
- **확인하지 못함**: 실제 외부 Chrome에서의 A/B 계정 친구 요청·업적 획득·시스템 안내 수신·
  재접속·off/mute·실패 중 이동 확인. 실제 자산 청음도 없다(자산 자체가 없다).

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
