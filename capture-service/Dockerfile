FROM mcr.microsoft.com/playwright:v1.62.0-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev=false

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8787

CMD ["npm", "run", "start"]
