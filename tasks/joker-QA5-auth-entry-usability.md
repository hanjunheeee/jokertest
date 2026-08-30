# Joker QA5 — 실제 게이머 진입 화면 사용성

## 배경과 직접 재현 증거

main 260a10e의 실제 브라우저 검증에서 BUG-076/077을 재현했다. 로그인/가입 화면은 390×844에서 scrollWidth 447, 360×800에서 417로 오른쪽이 잘린다. 비밀번호 찾기·Google·Discord 버튼은 클릭해도 아무 안내가 없다.

증거: C:/Users/minsa/Documents/Codex/2026-08-29/files-mentioned-by-the-user-pluto/outputs/gamer-ui-screenshots/04-login-mobile-clipped.png 및 05-signup-mobile-360.png.

## 요구사항

1. 로그인·가입 화면을 360×800, 390×844, 768×1024, 1280×720에서 사용할 수 있게 한다. 화면 폭보다 큰 document 가로 스크롤과 필수 버튼 잘림을 해소한다.
2. 좁은 화면에서 배너/간격/프레임 배치가 사용 영역을 밀어내지 않게 한다. overflow를 숨겨 입력을 더 자르는 해결책은 허용하지 않는다. 세로 공간이 부족하면 정상 스크롤로 모든 입력과 제출/모드전환 버튼에 접근할 수 있어야 한다.
3. 이메일 로그인·회원가입 모드 전환·비밀번호 보기·로그인 상태 유지 동작을 보존한다.
4. 미구현 비밀번호 찾기·Google/Discord 로그인은 기능이 준비 중임을 사용자와 접근성 도구에 명확히 표시한다. 명시적으로 비활성화하고 설명을 제공하거나, 클릭/키보드 활성 시 준비 중 안내를 표시한다.
5. 이번 슬라이스에서 외부 OAuth, 실제 비밀번호 재설정, DB schema, backend 인증, 게임 규칙은 구현/변경하지 않는다.

## 예상 범위

- frontend/src/shared/layouts 및 frontend/src/index.css 중 실제 가로 overflow의 원인인 레이아웃
- frontend/src/domains/auth/components/AuthScene 및 LoginForm 관련 컴포넌트
- 관련 frontend 회귀 테스트·수동 검증 문서
- 이미지 자산·게임 화면 리디자인은 범위 밖. 공유 레이아웃 변경 시 기존 데스크톱 게임 레이아웃 회귀를 확인한다.

## 성공 조건

- 네 viewport에서 로그인·가입 필수 입력/버튼을 직접 브라우저로 조작하며 가로 잘림이 없고 document.scrollWidth <= viewport width이다.
- 짧은 화면 667×375에서도 세로 스크롤 등으로 회원가입/로그인 버튼에 접근 가능하다.
- 일반 이메일 로그인 폼의 동작·값 보존·비밀번호 표시 토글은 회귀하지 않는다.
- 비밀번호 찾기·소셜 로그인 세 버튼은 미구현 상태를 침묵하지 않고 명시한다. 키보드/스크린리더에도 상태가 전달된다.
- frontend 전체 테스트와 production build가 직접 통과한다. 루트 npm ci나 backend 테스트를 frontend 검증 대신 사용하지 않는다.
- 실제 브라우저 수정 전후 스크린샷과 변경 파일·커밋 증거를 남긴 뒤 승인한다. DB가 없어 인증 성공 자체를 검증하지 못했다면 별도 미검증으로 표기하고 통과를 꾸미지 않는다.
