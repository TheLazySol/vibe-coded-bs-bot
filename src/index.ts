import * as cron from 'node-cron';
import Decimal from 'decimal.js';
import { config } from './config';
import logger from './utils/logger';
import { PriceService } from './services/data/priceService';
import { WalletService } from './services/trading/walletService';
import { TradingService } from './services/trading/tradingService';
import { RiskManager } from './services/trading/riskManager';
import { MeanReversionStrategy } from './strategies/meanReversion';
import { TradingSignal } from './types';
import Dashboard from './services/monitoring/dashboard';

class TradingBot {
  private priceService: PriceService;
  private walletService: WalletService;
  private tradingService: TradingService;
  private riskManager: RiskManager;
  private strategy: MeanReversionStrategy;
  private dashboard: Dashboard | null = null;
  private isRunning: boolean = false;
  private cronJob: cron.ScheduledTask | null = null;
  private lastSignal: TradingSignal | null = null;
  private checkInterval: number = 60000; // 1 minute default

  constructor() {
    this.priceService = new PriceService();
    this.walletService = new WalletService();
    this.tradingService = new TradingService(this.walletService);
    this.riskManager = new RiskManager();
    this.strategy = new MeanReversionStrategy();
    
    // Set check interval based on timeframe
    const timeframe = config.get().timeframe;
    this.setCheckInterval(timeframe);
    
    // Initialize dashboard if enabled
    const cfg = config.get();
    if (cfg.enableDashboard) {
      this.dashboard = new Dashboard();
    }
  }

  /**
   * Initialize the trading bot
   */
  public async initialize(): Promise<void> {
    try {
      logger.info('=================================================');
      logger.info('       SOLANA ALGORITHMIC TRADING BOT');
      logger.info('       Strategy: Mean Reversion on SOL');
      logger.info('=================================================');
      
      // Display configuration
      const cfg = config.get();
      logger.info('Configuration:', {
        network: cfg.solanaNetwork,
        tradingEnabled: cfg.tradingEnabled,
        paperTrading: cfg.paperTrading,
        maPeriod: cfg.maPeriod,
        stdDevMultiplier: cfg.stdDevMultiplier,
        timeframe: cfg.timeframe
      });

      // Initialize services
      logger.info('Initializing services...');
      await this.priceService.initialize();
      
      // Check wallet
      const walletAddress = this.walletService.getPublicKey();
      if (walletAddress) {
        const balance = await this.walletService.getSOLBalance();
        logger.info(`Wallet: ${walletAddress.toString()}`);
        logger.info(`SOL Balance: ${balance.toFixed(4)} SOL`);
        
        if (cfg.tradingEnabled && !cfg.paperTrading && balance.lt(0.1)) {
          logger.warn('Low SOL balance for live trading!');
        }
      } else {
        logger.warn('No wallet configured - running in observation mode');
      }

      // Display risk parameters
      const riskMetrics = this.riskManager.getRiskMetrics();
      logger.info('Risk Management Settings:', riskMetrics.riskLimits);

      logger.info('Bot initialized successfully!');
      
    } catch (error) {
      logger.error('Failed to initialize bot:', error);
      throw error;
    }
  }

  /**
   * Start the trading bot
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Bot is already running');
      return;
    }

    logger.info('Starting trading bot...');
    this.isRunning = true;

    // Start dashboard if enabled
    if (this.dashboard) {
      this.dashboard.start();
    }

    // Run initial check
    await this.runTradingCycle();

    // Schedule periodic checks based on timeframe
    const cronPattern = this.getCronPattern();
    this.cronJob = cron.schedule(cronPattern, async () => {
      await this.runTradingCycle();
    });

    logger.info(`Bot started - checking every ${this.checkInterval / 1000} seconds`);
    
    // Set up graceful shutdown
    this.setupGracefulShutdown();
  }

  /**
   * Run a single trading cycle
   */
  private async runTradingCycle(): Promise<void> {
    try {
      logger.debug('Running trading cycle...');
      
      // Get current price and market data
      const currentPrice = await this.priceService.getCurrentPrice();
      const marketData = await this.priceService.getMarketData();
      
      logger.info('Market Update:', {
        price: currentPrice.toFixed(2),
        volume24h: marketData.volume24h.toFixed(0),
        change24h: marketData.change24h.toFixed(2) + '%'
      });

      // Update dashboard
      if (this.dashboard) {
        this.dashboard.updateMetrics({
          price: currentPrice.toNumber(),
          volume24h: marketData.volume24h.toNumber(),
          change24h: marketData.change24h.toNumber(),
          positions: this.tradingService.getAllPositions(),
          trades: this.tradingService.getTradeHistory(10),
          performance: this.tradingService.getPortfolioStats(),
          riskMetrics: this.riskManager.getRiskMetrics()
        });
      }

      // Get price history for analysis
      const priceHistory = this.priceService.getPriceHistory();
      
      if (priceHistory.length < 20) {
        logger.debug('Insufficient price history for analysis');
        return;
      }

      // Generate trading signal
      const signal = this.strategy.analyze(priceHistory);
      
      if (signal) {
        await this.handleTradingSignal(signal);
      } else {
        logger.debug('No trading signal generated');
      }

      // Check existing positions
      await this.managePositions(currentPrice);
      
      // Update risk metrics
      const balance = await this.getAccountBalance();
      this.riskManager.updateDrawdown(balance);
      
      // Log portfolio stats periodically
      if (Math.random() < 0.1) { // 10% chance each cycle
        this.logPortfolioStats();
      }
      
    } catch (error) {
      logger.error('Trading cycle error:', error);
    }
  }

  /**
   * Handle a trading signal
   */
  private async handleTradingSignal(signal: TradingSignal): Promise<void> {
    logger.signal('New trading signal', {
      type: signal.type,
      strength: signal.strength,
      price: signal.price.toString(),
      reason: signal.reason
    });

    // Update dashboard with signal
    if (this.dashboard) {
      this.dashboard.addSignal({
        type: signal.type,
        strength: signal.strength,
        price: signal.price.toNumber(),
        timestamp: signal.timestamp,
        reason: signal.reason
      });
    }

    // Check if we should act on this signal
    if (signal.type === 'HOLD') {
      return;
    }

    // Avoid duplicate signals
    if (this.lastSignal && 
        this.lastSignal.type === signal.type &&
        Math.abs(this.lastSignal.timestamp - signal.timestamp) < 300000) { // 5 minutes
      logger.debug('Ignoring duplicate signal');
      return;
    }

    this.lastSignal = signal;

    // Get current balance and positions
    const balance = await this.getAccountBalance();
    const openPositions = this.tradingService.getOpenPositions();

    // Calculate position size
    const positionSize = this.strategy.calculatePositionSize(
      signal,
      balance,
      signal.price
    );

    // Validate trade with risk manager
    const validation = this.riskManager.validateTrade(
      signal,
      positionSize,
      balance,
      openPositions
    );

    if (!validation.allowed) {
      logger.warn('Trade rejected by risk manager:', validation.reason);
      return;
    }

    const finalSize = validation.adjustedSize || positionSize;
    
    // Execute trade
    const cfg = config.get();
    if (cfg.tradingEnabled) {
      logger.info(`Executing ${signal.type} trade for ${finalSize.toFixed(4)} SOL`);
      const trade = await this.tradingService.executeTrade(signal, finalSize);
      
      if (trade && trade.status === 'SUCCESS') {
        logger.trade('Trade executed successfully', trade);
        
        // Update dashboard with trade
        if (this.dashboard) {
          this.dashboard.addTrade({
            timestamp: trade.timestamp,
            side: trade.side,
            price: trade.price.toNumber(),
            size: trade.size.toNumber(),
            status: trade.status
          });
        }
        
        // Update risk tracking
        if (trade.side === 'SELL') {
          const positions = this.tradingService.getAllPositions();
          const lastClosed = positions[positions.length - 1];
          if (lastClosed && lastClosed.pnl && lastClosed.pnl.lt(0)) {
            this.riskManager.updateDailyLoss(lastClosed.pnl.abs());
          }
        }
      } else {
        logger.error('Trade execution failed');
      }
    } else {
      logger.info(`[SIMULATION] Would ${signal.type} ${finalSize.toFixed(4)} SOL at ${signal.price.toFixed(2)}`);
    }
  }

  /**
   * Manage existing positions
   */
  private async managePositions(currentPrice: Decimal): Promise<void> {
    const openPositions = this.tradingService.getOpenPositions();
    
    for (const position of openPositions) {
      // Update current price
      position.currentPrice = currentPrice;
      
      // Calculate PnL
      const entryValue = position.entryPrice.mul(position.size);
      const currentValue = currentPrice.mul(position.size);
      position.pnl = position.side === 'LONG' 
        ? currentValue.minus(entryValue)
        : entryValue.minus(currentValue);
      position.pnlPercent = position.pnl.div(entryValue).mul(100);
      
      // Check if position should be closed
      const closeCheck = this.riskManager.shouldClosePosition(position);
      
      if (closeCheck.shouldClose) {
        logger.info(`Closing position: ${closeCheck.reason}`, {
          id: position.id,
          pnl: position.pnl.toFixed(2),
          pnlPercent: position.pnlPercent.toFixed(2) + '%'
        });
        
        // Generate sell signal to close position
        const closeSignal: TradingSignal = {
          type: 'SELL',
          strength: 1,
          price: currentPrice,
          timestamp: Date.now(),
          indicators: {
            sma: new Decimal(0),
            upperBand: new Decimal(0),
            lowerBand: new Decimal(0),
            stdDev: new Decimal(0),
            zScore: new Decimal(0)
          },
          reason: closeCheck.reason || 'Position closure'
        };
        
        await this.tradingService.executeTrade(closeSignal, position.size);
      } else {
        // Log position status
        logger.debug('Position status', {
          id: position.id,
          pnl: position.pnl.toFixed(2),
          pnlPercent: position.pnlPercent.toFixed(2) + '%'
        });
      }
    }
  }

  /**
   * Get account balance (SOL or USDC equivalent)
   */
  private async getAccountBalance(): Promise<Decimal> {
    const cfg = config.get();
    
    if (cfg.paperTrading) {
      // For paper trading, use a simulated balance
      return new Decimal(1000); // $1000 starting balance
    }
    
    const solBalance = await this.walletService.getSOLBalance();
    const currentPrice = await this.priceService.getCurrentPrice();
    
    return solBalance.mul(currentPrice);
  }

  /**
   * Log portfolio statistics
   */
  private logPortfolioStats(): void {
    const stats = this.tradingService.getPortfolioStats();
    const riskMetrics = this.riskManager.getRiskMetrics();
    
    logger.metric('Portfolio Performance', {
      ...stats,
      dailyLoss: riskMetrics.dailyLoss,
      maxDrawdown: riskMetrics.maxDrawdown
    });
  }

  /**
   * Set check interval based on timeframe
   */
  private setCheckInterval(timeframe: string): void {
    const unit = timeframe.slice(-1);
    const value = parseInt(timeframe.slice(0, -1));
    
    switch (unit) {
      case 'm':
        this.checkInterval = value * 60 * 1000;
        break;
      case 'h':
        this.checkInterval = value * 60 * 60 * 1000;
        break;
      case 'd':
        this.checkInterval = value * 24 * 60 * 60 * 1000;
        break;
      default:
        this.checkInterval = 15 * 60 * 1000; // Default 15 minutes
    }
    
    // Cap at 1 hour max to ensure responsiveness
    this.checkInterval = Math.min(this.checkInterval, 60 * 60 * 1000);
  }

  /**
   * Get cron pattern based on check interval
   */
  private getCronPattern(): string {
    const minutes = Math.floor(this.checkInterval / 60000);
    
    if (minutes < 1) {
      return '* * * * * *'; // Every second (not recommended)
    } else if (minutes === 1) {
      return '* * * * *'; // Every minute
    } else if (minutes < 60) {
      return `*/${minutes} * * * *`; // Every N minutes
    } else {
      const hours = Math.floor(minutes / 60);
      return `0 */${hours} * * *`; // Every N hours
    }
  }

  /**
   * Stop the trading bot
   */
  public async stop(): Promise<void> {
    logger.info('Stopping trading bot...');
    this.isRunning = false;
    
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    
    // Close all open positions if configured
    const cfg = config.get();
    if (cfg.tradingEnabled) {
      const openPositions = this.tradingService.getOpenPositions();
      if (openPositions.length > 0) {
        logger.info(`Closing ${openPositions.length} open positions...`);
        for (const position of openPositions) {
          const closeSignal: TradingSignal = {
            type: 'SELL',
            strength: 1,
            price: position.currentPrice || position.entryPrice,
            timestamp: Date.now(),
            indicators: {
              sma: new Decimal(0),
              upperBand: new Decimal(0),
              lowerBand: new Decimal(0),
              stdDev: new Decimal(0),
              zScore: new Decimal(0)
            },
            reason: 'Bot shutdown'
          };
          await this.tradingService.executeTrade(closeSignal, position.size);
        }
      }
    }
    
    // Cleanup resources
    await this.priceService.cleanup();
    
    // Stop dashboard
    if (this.dashboard) {
      this.dashboard.stop();
    }
    
    // Final stats
    this.logPortfolioStats();
    
    logger.info('Bot stopped successfully');
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error(`Unhandled rejection: ${reason}`);
      logger.debug('Promise:', promise);
    });
  }
}

// Main entry point
async function main() {
  const bot = new TradingBot();
  
  try {
    await bot.initialize();
    await bot.start();
    
    logger.info('Bot is running. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Start the bot
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
