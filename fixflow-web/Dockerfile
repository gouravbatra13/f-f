FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

FROM dependencies AS build
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
