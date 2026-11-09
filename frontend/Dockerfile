# 화면 이미지 하나에 데스크톱·모바일 두 빌드 + nginx (API·소켓 프록시도 이 nginx가 맡음)
# build context는 저장소 루트 (docker-compose.yml의 context: .) → COPY 경로에 폴더 이름을 붙임
FROM node:22-alpine AS build
WORKDIR /app

# 모바일 빌드가 데스크톱 src·public을 같이 읽음 → 두 폴더 다 npm ci
# 패키지 목록을 소스보다 먼저 복사 → 소스만 바뀐 재빌드에서 설치 단계 캐시
COPY frontend/package.json frontend/package-lock.json frontend/
COPY frontend-mobile/package.json frontend-mobile/package-lock.json frontend-mobile/
RUN npm ci --prefix frontend && npm ci --prefix frontend-mobile

COPY frontend/ frontend/
COPY frontend-mobile/ frontend-mobile/

# Vite는 빌드 때 VITE_* 값을 글자로 박음 → npm run build 앞에 꼭 (DP-002)
# 값은 compose build.args가 넘김. API 주소는 경로 없이 (예: https://api.example.com)
ARG VITE_API_BASE_URL
ARG VITE_DISCORD_SUPPORT_URL=
# 모바일 광고 (비면 광고 안 씀)
ARG VITE_AD_PROVIDER=
ARG VITE_ADSENSE_CLIENT=
ARG VITE_ADSENSE_SLOT_BANNER=
ARG VITE_ADSENSE_SLOT_INTERSTITIAL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_DISCORD_SUPPORT_URL=$VITE_DISCORD_SUPPORT_URL \
    VITE_AD_PROVIDER=$VITE_AD_PROVIDER \
    VITE_ADSENSE_CLIENT=$VITE_ADSENSE_CLIENT \
    VITE_ADSENSE_SLOT_BANNER=$VITE_ADSENSE_SLOT_BANNER \
    VITE_ADSENSE_SLOT_INTERSTITIAL=$VITE_ADSENSE_SLOT_INTERSTITIAL

# 화면 버전(VITE_APP_VERSION)은 빌드 플러그인이 정함, 이미지 안엔 .git이 없어 "nogit-빌드시각"
# → 빌드마다 달라져서 새 버전 안내는 그대로 됨
RUN test -n "$VITE_API_BASE_URL" || (echo "VITE_API_BASE_URL 비어 있음" && exit 1)
RUN npm run build --prefix frontend && npm run build --prefix frontend-mobile


FROM nginx:1.27-alpine AS runner
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
# 보안 헤더·클라우드플레어 진짜 IP·관리자 허용 목록 조각 (default.conf가 include)
COPY nginx/snippets/ /etc/nginx/snippets/
COPY --from=build /app/frontend/dist /usr/share/nginx/html/desktop
# 모바일은 화면 파일만: public 그림은 데스크톱 폴더 것을 nginx가 같이 씀 (같은 그림 두 벌 안 넣기)
COPY --from=build /app/frontend-mobile/dist/index.html /app/frontend-mobile/dist/version.json /usr/share/nginx/html/mobile/
COPY --from=build /app/frontend-mobile/dist/assets /usr/share/nginx/html/mobile/assets

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
