#!/usr/bin/env tsx

import { Backtester, BacktestConfig } from '../backtest';

interface OptimizationResult {
  maPeriod: number;
  stdDevMultiplier: number;
  totalReturn: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
}

async function optimizeParameters() {
  console.log('🔬 Parameter Optimization for Mean Reversion Strategy');
  console.log('='.repeat(60));
  console.log('🎯 Testing multiple parameter combinations...\n');

  const results: OptimizationResult[] = [];
  
  // Parameter ranges to test
  const maPeriods = [10, 15, 20, 25, 30];
  const stdDevMultipliers = [1.5, 2.0, 2.5, 3.0];
  const startingBalance = 10000;
  const days = 30;
  
  const totalCombinations = maPeriods.length * stdDevMultipliers.length;
  let currentTest = 0;
  
  console.log(`📊 Testing ${totalCombinations} parameter combinations:`);
  console.log(`   • MA Periods: [${maPeriods.join(', ')}]`);
  console.log(`   • Std Dev Multipliers: [${stdDevMultipliers.join(', ')}]`);
  console.log(`   • Test Period: ${days} days\n`);
  
  for (const maPeriod of maPeriods) {
    for (const stdDevMultiplier of stdDevMultipliers) {
      currentTest++;
      const progress = ((currentTest / totalCombinations) * 100).toFixed(1);
      
      console.log(`⏳ [${currentTest}/${totalCombinations}] Testing MA:${maPeriod}, StdDev:${stdDevMultiplier}x (${progress}%)`);
      
      try {
        const backtester = new Backtester(startingBalance);
        
        const config: BacktestConfig = {
          startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          endDate: new Date(),
          initialBalance: startingBalance,
          symbol: 'SOL',
          timeframe: '1h',
          strategy: 'MeanReversion-Optimization'
        };
        
        const result = await backtester.runBacktest(config);
        
        results.push({
          maPeriod,
          stdDevMultiplier,
          totalReturn: result.totalReturnPercent.toNumber(),
          winRate: result.winRate.toNumber(),
          sharpeRatio: result.sharpeRatio.toNumber(),
          maxDrawdown: result.maxDrawdown.toNumber(),
          totalTrades: result.totalTrades
        });
        
      } catch (error) {
        console.log(`   ❌ Failed: ${error}`);
        results.push({
          maPeriod,
          stdDevMultiplier,
          totalReturn: -999,
          winRate: 0,
          sharpeRatio: -999,
          maxDrawdown: 1,
          totalTrades: 0
        });
      }
    }
  }
  
  console.log('\n📊 OPTIMIZATION RESULTS:');
  console.log('='.repeat(60));
  
  // Sort by total return
  const sortedByReturn = [...results].sort((a, b) => b.totalReturn - a.totalReturn);
  
  console.log('\n🏆 TOP 5 BY TOTAL RETURN:');
  console.log('Rank | MA | StdDev | Return% | WinRate% | Sharpe | MaxDD% | Trades');
  console.log('-'.repeat(70));
  
  sortedByReturn.slice(0, 5).forEach((result, index) => {
    const rank = (index + 1).toString().padStart(4);
    const ma = result.maPeriod.toString().padStart(2);
    const std = result.stdDevMultiplier.toFixed(1).padStart(6);
    const ret = result.totalReturn.toFixed(2).padStart(7);
    const win = result.winRate.toFixed(1).padStart(8);
    const sharpe = result.sharpeRatio.toFixed(2).padStart(6);
    const dd = (result.maxDrawdown * 100).toFixed(1).padStart(6);
    const trades = result.totalTrades.toString().padStart(6);
    
    console.log(`${rank} | ${ma} | ${std} | ${ret} | ${win} | ${sharpe} | ${dd} | ${trades}`);
  });
  
  // Sort by Sharpe ratio
  const sortedBySharpe = [...results].sort((a, b) => b.sharpeRatio - a.sharpeRatio);
  
  console.log('\n⚡ TOP 5 BY SHARPE RATIO:');
  console.log('Rank | MA | StdDev | Return% | WinRate% | Sharpe | MaxDD% | Trades');
  console.log('-'.repeat(70));
  
  sortedBySharpe.slice(0, 5).forEach((result, index) => {
    const rank = (index + 1).toString().padStart(4);
    const ma = result.maPeriod.toString().padStart(2);
    const std = result.stdDevMultiplier.toFixed(1).padStart(6);
    const ret = result.totalReturn.toFixed(2).padStart(7);
    const win = result.winRate.toFixed(1).padStart(8);
    const sharpe = result.sharpeRatio.toFixed(2).padStart(6);
    const dd = (result.maxDrawdown * 100).toFixed(1).padStart(6);
    const trades = result.totalTrades.toString().padStart(6);
    
    console.log(`${rank} | ${ma} | ${std} | ${ret} | ${win} | ${sharpe} | ${dd} | ${trades}`);
  });
  
  // Best overall (combining return and risk)
  const balanced = [...results]
    .filter(r => r.totalReturn > 0 && r.maxDrawdown < 0.2)
    .sort((a, b) => (b.totalReturn / (b.maxDrawdown + 0.01)) - (a.totalReturn / (a.maxDrawdown + 0.01)));
  
  if (balanced.length > 0) {
    console.log('\n🎯 BEST BALANCED STRATEGY (Return/Risk):');
    const best = balanced[0];
    console.log(`   📊 MA Period: ${best.maPeriod}`);
    console.log(`   📈 Std Dev Multiplier: ${best.stdDevMultiplier}x`);
    console.log(`   💰 Total Return: ${best.totalReturn.toFixed(2)}%`);
    console.log(`   🎯 Win Rate: ${best.winRate.toFixed(1)}%`);
    console.log(`   ⚡ Sharpe Ratio: ${best.sharpeRatio.toFixed(2)}`);
    console.log(`   📉 Max Drawdown: ${(best.maxDrawdown * 100).toFixed(1)}%`);
    console.log(`   🔄 Total Trades: ${best.totalTrades}`);
  }
  
  // Save results
  const fs = require('fs');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backtest-results/parameter-optimization-${timestamp}.json`;
  
  fs.writeFileSync(filename, JSON.stringify({
    timestamp: new Date().toISOString(),
    testPeriod: `${days} days`,
    totalCombinations,
    results: results,
    topByReturn: sortedByReturn.slice(0, 10),
    topBySharpe: sortedBySharpe.slice(0, 10),
    bestBalanced: balanced.slice(0, 5)
  }, null, 2));
  
  console.log(`\n💾 Full results saved to: ${filename}`);
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  
  if (balanced.length === 0) {
    console.log('❌ No profitable low-risk combinations found');
    console.log('   • Consider longer test periods');
    console.log('   • Adjust parameter ranges');
    console.log('   • Review market conditions during test period');
  } else {
    const best = balanced[0];
    console.log(`✅ Recommended parameters: MA=${best.maPeriod}, StdDev=${best.stdDevMultiplier}x`);
    console.log('   • Update your .env file with these values');
    console.log('   • Test with longer periods to confirm');
    console.log('   • Start with paper trading');
  }
}

// Run optimization
optimizeParameters().catch(console.error);
