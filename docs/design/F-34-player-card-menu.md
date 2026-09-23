# F-34 기능 설계도 — 플레이어 카드 메뉴(투표·밤 행동·추방), 제어 패널 제거, 인게임 전적

> F-34를 나눈 **모든 조각(V-1·V-2·S-1)** 의 계획·계획 검증에 같이 붙는다. 조각은 자기 몫만 구현한다.
> 여기 확정된 경로·필드·담당은 **계약**이다 — 조각의 계획은 이것을 바꾸지 않고, 부족한 점은 고치지 말고 `unsure`에 근거와 함께 남긴다.
> 작성 2026-09-22. 운영자 지시(2026-09-22 실제 인수): "플레이어 화면으로 투표 가능하게 — 인게임 화면에 플레이어 카드를 누르면 메뉴가 나오면서 투표할 수 있게", "인게임 왼쪽하단 UI 삭제 — 그 제어 패널(투표·밤 행동이 들어 있는 박스)", "인게임 추방기능", "인게임 플레이어 전적 문제 해결".
> 관련: F-33(이모티콘)은 **본인 카드 우클릭**을 쓴다. F-34의 메뉴는 **좌클릭**이다 — 두 설계도가 같은 카드를 나눠 쓴다(§2-1).

## 1. 이미 있는 것 (소비만 한다 — 계약을 바꾸지 않는다)

| 무엇 | 어디 | 핵심 |
|---|---|---|
| 행동 훅 | `frontend/src/domains/game/ingame/hooks/useInGameActionPanel.js` `useInGameActionPanel({interactionBlocked})` (:108, 반환 :416-478) | 대상 `dayVoteTargets`(:148)·`nightActionTargets`(:137), 선택 `selectedDayVoteTargetId`/`selectedNightTargetId`, 조건 `dayVoteControlsEnabled`(:249)·`nightActionsLocked`(:274)·`isNightTurnActor`(:273)·`tribunalVoteControlsEnabled`(:381)·`dayReadyControlsEnabled`(:359)·`dayVoteResolveControlsEnabled`(:297)·`tribunalResolveControlsEnabled`(:398)·`isGameEnded`(:244), 제출 `submitDayVote()`(:285)·`abstainDayVote()`(:290)·`submitNightAction()`(:408)·`skipNightAction()`(:412)·`submitTribunalVote`·`submitDayReady`, 집계 `resolveDayVote()`(:304)·`resolveTribunalVote`(:394)·`resolveNight`. 순수 헬퍼 `parseDayVoteResolvedPayload` 등은 `useGameSessionSocketEvents.js`가 import한다 — **이 파일에서 옮기지 않는다** |
| 제어 패널 | `.../components/actions/InGameActionPanel.jsx` (581줄), 위치 `CONTROL_PANEL_BASE_CLASS` :42 (`absolute bottom right z-30`) | 마운트 `InGamePage.jsx:273-277`(props `onOpenRoleReveal, roleRevealAvailable, interactionBlocked`), `InGamePlayArea.jsx:22`(InGamePage가 쓰지 않는 변형). 안에 있는 것: 펼치기 토글(:256, `useInGameControlPanelLayout`), "내 역할 보기"(:276), 낮 준비(:290), 낮 투표 대상 선택+투표/기권/낮 집계(:321-384), 재판(:386-453), 밤 대상+확정/건너뛰기+밤 종료(:455-531), 밤 개인 결과 JSON 덤프(:537-549), 펼쳤을 때만 사건 로그(:551-575) |
| 패널 잠금 시험 | `.../components/actions/__tests__/InGameActionPanel.{controlPanel,presentation,productionSource,visualPolish,frameAsset}.test.js` | 패널 원본을 고정한다 — V-2가 패널을 없애면 **함께 삭제**(계약 변경 기록) |
| 카드 | `.../components/board/InGamePlayerCard.jsx` props :26-36 (`portraitSrc, frameSrc, accountBorderSrc, nickname, status, theme, voteHighlight=false, isSelf, className`) — 평범한 `<div>`(:42), 클릭 없음 | `voteHighlight`는 정의만 있고 호출자가 없다(:37 테마, :95 네임플레이트) — "내 투표 대상" 강조로 쓴다 |
| 보드 | `.../components/board/InGamePlayerBoard.jsx` (41줄) | `useInGamePlayerSessionContext().players`를 `<div className="absolute pointer-events-auto" style={buildInGamePlayerSlotStyle(...)}>`(:21-25)로 배치. 클릭 핸들러 없음 — 메뉴는 여기 래퍼에 단다 |
| 세션 플레이어 형태 | `.../utils/buildPlayerSessionSourceFromGameState.js:72-78` → `{id: uuid, name, connected, alive, themeIndex, role?, team?, isAlly?, accountProfile*Id?, accountCardFrameId?}` | **`membershipId`는 실리지 않는다** — 추방은 `useInGameStore.getState().state.players`에서 읽는다(`SettingKickPlayerModal.jsx:57-64`와 같은 방식) |
| 시간바 스택 | `.../constants/timebar/ingameTimebarLayout.js` `INGAME_TIMEBAR_STACK_CLASS`("시간바와 선택적 투표 현황 버튼을 세로로 쌓는 래퍼"), `.../components/timebar/InGameTimebar.jsx:112-118`(`onVoteStatusClick`이면 `InGameVoteToggleButton`) | 대상 없는 행동 버튼 한 줄이 들어갈 자리(선례) |
| 추방 훅 | `.../hooks/useKickPlayerRequest.js` `useKickPlayerRequest({scope, buildRequest, getMembershipScopeId, verifyMembership})` (:156), 반환 :509-522 (`pendingTarget, status, errorCode, isSending, canLookupResult, isAwaitingResolution, requestConfirm, cancelConfirm, confirmKick, lookupResult, reset`), 사건 `KICK_EVENTS` :38 (`kick_game_player`, `get_kick_result`) | 인게임 호출부 `.../controls/ingameSetting/kickPlayer/SettingKickPlayerModal.jsx`(대상 :41-49, `getMembershipScopeId` :57-64, `verifyMembership` :77-115 `get_session_snapshot`, `buildRequest` :118-137). **이 모달과 설정→방관리 경로는 남긴다** |
| 추방 서버 | `backend/socket/gameSession.js` `handleKickGamePlayer` :4850, 방장 검사 :4940 (`session.hostUuid !== uuid` → `NOT_HOST`), 등록 :5255 | 변경 없음. `hostUuid`는 클라 store 최상위 키(`state.hostUuid`) |
| 투표 현황 | `.../components/vote/InGameVoteStatusContent.jsx`(70줄) — `DUMMY_VOTE_COUNTS`(`.../constants/vote/ingameVotePreviewData.js:8`) 슬롯 인덱스로 더미, `handleSubmit` no-op(:36) | 서버 집계는 **총계뿐**: `dayVoteResolution = {round, outcome, tribunalTargetUuid, publicVoteCount, publicAbstainCount, revoteExcludedUuids}`(`backend/game-core/gameSession.js:4088-4095`, 프런트 `ingameStore.js:1245-1275`, `applySessionSnapshot.js`). 개인별 득표는 서버 계약이 없다 — **이번 범위 밖** |
| 전적 목록 | `.../controls/playerRecordList/PlayerRecordListContent.jsx:36-51` — `DUMMY_PLAYER_RECORDS[index]`로 붙임, 행 `PlayerRecordListRow.jsx`(props :19-27, `formatPlayerRecordStats`) | 더미 정의 `.../constants/controls/playerRecordList/ingamePlayerRecordListData.js:64-80`. 같은 파일의 `getPlayerRecordListProfileAssets`(:52)·`getPlayerRecordListFallbackProfileAssets`(:88)는 `SettingKickPlayerModalContent.jsx`·결과 뷰모델도 쓴다 — **남긴다** |
| 로스터 공개 필드 | `backend/game-core/gameSession.js` `buildPlayerAccountProfileFields(player)` :1253-1264 (own-property 검사로 `accountProfilePhotoId, accountProfileBorderId, accountCardFrameId`만; `accountSkinsByJob` 금지 주석 :1257) — 사용 :1335(`buildGameStartedPayload`)·:4054(스냅샷) | 프런트 검증 `.../store/applySessionSnapshot.js` `applySessionSnapshotPure` :158, 플레이어 루프 :172-191(필수 `uuid, nickname, isAlive, isConnected`, 선택 own-property `isParticipating, membershipId, themeIndex, accountProfilePhotoId, accountProfileBorderId, accountCardFrameId`) — 모르는 키는 복사되지 않는다. `bootstrapSessionSnapshotPure` :120도 같은 규칙 |
| 계정 전적 | `backend/repositories/gameResult.repositories.js` `getMyRoleStatistics(userId)` :205(역할별 5행 `{games, wins, winRate}`), `getRoleRanking(role)` :224(`economyService.getPublicProfileLoadouts` :239 — 다른 계정 공개 정보 일괄 조회 선례), 출처 필터 :173(`development`·`test` 제외) | HTTP는 본인용 `GET /user/me/profile`(`backend/controller/profile.controller.js` `getMyProfile` :9-61 — `total_games`, `account_win_rate` = 역할별 games/wins 합)뿐. 타인 uuid 조회 없음 |
| 사건 잠금 시험 | `frontend/src/domains/game/ingame/__tests__/InGamePage.deadParticipant.integration.test.js` — `SERVER_EMIT_EVENTS_LOCK` :986-1003, `CLIENT_EMIT_EVENTS_LOCK` :1382-1396, `CLIENT_SUBSCRIBE_EVENTS_LOCK` :1399-1421, **`INGAME_MOUNT_LOCK` :1528-1539**(InGamePage가 마운트하는 컴포넌트 정확한 목록, `InGameActionPanel` 포함), `INGAME_STORE_DATA_KEYS` :1551 | 컴포넌트를 더하거나 빼면 **잠금을 같이 고친다**(단언 삭제가 아니라 목록 갱신) |
| 공용 UI | `frontend/src/shared/ui/`에 Popover/Menu 원시 컴포넌트 **없음**(`Dropdown.jsx`가 가장 가깝다) | 메뉴는 인게임 도메인 안에 만든다 |

## 2. F-34가 확정하는 계약

### 2-1. 카드 클릭 계약 (V-1)
- 보드 래퍼(`InGamePlayerBoard.jsx:21`)가 **좌클릭**(`onClick`) → 그 카드의 메뉴를 연다. **우클릭(`contextmenu`)은 F-33 팔레트 몫**이라 여기서 `preventDefault`하지 않고 건드리지 않는다. 키보드: 래퍼는 `role="button"`·`tabIndex=0`·Enter/Space로 같은 동작.
- 메뉴는 한 번에 하나. 다른 카드 클릭·바깥 클릭·Esc·단계 변화(`phase`/`dayPhase`/`nightTurnRole` 변경)·게임 종료에 닫힌다. `interactionBlocked`(영상·오버레이 중)면 열리지 않는다.
- 메뉴 항목과 **활성 조건은 `useInGameActionPanel`의 기존 값을 그대로 쓴다**(새 규칙을 만들지 않는다):

| 항목 | 보이는 조건 | 활성 조건 | 실행 |
|---|---|---|---|
| 투표 | `phase==="DAY" && dayPhase==="DAY_VOTE"` | `dayVoteControlsEnabled` 이고 대상이 `dayVoteTargets`에 있음 | `setSelectedDayVoteTargetId(uuid)` 뒤 `submitDayVote()` |
| 재판 투표(찬/반) | `gameState.phase==="TRIBUNAL"` 이고 카드 uuid가 `gameState.tribunal.defendantUuid` | `tribunalVoteControlsEnabled` | `submitTribunalVote("GUILTY"|"NOT_GUILTY")` |
| 밤 행동 대상 | `phase==="NIGHT"` 이고 `isNightTurnActor` | `!nightActionsLocked` 이고 대상이 `nightActionTargets`에 있음 | `setSelectedNightTargetId(uuid)` 뒤 `submitNightAction()` |
| 추방(방장) | `state.hostUuid === 나` 이고 카드 ≠ 나 (V-2) | `useKickPlayerRequest.status`가 SENDING이 아님 | §2-3 |

  본인 카드는 투표·밤 행동 항목을 보이지 않는다(자기 투표 규칙은 서버가 이미 거부하므로 화면에서도 내지 않는다). 대상이 아닌 카드(사망·제외 `revoteExcludedUuids`)는 항목을 **비활성**으로 보이고 이유 문구를 단다("이미 투표했습니다", "대상이 아닙니다").
- 내 현재 투표 대상 카드는 `voteHighlight`로 강조한다(선택 상태 `selectedDayVoteTargetId`·밤은 `selectedNightTargetId`).
- 컴포넌트·훅 편성(V-1): `.../components/board/InGamePlayerCardMenu.jsx`(항목 목록·비활성 이유 표시, 인게임 프레임 자산 사용), `.../hooks/useInGamePlayerCardMenu.js`(열림 상태·닫힘 규칙·항목 계산). 행동 훅은 **컨텍스트로 한 번만** 인스턴스화한다 — `InGamePage`에서 `useInGameActionPanel`을 부르고 `InGameActionContext`(신규, `.../context/InGameActionContext.jsx`)로 내려준다; V-1 단계에서는 `InGameActionPanel`도 같은 컨텍스트 값을 받아 **두 인스턴스가 상태를 나눠 갖지 않게** 한다(V-2가 패널을 없앨 때까지 둘 다 동작).

### 2-2. 대상 없는 행동의 새 자리 (V-2)
- 제어 패널을 없애면 갈 곳이 없어지는 것: 기권(`abstainDayVote`), 낮 준비(`submitDayReady`), 낮 집계(`resolveDayVote`), 재판 판정(`resolveTribunalVote`), 밤 건너뛰기(`skipNightAction`), 밤 종료(`resolveNight`), "내 역할 보기"(`onOpenRoleReveal`).
- 자리: 시간바 스택(`INGAME_TIMEBAR_STACK_CLASS`) 안, 투표 현황 버튼 줄 아래에 **`InGamePhaseActionRow`**(신규, `.../components/timebar/InGamePhaseActionRow.jsx`) 한 줄. 단계별로 그 단계의 버튼만 보인다(활성 조건은 §2-1과 같은 훅 값). "내 역할 보기"는 `InGameTopControls`의 기존 버튼 줄 끝에 아이콘 버튼으로 옮긴다.
- 없애는 것: 사건 로그, 밤 개인 결과 JSON 덤프, 펼치기 토글(`useInGameControlPanelLayout.js`), `InGameActionPanel.jsx`, `InGamePlayArea.jsx`의 마운트, 패널 잠금 시험 5개. 밤 개인 결과는 이미 `InGameNightPrivateResultOverlay`가 보여주므로 덤프는 대체물 없이 삭제.
- `INGAME_MOUNT_LOCK`: `InGameActionPanel` 제거, `InGamePlayerCardMenu`(V-1)·`InGamePhaseActionRow`(V-2) 추가.

### 2-3. 인게임 추방 항목 (V-2)
- 메뉴의 "추방" → 기존 `SettingKickPlayerModal`의 확인 흐름을 **재사용**한다: `useKickPlayerRequest({scope:"GAME", buildRequest, getMembershipScopeId, verifyMembership})`를 모달과 같은 인자로 부르는 훅 `useInGameKickFromCard.js`(신규)를 두고, `requestConfirm(target)` → 확인 대화(`SettingKickPlayerModalContent` 재사용) → `confirmKick(currentTargets)`. 결과 문구·`lookupResult`는 훅 반환값 그대로.
- `membershipId`는 `useInGameStore.getState().state.players`에서 uuid로 찾는다. 서버 계약(`kick_game_player`·`NOT_HOST`)·`CLIENT_EMIT_EVENTS_LOCK`은 바뀌지 않는다.

### 2-4. 투표 현황 실데이터 (V-2)
- `InGameVoteStatusContent`의 더미(`DUMMY_VOTE_COUNTS`, 슬롯 인덱스 매핑, no-op submit) 삭제. 표시는 서버가 주는 것만: 마지막 `dayVoteResolution`의 `publicVoteCount`/`publicAbstainCount`/`outcome`/`tribunalTargetUuid`, 아직 없으면 "집계 전". 개인별 득표 행은 **만들지 않는다**(서버 계약 없음 — 필요하면 별도 기능으로 등록).
- `ingameVotePreviewData.js`의 더미 상수와 `isVoteStatusLeader`/`resolveVoteStatusLeaderVoteCount`는 소비처가 없어지면 삭제.

### 2-5. 인게임 플레이어 전적 (S-1)
- 서버: 게임 시작 페이로드와 스냅샷의 플레이어 공개 필드에 **`accountTotalGames`(정수)**, **`accountWinRate`(0~100 정수, 소수 반올림)** 를 더한다. 계산은 `getMyRoleStatistics`와 같은 행(`findRoleStatisticsRows`, 출처 필터 동일)을 **참가자 전원에 대해 한 번에** 조회하는 새 저장소 함수 `getAccountRecordSummaries(userIds) → Map<userId, {totalGames, winRate}>`(`gameResult.repositories.js`)로 하고, 세션 생성 때 플레이어 객체에 붙인다(`buildPlayerAccountProfileFields`가 own-property로 복사). 조회 실패면 필드를 **붙이지 않는다**(0으로 위장 금지) — 로그만 남기고 게임은 진행한다.
- 판 수 0인 계정은 `{accountTotalGames: 0, accountWinRate: 0}`을 **붙인다**(조회 성공이므로). 실패와 0을 프런트가 구분할 수 있어야 한다.
- 프런트: `applySessionSnapshotPure`/`bootstrapSessionSnapshotPure`의 플레이어 루프에 두 필드를 own-property 검증(정수·범위)으로 추가, `buildPlayerSessionSourceFromGameState`가 세션 플레이어에 실어 준다. `PlayerRecordListContent`는 `DUMMY_PLAYER_RECORDS` 대신 세션 값으로 `"{n}판 | {rate}%"` 두 값을 보여주고, 필드가 없으면 "조회 실패"를 표시한다. `DUMMY_PLAYER_RECORDS_BASE`/`DUMMY_PLAYER_RECORDS`와 `formatPlayerRecordStats`의 wins/losses 인자는 삭제(프로필 자산 헬퍼는 남긴다).
- 이 필드는 공개 정보다(마이페이지 혈흔 기록의 총 판수·승률과 같은 값). 역할별 통계·업적은 싣지 않는다.

## 3. 조각 나누기와 담당

| 조각 | 범위 | 파일(생산) | 시험 |
|---|---|---|---|
| **V-1** | §2-1 카드 메뉴(투표·재판·밤 행동), 컨텍스트 추출, `voteHighlight` 연결 | `InGameActionContext.jsx`(신규), `useInGamePlayerCardMenu.js`(신규), `InGamePlayerCardMenu.jsx`(신규), `InGamePlayerBoard.jsx`, `InGamePage.jsx`, `InGameActionPanel.jsx`(컨텍스트 소비로만) | 메뉴 항목·활성 조건·제출 호출 시험(훅 단위 + 보드 통합), `INGAME_MOUNT_LOCK` 갱신 |
| **V-2** | §2-2 패널 제거·행동 줄, §2-3 추방 항목, §2-4 투표 현황 | `InGamePhaseActionRow.jsx`(신규), `useInGameKickFromCard.js`(신규), `InGameTimebar.jsx`, `InGameTopControls.jsx`, `InGamePage.jsx`, `InGamePlayArea.jsx`, `InGameVoteStatusContent.jsx`, 삭제: `InGameActionPanel.jsx`, `useInGameControlPanelLayout.js`, 더미 투표 상수 | 행동 줄 단계별 표시 시험, 추방 흐름 시험(`kickPlayerFlow.test.js` 형식), 패널 잠금 시험 5개 삭제(기록), 마운트 잠금 갱신 |
| **S-1** | §2-5 전적 | `gameResult.repositories.js`, `backend/game-core/gameSession.js`(필드 부착·`buildPlayerAccountProfileFields`), `applySessionSnapshot.js`, `buildPlayerSessionSourceFromGameState.js`, `PlayerRecordListContent.jsx`, `PlayerRecordListRow.jsx`, `ingamePlayerRecordListData.js` | 저장소 시험(출처 필터·0판·실패), 스냅샷 검증 시험(잘못된 값 거부·필드 없음 허용), 전적 목록 표시 시험 |

- 순서: V-1 → V-2 → S-1(S-1은 V와 독립이라 병렬 가능하지만 `InGamePage.jsx` 충돌을 피해 뒤에 둔다).
- 파일 수는 목안이다 — F-32 §2-5a와 같이 기능·시험을 빼거나 다시 쪼개지 않는다. 8개를 넘으면 조각이 `unsure`로 알린다.

## 4. 범위 밖 (이번에 하지 않는다)
- 개인별 득표 현황(서버 계약 신규 필요), MVP 표시, 관전자 메뉴, 모바일 터치 길게 누르기(우클릭 대체) — F-33과 함께 별도 등록.
- 채팅 스택·시간바 자체의 배치 변경.

## 5. 상태표 (F-32 §2-5a 양식)
| 항목 | 상태 | 근거 |
|---|---|---|
| 카드 클릭 계약(좌=메뉴, 우=팔레트) | 확정 | 운영자 2026-09-22 "플레이어 카드를 누르면 메뉴", 가이드 PDF p.4 "우클릭 → 팔레트" |
| 제어 패널 제거 | 확정 | 운영자 "그 제어 패널(투표·밤 행동이 들어 있는 박스)" 삭제 |
| 대상 없는 행동의 자리(시간바 스택) | 제안(운영자 확인 필요) | 기존 투표 현황 버튼 선례 |
| 전적 필드 이름·형식 | 제안(운영자 확인 필요) | F-30 형식 "{판수}판 \| {승률}%" |
| 투표 현황의 개인별 득표 | 범위 밖 | 서버 계약 없음 |

## 6. CM 병합 후 V-2 원문 정정 (2026-09-23)

승인된 범위를 변경하지 않고 CM 병합26d106d의 실제 계약과 반복 계획 반려 근거를 반영한다. 이전 절의 옛 줄 번호·단순 마운트 목록보다 현재 소유 파일 원문을 우선한다.

- 재판은 독립 phase `TRIBUNAL`이다. `DAY && TRIBUNAL`은 잘못된 과거 표기이며 사용하지 않는다.
- 기권 활성은 `dayVoteControlsEnabled && dayVoteStatus !== "submitting"`이다. 낮 집계의 `dayVoteResolveControlsEnabled`로 대체하지 않는다. 건너뛰기는 `!nightActionsLocked && nightActionStatus !== "submitting"`; 다른 버튼도 기존 패널의 각 활성 조건을 그대로 옮긴다. 사망·차단·전송 중 회귀 시험을 유지한다.
- `InGameActionProvider`는 Page와 별도 컴포넌트다. 추방 상태를 Provider가 소유하면 확인 대화도 그 값을 실제로 받을 수 있는 하위 소비처에 두거나 명시적 값·콜백 전달을 계획한다. 부모 Page가 자식 Provider의 훅 지역변수를 참조할 수 없다.
- 추방 확인 대상은 문자열 uuid가 아니라 현재 roster의 `{uuid,nickname,membershipId}` 객체다. `currentTargets`도 현재 roster에서 생성·갱신한다. `status`/`isSending` 명칭은 `useKickPlayerRequest` 실제 반환값과 맞춘다. 메뉴를 여는 조건에도 추방 항목을 포함해 낮 토론 등 투표 항목이 없는 단계에 방장 추방 메뉴가 열리게 한다.
- `SettingKickPlayerModalContent`는 모달 shell·상시 닫기 버튼을 제공하지 않는다. 확인 대상이 null이 된 ACK/조회 결과 후에도 FAILED/UNKNOWN·lookupResult를 보여줄 별도 표시 수명, 실제 shell, 명시적 닫기 경로와 Content 전체 props를 연결한다.
- 추방 통합 fixture에는 요청자·대상의 membershipId와 bootEpoch·roomId·roomInstanceId 등 기존 SettingKickPlayerModal buildRequest의 필수 값을 포함한다. 기존 메뉴 통합 시험의 파일·투표 payload·우클릭 검증은 보존하되 삭제된 패널을 클릭하는 준비 경로는 승인된 payload 계약 검증으로 이관한다.
- 마운트 잠금은 현재 PAGE/BOARD/PLAY_AREA의 파일별 exact 목록과 합집합이다. PhaseActionRow는 Timebar 내부에 마운트하므로 Timebar 원문 수집·파일별 exact 목록을 추가하고 실제/기대 합집합 양쪽에 포함한다. Page 직계 목록에 없는 Row를 넣지 않는다. 추가된 확인 UI의 실제 소유 파일 목록도 갱신한다. Provider AST 검사는 삭제된 패널 대신 보드·시간바(행동 줄 경로)의 실제 포함관계를 보증하도록 바꾼다. 기존 다른 사건·store·마운트 단언은 보존한다.
- 승인된 패널 잠금 시험 5개(controlPanel, frameAsset, presentation, productionSource, visualPolish)는 각각 명시적인 삭제 change로 계획하고, 구현 진행 기록에 계약 변경에 따른 삭제 목록을 남긴다. unsure/notes만으로 삭제 작업을 대신하지 않는다.