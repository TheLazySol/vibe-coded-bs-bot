#!/usr/bin/env tsx

import { Backtester, BacktestConfig } from '../backtest';

async function main() {
  console.log('🚀 Running 90-Day Backtest for SOL Mean Reversion Strategy');
  console.log('='.repeat(60));

  const backtester = new Backtester(10000); // $10,000 starting balance

  const config: BacktestConfig = {
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
    endDate: new Date(),
    initialBalance: 10000,
    symbol: 'SOL',
    timeframe: '4h',
    strategy: 'MeanReversion'
  };

  try {
    console.log(`📊 Testing period: ${config.startDate.toDateString()} to ${config.endDate.toDateString()}`);
    console.log(`💰 Initial balance: $${config.initialBalance.toLocaleString()}`);
    console.log('⏳ Running extended backtest... this may take a few moments\n');

    const result = await backtester.runBacktest(config);
    const report = backtester.generateReport(result);
    
    console.log(report);
    
    // Extended analysis for 90-day backtest
    const daysInPeriod = 90;
    const annualizedReturn = result.totalReturnPercent.mul(365).div(daysInPeriod);
    
    console.log('📈 EXTENDED ANALYSIS:');
    console.log(`📅 Annualized Return: ${annualizedReturn.toFixed(2)}%`);
    console.log(`📊 Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}`);
    console.log(`💸 Profit Factor: ${result.profitFactor.toFixed(2)}`);
    
    const avgTradesPerWeek = (result.totalTrades / daysInPeriod) * 7;
    console.log(`🔄 Avg Trades/Week: ${avgTradesPerWeek.toFixed(1)}`);
    
    // Save results
    const fs = require('fs');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backtest-results/90day-backtest-${timestamp}.json`;
    
    fs.writeFileSync(filename, JSON.stringify(result, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
    
    // Strategy assessment
    console.log('\n🎯 STRATEGY ASSESSMENT:');
    if (result.sharpeRatio.gt(1)) {
      console.log('✅ Excellent risk-adjusted returns');
    } else if (result.sharpeRatio.gt(0.5)) {
      console.log('⚠️  Good risk-adjusted returns');
    } else {
      console.log('❌ Poor risk-adjusted returns');
    }
    
    if (result.maxDrawdown.lt(0.1)) {
      console.log('✅ Low risk strategy');
    } else if (result.maxDrawdown.lt(0.2)) {
      console.log('⚠️  Moderate risk strategy');
    } else {
      console.log('❌ High risk strategy');
    }
    
  } catch (error) {
    console.error('❌ Backtest failed:', error);
    process.exit(1);
  }
}

main();
