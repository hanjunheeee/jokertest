# 친구창·대기방 초대·인게임 프로필 조사

작성일: 2026-09-09 · 코드 조사 완료 / 브라우저·실서버 재현 미실행

사용자 요청에 따라 친구창의 UI, 훅·저장소, HTTP API, Socket.IO, 서비스·저장소·모델, 관련 테스트를 대조했다. codebase-memory로 구조를 우선 탐색했다. 일부 최신 훅과 CommonJS exports가 그래프 검색에 나타나지 않아 해당 파일과 문자열을 직접 확인했다. 이번에는 문서만 변경하며 서버를 시작하거나 Pluto에 등록하지 않는다.

## 1. 기능별 현황과 반영 작업

| 기능 | 코드에서 확인한 현재 상태 | 요구사항 반영 |
|---|---|---|
| 친구 패널 열기·닫기 | 로비의 버튼과 패널, 목록/친구 추가/요청 수락 화면 존재 | F-19에서 대기방에 같은 UI 재사용 |
| 목록·폴더·검색 | 온라인/오프라인/즐겨찾기 분류, 폴더 접기, 로컬 닉네임/ID 검색 연결 | 기존 기능 보존, 대기방과 공용 데이터 사용 |
| 친구 후보 검색 | 닉네임 부분 검색, ACTIVE 사용자 최대 10명, 본인·기존 친구·보낸 대기 요청 제외 | 검색 응답 순서 경합·차단 대상 제외 보완 |
| 친구 신청 | 실제 POST, 자기 신청·이미 친구·진행 중 요청 방어 존재 | 실패 표시·요청 중 잠금·수신자 유효성·차단·동시 교차 신청 보완 |
| 받은 요청 수락·거절 | 실제 PUT, 수신자 권한·상태 검사, 트랜잭션·행 잠금 존재 | 동작 보존, 거절과 차단을 별도 의미로 표시 |
| 전체 수락 | Promise.all로 개별 수락 병렬 호출 | 일부 성공 후 일부 실패한 결과를 재조회하고 성공/실패별 안내 |
| 차단 | 검색 결과 버튼에 동작 없음. 받은 요청의 차단 표시 버튼은 거절 API 호출 | 사용자 확정: 실제 차단·해제·요청/초대 제한 구현 |
| 즐겨찾기 | Zustand Set만 사용, 서버·영속 저장 없음 | 사용자 확정: 계정별 서버 영속 저장 |
| 프로필 | API에 profile이 있으나 목록·검색·요청 행에서 전달하지 않고 기본 초상 사용 | F-13/F-19에서 계정 이미지·테두리 연결 |
| 후보 접속 상태 | UI는 online/status를 읽지만 검색 API는 id/name/profile만 반환 | 실제 상태 제공 또는 확인 불가 표시. 누락을 오프라인으로 단정하지 않음 |
| 온라인 상태 | 접속/해제 시 ONLINE/OFFLINE 저장 및 친구에게 이벤트 전송 | 재접속 재조회와 대기방 초대 가능 상태를 서버 기준으로 검증 |
| 실시간 요청 | 받은 요청·수락·거절 이벤트와 전역 App의 구독 연결 | 재접속 누락 복구, 다른 리스너를 지우지 않는 해제 처리 |
| 계정 전환 | 친구 store에 reset 존재. 앱의 실제 비테스트 호출 경로는 검색에서 발견하지 못함 | 로그아웃·계정 변경 시 초기화와 늦은 응답 무효화 |
| 게임 초대 | 대기방 페이지에 친구 패널 없음. 기존 RoomInvitePage는 방 코드 입력 흐름 | F-19에 대기방 친구 탭·친구별 초대·수락/거절/만료 추가 |
| 친구 삭제 | 현재 친구 routes에 삭제 API 없음 | 신규 친구 삭제는 이번 명시 범위 밖. 차단 시 기존 관계는 D-17에 따라 보존 |

## 2. UI·연결 근거

- [FriendListPanel](C:/Users/minsa/jokertest/frontend/src/domains/lobby/components/friendList/FriendListPanel.jsx): open/onClose로 동작하고 useFriendListSync를 직접 구독한다. 대기방에서 재사용 가능한 패널 경계다.
- [FriendListRow](C:/Users/minsa/jokertest/frontend/src/domains/lobby/components/friendList/list/FriendListRow.jsx:44): id/name/online만 받고 기본 PlayerProfilePortrait를 렌더링한다. 게임 초대 버튼은 없다.
- [RecommendedFriendRow](C:/Users/minsa/jokertest/frontend/src/domains/lobby/components/friendList/request/RecommendedFriendRow.jsx): 검색 결과 차단 버튼은 onClick이 없다. 프로필 값을 전달하지 않는다.
- [IncomingFriendRow](C:/Users/minsa/jokertest/frontend/src/domains/lobby/components/friendList/accept/IncomingFriendRow.jsx): 차단 표시가 onDecline(requestId)를 호출한다.
- [FriendRequestTab](C:/Users/minsa/jokertest/frontend/src/domains/lobby/components/friendList/request/FriendRequestTab.jsx): 후보의 online/status와 신청 상태를 표시한다.
- [useFriendSearch](C:/Users/minsa/jokertest/frontend/src/domains/lobby/hooks/useFriendSearch.js): 검색 에러는 UI로 반환하지만 신청 실패는 콘솔 처리다. 요청 세대/취소를 통한 오래된 검색 결과 방어가 없다.
- [useFriendListSync](C:/Users/minsa/jokertest/frontend/src/domains/lobby/hooks/useFriendListSync.js): 열릴 때 조회, 단건 수락/거절, 전체 수락을 처리한다. 전체 수락은 일부 서버 성공 후 reject되면 로컬 요청 목록이 그대로 남을 수 있다.
- [friend.store](C:/Users/minsa/jokertest/frontend/src/domains/lobby/store/friend.store.js): 목록·보낸 요청·즐겨찾기 상태를 보관한다. 조회 실패는 콘솔 처리이며 계정별 늦은 응답 방어와 즐겨찾기 영속 저장이 없다.
- [useFriendSocketEvents](C:/Users/minsa/jokertest/frontend/src/domains/lobby/hooks/useFriendSocketEvents.js): friend_status_change, friend_request_received/accepted/declined를 구독한다. connect 후 전체 재조회는 없고 off(event)로 같은 이벤트의 다른 리스너까지 제거할 가능성이 있다.
- [App](C:/Users/minsa/jokertest/frontend/src/app/App.jsx:12): 친구 소켓 구독이 로비 전용이 아니라 앱 전역에 있어 대기방 재사용 시 중복 구독을 추가할 필요가 없다.
- [GameMatchingPage](C:/Users/minsa/jokertest/frontend/src/domains/game/matching/pages/GameMatchingPage.jsx): 배경·방 패널·파티 인원·공통 조작만 조합하며 친구 패널을 렌더링하지 않는다.

## 3. 서버·DB 근거와 경계 사례

[friend.routes](C:/Users/minsa/jokertest/backend/routes/friend.routes.js)에 인증된 목록 GET, 닉네임 검색 GET, 받은 요청 GET, 신청 POST, 수락 PUT, 거절 PUT의 6개 경로가 있다. 차단·차단 해제·차단 목록·게임 초대 경로는 없다.

[friend.controller](C:/Users/minsa/jokertest/backend/controller/friend.controller.js)는 요청 수신·수락·거절 소켓 이벤트를 보낸다. 수락/거절 ID는 parseInt와 NaN만 확인하므로 완전한 양의 정수 입력 검증이 필요하다.

[friend.service](C:/Users/minsa/jokertest/backend/service/friend.service.js)는 목록에 프로필과 접속 상태를 제공하고, 수락/거절을 행 잠금과 트랜잭션으로 처리한다. 검색 반환값에는 접속 상태가 없다. 신청 대상의 존재·ACTIVE 상태 검증은 신청 서비스에서 확인되지 않았으므로 DB 외래키 오류만으로 정상 사용자 오류 처리를 대신하지 않게 보완한다.

[friend.repositories](C:/Users/minsa/jokertest/backend/repositories/friend.repositories.js)는 양방향 대기 요청·친구 관계를 조회한다. 검색은 닉네임만 사용한다. API 주석의 이메일 검색을 실제 구현으로 간주하지 않는다.

[FriendRequests 모델](C:/Users/minsa/jokertest/backend/models/friend/FriendRequests.js)은 requester_id/receiver_id/status 유일 인덱스를 선언한다. [FriendShips 모델](C:/Users/minsa/jokertest/backend/models/friend/FriendShips.js)은 방향 있는 requester_id/receiver_id 유일 인덱스를 선언한다. 다음은 모델과 로직에서 도출한 검증 대상이며, 실제 사용자 DB에서 재현한 결과가 아니다.

- A→B와 B→A가 동시에 신청되면 사전 조회를 둘 다 통과할 수 있고, 방향 있는 유일 인덱스는 두 행을 하나로 보장하지 않는다. 하나의 유효 관계·대기 요청으로 처리할 기준과 DB 방어가 필요하다.
- 같은 방향에서 거절→재신청→재거절하면 두 번째 DECLINED가 기존 DECLINED와 충돌할 수 있다. 요청 이력을 보존하면서 현재 대기 요청만 유일하게 관리하는 변경을 검토한다.
- 차단과 신청/초대 수락이 경합할 때 차단 정책이 서버에서 재검증되어야 한다.
- 모델에 인덱스가 선언되었다고 기존 DB에 이미 적용되어 있다고 단정하지 않는다. F-01/F-19 마이그레이션에서 실제 적용 상태를 확인한다.

[소켓 접속 상태 처리](C:/Users/minsa/jokertest/backend/socket/socket.js:123)는 ONLINE/OFFLINE을 저장·전송한다. 현재 친구 접속 상태만으로 대기 중/플레이 중/같은 방 여부를 판정할 수 없다. 초대 API는 실제 방과 게임 소속을 검사해야 한다.

## 4. 인게임 프로필과 명예의 전당

- [matchmaking](C:/Users/minsa/jokertest/backend/socket/matchmaking.js:601)의 방 참가자 데이터는 uuid/nickname/isReady 중심이다.
- [game_started payload](C:/Users/minsa/jokertest/backend/game-core/gameSession.js:1003)와 [재접속 상태](C:/Users/minsa/jokertest/backend/game-core/gameSession.js:2594)의 플레이어 정보에는 프로필 이미지가 없다.
- [mergeSourcePlayerWithPreview](C:/Users/minsa/jokertest/frontend/src/domains/game/ingame/utils/mergeSourcePlayerWithPreview.js)는 서버 플레이어의 이미지로 portraitSrc를 덮어쓰지 않아 preview 초상이 유지된다.
- [InGamePlayerCard](C:/Users/minsa/jokertest/frontend/src/domains/game/ingame/components/board/InGamePlayerCard.jsx:19)는 portraitSrc 표시를 지원한다. F-13에서 계정 장착값→방/게임 데이터→최초/재접속 상태→카드까지 연결한다.
- [lobbyMenu](C:/Users/minsa/jokertest/frontend/src/domains/lobby/constants/lobbyMenu.js:5)에 hallOfFame과 /podium 이동이 있다. F-18에서 로비 메뉴 진입을 제거하고 podium UI·리소스는 보존한다. 서고의 직업별 랭킹은 유지한다.

## 5. 효과음 조사

현재 독립 오디오 파일 검색에서는 frontend/public/bgm/LoginMusic.wav 1개만 확인했다. src에서 별도의 효과음 파일 참조·AudioContext 기반 효과음 구현은 발견하지 못했다. 영상 내장 트랙을 분석한 결과는 아니다.

사용자는 버튼·알림·게임 이벤트 전체의 효과음 추가를 확정했다. F-16에 효과음 채널과 사건별 매핑·출처/이용 조건 기록·누락 시 무음 처리를 추가한다. 음악 사용 금지 정책과 기존 영상의 muted는 유지한다. 실제 효과음 자산과 이용 조건이 준비되지 않은 상태를 완료로 표시하지 않는다.

## 6. 검증 범위와 남은 정책

기존 [즐겨찾기 테스트](C:/Users/minsa/jokertest/frontend/src/domains/lobby/store/__tests__/friendFavorites.test.js)와 [로컬 필터 테스트](C:/Users/minsa/jokertest/frontend/src/domains/lobby/utils/__tests__/friendListFilter.test.js)를 확인했다. 이 테스트의 존재는 친구 API·실제 차단·게임 초대의 인수 통과를 뜻하지 않는다. 이번 문서 조사에서는 앱 테스트·브라우저 시나리오를 새로 실행하지 않았다.

확정: 실제 친구 차단·해제와 요청·초대 제한, 즐겨찾기 계정별 서버 저장. 차단 시 기존 친구 관계를 보존하되 차단 목록으로 분리하고, 양방향 신청·초대 제한 및 기존 미처리 요청·초대 무효화를 적용한다. 해제 후 요청·초대는 자동 복원하지 않는다. 통합 명세 D-17에 반영했다. 동일 방의 게임 상태·투표·능력 같은 필수 이벤트는 친구 차단으로 차단하지 않는다.
