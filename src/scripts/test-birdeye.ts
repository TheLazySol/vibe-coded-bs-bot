#!/usr/bin/env tsx
/**
 * Test script to verify Birdeye API integration
 * Run with: pnpm tsx src/scripts/test-birdeye.ts
 */

import dotenv from 'dotenv';
import { createBirdeyeClient } from '../services/data/birdeyeClient';
import logger from '../utils/logger';

// Load environment variables
dotenv.config();

async function testBirdeyeIntegration() {
  console.log('🦅 Testing Birdeye API Integration...\n');

  // Check if API key is configured
  if (!process.env.BIRDEYE_API_KEY) {
    console.error('❌ BIRDEYE_API_KEY not found in environment variables');
    console.log('Please add your Birdeye API key to the .env file:');
    console.log('BIRDEYE_API_KEY=your_api_key_here\n');
    process.exit(1);
  }

  try {
    // Initialize Birdeye client
    console.log('📡 Initializing Birdeye client...');
    const birdeyeClient = createBirdeyeClient();
    console.log('✅ Birdeye client initialized successfully\n');

    // Test 1: Get SOL price
    console.log('🔍 Test 1: Getting SOL price...');
    const solPrice = await birdeyeClient.getSolPrice();
    console.log(`✅ SOL Price: $${solPrice.toFixed(2)}\n`);

    // Test 2: Get SOL market data
    console.log('📊 Test 2: Getting SOL market data...');
    const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';
    const marketData = await birdeyeClient.getTokenMarketData(SOL_ADDRESS);
    console.log('✅ SOL Market Data:');
    console.log(`   Price: $${marketData.price.toFixed(2)}`);
    console.log(`   Market Cap: $${(marketData.market_cap / 1e9).toFixed(2)}B`);
    console.log(`   Liquidity: $${(marketData.liquidity / 1e6).toFixed(2)}M`);
    console.log(`   Total Supply: ${(marketData.total_supply / 1e6).toFixed(2)}M SOL\n`);

    // Test 3: Get SOL trade data
    console.log('📈 Test 3: Getting SOL trade data...');
    const tradeData = await birdeyeClient.getTokenTradeData(SOL_ADDRESS, ['24h']);
    console.log('✅ SOL Trade Data (24h):');
    console.log(`   Volume: $${(tradeData.volume_24h_usd / 1e6).toFixed(2)}M`);
    console.log(`   Price Change: ${tradeData.price_change_24h_percent.toFixed(2)}%`);
    console.log(`   Trades: ${tradeData.trade_24h.toLocaleString()}`);
    console.log(`   Unique Wallets: ${tradeData.unique_wallet_24h.toLocaleString()}\n`);

    // Test 4: Search for USDC
    console.log('🔎 Test 4: Searching for USDC...');
    const searchResults = await birdeyeClient.search('USDC', {
      limit: 3,
      sortBy: 'volume_24h_usd'
    });
    
    if (searchResults.items.length > 0) {
      console.log('✅ USDC Search Results:');
      searchResults.items.forEach((item, index) => {
        if (item.type === 'token' && item.result.length > 0) {
          const token = item.result[0];
          console.log(`   ${index + 1}. ${token.name} (${token.symbol})`);
          console.log(`      Address: ${token.address}`);
          console.log(`      Price: $${token.price.toFixed(6)}`);
          console.log(`      24h Volume: $${(token.volume_24h_usd / 1e6).toFixed(2)}M`);
        }
      });
      console.log();
    }

    // Test 5: Get SOL metadata
    console.log('📋 Test 5: Getting SOL metadata...');
    const metadata = await birdeyeClient.getTokenMetadata(SOL_ADDRESS);
    console.log('✅ SOL Metadata:');
    console.log(`   Name: ${metadata.name}`);
    console.log(`   Symbol: ${metadata.symbol}`);
    console.log(`   Decimals: ${metadata.decimals}`);
    if (metadata.extensions.website) {
      console.log(`   Website: ${metadata.extensions.website}`);
    }
    if (metadata.extensions.twitter) {
      console.log(`   Twitter: ${metadata.extensions.twitter}`);
    }
    console.log();

    // Test 6: Get comprehensive token info
    console.log('🎯 Test 6: Getting comprehensive SOL info...');
    const comprehensiveInfo = await birdeyeClient.getComprehensiveTokenInfo(SOL_ADDRESS);
    console.log('✅ Comprehensive SOL Info:');
    console.log(`   Current Price: $${comprehensiveInfo.marketData.price.toFixed(2)}`);
    console.log(`   FDV: $${(comprehensiveInfo.marketData.fdv / 1e9).toFixed(2)}B`);
    console.log(`   1h Change: ${comprehensiveInfo.tradeData.price_change_1h_percent.toFixed(2)}%`);
    console.log(`   1h Volume: $${(comprehensiveInfo.tradeData.volume_1h_usd / 1e6).toFixed(2)}M`);
    console.log();

    console.log('🎉 All Birdeye API tests passed successfully!');
    console.log('Your Birdeye integration is working correctly.');

  } catch (error) {
    console.error('❌ Birdeye API test failed:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        console.log('\n💡 Tip: Check if your BIRDEYE_API_KEY is correct and active.');
      } else if (error.message.includes('429') || error.message.includes('rate limit')) {
        console.log('\n💡 Tip: You may have hit the rate limit. Try again in a few minutes.');
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        console.log('\n💡 Tip: Your API key may not have access to these endpoints.');
      }
    }
    
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testBirdeyeIntegration().catch(error => {
    logger.error('Test script error:', error);
    process.exit(1);
  });
}

export { testBirdeyeIntegration };
