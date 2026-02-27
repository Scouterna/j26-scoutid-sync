# Use Node 24 for native TypeScript support
FROM node:24-slim

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (production only)
RUN pnpm install --frozen-lockfile --prod

# Copy application source
COPY src/ ./src/

CMD ["node", "src/main.ts"]
