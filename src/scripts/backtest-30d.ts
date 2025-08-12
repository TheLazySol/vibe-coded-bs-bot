#!/usr/bin/env tsx

import { Backtester, BacktestConfig } from '../backtest';

async function main() {
  console.log('🚀 Running 30-Day Backtest for SOL Mean Reversion Strategy');
  console.log('='.repeat(60));

  const backtester = new Backtester(10000); // $10,000 starting balance

  const config: BacktestConfig = {
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate: new Date(),
    initialBalance: 10000,
    symbol: 'SOL',
    timeframe: '1h',
    strategy: 'MeanReversion'
  };

  try {
    console.log(`📊 Testing period: ${config.startDate.toDateString()} to ${config.endDate.toDateString()}`);
    console.log(`💰 Initial balance: $${config.initialBalance.toLocaleString()}`);
    console.log('⏳ Running backtest... this may take a moment\n');

    const result = await backtester.runBacktest(config);
    const report = backtester.generateReport(result);
    
    console.log(report);
    
    // Performance summary
    const returnPct = result.totalReturnPercent.toFixed(2);
    const returnColor = result.totalReturn.gt(0) ? '🟢' : '🔴';
    
    console.log('📈 QUICK SUMMARY:');
    console.log(`${returnColor} Total Return: ${returnPct}% (${result.totalReturn.gt(0) ? '+' : ''}$${result.totalReturn.toFixed(2)})`);
    console.log(`🎯 Win Rate: ${result.winRate.toFixed(1)}%`);
    console.log(`📉 Max Drawdown: ${result.maxDrawdown.mul(100).toFixed(2)}%`);
    console.log(`🔄 Total Trades: ${result.totalTrades}`);
    
    // Save results
    const fs = require('fs');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backtest-results/30day-backtest-${timestamp}.json`;
    
    fs.writeFileSync(filename, JSON.stringify(result, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
    
    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    if (result.totalReturnPercent.gt(10)) {
      console.log('✅ Strategy shows strong performance');
    } else if (result.totalReturnPercent.gt(0)) {
      console.log('⚠️  Strategy shows modest gains - consider parameter optimization');
    } else {
      console.log('❌ Strategy shows losses - review parameters or market conditions');
    }
    
    if (result.winRate.lt(40)) {
      console.log('⚠️  Low win rate - consider tighter entry criteria');
    }
    
    if (result.maxDrawdown.gt(0.15)) {
      console.log('⚠️  High drawdown - consider smaller position sizes');
    }
    
  } catch (error) {
    console.error('❌ Backtest failed:', error);
    process.exit(1);
  }
}

main();
