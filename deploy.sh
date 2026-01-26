#!/bin/bash

# --- Configuration ---
# CHANGE THIS: The path to your project on the VPS
APP_DIR="/var/www/softsleep"
# CHANGE THIS: The name of your backend service in PM2
BACKEND_SERVICE_NAME="softsleep-backend"

set -e # Exit immediately if a command fails

echo "🚀 Starting deployment..."

# 1. Navigate to project directory
# cd $APP_DIR || exit  <-- Uncomment this if running from outside the dir

# 2. Update Code
echo "📥 Pulling latest code..."
git pull origin main

# 3. Backend Setup
echo "🛠️ Updating Backend..."
cd backend
npm install
npx prisma generate        # 1. Update Prisma Client
npx prisma migrate deploy  # 2. Update Database Schema (Safe for production)
npm run build              # 3. Rebuild backend

# Restart Backend Service
echo "🔄 Restarting Backend Service..."
pm2 restart $BACKEND_SERVICE_NAME || pm2 start dist/app.js --name $BACKEND_SERVICE_NAME

# 4. Frontend Setup
echo "🎨 Updating Frontend..."
cd ../
npm install
npm run build

# Optional: Copy to web server root if needed
# echo "📂 Copying frontend build..."
# cp -r dist/* /var/www/html/

echo "✅ Deployment Complete!"
