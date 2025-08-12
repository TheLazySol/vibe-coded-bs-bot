import Decimal from 'decimal.js';

export interface TradingConfig {
  // Solana Configuration
  solanaRpcUrl: string;
  solanaNetwork: string;
  walletPrivateKey?: string;
  
  // Trading Settings
  tradingEnabled: boolean;
  paperTrading: boolean;
  maxPositionSize: number;
  riskPerTrade: number;
  
  // Strategy Parameters
  maPeriod: number;
  stdDevMultiplier: number;
  minVolumeUsd: number;
  timeframe: string;
  
  // Monitoring
  monitoringPort: number;
  logLevel: string;
  enableDashboard: boolean;
}

export interface PriceData {
  timestamp: number;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
  source: string;
}

export interface TradingSignal {
  type: 'BUY' | 'SELL' | 'HOLD';
  strength: number; // 0-1 confidence score
  price: Decimal;
  timestamp: number;
  indicators: {
    sma: Decimal;
    upperBand: Decimal;
    lowerBand: Decimal;
    stdDev: Decimal;
    zScore: Decimal;
  };
  reason: string;
}

export interface Position {
  id: string;
  entryPrice: Decimal;
  entryTime: number;
  size: Decimal;
  side: 'LONG' | 'SHORT';
  stopLoss?: Decimal;
  takeProfit?: Decimal;
  currentPrice?: Decimal;
  pnl?: Decimal;
  pnlPercent?: Decimal;
  status: 'OPEN' | 'CLOSED' | 'PENDING';
}

export interface Trade {
  id: string;
  timestamp: number;
  side: 'BUY' | 'SELL';
  price: Decimal;
  size: Decimal;
  fee: Decimal;
  txHash?: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  error?: string;
}

export interface MarketData {
  symbol: string;
  price: Decimal;
  volume24h: Decimal;
  change24h: Decimal;
  marketCap: Decimal;
  bid: Decimal;
  ask: Decimal;
  spread: Decimal;
  lastUpdate: number;
}

export interface BacktestResult {
  startDate: Date;
  endDate: Date;
  initialBalance: Decimal;
  finalBalance: Decimal;
  totalReturn: Decimal;
  totalReturnPercent: Decimal;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: Decimal;
  averageWin: Decimal;
  averageLoss: Decimal;
  profitFactor: Decimal;
  sharpeRatio: Decimal;
  maxDrawdown: Decimal;
  trades: Trade[];
}

export interface StrategyParams {
  maPeriod: number;
  stdDevMultiplier: number;
  entryThreshold: number;
  exitThreshold: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  minVolume: Decimal;
}

export interface RiskParams {
  maxPositionSize: Decimal;
  maxOpenPositions: number;
  riskPerTrade: Decimal;
  maxDailyLoss: Decimal;
  maxDrawdown: Decimal;
}

// ============================================================================
// Birdeye API Types
// ============================================================================

export interface BirdeyeApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface BirdeyeTokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  icon?: string;
  is_scaled_ui_token?: boolean;
  multiplier?: number;
}

export interface BirdeyeTokenMarketData {
  address: string;
  price: number;
  liquidity: number;
  total_supply: number;
  circulating_supply: number;
  market_cap: number;
  fdv: number;
  is_scaled_ui_token?: boolean;
  multiplier?: number;
}

export interface BirdeyeTokenTradeData {
  address: string;
  liquidity: number;
  last_trade_unix_time: number;
  last_trade_human_time: string;
  price: number;
  
  // Price changes for different timeframes
  history_30m_price: number;
  price_change_30m_percent: number;
  history_1h_price: number;
  price_change_1h_percent: number;
  history_2h_price: number;
  price_change_2h_percent: number;
  history_4h_price: number;
  price_change_4h_percent: number;
  history_8h_price: number;
  price_change_8h_percent: number;
  history_24h_price: number;
  price_change_24h_percent: number;
  
  // Unique wallets
  unique_wallet_30m: number;
  unique_wallet_1h: number;
  unique_wallet_2h: number;
  unique_wallet_4h: number;
  unique_wallet_8h: number;
  unique_wallet_24h: number;
  
  // Trade counts
  trade_30m: number;
  trade_1h: number;
  trade_2h: number;
  trade_4h: number;
  trade_8h: number;
  trade_24h: number;
  
  // Volume data
  volume_30m: number;
  volume_30m_usd: number;
  volume_1h: number;
  volume_1h_usd: number;
  volume_2h: number;
  volume_2h_usd: number;
  volume_4h: number;
  volume_4h_usd: number;
  volume_8h: number;
  volume_8h_usd: number;
  volume_24h: number;
  volume_24h_usd: number;
  
  // Buy/Sell data
  buy_30m: number;
  sell_30m: number;
  buy_1h: number;
  sell_1h: number;
  buy_2h: number;
  sell_2h: number;
  buy_4h: number;
  sell_4h: number;
  buy_8h: number;
  sell_8h: number;
  buy_24h: number;
  sell_24h: number;
  
  is_scaled_ui_token?: boolean;
  multiplier?: number;
}

export interface BirdeyePairOverview {
  address: string;
  base: BirdeyeTokenInfo;
  quote: BirdeyeTokenInfo;
  name: string;
  source: string;
  created_at: string;
  liquidity: number;
  liquidity_change_percentage_24h?: number;
  price: number;
  trade_24h: number;
  trade_24h_change_percent: number;
  trade_history_24h: number;
  unique_wallet_24h: number;
  unique_wallet_24h_change_percent: number;
  volume_24h: number;
  volume_24h_base: number;
  volume_24h_quote: number;
  volume_24h_change_percentage_24h?: number;
  volume_12h: number;
  volume_12h_base: number;
  volume_12h_quote: number;
  volume_1h: number;
  volume_1h_base: number;
  volume_1h_quote: number;
  volume_2h: number;
  volume_2h_base: number;
  volume_2h_quote: number;
}

export interface BirdeyeOHLCVData {
  address: string;
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
  type: string; // timeframe
  unixTime: number;
  currency?: string;
}

export interface BirdeyeOHLCVResponse {
  items: BirdeyeOHLCVData[];
}

export interface BirdeyeSearchResultToken {
  name: string;
  symbol: string;
  address: string;
  network: string;
  decimals: number;
  verified: boolean;
  fdv: number;
  market_cap: number;
  liquidity: number;
  price: number;
  price_change_24h_percent: number;
  volume_24h_usd: number;
  trade_24h: number;
  unique_wallet_24h: number;
  last_trade_unix_time: number;
  last_trade_human_time: string;
  updated_time: number;
  creation_time: string;
  is_scaled_ui_token?: boolean;
  multiplier?: number;
}

export interface BirdeyeSearchResult {
  type: 'token' | 'market';
  result: BirdeyeSearchResultToken[] | any[];
}

export interface BirdeyeSearchResponse {
  items: BirdeyeSearchResult[];
}

export interface BirdeyeTokenMetadata {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  extensions: {
    coingecko_id?: string;
    website?: string;
    twitter?: string;
    discord?: string;
    medium?: string;
    telegram?: string;
    description?: string;
  };
  logo_uri?: string;
}

// Birdeye Client Configuration
export interface BirdeyeConfig {
  apiKey: string;
  baseUrl: string;
  chain: string;
  rateLimitMs: number;
  maxRetries: number;
  timeoutMs: number;
}
