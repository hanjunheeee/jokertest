\# 테스트 전용 역할 고정 배정 (backend)



\## 배경

역할이 fisherYatesShuffle로 랜덤 배정되어 특정 시나리오(가드가 조커를 조사 등)를 재현하려면

원하는 배정이 나올 때까지 게임을 반복해야 한다. E2E 자동 테스트의 전제조건으로, 환경 플래그가

켜진 경우에만 결정적 배정을 허용한다. assignRoles는 이미 randomFn 주입 구조가 있다.

이번 작업은 backend만 다룬다. frontend는 수정하지 않는다.



\## 요구사항

1\. 환경 변수 DEBUG\_FIXED\_ROLES가 설정된 경우에만 활성화된다. 미설정(production 기본)이면

&#x20;  기존 랜덤 배정과 완전히 동일하게 동작한다 — 코드 경로가 분기 한 번 외에 달라지지 않는다.

2\. DEBUG\_FIXED\_ROLES 형식: 쉼표 구분 역할 목록 (예: "JOKER,DOCTOR,GUARD,WITCH\_HUNTER,CITIZEN").

&#x20;  게임 시작 시 참가자 입장 순서(세션 players 삽입 순서)대로 목록의 역할을 그대로 배정한다.

&#x20;  셔플하지 않는다.

3\. 방어: 목록 길이가 참가자 수와 다르거나, 알 수 없는 역할명이 있거나, 역할 구성 검증

&#x20;  (commitGameSession의 구성 검사)과 충돌하면 — 고정 배정을 포기하고 기존 랜덤 배정으로

&#x20;  fallback하며 console.warn 한 줄을 남긴다. 게임 시작을 실패시키지 않는다.

4\. .env.example에 주석과 함께 항목을 추가한다 (기본 미설정).



\## 수정 금지

\- frontend/\*\* 전체

\- assignRoles의 기존 랜덤 경로·fisherYatesShuffle

\- 역할 구성 검증 로직



\## 검증

\- 플래그 설정 + 유효 목록 → 입장 순서대로 정확히 배정

\- 플래그 미설정 → 기존 랜덤 경로 (기존 테스트 무변경 통과로 입증)

\- 길이 불일치 / 알 수 없는 역할 → 랜덤 fallback + 게임 정상 시작

\- 기존 backend 전체 테스트 PASS

