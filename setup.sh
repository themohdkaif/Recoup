#!/usr/bin/env bash
set -e

# Recoup: One-Command Monorepo Setup Script
echo "============================================================"
echo "          RECOUP: MONOREPO SETUP & INITIALIZATION           "
echo "============================================================"

# Resolve root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# 1. Python Virtual Environment Setup
echo ""
echo "[1/4] Configuring Python Backend Environment..."
if [ ! -d "backend/venv" ]; then
  echo "  • Creating virtual environment at backend/venv..."
  python3 -m venv backend/venv
else
  echo "  • Existing virtual environment found at backend/venv."
fi

# Activate venv & install dependencies
source backend/venv/bin/activate
echo "  • Installing Python dependencies from backend/requirements.txt..."
pip install --upgrade pip -q
pip install -r backend/requirements.txt -q
echo "  ✓ Python backend dependencies installed."

# 2. Environment Configuration
echo ""
echo "[2/4] Verifying Environment Variables..."
if [ ! -f "backend/.env" ]; then
  if [ -f "backend/.env.example" ]; then
    cp backend/.env.example backend/.env
    echo "  • Created backend/.env from backend/.env.example"
  else
    cat <<ENVEOF > backend/.env
RAZORPAY_KEY_ID=rzp_test_placeholder_key_id
RAZORPAY_KEY_SECRET=placeholder_key_secret
GEMINI_API_KEY=placeholder_gemini_api_key
DATABASE_URL=sqlite:///./recoup.db
ENVEOF
    echo "  • Created default backend/.env"
  fi
else
  echo "  • backend/.env already exists."
fi

# 3. Node.js Frontend Dependencies
echo ""
echo "[3/4] Installing Frontend Node Dependencies..."
if command -v npm >/dev/null 2>&1; then
  npm --prefix frontend install --silent
  echo "  ✓ Node dependencies installed in frontend/."
else
  echo "  ✗ Error: npm is not installed or not in PATH."
  exit 1
fi

# 4. Database Seeding & Pipeline Initialization
echo ""
echo "[4/4] Seeding SQLite Database & Running Initial Recovery Pipeline..."
export PYTHONPATH="$ROOT_DIR/backend"
python backend/scripts/seed.py

echo ""
echo "============================================================"
echo "             ✓ RECOUP SETUP COMPLETED SUCCESSFULLY           "
echo "============================================================"
echo ""
echo "To start both backend and frontend servers together, run:"
echo "    ./start.sh"
echo ""
echo "Or start them manually in separate terminals:"
echo "    Backend:  ./backend/venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000"
echo "    Frontend: npm --prefix frontend run dev"
echo ""
