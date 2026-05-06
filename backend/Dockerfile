FROM node:22-alpine AS deps
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm install --omit=dev


FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./

EXPOSE 4000
CMD ["node", "index.js"]

