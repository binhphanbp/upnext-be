FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
# Install dependencies but skip running package build scripts here to avoid
# interactive approval prompts inside Docker. Build scripts are executed
# later in the build stage where we can run them non-interactively.
RUN pnpm install --frozen-lockfile=false --ignore-scripts

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma:generate
RUN pnpm build
## Remove `prepare` script from package.json to avoid invoking husky
## during prune when devDependencies are not present.
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));if(p.scripts&&p.scripts.prepare){delete p.scripts.prepare;fs.writeFileSync('package.json',JSON.stringify(p,null,2));}"

RUN pnpm prune --prod

FROM node:24-alpine AS runner
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
EXPOSE 3636
CMD ["sh", "-c", "pnpm prisma:deploy && node dist/src/main.js"]
