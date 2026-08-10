# --- deps ---
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# GEMINI_API_KEY is a runtime secret, not a build-time one — the app reads
# it from process.env when /api/simulate is called, so it does not need to
# be present here.
RUN npm run build

# --- run ---
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 hacksight

COPY --from=builder /app/public ./public
COPY --from=builder --chown=hacksight:nodejs /app/.next/standalone ./
COPY --from=builder --chown=hacksight:nodejs /app/.next/static ./.next/static

USER hacksight
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
