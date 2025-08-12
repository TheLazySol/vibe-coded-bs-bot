import express, { Express, Request, Response } from 'express';
import { Server } from 'socket.io';
import http from 'http';
import path from 'path';
import { config } from '../../config';
import logger from '../../utils/logger';

export class Dashboard {
  private app: Express;
  private server: http.Server;
  private io: Server;
  private port: number;
  private metrics: any = {
    price: 0,
    volume24h: 0,
    change24h: 0,
    positions: [],
    trades: [],
    signals: [],
    performance: {},
    riskMetrics: {}
  };

  constructor(port?: number) {
    this.port = port || config.get().monitoringPort;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    
    this.setupRoutes();
    this.setupSocketIO();
  }

  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    // Serve static files
    this.app.use(express.static(path.join(__dirname, '../../../public')));
    
    // API endpoints
    this.app.get('/api/metrics', (_req: Request, res: Response) => {
      res.json(this.metrics);
    });
    
    this.app.get('/api/config', (_req: Request, res: Response) => {
      const cfg = config.get();
      res.json({
        tradingEnabled: cfg.tradingEnabled,
        paperTrading: cfg.paperTrading,
        strategy: 'Mean Reversion',
        timeframe: cfg.timeframe,
        maPeriod: cfg.maPeriod,
        stdDevMultiplier: cfg.stdDevMultiplier
      });
    });
    
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });
    
    // Serve dashboard HTML
    this.app.get('/', (_req: Request, res: Response) => {
      res.send(this.getDashboardHTML());
    });
  }

  /**
   * Setup Socket.IO for real-time updates
   */
  private setupSocketIO(): void {
    this.io.on('connection', (socket) => {
      logger.debug('Dashboard client connected');
      
      // Send initial data
      socket.emit('metrics', this.metrics);
      
      socket.on('disconnect', () => {
        logger.debug('Dashboard client disconnected');
      });
    });
  }

  /**
   * Start the dashboard server
   */
  public start(): void {
    this.server.listen(this.port, () => {
      logger.info(`Dashboard running at http://localhost:${this.port}`);
    });
  }

  /**
   * Stop the dashboard server
   */
  public stop(): void {
    this.server.close();
    logger.info('Dashboard stopped');
  }

  /**
   * Update metrics
   */
  public updateMetrics(data: Partial<typeof this.metrics>): void {
    this.metrics = { ...this.metrics, ...data };
    this.io.emit('metrics', this.metrics);
  }

  /**
   * Add trade to history
   */
  public addTrade(trade: any): void {
    this.metrics.trades.unshift(trade);
    if (this.metrics.trades.length > 50) {
      this.metrics.trades = this.metrics.trades.slice(0, 50);
    }
    this.io.emit('trade', trade);
  }

  /**
   * Add signal to history
   */
  public addSignal(signal: any): void {
    this.metrics.signals.unshift(signal);
    if (this.metrics.signals.length > 50) {
      this.metrics.signals = this.metrics.signals.slice(0, 50);
    }
    this.io.emit('signal', signal);
  }

  /**
   * Get dashboard HTML
   */
  private getDashboardHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Solana Trading Bot Dashboard</title>
    <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%);
            color: #e0e0e0;
            min-height: 100vh;
        }
        
        .header {
            background: rgba(26, 26, 62, 0.8);
            padding: 20px;
            border-bottom: 2px solid #9945FF;
            backdrop-filter: blur(10px);
        }
        
        .header h1 {
            font-size: 28px;
            background: linear-gradient(90deg, #9945FF, #14F195);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
        }
        
        .status {
            display: flex;
            gap: 20px;
            font-size: 14px;
        }
        
        .status-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .status-indicator {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #14F195;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .card {
            background: rgba(26, 26, 62, 0.6);
            border: 1px solid rgba(153, 69, 255, 0.3);
            border-radius: 12px;
            padding: 20px;
            backdrop-filter: blur(10px);
        }
        
        .card h2 {
            font-size: 14px;
            color: #888;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .metric {
            font-size: 32px;
            font-weight: bold;
            color: #fff;
            margin-bottom: 5px;
        }
        
        .metric.positive {
            color: #14F195;
        }
        
        .metric.negative {
            color: #ff4444;
        }
        
        .change {
            font-size: 14px;
            color: #888;
        }
        
        .positions-table, .trades-table {
            width: 100%;
            margin-top: 10px;
        }
        
        .positions-table th, .trades-table th {
            text-align: left;
            padding: 10px;
            border-bottom: 1px solid rgba(153, 69, 255, 0.3);
            font-size: 12px;
            color: #888;
            text-transform: uppercase;
        }
        
        .positions-table td, .trades-table td {
            padding: 10px;
            border-bottom: 1px solid rgba(153, 69, 255, 0.1);
            font-size: 14px;
        }
        
        .chart-container {
            position: relative;
            height: 300px;
            margin-top: 20px;
        }
        
        .signal-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        
        .signal-badge.buy {
            background: rgba(20, 241, 149, 0.2);
            color: #14F195;
        }
        
        .signal-badge.sell {
            background: rgba(255, 68, 68, 0.2);
            color: #ff4444;
        }
        
        .signal-badge.hold {
            background: rgba(255, 165, 0, 0.2);
            color: #ffa500;
        }
        
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚡ Solana Trading Bot</h1>
        <div class="status">
            <div class="status-item">
                <div class="status-indicator"></div>
                <span id="connectionStatus">Connected</span>
            </div>
            <div class="status-item">
                <span id="tradingMode">Paper Trading</span>
            </div>
            <div class="status-item">
                <span id="strategy">Mean Reversion Strategy</span>
            </div>
        </div>
    </div>
    
    <div class="container">
        <div class="grid">
            <div class="card">
                <h2>SOL Price</h2>
                <div class="metric" id="price">$0.00</div>
                <div class="change" id="priceChange">0.00%</div>
            </div>
            
            <div class="card">
                <h2>24h Volume</h2>
                <div class="metric" id="volume">$0</div>
                <div class="change">USD</div>
            </div>
            
            <div class="card">
                <h2>Total P&L</h2>
                <div class="metric" id="totalPnl">$0.00</div>
                <div class="change" id="winRate">Win Rate: 0%</div>
            </div>
            
            <div class="card">
                <h2>Open Positions</h2>
                <div class="metric" id="openPositions">0</div>
                <div class="change" id="exposure">Exposure: $0</div>
            </div>
        </div>
        
        <div class="grid">
            <div class="card" style="grid-column: span 2;">
                <h2>Price Chart</h2>
                <div class="chart-container">
                    <canvas id="priceChart"></canvas>
                </div>
            </div>
            
            <div class="card">
                <h2>Recent Signals</h2>
                <div id="signalsList"></div>
            </div>
        </div>
        
        <div class="card">
            <h2>Open Positions</h2>
            <table class="positions-table">
                <thead>
                    <tr>
                        <th>Entry</th>
                        <th>Size</th>
                        <th>Current</th>
                        <th>P&L</th>
                        <th>%</th>
                    </tr>
                </thead>
                <tbody id="positionsBody">
                    <tr><td colspan="5" style="text-align: center; color: #666;">No open positions</td></tr>
                </tbody>
            </table>
        </div>
        
        <div class="card">
            <h2>Recent Trades</h2>
            <table class="trades-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Side</th>
                        <th>Price</th>
                        <th>Size</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="tradesBody">
                    <tr><td colspan="5" style="text-align: center; color: #666;">No trades yet</td></tr>
                </tbody>
            </table>
        </div>
    </div>
    
    <div class="footer">
        <p>Solana Algorithmic Trading Bot | Mean Reversion Strategy</p>
    </div>
    
    <script>
        const socket = io();
        let priceChart = null;
        let priceData = [];
        
        // Initialize price chart
        const ctx = document.getElementById('priceChart').getContext('2d');
        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'SOL Price',
                    data: [],
                    borderColor: '#14F195',
                    backgroundColor: 'rgba(20, 241, 149, 0.1)',
                    borderWidth: 2,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            color: 'rgba(153, 69, 255, 0.1)'
                        }
                    },
                    y: {
                        display: true,
                        grid: {
                            color: 'rgba(153, 69, 255, 0.1)'
                        }
                    }
                }
            }
        });
        
        // Socket event handlers
        socket.on('connect', () => {
            document.getElementById('connectionStatus').textContent = 'Connected';
        });
        
        socket.on('disconnect', () => {
            document.getElementById('connectionStatus').textContent = 'Disconnected';
        });
        
        socket.on('metrics', (data) => {
            updateDashboard(data);
        });
        
        socket.on('trade', (trade) => {
            addTrade(trade);
        });
        
        socket.on('signal', (signal) => {
            addSignal(signal);
        });
        
        function updateDashboard(data) {
            // Update price
            if (data.price) {
                document.getElementById('price').textContent = '$' + parseFloat(data.price).toFixed(2);
                
                // Add to chart
                const now = new Date().toLocaleTimeString();
                priceChart.data.labels.push(now);
                priceChart.data.datasets[0].data.push(data.price);
                
                // Keep only last 20 points
                if (priceChart.data.labels.length > 20) {
                    priceChart.data.labels.shift();
                    priceChart.data.datasets[0].data.shift();
                }
                priceChart.update();
            }
            
            // Update volume
            if (data.volume24h) {
                document.getElementById('volume').textContent = '$' + formatNumber(data.volume24h);
            }
            
            // Update price change
            if (data.change24h !== undefined) {
                const changeEl = document.getElementById('priceChange');
                changeEl.textContent = data.change24h.toFixed(2) + '%';
                document.getElementById('price').className = 'metric ' + (data.change24h >= 0 ? 'positive' : 'negative');
            }
            
            // Update performance
            if (data.performance) {
                document.getElementById('totalPnl').textContent = '$' + (data.performance.totalPnL || '0.00');
                document.getElementById('winRate').textContent = 'Win Rate: ' + (data.performance.winRate || 0).toFixed(1) + '%';
                
                const pnlEl = document.getElementById('totalPnl');
                pnlEl.className = 'metric ' + (parseFloat(data.performance.totalPnL || 0) >= 0 ? 'positive' : 'negative');
            }
            
            // Update positions
            if (data.positions) {
                updatePositions(data.positions);
            }
            
            // Update trades
            if (data.trades) {
                updateTrades(data.trades);
            }
            
            // Update signals
            if (data.signals) {
                updateSignals(data.signals);
            }
        }
        
        function updatePositions(positions) {
            document.getElementById('openPositions').textContent = positions.filter(p => p.status === 'OPEN').length;
            
            const tbody = document.getElementById('positionsBody');
            if (positions.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">No open positions</td></tr>';
                return;
            }
            
            tbody.innerHTML = positions.filter(p => p.status === 'OPEN').map(pos => \`
                <tr>
                    <td>$\${parseFloat(pos.entryPrice).toFixed(2)}</td>
                    <td>\${parseFloat(pos.size).toFixed(4)}</td>
                    <td>$\${parseFloat(pos.currentPrice || pos.entryPrice).toFixed(2)}</td>
                    <td class="\${pos.pnl >= 0 ? 'positive' : 'negative'}">$\${parseFloat(pos.pnl || 0).toFixed(2)}</td>
                    <td class="\${pos.pnlPercent >= 0 ? 'positive' : 'negative'}">\${parseFloat(pos.pnlPercent || 0).toFixed(2)}%</td>
                </tr>
            \`).join('');
        }
        
        function updateTrades(trades) {
            const tbody = document.getElementById('tradesBody');
            if (trades.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">No trades yet</td></tr>';
                return;
            }
            
            tbody.innerHTML = trades.slice(0, 10).map(trade => \`
                <tr>
                    <td>\${new Date(trade.timestamp).toLocaleTimeString()}</td>
                    <td class="\${trade.side === 'BUY' ? 'positive' : 'negative'}">\${trade.side}</td>
                    <td>$\${parseFloat(trade.price).toFixed(2)}</td>
                    <td>\${parseFloat(trade.size).toFixed(4)}</td>
                    <td>\${trade.status}</td>
                </tr>
            \`).join('');
        }
        
        function updateSignals(signals) {
            const container = document.getElementById('signalsList');
            if (signals.length === 0) {
                container.innerHTML = '<p style="color: #666;">No signals yet</p>';
                return;
            }
            
            container.innerHTML = signals.slice(0, 5).map(signal => \`
                <div style="margin-bottom: 10px;">
                    <span class="signal-badge \${signal.type.toLowerCase()}">\${signal.type}</span>
                    <span style="margin-left: 10px; font-size: 12px; color: #888;">
                        \${new Date(signal.timestamp).toLocaleTimeString()}
                    </span>
                    <div style="font-size: 12px; color: #666; margin-top: 5px;">
                        \${signal.reason}
                    </div>
                </div>
            \`).join('');
        }
        
        function addTrade(trade) {
            // Prepend to trades list
            const tbody = document.getElementById('tradesBody');
            const row = document.createElement('tr');
            row.innerHTML = \`
                <td>\${new Date(trade.timestamp).toLocaleTimeString()}</td>
                <td class="\${trade.side === 'BUY' ? 'positive' : 'negative'}">\${trade.side}</td>
                <td>$\${parseFloat(trade.price).toFixed(2)}</td>
                <td>\${parseFloat(trade.size).toFixed(4)}</td>
                <td>\${trade.status}</td>
            \`;
            tbody.insertBefore(row, tbody.firstChild);
            
            // Keep only 10 rows
            while (tbody.children.length > 10) {
                tbody.removeChild(tbody.lastChild);
            }
        }
        
        function addSignal(signal) {
            const container = document.getElementById('signalsList');
            const div = document.createElement('div');
            div.style.marginBottom = '10px';
            div.innerHTML = \`
                <span class="signal-badge \${signal.type.toLowerCase()}">\${signal.type}</span>
                <span style="margin-left: 10px; font-size: 12px; color: #888;">
                    \${new Date(signal.timestamp).toLocaleTimeString()}
                </span>
                <div style="font-size: 12px; color: #666; margin-top: 5px;">
                    \${signal.reason}
                </div>
            \`;
            container.insertBefore(div, container.firstChild);
            
            // Keep only 5 signals
            while (container.children.length > 5) {
                container.removeChild(container.lastChild);
            }
        }
        
        function formatNumber(num) {
            if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
            if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
            if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
            return num.toFixed(2);
        }
        
        // Fetch initial config
        fetch('/api/config')
            .then(res => res.json())
            .then(config => {
                document.getElementById('tradingMode').textContent = 
                    config.paperTrading ? 'Paper Trading' : 'Live Trading';
            });
    </script>
</body>
</html>
    `;
  }
}

export default Dashboard;
