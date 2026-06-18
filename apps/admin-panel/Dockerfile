FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Vite inlines VITE_* vars at build time
ARG VITE_API_URL=http://localhost:8000
ARG VITE_REQUIRE_ADMIN_LOGIN=false
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_REQUIRE_ADMIN_LOGIN=$VITE_REQUIRE_ADMIN_LOGIN
RUN npm run build

FROM nginx:alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://localhost:80/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
