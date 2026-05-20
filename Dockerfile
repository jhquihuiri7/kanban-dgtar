# Imagen única para el Kanban DGTAR (Next.js). Incluye devDependencies porque
# el seed (tsx + TypeScript) corre dentro del contenedor.
FROM node:20-alpine

WORKDIR /app

# Instalar dependencias primero para aprovechar la cache de capas.
COPY package.json package-lock.json* ./
RUN npm install

# Código y build de producción.
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
