# Trading Analytics Suite 🚀

[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

> A comprehensive real-time trading analytics platform for cryptocurrency markets with advanced statistical analysis, alert management, and interactive dashboards.

Demo link - https://www.loom.com/share/5e73bfd3008c42a383790a538c0f1685

## ✨ Features

<table>
<tr>
<td>

### 📊 **Real-time Analytics**
- Z-Score deviation tracking
- Spread analysis between pairs
- Correlation measurements
- Rolling statistics & trends
- Stationarity testing (ADF)

</td>
<td>

### 🔔 **Smart Alerts**
- Custom threshold alerts
- Real-time notifications
- Alert history tracking
- Browser notifications
- WebSocket-based triggers

</td>
</tr>
<tr>
<td>

### 📈 **Data Visualization**
- Interactive real-time charts
- Multi-timeframe analysis
- Statistical overlays
- Mobile-responsive design
- Customizable dashboards

</td>
<td>

### 💾 **Data Management**
- Live WebSocket streams
- Historical data import
- Multi-symbol support
- PostgreSQL persistence
- CSV export functionality

</td>
</tr>
</table>

## 🛠️ Tech Stack

<details>
<summary><strong>Backend Technologies</strong></summary>

- **FastAPI** - Modern Python web framework
- **WebSockets** - Real-time communication
- **SQLModel/SQLAlchemy** - Type-safe ORM
- **PostgreSQL** - Production database
- **Pandas/NumPy** - Data processing
- **SciPy/Statsmodels** - Statistical analysis
- **Uvicorn** - ASGI server

</details>

<details>
<summary><strong>Frontend Technologies</strong></summary>

- **React 18** - Component-based UI
- **React Router** - Client-side routing
- **Recharts** - Interactive charts
- **Tailwind CSS** - Utility-first styling
- **Vite** - Fast build tool
- **Lucide React** - Icon library

</details>

<details>
<summary><strong>Infrastructure</strong></summary>

- **Docker & Docker Compose** - Containerization
- **WebSocket Protocol** - Real-time streaming
- **RESTful APIs** - HTTP endpoints
- **Environment Configuration** - Secure setup

</details>

## 📁 Project Structure

```
analytical_app/
├── 🐳 docker-compose.yml          # Multi-service orchestration
├── 🐍 QAbackend/                  # Python FastAPI Backend
│   ├── 📄 main.py                 # Core application logic
│   ├── 📦 requirements.txt        # Python dependencies
│   ├── 🐳 Dockerfile             # Backend container
│   ├── ⚙️  .env                   # Environment variables
│   ├── 🌐 binance_collector.html  # Data collector client
│   └── 📊 exports/               # Data exports
└── ⚛️  QAfrontend/               # React Frontend
    ├── 📱 src/
    │   ├── 🎯 App.jsx            # Main app component
    │   ├── 🧩 components/        # React components
    │   │   ├── 📊 TradingDashboard.jsx
    │   │   ├── 🔔 AlertsWidget.jsx
    │   │   ├── 📢 NotificationsWidget.jsx
    │   │   └── 📤 OHLCUploadWidget.jsx
    │   └── 🪝 hooks/             # Custom React hooks
    ├── 📦 package.json          # Node dependencies
    └── 🐳 Dockerfile           # Frontend container
```

## 🚀 Quick Start

### Prerequisites
- 🐳 Docker & Docker Compose
- 🐘 PostgreSQL Database (cloud or local)
- 🌐 Modern web browser

### Installation

1. **Clone Repository**
   ```bash
   git clone https://github.com/your-username/trading-analytics-suite.git
   cd trading-analytics-suite
   ```

2. **Configure Environment**
   ```bash
   # Create backend environment file
   cp QAbackend/.env.example QAbackend/.env
   
   # Edit with your database URL
   nano QAbackend/.env
   ```
   
   ```env
   DATABASE_URL=postgresql://user:password@host:port/database
   DEBUG=true
   ```

3. **Start Services**
   ```bash
   # Build and start all services
   docker-compose up --build -d
   
   # View logs
   docker-compose logs -f
   ```

4. **Access Applications**
   - 🎯 **Frontend Dashboard**: http://localhost:3000
   - 📡 **Backend API**: http://localhost:8000
   - 📊 **API Docs**: http://localhost:8000/docs
   - 🌐 **Data Collector**: Open `QAbackend/binance_browser_collector_save_test.html`

## 📖 Usage Guide

### 1. 🔄 Start Data Collection
```bash
# Open the HTML collector in your browser
open QAbackend/binance_browser_collector_save_test.html

# Configure symbols (e.g., btcusdt,ethusdt)
# Click "🚀 Start All Services"
```

### 2. 📊 Monitor Dashboard
- Real-time charts update automatically
- View Z-scores, spreads, and correlations
- Switch between timeframes (1m, 5m, 15m, 1h, 4h, 1d)

### 3. 🔔 Create Alerts
- Click "Create Alert" in dashboard
- Set conditions (Z-score thresholds, spreads)
- Receive browser notifications

### 4. 💾 Data Management
- Upload historical OHLC CSV files
- Export processed analytics data
- View comprehensive alert history

## 🔌 API Reference

### 📊 Analytics Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics` | Current market analytics |
| `GET` | `/api/symbols` | Available trading symbols |
| `GET` | `/api/historical/{symbol}` | Historical OHLC data |

### 🔔 Alert Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/alerts` | Create new alert |
| `GET` | `/api/alerts` | List all alerts |
| `DELETE` | `/api/alerts/{id}` | Delete alert |
| `GET` | `/api/alerts/triggered` | Recent triggered alerts |

### 🌐 WebSocket Endpoints
- `ws://localhost:8000/ws/analytics` - Real-time analytics stream
- `ws://localhost:8000/ws/from_tool` - Data collection endpoint

## 📈 Key Algorithms

### Statistical Analysis
```python
# Z-Score Calculation
z_score = (current_price - rolling_mean) / rolling_std

# Spread Analysis  
spread = abs(price_a - price_b) / ((price_a + price_b) / 2)

# Correlation Analysis
correlation = pearson_correlation(series_a, series_b)
```

### Data Processing Pipeline
```mermaid
graph LR
    A[🔴 Live Data] --> B[📊 Processing]
    B --> C[📈 Analytics]
    C --> D[🔔 Alerts]
    C --> E[💾 Storage]
    D --> F[📱 Notifications]
```

## 🔧 Development

### Local Development Setup
```bash
# Backend development
cd QAbackend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
python main.py

# Frontend development  
cd QAfrontend
npm install
npm start
```

### Environment Variables
```env
# QAbackend/.env
DATABASE_URL=postgresql://user:pass@host:port/db
DEBUG=true
LOG_LEVEL=INFO


## 📊 Performance & Monitoring

- ⚡ **Latency**: < 100ms for real-time updates
- 🔄 **Throughput**: 1000+ ticks per second
- 👥 **Concurrent Users**: Multiple WebSocket connections
- 💾 **Memory**: Efficient circular buffers
- 📈 **Uptime**: Auto-reconnection & error recovery


## 🛡️ Security Features

- 🔐 **Environment Variables** - Secure credential storage
- 🌐 **CORS Configuration** - Cross-origin protection  
- ✅ **Input Validation** - SQL injection prevention
- 📝 **Error Handling** - Graceful failure management
- 🔄 **Auto-reconnection** - WebSocket resilience


## 🙏 Acknowledgments

- 📊 [Binance API](https://binance-docs.github.io/apidocs/) - Real-time market data
- 📈 [Recharts](https://recharts.org/) - Beautiful React charts
- 🚀 [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- ⚛️ [React](https://reactjs.org/) - UI library



</div>