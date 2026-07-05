# 전체 흐름도 작성 체크리스트

대상: 프로젝트 전체(프론트 + 백엔드). UI 컴포넌트(`components/` 폴더, `shared/ui/*` 위젯)만 제외하고, 로직이 있는 파일은 모두 대상입니다.

결과 문서:

- 흐름도 인덱스: `docs/PROJECT_FLOW.md`
- 로그인: `docs/LOGIN_FLOW.md`
- 공통 인프라: `docs/COMMON_INFRA_FLOW.md`
- 회원가입: `docs/SIGNUP_FLOW.md`
- 세션 확인 / 로그아웃: `docs/SESSION_LOGOUT_FLOW.md`
- 사용자 / 계정: `docs/USER_ACCOUNT_FLOW.md`
- 친구: `docs/FRIEND_FLOW.md`
- 소켓 / 접속 상태: `docs/SOCKET_PRESENCE_FLOW.md`
- 매칭 / 방: `docs/MATCHING_ROOM_FLOW.md`
- 인게임 / 기타 페이지: `docs/INGAME_AND_MISC_FLOW.md`

상태 표기:

- `[x]` 확인 완료
- `구현됨` 프론트 진입점에서 백엔드 라우트/서비스 또는 소켓 핸들러까지 연결됨
- `부분 구현` 화면·상태·유틸은 있으나 서버 처리나 실시간 연동이 비어 있음
- `미연결` 모델/파일은 있으나 호출 흐름을 찾지 못함

---

## 공통 인프라 (여러 흐름에서 공통으로 쓰임)

- [x] 서버 진입/라우트 등록 — `backend/index.js` (`/auth`, `/friends`, `/user`, Socket.io, 전역 에러 핸들러)
- [x] 프론트 라우트 등록 — `app/routes/index.jsx`, `app/App.jsx` (공개/보호 라우트, 앱 시작 시 세션 재검증, 소켓 연결)
- [x] 인증 미들웨어 — `backend/middleware/auth.middleware.js` (`verifyToken`)
- [x] 전역 에러 처리 — `backend/middleware/errorHandler.js`, `backend/utils/appError.js`
- [x] 로그인 관련 유틸 — `backend/utils/hash.js`, `backend/utils/jwt.js`, `backend/utils/ip.js`, `backend/utils/device.js`
- [x] 방 코드 생성 유틸 — `backend/utils/roomCode.js` (`matchmaking.js`에서 방 생성 시 사용)
- [x] 프론트 공통 API 클라이언트 — `shared/api/client.js` (`credentials: include`, 401 자동 로그아웃)
- [x] 소켓 클라이언트 연결 관리 — `shared/socket/socketClient.js`, `shared/hooks/useSocket.js`
- [x] 라우트 가드 — `shared/ui/ProtectedRoute.jsx`

## 인증

- [x] 로그인 — `docs/LOGIN_FLOW.md`
- [x] 회원가입 — `LoginPage.jsx` -> `auth/api/auth.js` -> `user.controller.signup` -> `auth.service.signup` (구현됨)
- [x] 세션 확인(자동 로그인 유지) — `App.jsx` -> `auth.js: getMeApi` -> `verifyToken` -> `user.controller.me` (구현됨)
- [x] 로그아웃 — `auth.js: logoutApi` -> `user.controller.logout` -> `recordLogout` (구현됨)
- [x] 비밀번호 찾기 / 계정 찾기 — 모델은 존재 (`account_find_request.model.js`, `password_reset_token.model.js`), 연결된 라우트/컨트롤러는 찾지 못함 (미연결)

## 사용자 / 계정

- [x] 내 프로필 조회 — `MyPage.jsx`, `useMyProfile.js` -> `user/api/user.js` -> `profile.controller.getMyProfile` (구현됨)
- [x] 닉네임 변경 — `AccountPage.jsx`, `useAccountForm.js` -> `updateNicknameApi` -> `profile.controller.updateNickname` (구현됨)
- [x] 비밀번호 변경 — `useAccountForm.js` -> `updatePasswordApi` -> `profile.controller.updatePassword` (구현됨)

## 친구

- [x] 친구 목록 조회 — `LobbyPage.jsx`, `useFriendListSync.js` -> `lobby/api/friend.js` -> `friend.controller.getFriends` -> `friend.service` (구현됨)
- [x] 받은 친구 요청 조회 — `useFriendListSync.js` -> `friend.controller.getIncomingRequests` (구현됨)
- [x] 친구 검색 — `useFriendSearch.js` -> `friend.controller.searchUsers` (구현됨)
- [x] 친구 요청 보내기 — `useFriendSearch.js` -> `friend.controller.sendFriendRequest` -> `emitToUser(friend_request_received)` (구현됨)
- [x] 친구 요청 수락 — `useFriendListSync.js` -> `friend.controller.acceptRequest` -> `emitToUser(friend_request_accepted)` (구현됨)
- [x] 친구 요청 거절 — `useFriendListSync.js` -> `friend.controller.declineRequest` -> `emitToUser(friend_request_declined)` (구현됨)

## 소켓 / 접속 상태

- [x] 소켓 연결과 인증 — `useSocket.js` -> `socket.js: authenticateSocket` (구현됨)
- [x] 접속/해제 상태 처리 — `handleConnection` / `handleDisconnect` -> `presence.service.js` (구현됨)
- [x] 친구 실시간 알림 브로드캐스트 — `broadcastFriendStatus`, `emitToUser` (구현됨)

## 매칭 / 방

- [x] 랜덤 매칭 큐 참가 — `MultiplayEntryPage.jsx` -> `matchingStore.js` -> `matchmaking.js: handleJoinMatchmaking` (구현됨)
- [x] 방 화면 액션(삭제/시작/퇴장) — `GameMatchingPage.jsx`, `useMatchingRoom.js` -> `handleDeleteRoom` / `handleStartGame` / `removeFromRoom` (구현됨, `game_started` 후 프론트는 `/lobby` 임시 이동)
- [x] 방 코드 참여 — `RoomInvitePage.jsx`, `useRoomCodeInput.js` (부분 구현: 6자리 입력 UI만 있고 참여 API/소켓 이벤트는 TODO)
- [x] 게임 만들기 진입 — `GameSetupPage.jsx`, `useSetupTabState.js` (부분 구현: 설정 화면 후 `/game-matching` 이동, 서버 방 생성 없음)

## 인게임

- [x] 인게임 페이지 — `InGamePage.jsx`, 관련 상태/유틸(`pickInGameChatProfile.js`, `pickInGameJobPortrait.js`, `chunkPlayerSlots.js`) (부분 구현: 화면 조합/더미 유틸 중심, 백엔드/소켓 게임 진행 연동은 확인되지 않음)

## 기타 페이지

- [x] 설정 — `SettingPage.jsx`, `useScrollbarSync.js`, `useVideoIntro.js` (프론트 전용)
- [x] 상점 — `StorePage.jsx`, `useStoreCategoryFilter.js` (프론트 전용)
- [x] 홈 — `HomePage.jsx` (정적 랜딩)

## 연결된 프론트 흐름이 불명확한 백엔드 조각

- [x] `backend/models/system/traffic_log.model.js` — 모델은 있으나 기록/조회 호출 흐름을 찾지 못함 (미연결)
