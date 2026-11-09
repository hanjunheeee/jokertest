# 문제 목록 — lobby (메뉴·친구·초대·알림)

2단계 브라우저 시험(desktop 1280×800)에서 나온 앱 문제. 앱 코드는 안 고침, 3단계에서 감독이 모아서 고침.

| 번호 | 시험 이름 | 재현 순서 | 기대 | 실제 | 의심 파일:줄 | 심각도 |
|---|---|---|---|---|---|---|
| 1 | notifications › 지운 뒤 새로 읽어도 → 지운 알림은 다시 안 나옴 | 새 계정 로비 → 알림 창 열기(자동 읽음) → 읽은 메시지 삭제 → "표시할 알림이 없습니다" → 새로고침 → 알림 창 | 지운 "알림 기능 안내"는 다시 안 나옴 | 새로 접속할 때마다 "알림 기능 안내"가 새로(안 읽음으로) 다시 생겨 배지 1이 또 뜸. 지우기가 줄을 진짜로 지우고(destroy), 접속 때 환영 알림을 출처 키로 "없으면 만들기" 하기 때문 | backend/socket/connection/notifications.js:33 (`ensureSystemWelcome` 접속마다), backend/services/notification/create.js:111-125, backend/repositories/notification.js:57 (`destroy`) | 낮음 |
| 2 | (알려 둠, 시험 아님) 친구 삭제 | 로비 → 친구 목록 → 친구 줄 | 친구 삭제(끊기) 버튼 | 데스크톱 화면에 친구 삭제 기능이 없음 (줄에는 즐겨찾기·초대·차단만, API도 `/friends` 아래 삭제 경로 없음). 브리프의 "삭제"는 차단·차단 해제로 대신 시험함 | frontend/src/domains/lobby/components/friendList/list/FriendListRow.jsx, backend/routes/friend.routes.js | 낮음 (기능 빠짐) |
| 3 | notifications › 알림 기능 안내의 환경설정 열기를 누르면 → 설정 화면으로 감 / friends › 신청을 받으면 → … 요청 보러 가기를 누르면 요청 수락 탭이 열림 | 새 계정 로비 진입 직후(1~2초 안) 알림 창 열기 → 항목이 읽음으로 바뀐 뒤 "환경설정 열기"(또는 "요청 보러 가기") 누르기 | 설정 화면(또는 친구 패널 요청 수락 탭)으로 감 | 로비에 그대로 있음 (창만 닫히거나 아무 일 없음). 같은 동작을 로비에서 1.5초쯤 기다렸다 하면 감. 두 번 따로 돌려 둘 다 같은 결과(4/4 실패) → 깜빡임 아니라 들어온 직후 누르면 안 됨. 원인은 못 찾음: 창 열자마자 자동 읽음이 미리 읽음 표시를 하고, 그 사이 알림 목록 다시 받기(접속 준비 동기화)가 겹치는 듯 | frontend/src/domains/notifications/components/NotificationModal.js:43-47 (`handleOpenTarget`이 `markRead` 결과 ok일 때만 이동), store/notifications/readActions.js:70-90 (자동 읽음 미리 표시), hooks/notificationSocket/readySync.js | 중간 (알림 눌러도 안 감) |
