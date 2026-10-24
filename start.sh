#!/bin/bash
# Pterodactyl startup script for ff-topup backend

echo "=== Starting FF-TopUp Backend ==="

CLOUDFLARE_TUNNEL_TOKEN="eyJhIjoiM2M1OTkzMTlkNzBlMjRiNmI0MTg1M2YyNDdjNTIzYzkiLCJ0IjoiNmY0ZGI4NTUtNzUyMi00NjRjLTg1ZGEtZGViODUyYmY4NDBkIiwicyI6Ik9UVm1NV0V4TUdJdE1UWm1OUzAwTWpJM0xXRmpZekV0TVRnMk1UTXlNV014TVRJeSJ9"

if [ ! -f "./cloudflared" ]; then
    echo "Downloading cloudflared binary..."
    curl -L --output ./cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
    chmod +x ./cloudflared
fi

echo "Starting Cloudflare Tunnel in background..."
./cloudflared tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN" &

# Add local bin to PATH
export PATH="$HOME/.local/bin:$PATH"

# Ensure requirements installed
if [ -f "requirements.txt" ]; then
    python3 -m pip install -q -r requirements.txt
fi

# Set port for Pterodactyl
export SERVER_PORT=8656
export PORT=8656

# Start FastAPI backend
python3 main.py
