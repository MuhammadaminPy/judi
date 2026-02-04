#!/bin/bash

echo "🎰 Starting Casino Bot..."

if [ ! -f .env ]; then
    echo "⚠️  .env file not found! Creating from .env.example..."
    cp .env.example .env
    echo "📝 Please edit .env file with your credentials!"
    exit 1
fi

echo "📦 Checking Python dependencies..."
pip install -r requirements.txt

echo "🔧 Checking MongoDB connection..."
if ! pgrep -x "mongod" > /dev/null; then
    echo "⚠️  MongoDB is not running. Please start MongoDB first:"
    echo "   mongod"
    exit 1
fi

echo "🚀 Starting bot..."
python bot.py
