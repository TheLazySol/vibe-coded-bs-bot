import Decimal from 'decimal.js';
import { SMA, RSI, EMA } from 'technicalindicators';
import { PriceData, TradingSignal, StrategyParams } from '../types';
import logger from '../utils/logger';
import { config } from '../config';

export class MeanReversionStrategy {
  private params: StrategyParams;
  
  constructor(params?: Partial<StrategyParams>) {
    const cfg = config.get();
    this.params = {
      maPeriod: params?.maPeriod ?? cfg.maPeriod,
      stdDevMultiplier: params?.stdDevMultiplier ?? cfg.stdDevMultiplier,
      entryThreshold: params?.entryThreshold ?? 0.5, // Z-score threshold for entry
      exitThreshold: params?.exitThreshold ?? 0.1,   // Z-score threshold for exit
      stopLossPercent: params?.stopLossPercent ?? 0.05, // 5% stop loss
      takeProfitPercent: params?.takeProfitPercent ?? 0.1, // 10% take profit
      minVolume: params?.minVolume ?? new Decimal(cfg.minVolumeUsd)
    };
  }

  /**
   * Analyze price data and generate trading signal
   */
  public analyze(priceHistory: PriceData[]): TradingSignal | null {
    if (priceHistory.length < this.params.maPeriod) {
      logger.debug(`Insufficient data for analysis. Need ${this.params.maPeriod} points, have ${priceHistory.length}`);
      return null;
    }

    const closes = priceHistory.map(p => p.close.toNumber());
    const currentPrice = new Decimal(closes[closes.length - 1]);
    
    // Calculate indicators
    const indicators = this.calculateIndicators(closes);
    
    if (!indicators) {
      return null;
    }

    // Calculate Z-score (how many standard deviations away from mean)
    const zScore = currentPrice.minus(indicators.sma).div(indicators.stdDev);
    
    // Generate signal based on mean reversion logic
    const signal = this.generateSignal(
      currentPrice,
      zScore,
      indicators,
      priceHistory[priceHistory.length - 1].volume
    );

    if (signal) {
      logger.signal('Trading signal generated', {
        type: signal.type,
        price: currentPrice.toString(),
        zScore: zScore.toString(),
        sma: indicators.sma.toString(),
        strength: signal.strength
      });
    }

    return signal;
  }

  /**
   * Calculate technical indicators
   */
  private calculateIndicators(closes: number[]): {
    sma: Decimal;
    upperBand: Decimal;
    lowerBand: Decimal;
    stdDev: Decimal;
    rsi?: number;
    ema?: Decimal;
  } | null {
    try {
      // Calculate Simple Moving Average
      const smaValues = SMA.calculate({
        period: this.params.maPeriod,
        values: closes
      });
      
      if (smaValues.length === 0) {
        return null;
      }
      
      const sma = new Decimal(smaValues[smaValues.length - 1]);
      
      // Calculate Standard Deviation
      const recentCloses = closes.slice(-this.params.maPeriod);
      const mean = recentCloses.reduce((a, b) => a + b, 0) / recentCloses.length;
      const variance = recentCloses.reduce((sum, val) => {
        return sum + Math.pow(val - mean, 2);
      }, 0) / recentCloses.length;
      const stdDev = new Decimal(Math.sqrt(variance));
      
      // Calculate Bollinger Bands
      const upperBand = sma.plus(stdDev.mul(this.params.stdDevMultiplier));
      const lowerBand = sma.minus(stdDev.mul(this.params.stdDevMultiplier));
      
      // Calculate RSI for additional confirmation
      let rsi: number | undefined;
      if (closes.length >= 14) {
        const rsiValues = RSI.calculate({
          period: 14,
          values: closes
        });
        if (rsiValues.length > 0) {
          rsi = rsiValues[rsiValues.length - 1];
        }
      }
      
      // Calculate EMA for trend confirmation
      let ema: Decimal | undefined;
      if (closes.length >= 20) {
        const emaValues = EMA.calculate({
          period: 20,
          values: closes
        });
        if (emaValues.length > 0) {
          ema = new Decimal(emaValues[emaValues.length - 1]);
        }
      }
      
      return {
        sma,
        upperBand,
        lowerBand,
        stdDev,
        rsi,
        ema
      };
    } catch (error) {
      logger.error('Error calculating indicators:', error);
      return null;
    }
  }

  /**
   * Generate trading signal based on indicators
   */
  private generateSignal(
    currentPrice: Decimal,
    zScore: Decimal,
    indicators: {
      sma: Decimal;
      upperBand: Decimal;
      lowerBand: Decimal;
      stdDev: Decimal;
      rsi?: number;
      ema?: Decimal;
    },
    volume: Decimal
  ): TradingSignal | null {
    // Check volume requirement
    if (volume.lt(this.params.minVolume)) {
      logger.debug('Volume too low for trading signal');
      return null;
    }

    const timestamp = Date.now();
    let signalType: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let strength = 0;
    let reason = '';

    // Mean Reversion Logic
    const zScoreAbs = zScore.abs();
    
    // Strong oversold condition (price significantly below mean)
    if (zScore.lt(-this.params.stdDevMultiplier)) {
      signalType = 'BUY';
      strength = Math.min(zScoreAbs.toNumber() / 3, 1); // Normalize strength
      reason = `Price ${zScoreAbs.toFixed(2)} std devs below mean - strong oversold`;
      
      // Confirm with RSI if available
      if (indicators.rsi && indicators.rsi < 30) {
        strength = Math.min(strength + 0.2, 1);
        reason += ', RSI oversold';
      }
    }
    // Strong overbought condition (price significantly above mean)
    else if (zScore.gt(this.params.stdDevMultiplier)) {
      signalType = 'SELL';
      strength = Math.min(zScoreAbs.toNumber() / 3, 1);
      reason = `Price ${zScoreAbs.toFixed(2)} std devs above mean - strong overbought`;
      
      // Confirm with RSI if available
      if (indicators.rsi && indicators.rsi > 70) {
        strength = Math.min(strength + 0.2, 1);
        reason += ', RSI overbought';
      }
    }
    // Moderate reversion opportunity
    else if (zScore.lt(-this.params.entryThreshold) && zScore.gt(-this.params.stdDevMultiplier)) {
      signalType = 'BUY';
      strength = Math.min(zScoreAbs.toNumber() / 2, 0.7);
      reason = `Price ${zScoreAbs.toFixed(2)} std devs below mean - moderate oversold`;
    }
    else if (zScore.gt(this.params.entryThreshold) && zScore.lt(this.params.stdDevMultiplier)) {
      signalType = 'SELL';
      strength = Math.min(zScoreAbs.toNumber() / 2, 0.7);
      reason = `Price ${zScoreAbs.toFixed(2)} std devs above mean - moderate overbought`;
    }
    // Exit zone (price returning to mean)
    else if (zScoreAbs.lt(this.params.exitThreshold)) {
      // This would trigger position exit if we have an open position
      signalType = 'HOLD';
      strength = 0.1;
      reason = 'Price near mean - neutral zone';
    }

    // Additional filters for false signals
    if (signalType !== 'HOLD') {
      // Check if price is at Bollinger Band extremes
      if (signalType === 'BUY' && currentPrice.lt(indicators.lowerBand)) {
        strength = Math.min(strength + 0.1, 1);
        reason += ', price below lower Bollinger Band';
      } else if (signalType === 'SELL' && currentPrice.gt(indicators.upperBand)) {
        strength = Math.min(strength + 0.1, 1);
        reason += ', price above upper Bollinger Band';
      }
      
      // Trend filter using EMA (optional)
      if (indicators.ema) {
        const trendBias = currentPrice.gt(indicators.ema) ? 'bullish' : 'bearish';
        if ((signalType === 'BUY' && trendBias === 'bearish') ||
            (signalType === 'SELL' && trendBias === 'bullish')) {
          // Signal aligns with mean reversion against trend
          strength = Math.min(strength + 0.05, 1);
        }
      }
    }

    // Only return signal if strength is significant
    if (strength < 0.3) {
      return null;
    }

    return {
      type: signalType,
      strength,
      price: currentPrice,
      timestamp,
      indicators: {
        sma: indicators.sma,
        upperBand: indicators.upperBand,
        lowerBand: indicators.lowerBand,
        stdDev: indicators.stdDev,
        zScore: zScore
      },
      reason
    };
  }

  /**
   * Calculate position size based on signal strength and risk parameters
   */
  public calculatePositionSize(
    signal: TradingSignal,
    availableBalance: Decimal,
    currentPrice: Decimal
  ): Decimal {
    const cfg = config.get();
    const maxPosition = new Decimal(cfg.maxPositionSize);
    const riskPerTrade = new Decimal(cfg.riskPerTrade);
    
    // Base position size on signal strength
    let positionSize = maxPosition.mul(signal.strength);
    
    // Apply risk management
    const riskAmount = availableBalance.mul(riskPerTrade);
    const stopLossDistance = currentPrice.mul(this.params.stopLossPercent);
    const riskBasedSize = riskAmount.div(stopLossDistance);
    
    // Use the smaller of the two for safety
    positionSize = Decimal.min(positionSize, riskBasedSize);
    
    // Ensure we don't exceed available balance
    const maxAffordable = availableBalance.div(currentPrice).mul(0.95); // Keep 5% buffer
    positionSize = Decimal.min(positionSize, maxAffordable);
    
    return positionSize;
  }

  /**
   * Calculate stop loss and take profit levels
   */
  public calculateRiskLevels(
    entryPrice: Decimal,
    signalType: 'BUY' | 'SELL'
  ): { stopLoss: Decimal; takeProfit: Decimal } {
    if (signalType === 'BUY') {
      return {
        stopLoss: entryPrice.mul(1 - this.params.stopLossPercent),
        takeProfit: entryPrice.mul(1 + this.params.takeProfitPercent)
      };
    } else {
      return {
        stopLoss: entryPrice.mul(1 + this.params.stopLossPercent),
        takeProfit: entryPrice.mul(1 - this.params.takeProfitPercent)
      };
    }
  }

  /**
   * Update strategy parameters
   */
  public updateParams(params: Partial<StrategyParams>): void {
    this.params = { ...this.params, ...params };
    logger.info('Strategy parameters updated', this.params);
  }

  /**
   * Get current strategy parameters
   */
  public getParams(): StrategyParams {
    return { ...this.params };
  }
}
