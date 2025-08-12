import axios from 'axios';
import {
  VersionedTransaction
} from '@solana/web3.js';
import Decimal from 'decimal.js';
import { Trade, Position, TradingSignal } from '../../types';
import { WalletService } from './walletService';
import logger from '../../utils/logger';
import { config } from '../../config';

interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: any;
  priceImpactPct: string;
  routePlan: any[];
}

export class TradingService {
  private walletService: WalletService;
  private positions: Map<string, Position> = new Map();
  private trades: Trade[] = [];
  private readonly JUPITER_API_URL = 'https://quote-api.jup.ag/v6';
  private readonly SOL_MINT = 'So11111111111111111111111111111111111111112';
  private readonly USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  
  constructor(walletService: WalletService) {
    this.walletService = walletService;
  }

  /**
   * Execute a trade based on signal
   */
  public async executeTrade(
    signal: TradingSignal,
    amount: Decimal
  ): Promise<Trade | null> {
    const cfg = config.get();
    
    // Check if trading is enabled
    if (!cfg.tradingEnabled) {
      logger.warn('Trading is disabled');
      return null;
    }
    
    // Paper trading simulation
    if (cfg.paperTrading) {
      return this.simulateTrade(signal, amount);
    }
    
    // Live trading
    try {
      if (signal.type === 'BUY') {
        return await this.buySOL(amount);
      } else if (signal.type === 'SELL') {
        return await this.sellSOL(amount);
      }
    } catch (error) {
      logger.error('Trade execution failed:', error);
      return null;
    }
    
    return null;
  }

  /**
   * Buy SOL with USDC
   */
  private async buySOL(amountInUSDC: Decimal): Promise<Trade | null> {
    try {
      // Get quote from Jupiter
      const quote = await this.getJupiterQuote(
        this.USDC_MINT,
        this.SOL_MINT,
        amountInUSDC
      );
      
      if (!quote) {
        logger.error('Failed to get quote for SOL purchase');
        return null;
      }
      
      // Get swap transaction
      const transaction = await this.getJupiterSwapTransaction(quote);
      
      if (!transaction) {
        logger.error('Failed to get swap transaction');
        return null;
      }
      
      // Execute transaction
      const signature = await this.walletService.signAndSendTransaction(transaction);
      
      if (!signature) {
        throw new Error('Transaction failed');
      }
      
      const trade: Trade = {
        id: this.generateTradeId(),
        timestamp: Date.now(),
        side: 'BUY',
        price: new Decimal(quote.outAmount).div(new Decimal(quote.inAmount)),
        size: new Decimal(quote.outAmount).div(1e9), // SOL has 9 decimals
        fee: new Decimal(0), // Jupiter fees are included in the quote
        txHash: signature,
        status: 'SUCCESS'
      };
      
      this.trades.push(trade);
      logger.trade('SOL purchase executed', trade);
      
      return trade;
    } catch (error) {
      logger.error('Failed to buy SOL:', error);
      
      const failedTrade: Trade = {
        id: this.generateTradeId(),
        timestamp: Date.now(),
        side: 'BUY',
        price: new Decimal(0),
        size: amountInUSDC,
        fee: new Decimal(0),
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      this.trades.push(failedTrade);
      return failedTrade;
    }
  }

  /**
   * Sell SOL for USDC
   */
  private async sellSOL(amountInSOL: Decimal): Promise<Trade | null> {
    try {
      // Get quote from Jupiter
      const quote = await this.getJupiterQuote(
        this.SOL_MINT,
        this.USDC_MINT,
        amountInSOL
      );
      
      if (!quote) {
        logger.error('Failed to get quote for SOL sale');
        return null;
      }
      
      // Get swap transaction
      const transaction = await this.getJupiterSwapTransaction(quote);
      
      if (!transaction) {
        logger.error('Failed to get swap transaction');
        return null;
      }
      
      // Execute transaction
      const signature = await this.walletService.signAndSendTransaction(transaction);
      
      if (!signature) {
        throw new Error('Transaction failed');
      }
      
      const trade: Trade = {
        id: this.generateTradeId(),
        timestamp: Date.now(),
        side: 'SELL',
        price: new Decimal(quote.outAmount).div(new Decimal(quote.inAmount)),
        size: amountInSOL,
        fee: new Decimal(0),
        txHash: signature,
        status: 'SUCCESS'
      };
      
      this.trades.push(trade);
      logger.trade('SOL sale executed', trade);
      
      return trade;
    } catch (error) {
      logger.error('Failed to sell SOL:', error);
      
      const failedTrade: Trade = {
        id: this.generateTradeId(),
        timestamp: Date.now(),
        side: 'SELL',
        price: new Decimal(0),
        size: amountInSOL,
        fee: new Decimal(0),
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      this.trades.push(failedTrade);
      return failedTrade;
    }
  }

  /**
   * Get quote from Jupiter
   */
  private async getJupiterQuote(
    inputMint: string,
    outputMint: string,
    amount: Decimal
  ): Promise<JupiterQuote | null> {
    try {
      const params = {
        inputMint,
        outputMint,
        amount: amount.mul(inputMint === this.SOL_MINT ? 1e9 : 1e6).toFixed(0), // SOL: 9 decimals, USDC: 6 decimals
        slippageBps: 50, // 0.5% slippage
        onlyDirectRoutes: false,
        maxAccounts: 64
      };
      
      const response = await axios.get(`${this.JUPITER_API_URL}/quote`, { params });
      
      if (response.data) {
        logger.debug('Jupiter quote received', {
          inAmount: response.data.inAmount,
          outAmount: response.data.outAmount,
          priceImpact: response.data.priceImpactPct
        });
        return response.data;
      }
    } catch (error) {
      logger.error('Failed to get Jupiter quote:', error);
    }
    return null;
  }

  /**
   * Get swap transaction from Jupiter
   */
  private async getJupiterSwapTransaction(
    quote: JupiterQuote
  ): Promise<VersionedTransaction | null> {
    try {
      const walletPublicKey = this.walletService.getPublicKey();
      if (!walletPublicKey) {
        logger.error('Wallet not initialized');
        return null;
      }
      
      const response = await axios.post(`${this.JUPITER_API_URL}/swap`, {
        quoteResponse: quote,
        userPublicKey: walletPublicKey.toString(),
        wrapAndUnwrapSol: true,
        computeUnitPriceMicroLamports: 1000000, // Priority fee
        asLegacyTransaction: false
      });
      
      if (response.data && response.data.swapTransaction) {
        const swapTransactionBuf = Buffer.from(response.data.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        return transaction;
      }
    } catch (error) {
      logger.error('Failed to get swap transaction:', error);
    }
    return null;
  }

  /**
   * Simulate a trade for paper trading
   */
  private async simulateTrade(
    signal: TradingSignal,
    amount: Decimal
  ): Promise<Trade> {
    const trade: Trade = {
      id: this.generateTradeId(),
      timestamp: Date.now(),
      side: signal.type as 'BUY' | 'SELL',
      price: signal.price,
      size: amount,
      fee: amount.mul(0.0025), // Simulate 0.25% fee
      status: 'SUCCESS'
    };
    
    this.trades.push(trade);
    logger.trade(`[PAPER] Trade simulated`, trade);
    
    // Update position
    if (signal.type === 'BUY') {
      this.openPosition(trade);
    } else if (signal.type === 'SELL') {
      this.closePosition(trade);
    }
    
    return trade;
  }

  /**
   * Open a new position
   */
  private openPosition(trade: Trade): void {
    const position: Position = {
      id: this.generatePositionId(),
      entryPrice: trade.price,
      entryTime: trade.timestamp,
      size: trade.size,
      side: 'LONG',
      status: 'OPEN'
    };
    
    this.positions.set(position.id, position);
    logger.info('Position opened', position);
  }

  /**
   * Close an existing position
   */
  private closePosition(trade: Trade): void {
    // Find open position to close
    const openPosition = Array.from(this.positions.values()).find(
      p => p.status === 'OPEN'
    );
    
    if (openPosition) {
      openPosition.status = 'CLOSED';
      openPosition.currentPrice = trade.price;
      
      // Calculate PnL
      const entryValue = openPosition.entryPrice.mul(openPosition.size);
      const exitValue = trade.price.mul(openPosition.size);
      openPosition.pnl = exitValue.minus(entryValue);
      openPosition.pnlPercent = openPosition.pnl.div(entryValue).mul(100);
      
      logger.info('Position closed', {
        id: openPosition.id,
        pnl: openPosition.pnl.toString(),
        pnlPercent: openPosition.pnlPercent.toString()
      });
    }
  }

  /**
   * Get current open positions
   */
  public getOpenPositions(): Position[] {
    return Array.from(this.positions.values()).filter(p => p.status === 'OPEN');
  }

  /**
   * Get all positions
   */
  public getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get trade history
   */
  public getTradeHistory(limit?: number): Trade[] {
    if (limit) {
      return this.trades.slice(-limit);
    }
    return [...this.trades];
  }

  /**
   * Calculate portfolio statistics
   */
  public getPortfolioStats(): {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnL: string;
    averagePnL: string;
  } {
    const closedPositions = Array.from(this.positions.values()).filter(
      p => p.status === 'CLOSED' && p.pnl
    );
    
    const winningTrades = closedPositions.filter(p => p.pnl!.gt(0));
    const losingTrades = closedPositions.filter(p => p.pnl!.lt(0));
    
    const totalPnL = closedPositions.reduce(
      (sum, p) => sum.plus(p.pnl || 0),
      new Decimal(0)
    );
    
    const averagePnL = closedPositions.length > 0
      ? totalPnL.div(closedPositions.length)
      : new Decimal(0);
    
    return {
      totalTrades: closedPositions.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: closedPositions.length > 0
        ? (winningTrades.length / closedPositions.length) * 100
        : 0,
      totalPnL: totalPnL.toFixed(2),
      averagePnL: averagePnL.toFixed(2)
    };
  }

  /**
   * Generate unique trade ID
   */
  private generateTradeId(): string {
    return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique position ID
   */
  private generatePositionId(): string {
    return `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
