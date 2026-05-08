FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .

ARG VITE_BASE_PATH=/financial-app
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

RUN npm run build

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4173${VITE_BASE_PATH}/ || exit 1

CMD ["npm", "run", "preview"]
