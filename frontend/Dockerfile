FROM node:22-alpine AS builder

WORKDIR /app

# Accept build-time Vite envs (Clerk key, API base, MSW flag)
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_API_BASE_URL
ARG VITE_ENABLE_MSW
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_ENABLE_MSW=${VITE_ENABLE_MSW}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
