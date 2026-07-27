FROM node:20-slim

# Install system dependencies for fonts and graphics
RUN apt-get update && apt-get install -y \
    fonts-noto-color-emoji \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Hugging Face Spaces routes HTTP traffic to port 7860 by default
ENV PORT=7860
EXPOSE 7860

# Start the 24/7 service
CMD ["npm", "start"]
