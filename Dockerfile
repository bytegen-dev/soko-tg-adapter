FROM node:20-alpine AS builder

WORKDIR /app

ENV HUSKY=0

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HUSKY=0
ENV PORT=8080
ENV STATE_DATA_DIR=/data

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

RUN mkdir -p /data

EXPOSE 8080

CMD ["node", "dist/index.js"]
