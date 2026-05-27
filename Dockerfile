# Imagen única para el Kanban DGTAR (Next.js).
FROM node:20-alpine

WORKDIR /app

# Instalar dependencias primero para aprovechar la cache de capas.
COPY package.json package-lock.json* ./
RUN npm install

# Código y build de producción. En desarrollo docker-compose.dev.yml salta el
# build para arrancar más rápido y usar hot reload.
COPY . .
ARG SKIP_BUILD=false
RUN if [ "$SKIP_BUILD" != "true" ]; then npm run build; fi

EXPOSE 3000
CMD ["npm", "start"]
