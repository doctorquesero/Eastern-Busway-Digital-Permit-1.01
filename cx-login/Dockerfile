FROM node:22

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "index.js"]
