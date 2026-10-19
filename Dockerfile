# ---------------------------------------------------------------------------
# Multi-stage build.
# WHY: the build stage has dev dependencies (TypeScript, Nest CLI, Jest);
# the runtime stage only has production deps + compiled JS -> smaller image,
# smaller attack surface, faster pulls.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY kb ./kb
# Never bake secrets into the image: pass GEMINI_API_KEY at runtime (-e / --env-file).
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/main.js"]
