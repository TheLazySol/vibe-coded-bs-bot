import dotenv from 'dotenv';
import { TradingConfig } from '../types';

// Load environment variables
dotenv.config();

export class Config {
  private static instance: Config;
  private config: TradingConfig;

  private constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  private loadConfig(): TradingConfig {
    return {
      // Solana Configuration
      solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      solanaNetwork: process.env.SOLANA_NETWORK || 'mainnet-beta',
      walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
      
      // Trading Settings
      tradingEnabled: process.env.TRADING_ENABLED === 'true',
      paperTrading: process.env.PAPER_TRADING !== 'false', // Default to true for safety
      maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '1000'),
      riskPerTrade: parseFloat(process.env.RISK_PER_TRADE || '0.02'),
      
      // Strategy Parameters
      maPeriod: parseInt(process.env.MA_PERIOD || '20'),
      stdDevMultiplier: parseFloat(process.env.STD_DEV_MULTIPLIER || '2'),
      minVolumeUsd: parseFloat(process.env.MIN_VOLUME_USD || '10000'),
      timeframe: process.env.TIMEFRAME || '15m',
      
      // Monitoring
      monitoringPort: parseInt(process.env.MONITORING_PORT || '3000'),
      logLevel: process.env.LOG_LEVEL || 'info',
      enableDashboard: process.env.ENABLE_DASHBOARD !== 'false'
    };
  }

  private validateConfig(): void {
    const errors: string[] = [];

    // Validate wallet configuration
    if (this.config.tradingEnabled && !this.config.paperTrading) {
      if (!this.config.walletPrivateKey) {
        errors.push('WALLET_PRIVATE_KEY is required for live trading');
      }
    }

    // Validate strategy parameters
    if (this.config.maPeriod < 2) {
      errors.push('MA_PERIOD must be at least 2');
    }

    if (this.config.stdDevMultiplier <= 0) {
      errors.push('STD_DEV_MULTIPLIER must be positive');
    }

    if (this.config.riskPerTrade > 0.1) {
      errors.push('RISK_PER_TRADE should not exceed 10% (0.1)');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  public get(): TradingConfig {
    return { ...this.config };
  }

  public update(updates: Partial<TradingConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfig();
  }

  public isLiveTrading(): boolean {
    return this.config.tradingEnabled && !this.config.paperTrading;
  }

  public isPaperTrading(): boolean {
    return this.config.tradingEnabled && this.config.paperTrading;
  }
}

export const config = Config.getInstance();
