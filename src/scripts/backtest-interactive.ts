#!/usr/bin/env tsx

import { Backtester, BacktestConfig } from '../backtest';

// Simple CLI prompt
function prompt(question: string): Promise<string> {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    readline.question(question, (answer: string) => {
      readline.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('🚀 Interactive Backtest for SOL Mean Reversion Strategy');
  console.log('='.repeat(60));
  console.log('📝 This will test your strategy with custom parameters\n');

  try {
    // Get user inputs
    const daysStr = await prompt('📅 How many days back to test? (default: 30): ');
    const days = parseInt(daysStr) || 30;
    
    const balanceStr = await prompt('💰 Starting balance in USD? (default: 10000): ');
    const startingBalance = parseInt(balanceStr) || 10000;
    
    const maPeriodStr = await prompt('📊 Moving Average period? (default: 20): ');
    const maPeriod = parseInt(maPeriodStr) || 20;
    
    const stdDevStr = await prompt('📈 Standard Deviation multiplier? (default: 2): ');
    const stdDevMultiplier = parseFloat(stdDevStr) || 2;
    
    const timeframeStr = await prompt('⏰ Timeframe? (1h/4h/1d, default: 1h): ');
    const timeframe = timeframeStr || '1h';

    console.log('\n⚙️  CONFIGURATION:');
    console.log(`📅 Period: ${days} days`);
    console.log(`💰 Starting Balance: $${startingBalance.toLocaleString()}`);
    console.log(`📊 MA Period: ${maPeriod}`);
    console.log(`📈 Std Dev Multiplier: ${stdDevMultiplier}x`);
    console.log(`⏰ Timeframe: ${timeframe}`);
    console.log('\n⏳ Running backtest...\n');

    // Create backtester with custom strategy
    const backtester = new Backtester(startingBalance);

    const config: BacktestConfig = {
      startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      endDate: new Date(),
      initialBalance: startingBalance,
      symbol: 'SOL',
      timeframe,
      strategy: 'MeanReversion-Custom'
    };

    const result = await backtester.runBacktest(config);
    const report = backtester.generateReport(result);
    
    console.log(report);
    
    // Performance analysis
    const returnPct = result.totalReturnPercent.toFixed(2);
    const dailyReturn = result.totalReturnPercent.div(days);
    const annualizedReturn = dailyReturn.mul(365);
    
    console.log('🎯 PERFORMANCE ANALYSIS:');
    console.log(`📈 Total Return: ${returnPct}%`);
    console.log(`📅 Daily Return: ${dailyReturn.toFixed(3)}%`);
    console.log(`📊 Annualized Return: ${annualizedReturn.toFixed(2)}%`);
    console.log(`🎯 Win Rate: ${result.winRate.toFixed(1)}%`);
    console.log(`📉 Max Drawdown: ${result.maxDrawdown.mul(100).toFixed(2)}%`);
    console.log(`⚡ Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}`);
    
    // Trading frequency analysis
    const tradesPerDay = result.totalTrades / days;
    console.log(`🔄 Trades per Day: ${tradesPerDay.toFixed(2)}`);
    
    // Save results with custom parameters
    const fs = require('fs');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backtest-results/custom-backtest-${days}d-ma${maPeriod}-std${stdDevMultiplier}-${timestamp}.json`;
    
    // Add configuration to results
    const enhancedResult = {
      ...result,
      configuration: {
        days,
        startingBalance,
        maPeriod,
        stdDevMultiplier,
        timeframe
      }
    };
    
    fs.writeFileSync(filename, JSON.stringify(enhancedResult, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
    
    // Parameter optimization suggestions
    console.log('\n💡 OPTIMIZATION SUGGESTIONS:');
    
    if (result.totalTrades < days / 10) {
      console.log('📉 Too few trades - consider:');
      console.log('   • Lower std dev multiplier (more sensitive)');
      console.log('   • Shorter MA period');
      console.log('   • Shorter timeframe');
    }
    
    if (result.totalTrades > days / 2) {
      console.log('📈 Too many trades - consider:');
      console.log('   • Higher std dev multiplier (less sensitive)');
      console.log('   • Longer MA period');
      console.log('   • Longer timeframe');
    }
    
    if (result.winRate.lt(40)) {
      console.log('🎯 Low win rate - consider:');
      console.log('   • Higher entry threshold');
      console.log('   • Longer MA period for trend confirmation');
      console.log('   • Adding volume filters');
    }
    
    if (result.maxDrawdown.gt(0.15)) {
      console.log('⚠️  High drawdown - consider:');
      console.log('   • Smaller position sizes');
      console.log('   • Tighter stop losses');
      console.log('   • More conservative entry criteria');
    }
    
    console.log('\n🔄 Want to test different parameters? Run the command again!');
    
  } catch (error) {
    console.error('❌ Backtest failed:', error);
    process.exit(1);
  }
}

main();
