FROM node:lts-alpine

USER node
WORKDIR /home/node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node . ./

ENV NODE_ENV=production
RUN node --run build

HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- "http://localhost:${PORT:-3000}/health" > /dev/null || exit 1

CMD ["node","node_modules/jeasx/cli.js","start"]
