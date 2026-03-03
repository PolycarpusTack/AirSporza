FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma/
RUN pnpm exec prisma generate

COPY tsconfig.json ./
COPY src ./src

RUN pnpm run build

FROM node:20-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 sporza

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

COPY prisma ./prisma/
RUN pnpm exec prisma generate

COPY --from=builder /app/dist ./dist

RUN mkdir -p logs
RUN chown -R sporza:nodejs /app

USER sporza

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
