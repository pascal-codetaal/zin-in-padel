FROM node:22-alpine AS development-dependencies-env
RUN corepack enable
# prisma generate (postinstall) loads prisma.config.ts, which eagerly resolves
# env("DIRECT_URL"). generate never connects, so a throwaway placeholder is enough
# at build time. Real DIRECT_URL/DATABASE_URL come from Fly secrets at runtime
# (this ENV is absent from the final stage below).
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
COPY . /app
WORKDIR /app
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS production-dependencies-env
RUN corepack enable
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
COPY ./package.json pnpm-lock.yaml pnpm-workspace.yaml ./prisma/ ./app/
WORKDIR /app
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build-env
RUN corepack enable
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN pnpm run build

FROM node:22-alpine
RUN corepack enable
COPY ./package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
COPY --from=build-env /app/app /app/app
COPY --from=build-env /app/tsconfig.json /app/tsconfig.json
COPY --from=build-env /app/whatsapp-templates /app/whatsapp-templates
COPY --from=build-env /app/scripts /app/scripts
COPY --from=build-env /app/prisma /app/prisma
WORKDIR /app
CMD ["pnpm", "run", "start"]
