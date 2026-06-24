FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG PRISMA_GENERATE_DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
RUN DATABASE_URL="$PRISMA_GENERATE_DATABASE_URL" pnpm prisma:generate
RUN pnpm build
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));if(p.scripts&&p.scripts.prepare){delete p.scripts.prepare;fs.writeFileSync('package.json',JSON.stringify(p,null,2));}"
RUN pnpm prune --prod

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "dist/src/main.js"]
