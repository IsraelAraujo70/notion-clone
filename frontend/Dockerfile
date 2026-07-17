FROM node:20-slim AS builder

WORKDIR /workspace
COPY packages/core ./packages/core

WORKDIR /workspace/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN npm run build

FROM node:20-slim AS dev

WORKDIR /workspace
COPY packages/core ./packages/core

WORKDIR /workspace/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_BASE_URL=http://localhost:18080

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]

FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=8080

COPY --from=builder /workspace/frontend/.next/standalone/frontend ./
COPY --from=builder /workspace/frontend/.next/static ./.next/static
COPY --from=builder /workspace/frontend/public ./public

CMD ["node", "server.js"]
