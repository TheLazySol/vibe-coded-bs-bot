# Solana Algorithmic Trading Bot 🚀

An advanced algorithmic trading bot for Solana, implementing a **Mean Reversion Strategy** for SOL trading. Built with TypeScript, this bot provides real-time market analysis, automated trade execution, risk management, and a beautiful monitoring dashboard.

## 📊 Strategy Overview

The bot implements a **Mean Reversion Strategy** based on the principle that prices tend to revert to their mean over time. When SOL price deviates significantly from its moving average, the bot identifies trading opportunities:

- **BUY Signal**: When price falls below the mean by a significant margin (oversold)
- **SELL Signal**: When price rises above the mean by a significant margin (overbought)

### Key Indicators Used:
- Simple Moving Average (SMA)
- Bollinger Bands
- Standard Deviation & Z-Score
- RSI (Relative Strength Index) for confirmation
- Volume filters to avoid low-liquidity periods

## ✨ Features

- **Multi-Source Price Data**: Aggregates prices from Pyth Network, BirdEye, CoinGecko, and Binance
- **Jupiter Integration**: Executes trades through Jupiter aggregator for best prices
- **Risk Management**: Advanced position sizing, stop-loss, take-profit, and drawdown protection
- **Paper Trading Mode**: Test strategies without real funds
- **Real-time Dashboard**: Beautiful web interface for monitoring performance
- **Comprehensive Logging**: Detailed logs for trades, signals, and system events
- **Backtesting**: Test strategies on historical data (coming soon)

## 🛠️ Technology Stack

- **Runtime**: Node.js with TypeScript
- **Blockchain**: Solana Web3.js, SPL Token
- **DEX Integration**: Jupiter Aggregator API
- **Price Feeds**: Pyth Network, BirdEye API, CoinGecko
- **Real-time Data**: WebSocket connections
- **Monitoring**: Express.js + Socket.IO dashboard
- **Technical Analysis**: TechnicalIndicators library

## 📋 Prerequisites

- Node.js v18+ and pnpm
- Solana wallet with SOL for trading
- RPC endpoint (default uses public Solana RPC)
- Optional: API keys for enhanced data sources

## 🚀 Quick Start

### 1. Clone and Install

```bash
cd algorithmic-trading
pnpm install
```

### 2. Configure Environment

Copy the example configuration file and set your parameters:

```bash
cp env.example .env
```

Edit `.env` with your settings:

```env
# CRITICAL: Add your wallet private key (base58 encoded)
WALLET_PRIVATE_KEY=your_private_key_here

# Start with paper trading for safety
PAPER_TRADING=true
TRADING_ENABLED=true

# Strategy parameters
MA_PERIOD=20
STD_DEV_MULTIPLIER=2
TIMEFRAME=15m
MAX_POSITION_SIZE=100
RISK_PER_TRADE=0.02
```

### 3. Run the Bot

**Development mode (with auto-reload):**
```bash
pnpm dev
```

**Production mode:**
```bash
pnpm build
pnpm start
```

### 4. Access Dashboard

Open your browser and navigate to:
```
http://localhost:3000
```

## ⚙️ Configuration

### Key Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `TRADING_ENABLED` | Enable/disable trading | `false` |
| `PAPER_TRADING` | Use simulated trading | `true` |
| `MA_PERIOD` | Moving average period | `20` |
| `STD_DEV_MULTIPLIER` | Bollinger Band width | `2` |
| `MAX_POSITION_SIZE` | Max position in USD | `1000` |
| `RISK_PER_TRADE` | Risk per trade (%) | `0.02` |
| `TIMEFRAME` | Analysis timeframe | `15m` |

### Risk Management Settings

- **Max Open Positions**: 3 concurrent positions
- **Daily Loss Limit**: 10% of max position size
- **Max Drawdown**: 20% from peak
- **Stop Loss**: 5% per position
- **Take Profit**: 10% per position

## 📊 Trading Logic

### Entry Conditions

The bot enters a position when:

1. **Oversold (BUY)**:
   - Price is 2+ standard deviations below SMA
   - RSI < 30 (if available)
   - Volume meets minimum threshold
   - Risk checks pass

2. **Overbought (SELL)**:
   - Price is 2+ standard deviations above SMA
   - RSI > 70 (if available)
   - Volume meets minimum threshold
   - Open long position exists

### Exit Conditions

Positions are closed when:
- Price returns to mean (Z-score < 0.1)
- Stop loss triggered (-5%)
- Take profit reached (+10%)
- Position age exceeds 24 hours
- Emergency stop at -10% loss

## 🔒 Security Considerations

1. **Never commit your `.env` file** - It contains sensitive keys
2. **Start with paper trading** to understand the bot's behavior
3. **Use small position sizes** when starting live trading
4. **Monitor the bot regularly** - Automated trading carries risks
5. **Keep your private keys secure** - Consider using a dedicated trading wallet
6. **Set conservative risk parameters** initially

## 📈 Performance Monitoring

The dashboard provides real-time metrics:

- Current SOL price and 24h change
- Open positions with P&L
- Recent trades and signals
- Win rate and total P&L
- Risk metrics (drawdown, daily loss)
- Price chart with entry/exit points

## 🧪 Testing Strategies

### Paper Trading

Always test new strategies in paper trading mode first:

```bash
PAPER_TRADING=true
TRADING_ENABLED=true
pnpm dev
```

### Backtesting (Coming Soon)

Run historical simulations:

```bash
pnpm backtest
```

## 📝 Logs

The bot maintains detailed logs in the `logs/` directory:

- `combined.log` - All events
- `error.log` - Errors only
- `trades.log` - Trade execution details

## 🚨 Risk Warning

**IMPORTANT**: Cryptocurrency trading carries substantial risk. This bot is provided for educational purposes. 

- Past performance does not guarantee future results
- You can lose all invested capital
- Always understand the code before running with real funds
- The developers are not responsible for any losses

## 🛠️ Development

### Project Structure

```
src/
├── index.ts              # Main bot orchestrator
├── config/               # Configuration management
├── types/                # TypeScript definitions
├── strategies/           # Trading strategies
│   └── meanReversion.ts  # Mean reversion implementation
├── services/
│   ├── data/            # Price data services
│   ├── trading/         # Trade execution
│   └── monitoring/      # Dashboard & metrics
└── utils/               # Helper utilities
```

### Adding New Strategies

1. Create a new strategy file in `src/strategies/`
2. Implement the strategy interface
3. Update the main bot to use your strategy
4. Test thoroughly in paper trading mode

## 🐛 Troubleshooting

### Common Issues

1. **"Insufficient SOL balance"**
   - Ensure your wallet has enough SOL for trades and fees
   - Check you're on the correct network (mainnet/devnet)

2. **"Failed to get price from any source"**
   - Check your internet connection
   - Verify RPC endpoint is responsive
   - Some price sources may require API keys

3. **"Transaction simulation failed"**
   - Slippage may be too low
   - Insufficient SOL for fees
   - DEX liquidity issues

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Test thoroughly
4. Submit a pull request

## 📄 License

MIT License - See LICENSE file for details

## ⚠️ Disclaimer

This software is provided "as is" without warranty of any kind. Trading cryptocurrencies is highly risky. Never invest more than you can afford to lose. The developers assume no responsibility for financial losses.

## 🆘 Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Read the logs for detailed error information

---

**Remember**: Start with paper trading, use small amounts when going live, and never invest more than you can afford to lose! 🚀
