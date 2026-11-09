# 문제 목록 — 마이페이지(mypage)

| 번호 | 시험 이름 | 재현 순서 | 기대 | 실제 | 의심 파일:줄 | 심각도 |
|---|---|---|---|---|---|---|
| M-1 | 로그인 유지 없이 들어와 연결하기를 확인하면 → 로그아웃되지 않고 안내가 뜸 | "로그인 상태 유지" 안 하고 로그인 → 계정 관리 → Discord 연결하기 → 확인 | Discord 연결 화면으로 가거나(키 없으면) 안내 | `/auth/refresh` 401 (refresh 쿠키는 로그인 유지 때만 있음) → 로그아웃되고 로그인 화면으로 튕김 | frontend/src/domains/user/hooks/useDiscordAccountLink.js:50-58 (갱신 실패 = 로그인 풀림으로 봄) · backend/controllers/auth/session.js:39 | 중간 |
| M-2 | 로그인 유지로 들어와 연결하기를 확인하면 → 키가 없어 "지금은 Discord 계정 연결을 사용할 수 없습니다." 안내 | 로그인 유지 로그인 → 계정 관리 → Discord 연결하기 → 확인 (시험 백엔드엔 Discord 키 없음) | `/account?socialLinkError=DISCORD_OAUTH_NOT_CONFIGURED`로 돌아와 안내 (화면에 문구 준비돼 있음) | `GET /auth/discord/link` 500 (`DISCORD_CLIENT_ID 환경변수가 설정되지 않았습니다.`) → 브라우저가 백엔드 주소(4100)의 JSON 오류 화면에 멈춤 | backend/controllers/auth/discordLink.js:29 (buildAuthorizationUrl 오류를 next로 던짐, redirectWithError 안 씀) · services/auth/oauth/discord/env.js:15 | 중간 |
