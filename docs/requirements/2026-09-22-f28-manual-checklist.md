# F-28 최종 인수 — 사람이 실제 Chrome에서 볼 것 (2026-09-22 정리)

배치 F-23~F-32의 조각들이 "실제 브라우저 확인은 F-28로 미룬다"로 남긴 항목을 실행 기록(`2026-09-19-pluto-f23-unblock.md`)에서 모아 한 곳에 둔다. pluto 파이프라인은 실제 Chrome·다중 사용자·외부 메일·토스 결제를 실행하지 못하므로, F-28(BN)의 자동 검증은 시험·빌드·격리 DB 회귀와 이 목록의 **미검증 기록**까지이고, 아래 항목의 실제 확인은 운영자가 QA 스크립트로 수행한다(운영 규칙: 계정 생성·비밀번호 입력은 운영자 몫).

## 1. 조각별로 미룬 확인 항목

#### F-28에서 볼 것 (F-29a분 추가)
- 로그인 화면 → 아이디 찾기 → 마스킹 이메일 표시 / 틀린 입력의 공통 안내 / 연속 시도 제한 안내 / 뒤로 가기.
- **기존 결함 후보(이 조각 밖)**: `backend/utils/ip.js::getClientIp`가 X-Forwarded-For 첫 값을 검증 없이 신뢰한다 — 로그인 기록·다른 제한에서 IP를 속일 수 있다. F-29a는 빈도 제한 키만 `req.ip`로 바꿨다. 다른 사용처 점검은 F-28 또는 별도 작업.

#### F-28에서 볼 것 (F-29b분 추가)
- 실제 메일 수신 — 외부 입력(서비스 계정·발신 주소·앱 기본 URL) 없어 **미검증**. 테스트 어댑터로만 확인.
- 재설정 뒤 열려 있던 다른 브라우저의 소켓 연결이 5초 안팎에 끊기는가. 연결당 5초 주기 세션 조회의 부하(동시 접속이 많을 때) — 운영 전에 주기 값 검토.
- `has_local_password` backfill을 실제 운영 DB에 적용하기 전에, 소셜 가입 계정 수와 false로 분류된 수가 맞는지 표본 확인(격리 DB에서만 검증했다).

#### F-28에서 볼 것 (F-30분 추가)
- 마이페이지 피의 기록이 전체 판수·승률 두 항목뿐인지, 표시값이 API 값과 같은지, 0판 계정 0.0%, 서버를 끊었을 때 실패 안내·재시도.
- 로비·마이페이지 배너에 명성 흔적(이름·값·장식·빈 자리)이 없는지, 긴 한글 닉네임이 글자 크기 최대·좁은 창에서 넘치지 않는지.
- 업적·랭킹·운명의 가면 값이 이전과 같은지.

#### F-28에서 볼 것 (F-31a분 추가)
- 실제 메일 어댑터 설정으로 인증번호 메일이 오는지(자동 시험은 메모리 어댑터), 재발송 뒤 이전 번호 거부, 5회 오입력 잠금, 시간당·일당 한도 초과 안내 문구.
- 가입 실패 응답에 서버 내부 문구가 보이지 않는지(중복 이메일·닉네임은 기존 문구 그대로).
- `backend/utils/ip.js::getClientIp`가 X-Forwarded-For를 신뢰 — 프록시 없는 배포에서 IP 한도 우회 가능(이전 목록과 같은 항목).

#### F-28에서 볼 것 (F-31b분 추가)
- 가입 화면에서 발송→60초 재발송 대기 카운트→확인→가입까지 실제 서버와 이어지는지, 만료·횟수 초과·요청 제한·통신 실패 안내가 각각 다른 문구로 보이는지.
- 이메일을 바꾸면 인증이 풀리고 가입 버튼이 다시 막히는지, 가입 버튼 연타 시 계정이 하나만 생기는지.
- 개발자 도구의 저장소·쿠키·콘솔에 가입 증명 값이 보이지 않는지.

#### F-28에서 볼 것 (F-31 본 조각분 추가)
- Google/Discord로 처음 가입할 때 제공자가 이메일을 인증해 준 경우엔 바로 가입, 아닌 경우엔 자체 인증 화면이 뜨는지. 인증 없이 가입 완료 요청을 보내면 거부되는지.
- 기존 소셜 계정 로그인에 추가 인증이 강제되지 않는지.

#### F-28에서 볼 것 (F-32c분 추가)
- 실제 Chrome에서: 상점 재화 탭에 서버 상품이 보이는지, 충전을 누르면 (키 미설정 상태에서) 버튼이 '설정 대기'로 바뀌고 결제창이 뜨지 않는지. 토스 test 키를 넣은 경우 결제창 → 복귀 → 확인 중 → 완료 → 잔액 갱신. 골드 구매의 부족·완료·가격 변경 재확인.

#### F-28에서 볼 것 (F-32 본 조각분 추가)
- 실제 Chrome 두 창: 한 창에서 충전 confirm을 느리게 만든 채 다른 창(또는 재로그인)으로 상점에 들어가면 진행 중 주문이 발견되어 이어서 완료되고 잔액이 한 번만 오르는지(§2-6a). 계정 전환 뒤 이전 계정 주문이 안 보이는지.
- 토스 테스트 키가 있으면 실제 결제창 → 복귀 → 확인 중 → 완료 → 잔액·내역 갱신. 없으면 미검증 유지.

#### F-28에서 볼 것 (F-27d분 추가)
- Safari·iOS·Chrome 각각에서 역할 영상(킬 USER/TARGET, 치료, 조사, 확인)이 검은 배경 없이 투명하게 canvas에 그려지고 소리가 나는지, 끝나면 다음 사건으로 넘어가는지. 재생이 막힌 환경에서 재시도·건너뛰기가 되는지.

## 2. 사용자 추가 확정(2026-09-13)의 통합 시나리오 — 실제 서버·승인 DB·Chrome
- 가입 → 다이아 테스트 충전(토스 test 키 필요 — 없으면 '설정 대기' 확인까지) → 다이아로 골드 구매 → 상점 구매 → 프로필/장비 → 로그아웃 → 재로그인 복원.
- 기존 계정·검증된 소셜 계정 로그인, 전적의 전체 판수·승률 두 항목, 명성 제거, 업적/랭킹 원본 보존.
- 죽은 참가자의 관전/나가기 선택 유지(외부 관전자 입장은 제거된 상태).

## 3. 외부 입력이 없어 미검증으로 남는 것
- 실제 메일 수신(비밀번호 재설정·가입 인증 링크) — 메일 서비스 계정·발신 주소 미제공.
- 실제 토스 테스트 결제창 — test client/secret 키 미제공.
- 효과음·영상 내장음의 실제 청음 — 자동 시험은 재생 호출·음소거·볼륨 값만 확인.
  - 2026-09-22 20:00 갱신: 효과음 22종(자체 합성, c49e2b5b)과 배경음 Death Waltz(CC0, b66aab6a)가 실제로 실린다. 청음 항목: 로그인·로비에서 배경음이 들리고 설정 Master/배경음 슬라이더에 따라 변하는지, 효과음 음소거가 배경음에 영향 없는지, 22종 효과음이 각 사건에 나는지.

## 4. 병합 원장 (기능 → 병합 커밋)
- eb248a73 2026-09-22 pluto(CJ): F-27d 역할 영상 브라우저 공통 재생 (stacked MP4·canvas 합성)
- 038c5b8b 2026-09-22 pluto(BQ): F32 다이아 충전과 골드 구매
- 24c75aa6 2026-09-22 pluto(CH): F32c 다이아 충전·골드 구매 화면 (결제창 호출·복귀·상태 표시)
- a738af5e 2026-09-22 pluto(CC): F32b 골드 구매 서버 (다이아 차감·골드 지급·원장 단일 트랜잭션)
- 0facbace 2026-09-22 pluto(CB): F32a 다이아 충전 서버 (상품표·주문·토스 테스트 승인·단일 지급)
- 5d8565da 2026-09-21 pluto(BP): F31 회원가입 이메일 인증
- 7cdf548d 2026-09-21 pluto(CG): F31b 가입 화면의 이메일 인증 흐름 (발송·확인·재발송·주소 변경)
- 72a6bb90 2026-09-21 pluto(CA): F31a 가입 이메일 인증의 서버 (인증번호·가입 증명·단일 가입)
- 743dac3d 2026-09-21 pluto(BO): F30 피의 기록과 명성 제거
- 5fa62b0c 2026-09-21 pluto(BM): F-29 아이디 찾기·비밀번호 찾기·메일 재설정
- e96363dd 2026-09-21 pluto(CF): F-29c 비밀번호 재설정 화면 흐름 (요청 → 링크 → 새 비밀번호)
- c17e5c59 2026-09-21 pluto(BX): F-29b 비밀번호 재설정 서버 (토큰·메일 어댑터·세션 폐기)
- 9055612b 2026-09-21 pluto(BW): F-29a 아이디 찾기 (닉네임·생년월일 → 마스킹 이메일)
- 4719997b 2026-09-21 pluto(CI): F-27c 역할 영상 연결 (웹 변환본·내장 사운드)
- f6e93c8d 2026-09-21 pluto(BL): F-27 직업별 영상·완료 후 다음 턴
- 9b8d73f3 2026-09-20 pluto(CE): F-27b 화면의 역할별 연출 순서와 재생 완료·오류·건너뛰기 보고
- 77aaef8a 2026-09-20 pluto(BZ): F-27a 서버의 연출 대기 게이트와 진행 해제
- 13535a72 2026-09-20 pluto(BK): F-26 능력 사용자·대상자 이벤트
- 38f958a3 2026-09-20 pluto(CD): F-26b 클라이언트의 성공 사건 수신·완료 ACK·중복/오래된 사건 거부
- d8c45bf3 2026-09-20 pluto(BY): F-26a 역할별 성공 사건의 서버 생성·수신자별 payload
- 6acc892b 2026-09-20 pluto(BJ): F-25 밤 순차 판정·킬 후 치료
- 98cf4b71 2026-09-20 pluto(BV): F-25b 최종 사망·승패·기록 확정 시점과 기존 공동 판정 정리
- 152f216a 2026-09-20 pluto(BU): F-25a 밤 역할별 순차 판정 core (킬·치료·임시 사망)
- a2bfc1ab 2026-09-20 pluto(BI): F-24 방 코드·다음 게임 설정 유지
- b2e2e4cd 2026-09-20 pluto(BH): F-23 관전자 설정·입장·권한 전면 제거
- 68802611 2026-09-18 pluto(BF): F-21 방장 추방
- f0977996 2026-09-18 pluto(BE): F-20 대기방 설정 변경
- 38d1659a 2026-09-17 pluto(BD): F-19 친구창 보완·차단/해제·대기방 친구 UI·실제 초대
- ae40d975 2026-09-13 pluto(BC): F-18 로비 프로필·Discord 고객센터·명예의 전당 진입 제거
- 11e95027 2026-09-13 pluto(BB): F-17 알림 모달·읽음·발생 이벤트
- 24292865 2026-09-12 pluto(BA): F-16 효과음 전체·사운드 설정·금지 음악 무음 유지
- 27a9de3c 2026-09-12 pluto(AZ): F-15 통합 일반·채팅 설정
- f5682a1f 2026-09-12 pluto(AY): F-14 구매 스킨·카드 장착
- c544d20c 2026-09-12 pluto(AX): F-13 프로필·테두리 편집·계정 프로필 인게임 반영
- 81236f71 2026-09-11 pluto(AW): F-12 22개 업적·자동 보상·서고 해금
- 88f5d793 2026-09-11 pluto(AV): F-11 투표 참여 영속 집계
- 0c470cc6 2026-09-11 pluto(AU): F-10 직업 전적·랭킹·운명의 가면
- 9351a5b8 2026-09-11 pluto(AT): F-09 실제 상품 구매·표시용 이모티콘 탭
- bdefdd2d 2026-09-11 pluto(AS): F-08 지갑·거래·카탈로그·소유권
- ee1f45a1 2026-09-10 pluto(AR): F-07 Discord 로그인
- 635c929b 2026-09-10 pluto(AQ): F-06 Google 로그인
- 331d5762 2026-09-10 pluto(AP): F-05 소셜 계정 공통 기반
- c78b7764 2026-09-10 pluto(AO): F-04 계정관리 닉네임·비밀번호 보완
- 4277a6e6 2026-09-10 pluto(AN): F-03 로그인 유지·세션 만료
- 0950d00a 2026-09-10 pluto(AM): F-02 회원가입 입력·중복 확인
- ba6d4695 2026-09-09 pluto(AL): F-01 DB 변경·기존 계정 이관 기반
- 93610c98 2026-09-09 pluto(AK): UI-16 신버전 UI 전체 흐름 실제 브라우저 회귀 검증
- 33212793 2026-09-09 pluto(AJ): UI-15 인게임 채팅 색상·에셋 경로 정리·옛 에셋 삭제
- b2c2b760 2026-09-09 pluto(AJ): delete 14 unreferenced legacy assets (human commit)
- d9dd546a 2026-09-09 pluto(AI): UI-14 인게임 오버레이 이식 (역할 공개·페이즈 진입·밤 턴 안내·사망 연출·개인 결과)
- 6bd9e957 2026-09-09 pluto(AI): record overlays visual check as unverified, deferred to UI-16
- 4fd1e01b 2026-09-09 pluto(AI): human fix — take remote responsive class values for the 7 shared role-reveal layout constants
- 86e37be9 2026-09-09 pluto(AI): human fix — revert backend lockfile drift (UI slice must not change lockfiles)
- 8503219f 2026-09-09 pluto(AH): UI-13 인게임 배경·타임바·페이지 조립 이식 (로컬 데이터 흐름 유지)
- d8ceb101 2026-09-09 pluto(AH): record timebar/page visual check as unverified, deferred to UI-16
- 09f0f4e9 2026-09-09 pluto(AH): port useInGameResultNavigation and wire ENDED→/gameresult (human commit)
- 12d1165c 2026-09-09 pluto(AG): UI-12 인게임 액션 패널·대상 선택·양피지 모달 이식 (로컬 revote 유지)
- d4625af9 2026-09-09 pluto(AG): human fix — revert backend lockfile drift (UI slice must not change lockfiles)
- 94d44b9f 2026-09-09 pluto(AF): UI-11 인게임 상단 컨트롤·사이드 패널·인게임 설정·기록 패널 이식
- b35b5658 2026-09-09 pluto(AF): record in-game settings visual check as unverified, deferred to UI-16
- 91c76979 2026-09-09 pluto(AE): UI-10 인게임 플레이어 보드·카드·명판 이식
- 885ab7cd 2026-09-09 pluto(AE): record player-card visual check as unverified, deferred to UI-16
- 7c4b41ca 2026-09-09 pluto(AD): UI-09 게임 결과 화면 이식 (로컬 winResult 연결)
- 8320da68 2026-09-09 pluto(AD): record game-result visual check as unverified, deferred to UI-16
- 76020f11 2026-09-09 pluto(AC): UI-08 방 목록·방 코드·게임 설정 화면 이식 (로컬 로직 유지)
- c615d7c4 2026-09-09 pluto(AC): record room-code/setup visual check as unverified, deferred to UI-16
- feed38ec 2026-09-09 pluto(AB): UI-07 포디움 화면 신설
- 568b9cdf 2026-09-09 pluto(AB): record podium visual check as unverified, deferred to UI-16
- b302f029 2026-09-09 pluto(X): UI-03 마이페이지·프로필 편집·스킨 카드 이식
- c821c9d9 2026-09-09 pluto(X): record my-page visual check as unverified, deferred to UI-16
- b29428f3 2026-09-09 pluto(AA): UI-06 도서관 화면 신설
- 9ac0368d 2026-09-09 pluto(AA): record library visual check as unverified, deferred to UI-16
- d33b1c0b 2026-09-09 pluto(Y): UI-04 상점 화면 이식
- 9879a7e5 2026-09-09 pluto(Y): human fix — revert backend lockfile drift (UI slice must not change lockfiles)
- 5d6a0d54 2026-09-08 pluto(Z): UI-05 설정 화면 이식
- 2b0cb6d5 2026-09-08 pluto(W): UI-02 로비 화면 이식
- 08c27654 2026-09-08 pluto(W): record lobby visual check as unverified, deferred to UI-16
- 03a64bb1 2026-09-08 pluto(V): UI-01 공용 기반 이식 (index.css·shared)
- 67f473e3 2026-09-08 pluto(V): human fix — keep 10 portrait slots as remote, revert backend lockfile
- 260a10e5 2026-08-30 pluto(T): joker-QA4-day-transition-self-alive
- ef52f2f7 2026-08-30 pluto(R): joker-QA2-mobile-room-code-input
- abdc77c9 2026-08-30 pluto(Q): joker-QA1-room-code-display
- b7f04e46 2026-08-30 pluto(P): joker-R1-match-results
- 3a920bd7 2026-08-30 pluto(O): joker-M1-concurrent-users
- 6f6b23c3 2026-08-29 pluto(N): joker-INFRA1-docker
- da4fda60 2026-08-29 pluto(M): joker-MM1-ingame-room-guard
- 49678505 2026-08-29 pluto(L): joker-DB3-tables-cleanup
- 56bc3244 2026-08-29 pluto(K): joker-DB2-account-paths
- 7ac26b3b 2026-08-29 pluto(J): joker-DB1-startup-pool
- c17f467e 2026-08-29 pluto(I): joker-L1-room-code-join
- 6a8b0ac5 2026-08-29 pluto(H): joker-S3-disconnect-death
- 47e4d9ba 2026-08-29 pluto(G): joker-S4-chat-channels
- d46f58ea 2026-08-29 pluto(F): joker-S2-joint-resolver
- ce8a8b52 2026-08-29 pluto(E): joker-S1-4-conceal-tests
- e19a4e5f 2026-08-29 pluto(D): joker-S1-3-frontend-turns
- 5b4be480 2026-08-29 pluto(C): joker-S1-2-timers
- df94b9b5 2026-08-29 pluto(B): joker-S1-1-night-turn-engine
- 16caa113 2026-08-29 pluto(A): joker-T1-test-split
