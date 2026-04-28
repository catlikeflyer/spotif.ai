#!/bin/bash

echo "🎶 Starting Spotify Agent environment..."

# Function to elegantly kill all background processes when the script stops
cleanup() {
    echo ""
    echo "🛑 Shutting down Spotify Agent..."
    kill $(jobs -p) 2>/dev/null
    exit
}

# Catch Ctrl+C and exit signals to run the cleanup function
trap cleanup EXIT INT TERM

# 1. Check Ollama status
echo "🧠 Checking Ollama..."
if ! curl -s http://localhost:11434/api/tags >/dev/null; then
    echo "⚠️  Ollama doesn't seem to be running. Attempting to start it in the background..."
    ollama serve >/dev/null 2>&1 &
    sleep 3
else
    echo "✅ Ollama is running."
fi

# 2. Start Backend
echo "⚙️  Starting Node.js Backend..."
cd spotify-agent/backend
node index.js &
cd ../..

# 3. Start Frontend
echo "🎨 Starting React Frontend..."
cd spotify-agent/frontend
npm run dev &
cd ../..

echo ""
echo "🚀 Everything is up and running!"
echo "👉 Open your browser to: http://localhost:5173"
echo ""
echo "Press [Ctrl+C] at any time to stop all servers."

# Wait indefinitely so the script doesn't exit (which would kill the background tasks)
wait
