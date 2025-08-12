import axios from 'axios';
import Decimal from 'decimal.js';
import { PriceData, BacktestResult, Trade, Position } from './types';
import { MeanReversionStrategy } from './strategies/meanReversion';
import { RiskManager } from './services/trading/riskManager';
import logger from './utils/logger';


interface BacktestConfig {
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  symbol: string;
  timeframe: string;
  strategy: string;
}

class Backtester {
  private strategy: MeanReversionStrategy;
  private riskManager: RiskManager;
  private balance: Decimal;
  private initialBalance: Decimal;
  private positions: Position[] = [];
  private trades: Trade[] = [];
  private peakBalance: Decimal = new Decimal(0);
  private maxDrawdown: Decimal = new Decimal(0);

  constructor(initialBalance: number = 10000) {
    this.strategy = new MeanReversionStrategy();
    this.riskManager = new RiskManager();
    this.balance = new Decimal(initialBalance);
    this.initialBalance = new Decimal(initialBalance);
    this.peakBalance = this.balance;
  }

  /**
   * Run backtest with historical data
   */
  public async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    logger.info('Starting backtest...', {
      startDate: config.startDate.toISOString(),
      endDate: config.endDate.toISOString(),
      initialBalance: config.initialBalance,
      timeframe: config.timeframe
    });

    // Fetch historical data
    const historicalData = await this.fetchHistoricalData(
      config.startDate,
      config.endDate,
      config.timeframe
    );

    if (historicalData.length === 0) {
      throw new Error('No historical data available for the specified period');
    }

    logger.info(`Loaded ${historicalData.length} data points for backtesting`);

    // Initialize strategy with enough initial data
    const strategyPeriod = this.strategy.getParams().maPeriod;
    let priceWindow: PriceData[] = [];

    // Process each data point
    for (let i = 0; i < historicalData.length; i++) {
      const currentData = historicalData[i];
      priceWindow.push(currentData);

      // Keep only the window we need for analysis
      if (priceWindow.length > strategyPeriod * 2) {
        priceWindow = priceWindow.slice(-strategyPeriod * 2);
      }

      // Skip until we have enough data for strategy
      if (priceWindow.length < strategyPeriod) {
        continue;
      }

      // Update position values with current price
      this.updatePositionValues(currentData.close);

      // Check for position exits first
      this.checkPositionExits(currentData);

      // Generate trading signal
      const signal = this.strategy.analyze(priceWindow);

      if (signal && signal.type !== 'HOLD') {
        await this.processSignal(signal, currentData);
      }

      // Update balance tracking
      this.updateBalanceTracking();

      // Log progress every 100 data points
      if (i % 100 === 0) {
        const progress = ((i / historicalData.length) * 100).toFixed(1);
        logger.info(`Backtest progress: ${progress}% - Balance: $${this.balance.toFixed(2)}`);
      }
    }

    // Close any remaining open positions at the end
    this.closeAllPositions(historicalData[historicalData.length - 1].close);

    // Calculate final results
    const result = this.calculateResults(config);
    
    logger.info('Backtest completed!', {
      finalBalance: result.finalBalance.toString(),
      totalReturn: result.totalReturnPercent.toString() + '%',
      totalTrades: result.totalTrades,
      winRate: result.winRate.toString() + '%'
    });

    return result;
  }

  /**
   * Fetch historical price data
   */
  private async fetchHistoricalData(
    startDate: Date,
    endDate: Date,
    _timeframe: string
  ): Promise<PriceData[]> {
    try {
      // Calculate days between dates
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      logger.info(`Fetching ${daysDiff} days of historical data...`);

      // Use CoinGecko for historical data
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/coins/solana/ohlc',
        {
          params: {
            vs_currency: 'usd',
            days: Math.min(daysDiff, 365) // CoinGecko limit
          }
        }
      );

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response from CoinGecko API');
      }

      // Convert to our PriceData format
      const priceData: PriceData[] = response.data.map((candle: number[]) => ({
        timestamp: candle[0],
        open: new Decimal(candle[1]),
        high: new Decimal(candle[2]),
        low: new Decimal(candle[3]),
        close: new Decimal(candle[4]),
        volume: new Decimal(1000000), // Simulated volume
        source: 'coingecko-backtest'
      }));

      // Filter by date range
      const filteredData = priceData.filter(data => {
        const dataDate = new Date(data.timestamp);
        return dataDate >= startDate && dataDate <= endDate;
      });

      // Sort by timestamp
      return filteredData.sort((a, b) => a.timestamp - b.timestamp);

    } catch (error) {
      logger.error('Failed to fetch historical data:', error);
      throw error;
    }
  }

  /**
   * Process a trading signal
   */
  private async processSignal(signal: any, currentData: PriceData): Promise<void> {
    const openPositions = this.positions.filter(p => p.status === 'OPEN');
    
    // Calculate position size
    const positionSize = this.strategy.calculatePositionSize(
      signal,
      this.balance,
      signal.price
    );

    // Validate with risk manager
    const validation = this.riskManager.validateTrade(
      signal,
      positionSize,
      this.balance,
      openPositions
    );

    if (!validation.allowed) {
      return;
    }

    const finalSize = validation.adjustedSize || positionSize;
    const cost = finalSize.mul(signal.price);

    // Execute trade based on signal type
    if (signal.type === 'BUY' && this.balance.gte(cost)) {
      this.executeBuy(finalSize, signal.price, currentData.timestamp);
    } else if (signal.type === 'SELL' && openPositions.length > 0) {
      this.executeSell(openPositions[0], signal.price, currentData.timestamp);
    }
  }

  /**
   * Execute buy order
   */
  private executeBuy(size: Decimal, price: Decimal, timestamp: number): void {
    const cost = size.mul(price);
    const fee = cost.mul(0.0025); // 0.25% fee
    const totalCost = cost.plus(fee);

    if (this.balance.lt(totalCost)) {
      return;
    }

    // Deduct from balance
    this.balance = this.balance.minus(totalCost);

    // Create trade record
    const trade: Trade = {
      id: `backtest_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
      side: 'BUY',
      price,
      size,
      fee,
      status: 'SUCCESS'
    };

    this.trades.push(trade);

    // Create position
    const position: Position = {
      id: `pos_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      entryPrice: price,
      entryTime: timestamp,
      size,
      side: 'LONG',
      stopLoss: this.riskManager.calculateStopLoss(price, 'LONG'),
      takeProfit: this.riskManager.calculateTakeProfit(price, 'LONG'),
      status: 'OPEN'
    };

    this.positions.push(position);
  }

  /**
   * Execute sell order
   */
  private executeSell(position: Position, price: Decimal, timestamp: number): void {
    if (position.status !== 'OPEN') {
      return;
    }

    const proceeds = position.size.mul(price);
    const fee = proceeds.mul(0.0025); // 0.25% fee
    const netProceeds = proceeds.minus(fee);

    // Add to balance
    this.balance = this.balance.plus(netProceeds);

    // Create trade record
    const trade: Trade = {
      id: `backtest_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
      side: 'SELL',
      price,
      size: position.size,
      fee,
      status: 'SUCCESS'
    };

    this.trades.push(trade);

    // Close position
    position.status = 'CLOSED';
    position.currentPrice = price;
    
    const entryValue = position.entryPrice.mul(position.size);
    const exitValue = price.mul(position.size);
    position.pnl = exitValue.minus(entryValue);
    position.pnlPercent = position.pnl.div(entryValue).mul(100);
  }

  /**
   * Update position values with current price
   */
  private updatePositionValues(currentPrice: Decimal): void {
    this.positions
      .filter(p => p.status === 'OPEN')
      .forEach(position => {
        position.currentPrice = currentPrice;
        
        const entryValue = position.entryPrice.mul(position.size);
        const currentValue = currentPrice.mul(position.size);
        position.pnl = currentValue.minus(entryValue);
        position.pnlPercent = position.pnl.div(entryValue).mul(100);
      });
  }

  /**
   * Check for position exits (stop loss, take profit)
   */
  private checkPositionExits(currentData: PriceData): void {
    const openPositions = this.positions.filter(p => p.status === 'OPEN');
    
    for (const position of openPositions) {
      const shouldClose = this.riskManager.shouldClosePosition(position);
      
      if (shouldClose.shouldClose) {
        this.executeSell(position, currentData.close, currentData.timestamp);
      }
    }
  }

  /**
   * Close all open positions
   */
  private closeAllPositions(finalPrice: Decimal): void {
    const openPositions = this.positions.filter(p => p.status === 'OPEN');
    
    for (const position of openPositions) {
      this.executeSell(position, finalPrice, Date.now());
    }
  }

  /**
   * Update balance tracking for drawdown calculation
   */
  private updateBalanceTracking(): void {
    // Calculate total portfolio value (balance + position values)
    const positionValue = this.positions
      .filter(p => p.status === 'OPEN')
      .reduce((total, position) => {
        const currentValue = position.currentPrice 
          ? position.size.mul(position.currentPrice)
          : position.size.mul(position.entryPrice);
        return total.plus(currentValue);
      }, new Decimal(0));

    const totalValue = this.balance.plus(positionValue);

    // Update peak and drawdown
    if (totalValue.gt(this.peakBalance)) {
      this.peakBalance = totalValue;
    }

    const drawdown = this.peakBalance.minus(totalValue).div(this.peakBalance);
    if (drawdown.gt(this.maxDrawdown)) {
      this.maxDrawdown = drawdown;
    }
  }

  /**
   * Calculate final backtest results
   */
  private calculateResults(config: BacktestConfig): BacktestResult {
    const closedPositions = this.positions.filter(p => p.status === 'CLOSED');
    const winningTrades = closedPositions.filter(p => p.pnl && p.pnl.gt(0));
    const losingTrades = closedPositions.filter(p => p.pnl && p.pnl.lt(0));

    const totalReturn = this.balance.minus(this.initialBalance);
    const totalReturnPercent = totalReturn.div(this.initialBalance).mul(100);

    const averageWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, p) => sum.plus(p.pnl!), new Decimal(0)).div(winningTrades.length)
      : new Decimal(0);

    const averageLoss = losingTrades.length > 0
      ? losingTrades.reduce((sum, p) => sum.plus(p.pnl!.abs()), new Decimal(0)).div(losingTrades.length)
      : new Decimal(0);

    const profitFactor = averageLoss.gt(0) ? averageWin.div(averageLoss) : new Decimal(0);
    const winRate = closedPositions.length > 0 
      ? new Decimal(winningTrades.length).div(closedPositions.length).mul(100)
      : new Decimal(0);

    // Calculate Sharpe ratio (simplified)
    const sharpeRatio = this.calculateSharpeRatio(closedPositions);

    return {
      startDate: config.startDate,
      endDate: config.endDate,
      initialBalance: this.initialBalance,
      finalBalance: this.balance,
      totalReturn,
      totalReturnPercent,
      totalTrades: closedPositions.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      averageWin,
      averageLoss,
      profitFactor,
      sharpeRatio,
      maxDrawdown: this.maxDrawdown,
      trades: this.trades
    };
  }

  /**
   * Calculate Sharpe ratio
   */
  private calculateSharpeRatio(positions: Position[]): Decimal {
    if (positions.length < 2) {
      return new Decimal(0);
    }

    const returns = positions
      .filter(p => p.pnl)
      .map(p => p.pnlPercent!)
      .map(pct => pct.div(100));

    if (returns.length === 0) {
      return new Decimal(0);
    }

    const avgReturn = returns.reduce((sum, ret) => sum.plus(ret), new Decimal(0)).div(returns.length);
    
    const variance = returns.reduce((sum, ret) => {
      const diff = ret.minus(avgReturn);
      return sum.plus(diff.mul(diff));
    }, new Decimal(0)).div(returns.length);

    const stdDev = new Decimal(Math.sqrt(variance.toNumber()));
    
    return stdDev.gt(0) ? avgReturn.div(stdDev) : new Decimal(0);
  }

  /**
   * Generate backtest report
   */
  public generateReport(result: BacktestResult): string {
    const duration = (result.endDate.getTime() - result.startDate.getTime()) / (1000 * 60 * 60 * 24);
    
    return `
=================================================
           BACKTEST RESULTS REPORT
=================================================

Period: ${result.startDate.toDateString()} to ${result.endDate.toDateString()} (${duration.toFixed(0)} days)
Strategy: Mean Reversion on SOL

PERFORMANCE SUMMARY:
├─ Initial Balance:     $${result.initialBalance.toFixed(2)}
├─ Final Balance:       $${result.finalBalance.toFixed(2)}
├─ Total Return:        $${result.totalReturn.toFixed(2)}
├─ Return %:            ${result.totalReturnPercent.toFixed(2)}%
├─ Max Drawdown:        ${result.maxDrawdown.mul(100).toFixed(2)}%
└─ Sharpe Ratio:        ${result.sharpeRatio.toFixed(2)}

TRADING STATISTICS:
├─ Total Trades:        ${result.totalTrades}
├─ Winning Trades:      ${result.winningTrades}
├─ Losing Trades:       ${result.losingTrades}
├─ Win Rate:            ${result.winRate.toFixed(1)}%
├─ Average Win:         $${result.averageWin.toFixed(2)}
├─ Average Loss:        $${result.averageLoss.toFixed(2)}
└─ Profit Factor:       ${result.profitFactor.toFixed(2)}

RISK METRICS:
├─ Best Trade:          $${Math.max(...result.trades.map(t => t.side === 'SELL' ? 0 : 0))}
├─ Worst Trade:         $${Math.min(...result.trades.map(t => t.side === 'SELL' ? 0 : 0))}
└─ Max Drawdown:        ${result.maxDrawdown.mul(100).toFixed(2)}%

=================================================
    `;
  }
}

// CLI interface for running backtests
async function runBacktestCLI() {
  const backtester = new Backtester(10000); // $10,000 starting balance

  const backtestConfig: BacktestConfig = {
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate: new Date(),
    initialBalance: 10000,
    symbol: 'SOL',
    timeframe: '1h',
    strategy: 'MeanReversion'
  };

  try {
    const result = await backtester.runBacktest(backtestConfig);
    const report = backtester.generateReport(result);
    
    console.log(report);
    
    // Save results to file
    const fs = require('fs');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backtest-results/backtest-${timestamp}.json`;
    
    // Create directory if it doesn't exist
    if (!fs.existsSync('backtest-results')) {
      fs.mkdirSync('backtest-results', { recursive: true });
    }
    
    fs.writeFileSync(filename, JSON.stringify(result, null, 2));
    console.log(`Results saved to: ${filename}`);
    
  } catch (error) {
    console.error('Backtest failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runBacktestCLI();
}

export { Backtester, BacktestConfig };
