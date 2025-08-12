import Decimal from 'decimal.js';
import { Position, TradingSignal, RiskParams } from '../../types';
import logger from '../../utils/logger';
import { config } from '../../config';

export class RiskManager {
  private params: RiskParams;
  private dailyLoss: Decimal = new Decimal(0);
  private dailyLossResetTime: number = 0;
  private maxDrawdown: Decimal = new Decimal(0);
  private peakBalance: Decimal = new Decimal(0);
  
  constructor(params?: Partial<RiskParams>) {
    const cfg = config.get();
    this.params = {
      maxPositionSize: new Decimal(params?.maxPositionSize ?? cfg.maxPositionSize),
      maxOpenPositions: params?.maxOpenPositions ?? 3,
      riskPerTrade: new Decimal(params?.riskPerTrade ?? cfg.riskPerTrade),
      maxDailyLoss: new Decimal(params?.maxDailyLoss ?? cfg.maxPositionSize * 0.1), // 10% of max position
      maxDrawdown: new Decimal(params?.maxDrawdown ?? 0.2) // 20% max drawdown
    };
  }

  /**
   * Validate if a trade should be allowed based on risk parameters
   */
  public validateTrade(
    signal: TradingSignal,
    proposedSize: Decimal,
    currentBalance: Decimal,
    openPositions: Position[]
  ): { allowed: boolean; reason?: string; adjustedSize?: Decimal } {
    // Check if we've exceeded max open positions
    if (openPositions.length >= this.params.maxOpenPositions) {
      return {
        allowed: false,
        reason: `Maximum open positions (${this.params.maxOpenPositions}) reached`
      };
    }

    // Check daily loss limit
    if (this.isDailyLossLimitExceeded()) {
      return {
        allowed: false,
        reason: `Daily loss limit (${this.params.maxDailyLoss.toFixed(2)}) exceeded`
      };
    }

    // Check drawdown limit
    if (this.isDrawdownLimitExceeded(currentBalance)) {
      return {
        allowed: false,
        reason: `Maximum drawdown (${this.params.maxDrawdown.mul(100).toFixed(1)}%) exceeded`
      };
    }

    // Calculate total exposure
    const currentExposure = this.calculateTotalExposure(openPositions);
    const newExposure = currentExposure.plus(proposedSize.mul(signal.price));
    
    // Check if total exposure exceeds limits
    const maxExposure = currentBalance.mul(0.5); // Max 50% of balance in positions
    if (newExposure.gt(maxExposure)) {
      const availableExposure = maxExposure.minus(currentExposure);
      if (availableExposure.lte(0)) {
        return {
          allowed: false,
          reason: 'Maximum exposure limit reached'
        };
      }
      
      // Adjust position size
      const adjustedSize = availableExposure.div(signal.price);
      return {
        allowed: true,
        adjustedSize,
        reason: `Position size adjusted from ${proposedSize.toFixed(4)} to ${adjustedSize.toFixed(4)} due to exposure limits`
      };
    }

    // Calculate position size based on risk per trade
    const riskAmount = currentBalance.mul(this.params.riskPerTrade);
    const stopLossDistance = signal.price.mul(0.05); // 5% stop loss
    const riskBasedSize = riskAmount.div(stopLossDistance);
    
    // Use the smaller of proposed size and risk-based size
    let finalSize = Decimal.min(proposedSize, riskBasedSize);
    
    // Ensure size doesn't exceed max position size
    finalSize = Decimal.min(finalSize, this.params.maxPositionSize);
    
    // Check minimum position size (avoid dust trades)
    const minPositionValue = new Decimal(10); // $10 minimum
    const positionValue = finalSize.mul(signal.price);
    if (positionValue.lt(minPositionValue)) {
      return {
        allowed: false,
        reason: `Position value (${positionValue.toFixed(2)}) below minimum ($${minPositionValue})`
      };
    }

    // Validate signal strength
    if (signal.strength < 0.4) {
      return {
        allowed: false,
        reason: `Signal strength (${signal.strength.toFixed(2)}) too weak (minimum: 0.4)`
      };
    }

    // All checks passed
    if (!finalSize.eq(proposedSize)) {
      return {
        allowed: true,
        adjustedSize: finalSize,
        reason: `Position size adjusted for risk management`
      };
    }

    return { allowed: true };
  }

  /**
   * Calculate total exposure from open positions
   */
  private calculateTotalExposure(positions: Position[]): Decimal {
    return positions.reduce((total, pos) => {
      if (pos.status === 'OPEN') {
        const currentValue = pos.currentPrice 
          ? pos.size.mul(pos.currentPrice)
          : pos.size.mul(pos.entryPrice);
        return total.plus(currentValue);
      }
      return total;
    }, new Decimal(0));
  }

  /**
   * Update daily loss tracking
   */
  public updateDailyLoss(loss: Decimal): void {
    // Reset daily loss if it's a new day
    const dayStart = new Date().setHours(0, 0, 0, 0);
    
    if (this.dailyLossResetTime < dayStart) {
      this.dailyLoss = new Decimal(0);
      this.dailyLossResetTime = dayStart;
      logger.info('Daily loss counter reset');
    }
    
    this.dailyLoss = this.dailyLoss.plus(loss);
    logger.metric('Daily loss updated', {
      dailyLoss: this.dailyLoss.toFixed(2),
      limit: this.params.maxDailyLoss.toFixed(2)
    });
  }

  /**
   * Check if daily loss limit is exceeded
   */
  private isDailyLossLimitExceeded(): boolean {
    return this.dailyLoss.gt(this.params.maxDailyLoss);
  }

  /**
   * Update and check drawdown
   */
  public updateDrawdown(currentBalance: Decimal): void {
    // Update peak balance
    if (currentBalance.gt(this.peakBalance)) {
      this.peakBalance = currentBalance;
    }
    
    // Calculate current drawdown
    if (this.peakBalance.gt(0)) {
      const drawdown = this.peakBalance.minus(currentBalance).div(this.peakBalance);
      this.maxDrawdown = Decimal.max(this.maxDrawdown, drawdown);
      
      if (drawdown.gt(0.05)) { // Log if drawdown > 5%
        logger.warn('Significant drawdown detected', {
          current: drawdown.mul(100).toFixed(2) + '%',
          max: this.maxDrawdown.mul(100).toFixed(2) + '%',
          peakBalance: this.peakBalance.toFixed(2),
          currentBalance: currentBalance.toFixed(2)
        });
      }
    }
  }

  /**
   * Check if drawdown limit is exceeded
   */
  private isDrawdownLimitExceeded(currentBalance: Decimal): boolean {
    if (this.peakBalance.eq(0)) {
      this.peakBalance = currentBalance;
      return false;
    }
    
    const currentDrawdown = this.peakBalance.minus(currentBalance).div(this.peakBalance);
    return currentDrawdown.gt(this.params.maxDrawdown);
  }

  /**
   * Calculate stop loss for a position
   */
  public calculateStopLoss(
    entryPrice: Decimal,
    side: 'LONG' | 'SHORT',
    atr?: Decimal
  ): Decimal {
    // Use ATR-based stop if available, otherwise use percentage
    const stopDistance = atr 
      ? atr.mul(2) // 2x ATR stop
      : entryPrice.mul(0.05); // 5% stop
    
    if (side === 'LONG') {
      return entryPrice.minus(stopDistance);
    } else {
      return entryPrice.plus(stopDistance);
    }
  }

  /**
   * Calculate take profit for a position
   */
  public calculateTakeProfit(
    entryPrice: Decimal,
    side: 'LONG' | 'SHORT',
    riskRewardRatio: number = 2
  ): Decimal {
    const profitTarget = entryPrice.mul(0.05 * riskRewardRatio); // Risk-reward based
    
    if (side === 'LONG') {
      return entryPrice.plus(profitTarget);
    } else {
      return entryPrice.minus(profitTarget);
    }
  }

  /**
   * Check if position should be closed based on risk rules
   */
  public shouldClosePosition(position: Position): { 
    shouldClose: boolean; 
    reason?: string 
  } {
    if (!position.currentPrice) {
      return { shouldClose: false };
    }

    // Check stop loss
    if (position.stopLoss) {
      if (position.side === 'LONG' && position.currentPrice.lte(position.stopLoss)) {
        return { 
          shouldClose: true, 
          reason: 'Stop loss triggered' 
        };
      }
      if (position.side === 'SHORT' && position.currentPrice.gte(position.stopLoss)) {
        return { 
          shouldClose: true, 
          reason: 'Stop loss triggered' 
        };
      }
    }

    // Check take profit
    if (position.takeProfit) {
      if (position.side === 'LONG' && position.currentPrice.gte(position.takeProfit)) {
        return { 
          shouldClose: true, 
          reason: 'Take profit reached' 
        };
      }
      if (position.side === 'SHORT' && position.currentPrice.lte(position.takeProfit)) {
        return { 
          shouldClose: true, 
          reason: 'Take profit reached' 
        };
      }
    }

    // Check time-based exit (optional)
    const positionAge = Date.now() - position.entryTime;
    const maxPositionAge = 24 * 60 * 60 * 1000; // 24 hours
    if (positionAge > maxPositionAge) {
      return { 
        shouldClose: true, 
        reason: 'Position age exceeded 24 hours' 
      };
    }

    // Check for significant loss
    if (position.pnlPercent && position.pnlPercent.lt(-10)) {
      return { 
        shouldClose: true, 
        reason: 'Emergency stop - loss exceeded 10%' 
      };
    }

    return { shouldClose: false };
  }

  /**
   * Get risk metrics
   */
  public getRiskMetrics(): {
    dailyLoss: string;
    maxDrawdown: string;
    peakBalance: string;
    riskLimits: {
      maxPositionSize: string;
      maxOpenPositions: number;
      riskPerTrade: string;
      maxDailyLoss: string;
      maxDrawdown: string;
    };
  } {
    return {
      dailyLoss: this.dailyLoss.toFixed(2),
      maxDrawdown: this.maxDrawdown.mul(100).toFixed(2) + '%',
      peakBalance: this.peakBalance.toFixed(2),
      riskLimits: {
        maxPositionSize: this.params.maxPositionSize.toFixed(2),
        maxOpenPositions: this.params.maxOpenPositions,
        riskPerTrade: this.params.riskPerTrade.mul(100).toFixed(1) + '%',
        maxDailyLoss: this.params.maxDailyLoss.toFixed(2),
        maxDrawdown: this.params.maxDrawdown.mul(100).toFixed(1) + '%'
      }
    };
  }

  /**
   * Reset risk metrics (for new trading period)
   */
  public resetMetrics(): void {
    this.dailyLoss = new Decimal(0);
    this.dailyLossResetTime = Date.now();
    this.maxDrawdown = new Decimal(0);
    this.peakBalance = new Decimal(0);
    logger.info('Risk metrics reset');
  }
}
