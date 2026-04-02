#!/usr/bin/env bash
set -euo pipefail

# Run from this script's directory (project root).
cd "$(dirname "$0")"

echo "[1/4] Switching to main branch..."
git checkout main

echo "[2/4] Pulling latest from origin/main..."
git pull origin main

echo "[3/4] Installing/updating dependencies..."
npm install

echo "[4/4] Starting the project..."
npm start
