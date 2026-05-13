FROM node:22-alpine AS deps
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm install --omit=dev


FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./

RUN chmod +x docker-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "index.js"]

