#!/bin/bash

# Setup Ollama Backend for AI Queue Dashboard
# Makes the "Process One" button actually work!

echo "🤖 Setting up Ollama backend for AI Queue Dashboard..."

# Check if Ollama is running
if ! curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo "❌ Ollama not running! Please start it first:"
    echo "   ollama serve"
    echo ""
    echo "Then make sure llama3.1:70b is available:"
    echo "   ollama list"
    exit 1
fi

echo "✅ Ollama is running"

# Check if llama3.1:70b is available
if ! ollama list | grep -q "llama3.1:70b"; then
    echo "❌ llama3.1:70b model not found!"
    echo "Please install it first:"
    echo "   ollama pull llama3.1:70b"
    exit 1
fi

echo "✅ Llama 3.1 70B model is available"

# Test the worker script
echo "🔧 Testing queue worker..."
node scripts/queue-worker.js status

echo ""
echo "🚀 Backend setup complete!"
echo ""
echo "📋 Available commands:"
echo "  node scripts/queue-worker.js add-demo    # Add sample tasks"
echo "  node scripts/queue-worker.js process     # Process one task" 
echo "  node scripts/queue-worker.js status      # Check queue status"
echo "  node scripts/queue-worker.js cleanup     # Clear completed"
echo ""
echo "🌐 Now restart your UI and try the buttons:"
echo "  npm run dev"
echo ""
echo "The 'Process One' button will actually send tasks to Llama 3.1 70B! 🎯"