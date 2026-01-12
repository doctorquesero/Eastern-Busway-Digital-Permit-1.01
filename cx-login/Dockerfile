FROM node:22

WORKDIR /app

# Copiar solo los archivos del backend
COPY cx-login/package*.json ./

RUN npm install

# Copiar el resto del backend
COPY cx-login/. .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "index.js"]
