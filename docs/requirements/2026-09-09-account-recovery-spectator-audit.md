# 계정 복구·관전자 제거 추가 조사

작성일: 2026-09-09 · 코드 조사 / 실제 브라우저·메일 발송 미검증

사용자 추가 요구: 아이디 찾기·비밀번호 찾기 구현, F-23 관전자 기능을 설정부터 전면 제거. 아이디 찾기는 후속 답변으로 닉네임·생년월일에 따른 마스킹 이메일 힌트 방식으로 확정했다.

## 1. 계정 복구의 현재 상태

| 영역 | 코드에서 확인한 상태 | 이번 요구사항 |
|---|---|---|
| 로그인 화면 | 비밀번호 찾기 버튼에 onClick/이동이 없음 | 실제 찾기 흐름 연결, 아이디 찾기 진입 추가 |
| 인증 API | signup/login/me/logout만 등록 | 인증 전 아이디 힌트 조회·비밀번호 재설정 요청/완료 추가 |
| 아이디 찾기 로그 | account_find_requests 모델 존재, email 필수. 처리 서비스 미연결 | 닉네임·생년월일 조회와 마스킹 반환에 맞게 최소 기록 구조 보완 |
| 재설정 토큰 | password_reset_tokens에 token/expired_at/used 존재. 실제 발급·검증 미연결 | 해시 저장·만료·일회용·비밀번호 변경/세션 폐기 연결 |
| 메일 | backend 패키지에 전용 메일 라이브러리 없음. 조사 범위에서 발송 구현 발견 못함 | 설정 가능한 발송 어댑터·테스트 어댑터와 실제 수신 검증 |

근거: [LoginOptions](C:/Users/minsa/jokertest/frontend/src/domains/auth/components/LoginForm/LoginOptions.jsx:10), [인증 라우트](C:/Users/minsa/jokertest/backend/routes/auth.routes.js), [아이디 찾기 로그 모델](C:/Users/minsa/jokertest/backend/models/auth/account_find_request.model.js), [토큰 모델](C:/Users/minsa/jokertest/backend/models/auth/password_reset_token.model.js), [서버 패키지](C:/Users/minsa/jokertest/backend/package.json), [프론트 라우트](C:/Users/minsa/jokertest/frontend/src/app/routes/index.jsx).

아이디 찾기는 전체 이메일을 반환하지 않고 서버에서 마스킹한다. 이 힌트 조회를 비밀번호 변경 권한으로 사용하지 않는다. 비밀번호 복구는 가입 이메일 소유자가 받는 일회용 링크로 진행한다. 기존 생년월일 미등록 계정, 비밀번호 없는 소셜 계정과 실제 메일 환경 미준비를 각각 처리해야 한다.

## 2. 관전자 제거 범위

현재 인게임 설정 정의에 allow-spectators/관전자 허용 체크박스가 있다. 코드 검색에서 별도 관전자 서버 API·입장 기능은 발견하지 못했다. 기존 F-23은 앞으로 이를 만들 계획이었으므로 그 계획을 취소하고 실제 남은 설정·경로 정리로 바꾼다.

근거: [인게임 설정 항목](C:/Users/minsa/jokertest/frontend/src/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js:30).

서버의 일부 주석은 이미 참가한 사망자의 읽기 전용 상태를 관전자라고 표현한다. 이들은 별도 관전 입장 계정과 다르다. 사용자가 앞서 확정한 사망 대상의 밤 영상 수신과 의사 치료 가능성, 정상 참가자의 재접속 계약을 유지한다.

근거: [게임 채팅 수신·발행 규칙](C:/Users/minsa/jokertest/backend/game-core/gameSession.js:109), [게임 소켓 재접속 경계](C:/Users/minsa/jokertest/backend/socket/gameSession.js:107).

제거 대상은 관전자 전용 설정·UI·저장 키·입장/라우트·API/소켓 권한이다. 실제 존재하는 항목을 정리하며 없는 관전자 기능을 새로 만들지 않는다. 오래된 설정이 관전을 되살리지 않고 비참가자가 직접 요청으로 관전 권한을 얻지 못하는지 검증한다.

## 3. 문서·작업 반영

- AUTH-05: 아이디 찾기·마스킹 이메일 안내.
- AUTH-06: 비밀번호 찾기·일회용 링크 재설정.
- GAME-03/F-23: 관전자 기능 전면 제거.
- F-29: 계정 복구 기능 묶음. F-01~F-05의 DB·가입·세션·계정 유형 기반 이후 구현한다.
- F-28: F-29까지 완료한 뒤 최종 인수한다.
- D-13: 관전자 포함 결정을 최신 제거 지시로 대체.
- D-18: 마스킹 이메일 힌트·메일 재설정 방식 기록.

이번 작업에서는 요구사항과 조사 문서만 수정했다. 메일을 발송하거나 앱 서버·Pluto 데몬을 실행하지 않았다.
