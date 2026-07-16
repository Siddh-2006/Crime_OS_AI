FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production=false

COPY . .
RUN npm run build

# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

RUN mkdir -p logs && chown -R appuser:appgroup /app

USER appuser

EXPOSE 5000

CMD ["node", "dist/server.js"]
