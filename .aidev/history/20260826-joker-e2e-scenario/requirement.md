\# E2E 멀티 클라이언트 10일차 시나리오 (frontend + 스크립트)



\## 배경

Playwright로 브라우저 컨텍스트 5개를 띄워 전체 게임 플로우를 자동 재생한다.

DEBUG\_FIXED\_ROLES(직전 slice)로 역할이 입장 순서대로 결정적이다. 이 스크립트는 slice

worktree가 아니라 본 repo에서 실행하는 물건이다 — 실행 전제: backend가

DEBUG\_FIXED\_ROLES=JOKER,DOCTOR,GUARD,WITCH\_HUNTER,CITIZEN 과 함께 localhost에 떠 있고,

frontend dev 서버가 떠 있고, e2e/.env에 테스트 계정 5개가 있다. slice의 검증 범위는

스크립트 작성 + 헬퍼 단위 테스트 + 기존 테스트/빌드 PASS까지이며 실제 E2E 실행은 merge 후

사람이 한다. 이번 작업은 frontend와 e2e 스크립트만 다룬다. backend는 수정하지 않는다.



\## 시나리오

계정 5개 로그인 → 방 생성·전원 입장 → 게임 시작 → 각 창에서 자기 역할 공개 문구 검증.

\[1\~9일차 반복]

&#x20; 밤: JOKER→CITIZEN 암살 제출, DOCTOR→CITIZEN 보호(보호 성공), GUARD→매일 다른 생존자

&#x20; 순환 조사 — 조사 패널이 그 밤에 뜨는지 먼저 검증, WITCH\_HUNTER는 day0(1일차)에 skip

&#x20; 자동 진행을 검증하고 2일차부터 확인 패널 검증 후 매일 다른 대상 확인.

&#x20; → 보호 성공이므로 사망 영상이 뜨지 않음을 검증 → GUARD 창 개인 결과 문구

&#x20; ("…님은 광대 진영입니다" / "…님은 시민 진영입니다" — 조사 대상의 실제 진영과 일치) 검증,

&#x20; WH 창 확인 결과 문구 검증 → DAY 진입 검증 → 전원 기권 투표 → 다음 밤 전이 검증.

\[10일차]

&#x20; 밤: JOKER→CITIZEN, DOCTOR→GUARD(보호 실패) → 사망 영상 재생 검증 → DAY 진입,

&#x20; 사망자 표시 검증 → 낮: 생존 전원이 JOKER 투표 → 재판 전이 → 재판 찬성 → 처형 →

