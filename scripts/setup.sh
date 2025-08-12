#!/bin/bash

echo "================================================="
echo "   SOLANA ALGORITHMIC TRADING BOT SETUP"
echo "================================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Creating .env file from example..."
    cp env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env file and add your configuration:"
    echo "   - Add your wallet private key (or leave empty for paper trading)"
    echo "   - Configure strategy parameters"
    echo "   - Set API keys if available"
    echo ""
else
    echo "✅ .env file already exists"
fi

# Create logs directory
if [ ! -d logs ]; then
    mkdir -p logs
    echo "✅ Logs directory created"
fi

# Create data directory for historical data
if [ ! -d data ]; then
    mkdir -p data
    echo "✅ Data directory created"
fi

echo ""
echo "Setup complete! Next steps:"
echo ""
echo "1. Edit .env file with your configuration"
echo "2. Run 'pnpm dev' to start in development mode"
echo "3. Open http://localhost:3000 to view the dashboard"
echo ""
echo "⚠️  SAFETY TIPS:"
echo "   - Always start with PAPER_TRADING=true"
echo "   - Test thoroughly before enabling live trading"
echo "   - Use small position sizes initially"
echo "   - Monitor the bot regularly"
echo ""
