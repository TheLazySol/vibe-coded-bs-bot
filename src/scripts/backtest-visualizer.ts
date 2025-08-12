#!/usr/bin/env tsx

import { Backtester, BacktestConfig } from '../backtest';
import express from 'express';
import { Server } from 'socket.io';
import http from 'http';

interface VisualizationData {
  timestamp: number;
  price: number;
  balance: number;
  signal?: 'BUY' | 'SELL' | 'HOLD';
  sma: number;
  upperBand: number;
  lowerBand: number;
  position?: 'OPEN' | 'CLOSED';
  trades: number;
}

class BacktestVisualizer {
  private app: express.Express;
  private server: http.Server;
  private io: Server;
  private port: number = 3001;
  private data: VisualizationData[] = [];

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server, {
      cors: { origin: '*', methods: ['GET', 'POST'] }
    });
    this.setupRoutes();
    this.setupSocketIO();
  }

  private setupRoutes(): void {
    this.app.get('/', (_req, res) => {
      res.send(this.getVisualizationHTML());
    });

    this.app.get('/api/data', (_req, res) => {
      res.json(this.data);
    });
  }

  private setupSocketIO(): void {
    this.io.on('connection', (socket) => {
      console.log('📱 Visualization client connected');
      socket.emit('initial_data', this.data);
      
      socket.on('disconnect', () => {
        console.log('📱 Client disconnected');
      });
    });
  }

  public start(): void {
    this.server.listen(this.port, () => {
      console.log(`🎨 Backtest Visualizer running at http://localhost:${this.port}`);
      console.log('📊 Open this URL to see real-time backtesting visualization');
    });
  }

  public addDataPoint(data: VisualizationData): void {
    this.data.push(data);
    this.io.emit('new_data', data);
    
    // Keep only last 500 points for performance
    if (this.data.length > 500) {
      this.data = this.data.slice(-500);
    }
  }

  public updateProgress(progress: number, currentBalance: number): void {
    this.io.emit('progress', { progress, currentBalance });
  }

  public complete(results: any): void {
    this.io.emit('complete', results);
  }

  private getVisualizationHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Backtest Visualizer</title>
    <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #0a0e1a; color: #e0e0e0; 
        }
        .header {
            background: #1a1a2e; padding: 20px; border-bottom: 2px solid #9945FF;
            display: flex; justify-content: space-between; align-items: center;
        }
        .header h1 {
            background: linear-gradient(90deg, #9945FF, #14F195);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .status { display: flex; gap: 20px; align-items: center; }
        .progress-bar {
            width: 200px; height: 20px; background: #333;
            border-radius: 10px; overflow: hidden;
        }
        .progress-fill {
            height: 100%; background: linear-gradient(90deg, #9945FF, #14F195);
            width: 0%; transition: width 0.3s;
        }
        .container { padding: 20px; max-width: 1400px; margin: 0 auto; }
        .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 20px; }
        .card {
            background: rgba(26, 26, 62, 0.6); border: 1px solid rgba(153, 69, 255, 0.3);
            border-radius: 12px; padding: 20px; backdrop-filter: blur(10px);
        }
        .chart-container { position: relative; height: 400px; }
        .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .metric { text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
        .metric-label { font-size: 12px; color: #888; text-transform: uppercase; }
        .positive { color: #14F195; }
        .negative { color: #ff4444; }
        .neutral { color: #ffa500; }
        .log { background: #1a1a1a; padding: 15px; border-radius: 8px; max-height: 200px; overflow-y: auto; }
        .log-entry { font-size: 12px; margin-bottom: 5px; font-family: monospace; }
        .signal-buy { color: #14F195; }
        .signal-sell { color: #ff4444; }
        .signal-hold { color: #ffa500; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔬 Backtest Visualizer</h1>
        <div class="status">
            <div>
                <div style="font-size: 12px; color: #888;">Progress</div>
                <div class="progress-bar">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
            </div>
            <div>
                <div style="font-size: 12px; color: #888;">Balance</div>
                <div id="currentBalance" style="font-size: 18px; font-weight: bold;">$10,000</div>
            </div>
        </div>
    </div>

    <div class="container">
        <div class="grid">
            <div class="card">
                <h3>📈 Price & Strategy</h3>
                <div class="chart-container">
                    <canvas id="priceChart"></canvas>
                </div>
            </div>
            
            <div class="card">
                <h3>📊 Live Metrics</h3>
                <div class="metrics">
                    <div class="metric">
                        <div class="metric-value" id="totalReturn">0%</div>
                        <div class="metric-label">Total Return</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value" id="totalTrades">0</div>
                        <div class="metric-label">Total Trades</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value" id="winRate">0%</div>
                        <div class="metric-label">Win Rate</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value" id="currentPrice">$0</div>
                        <div class="metric-label">Current Price</div>
                    </div>
                </div>
                
                <h4 style="margin-top: 20px; margin-bottom: 10px;">🚨 Live Signals</h4>
                <div class="log" id="signalLog">
                    <div class="log-entry">Waiting for backtest to start...</div>
                </div>
            </div>
        </div>
        
        <div class="card">
            <h3>💰 Balance History</h3>
            <div class="chart-container">
                <canvas id="balanceChart"></canvas>
            </div>
        </div>
    </div>

    <script>
        const socket = io();
        let priceChart, balanceChart;
        let initialBalance = 10000;
        let totalTrades = 0;
        let winningTrades = 0;
        
        // Initialize charts
        function initCharts() {
            const priceCtx = document.getElementById('priceChart').getContext('2d');
            priceChart = new Chart(priceCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'SOL Price',
                            data: [],
                            borderColor: '#14F195',
                            backgroundColor: 'rgba(20, 241, 149, 0.1)',
                            borderWidth: 2,
                            tension: 0.1,
                            yAxisID: 'y'
                        },
                        {
                            label: 'SMA',
                            data: [],
                            borderColor: '#9945FF',
                            borderWidth: 1,
                            tension: 0.1,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Upper Band',
                            data: [],
                            borderColor: 'rgba(255, 68, 68, 0.5)',
                            borderWidth: 1,
                            borderDash: [5, 5],
                            tension: 0.1,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Lower Band',
                            data: [],
                            borderColor: 'rgba(255, 68, 68, 0.5)',
                            borderWidth: 1,
                            borderDash: [5, 5],
                            tension: 0.1,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { intersect: false },
                    scales: {
                        y: { type: 'linear', display: true, position: 'left' }
                    },
                    plugins: { legend: { display: true } }
                }
            });

            const balanceCtx = document.getElementById('balanceChart').getContext('2d');
            balanceChart = new Chart(balanceCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Portfolio Balance',
                        data: [],
                        borderColor: '#ffa500',
                        backgroundColor: 'rgba(255, 165, 0, 0.1)',
                        borderWidth: 2,
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { 
                            beginAtZero: false,
                            ticks: { 
                                callback: function(value) { 
                                    return '$' + value.toLocaleString(); 
                                } 
                            } 
                        }
                    }
                }
            });
        }

        // Socket event handlers
        socket.on('connect', () => {
            console.log('Connected to backtest visualizer');
        });

        socket.on('initial_data', (data) => {
            data.forEach(point => addDataPoint(point));
        });

        socket.on('new_data', (data) => {
            addDataPoint(data);
        });

        socket.on('progress', (data) => {
            document.getElementById('progressFill').style.width = data.progress + '%';
            document.getElementById('currentBalance').textContent = '$' + data.currentBalance.toLocaleString();
            
            const returnPct = ((data.currentBalance - initialBalance) / initialBalance * 100).toFixed(2);
            const returnEl = document.getElementById('totalReturn');
            returnEl.textContent = returnPct + '%';
            returnEl.className = 'metric-value ' + (data.currentBalance >= initialBalance ? 'positive' : 'negative');
        });

        socket.on('complete', (results) => {
            addSignalLog('🎉 Backtest Complete!', 'neutral');
            addSignalLog(\`Final Return: \${results.totalReturnPercent.toFixed(2)}%\`, 
                results.totalReturn > 0 ? 'positive' : 'negative');
        });

        function addDataPoint(point) {
            const time = new Date(point.timestamp).toLocaleTimeString();
            
            // Update price chart
            priceChart.data.labels.push(time);
            priceChart.data.datasets[0].data.push(point.price);
            priceChart.data.datasets[1].data.push(point.sma);
            priceChart.data.datasets[2].data.push(point.upperBand);
            priceChart.data.datasets[3].data.push(point.lowerBand);
            
            // Keep only last 50 points
            if (priceChart.data.labels.length > 50) {
                priceChart.data.labels.shift();
                priceChart.data.datasets.forEach(dataset => dataset.data.shift());
            }
            priceChart.update('none');
            
            // Update balance chart
            balanceChart.data.labels.push(time);
            balanceChart.data.datasets[0].data.push(point.balance);
            
            if (balanceChart.data.labels.length > 50) {
                balanceChart.data.labels.shift();
                balanceChart.data.datasets[0].data.shift();
            }
            balanceChart.update('none');
            
            // Update metrics
            document.getElementById('currentPrice').textContent = '$' + point.price.toFixed(2);
            document.getElementById('totalTrades').textContent = point.trades;
            
            // Add signal to log
            if (point.signal && point.signal !== 'HOLD') {
                addSignalLog(\`\${point.signal} @ $\${point.price.toFixed(2)}\`, 
                    point.signal === 'BUY' ? 'signal-buy' : 'signal-sell');
            }
        }

        function addSignalLog(message, className = '') {
            const log = document.getElementById('signalLog');
            const entry = document.createElement('div');
            entry.className = 'log-entry ' + className;
            entry.textContent = new Date().toLocaleTimeString() + ' - ' + message;
            log.appendChild(entry);
            log.scrollTop = log.scrollHeight;
            
            // Keep only last 20 entries
            while (log.children.length > 20) {
                log.removeChild(log.firstChild);
            }
        }

        // Initialize
        initCharts();
    </script>
</body>
</html>`;
  }
}

// Enhanced backtester with visualization
class VisualBacktester extends Backtester {
  private visualizer: BacktestVisualizer;
  private dataPointCount = 0;

  constructor(initialBalance: number = 10000) {
    super(initialBalance);
    this.visualizer = new BacktestVisualizer();
  }

  public async runVisualBacktest(config: BacktestConfig): Promise<any> {
    console.log('🎨 Starting Visual Backtest...');
    this.visualizer.start();
    
    // Give user time to open browser
    console.log('📱 Open http://localhost:3001 to see real-time visualization');
    console.log('⏳ Starting backtest in 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return super.runBacktest(config);
  }

  // Override to add visualization hooks
  protected onDataPoint(priceData: any, balance: number, signal: any, indicators: any): void {
    this.dataPointCount++;
    
    const visualData = {
      timestamp: priceData.timestamp,
      price: priceData.close.toNumber(),
      balance: balance,
      signal: signal?.type,
      sma: indicators.sma?.toNumber() || 0,
      upperBand: indicators.upperBand?.toNumber() || 0,
      lowerBand: indicators.lowerBand?.toNumber() || 0,
      trades: this.dataPointCount
    };
    
    this.visualizer.addDataPoint(visualData);
    
    // Update progress every 10 data points
    if (this.dataPointCount % 10 === 0) {
      this.visualizer.updateProgress(50, balance); // Approximate progress
    }
  }

  protected onComplete(results: any): void {
    this.visualizer.complete(results);
    console.log('🎨 Visualization complete - browser window will stay open');
  }
}

// CLI for visual backtest
async function runVisualBacktest() {
  const backtester = new VisualBacktester(10000);
  
  const config: BacktestConfig = {
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate: new Date(),
    initialBalance: 10000,
    symbol: 'SOL',
    timeframe: '1h',
    strategy: 'MeanReversion-Visual'
  };
  
  try {
    await backtester.runVisualBacktest(config);
  } catch (error) {
    console.error('Visual backtest failed:', error);
  }
}

if (require.main === module) {
  runVisualBacktest();
}

export { VisualBacktester, BacktestVisualizer };
