# 문제 목록 — safari (아이폰 사파리 WebKit, `--project=mobile-safari`)

샘플 20개 (2026-11-09, WebKit 26.5 / playwright webkit v2336): `mobile/lobby.spec.js` 1 · `mobile/screens-auth.spec.js` 15 · `mobile/talk-bubbles.spec.js` @game 4 → 16 통과 · 4 실패. 실패 4개 중 3개는 크롬 모바일(`--project=mobile`)에서도 똑같이 실패 → 사파리 문제 아님(모바일 파트 쪽). 사파리에서만 나온 1개는 다시 3번 돌려 3번 다 통과.

| 번호 | 시험 이름 | 재현 순서 | 기대 | 실제 | 의심 파일:줄 | 심각도 |
|---|---|---|---|---|---|---|
| S-1 | 재설정 링크를 받아 모바일에서 열면 → 새 비번을 넣고 바꾼 비번으로 로그인됨 (`mobile/screens-auth.spec.js:91`) | 사파리, 작업자 2, 첫 실행 | `page.goto('/password-reset/request')` 30초 안에 load | 한 번 30초 넘김(load 안 옴), 다시 3번은 다 통과 → 첫 화면 묶기(vite) 늦음 같은 한 번짜리 흔들림. 앱 버그 아님 | (환경) WebKit이 크롬보다 느림 — 쉬운 시험도 하나 20~30초 | 하 |
| S-2 | (시험 쪽 고칠 것, 크롬도 같음) 모바일에서 비번을 틀리면 → 알림 (`:55`) · 다 채워 가입하면 → 가입 완료 알림 (`:153`) | 모바일 로그인 비번 틀림 / 가입 누름 | `ui.captureAlert`가 문구를 받음 | 모바일은 `window.alert`를 양피지 안내 창(`alertdialog "안내"` + "확인")으로 바꿔 둬서 브라우저 대화상자 사건이 안 옴 → 10초 기다리다 실패. 화면엔 "이메일 또는 비밀번호가 일치하지 않습니다." 잘 뜸 | frontend-mobile/src/shared/ui/modal/parchment/parchmentAlert.js:64 (의도된 동작) · e2e/helpers/ui.js:100 `captureAlert` (모바일이면 `getByRole('alertdialog', { name: '안내' })` 글자 읽고 "확인" 누르게) | 중 (시험) | → 고침(b154fd9f) captureAlert가 양피지 안내 창도 읽음 (크롬 모바일로 확인, 사파리는 안 돌림)
| S-3 | (모바일 파트 확인할 것, 크롬도 같음) 이메일 인증·칸은 다 채웠지만 "만 14세 이상"을 안 누르면 → 회원가입 버튼이 꺼져 있음 (`:166`) | 가입 칸 → 이메일 인증 → 비번·닉네임·생일 → 개인정보·이용약관만 체크 | 버튼 꺼짐 | 버튼 켜짐 — 앱이 14세를 누를 때만 막는지(가입 누르면 안내), 아니면 앱 버그인지 모바일 파트가 확인 | frontend-mobile 가입 칸 (확인 못 함) | 중 | → 안 고침(앱 버그 아님: 누르면 "만 14세 이상인지 확인해주세요." 알림으로 막고 서버도 검사, 필수 약관도 같은 방식이라 버튼은 이메일 인증만 봄. 모바일도 데스크톱 useLoginPage 그대로)

사파리에서만 다르게 동작한 것: 샘플 안에선 없음 (로그인·로비·말풍선 판 @game·소켓·Shift+Enter·Enter 보내기·약관 고르기·날짜 칸 `fill` 다 크롬과 같음).
