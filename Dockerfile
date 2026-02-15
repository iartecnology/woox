# Build stage
FROM node:20-alpine AS build
WORKDIR /app

# Optimización de memoria para evitar exit code 3 (OOM)
ENV NODE_OPTIONS=--max-old-space-size=2048

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist/woox-frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
