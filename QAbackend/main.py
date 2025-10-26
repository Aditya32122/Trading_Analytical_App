import asyncio
import json
import io  
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set
import pandas as pd
import numpy as np
from collections import deque
from dataclasses import dataclass, asdict
import logging
from statsmodels.tsa.stattools import adfuller
from scipy import stats
from pathlib import Path
from fastapi import FastAPI,UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import uvicorn
from threading import Thread
from sqlmodel import Field, Session, SQLModel, create_engine, select
from typing import Optional as SQLOptional
import os
from dotenv import load_dotenv


load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.DEBUG,  # Changed to DEBUG to see raw data
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL, echo=False)


# SQLModel Tables
class TickRecord(SQLModel, table=True):
    __tablename__ = "ticks"
    
    id: SQLOptional[int] = Field(default=None, primary_key=True)
    timestamp: float = Field(index=True)
    symbol: str = Field(index=True)
    price: float
    quantity: float


class CandleRecord(SQLModel, table=True):
    __tablename__ = "candles"
    
    id: SQLOptional[int] = Field(default=None, primary_key=True)
    timestamp: float = Field(index=True)
    symbol: str = Field(index=True)
    timeframe: str = Field(index=True)
    open: float
    high: float
    low: float
    close: float
    volume: float
    tick_count: int


def init_db():
    """Initialize database tables"""
    SQLModel.metadata.create_all(engine)


@dataclass
class TickData:
    """Single tick data structure"""
    timestamp: float
    symbol: str
    price: float
    quantity: float
    
    def to_dict(self):
        return asdict(self)

class AlertRecord(SQLModel, table=True):
    __tablename__ = "alerts"
    
    id: SQLOptional[int] = Field(default=None, primary_key=True)
    name: str
    condition: str
    symbol: str
    value: float
    active: bool = True
    created_at: float = Field(default_factory=lambda: datetime.now().timestamp())


class TriggeredAlertRecord(SQLModel, table=True):
    __tablename__ = "triggered_alerts"
    
    id: SQLOptional[int] = Field(default=None, primary_key=True)
    alert_id: int = Field(foreign_key="alerts.id")
    name: str
    condition: str
    symbol: str
    threshold: float
    current_value: float
    timestamp: float = Field(default_factory=lambda: datetime.now().timestamp(), index=True)

@dataclass
class OHLCVData:
    """OHLCV candle data"""
    timestamp: float
    symbol: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    tick_count: int
    
    def to_dict(self):
        return asdict(self)


class TickBuffer:
    """Buffer for storing and sampling tick data"""
    
    def __init__(self, max_size: int = 100000):
        self.max_size = max_size
        self.ticks: deque = deque(maxlen=max_size)
        
    def add(self, tick: TickData):
        """Add tick to buffer"""
        self.ticks.append(tick)
        
    def get_recent(self, count: int = 1000) -> List[TickData]:
        """Get recent ticks"""
        return list(self.ticks)[-count:]
    
    def get_since(self, timestamp: float) -> List[TickData]:
        """Get ticks since timestamp"""
        return [t for t in self.ticks if t.timestamp >= timestamp]
    
    def to_dataframe(self) -> pd.DataFrame:
        """Convert to pandas DataFrame"""
        if not self.ticks:
            return pd.DataFrame()
        return pd.DataFrame([t.to_dict() for t in self.ticks])


class DataResampler:
    """Resample tick data to OHLCV candles"""
    
    def __init__(self):
        self.candles: Dict[str, Dict[str, deque]] = {}  # {symbol: {timeframe: deque}}
        
    def resample(self, ticks: List[TickData], timeframe: str) -> List[OHLCVData]:
        """
        Resample ticks to OHLCV candles
        timeframe: '1s', '1m', '5m', '15m', '1h'
        """
        if not ticks:
            return []
        
        df = pd.DataFrame([t.to_dict() for t in ticks])
        df['datetime'] = pd.to_datetime(df['timestamp'], unit='ms')
        df = df.set_index('datetime')
        
        # Map timeframe to pandas resample rule
        freq_map = {'1s': '1S', '1m': '1T', '5m': '5T', '15m': '15T', '1h': '1H'}
        freq = freq_map.get(timeframe, '1T')
        
        ohlcv = df.groupby('symbol').resample(freq).agg({
            'price': ['first', 'max', 'min', 'last', 'count'],
            'quantity': 'sum'
        })
        
        candles = []
        for (symbol, ts), row in ohlcv.iterrows():
            if pd.notna(row[('price', 'first')]):
                candles.append(OHLCVData(
                    timestamp=ts.timestamp() * 1000,
                    symbol=symbol,
                    open=row[('price', 'first')],
                    high=row[('price', 'max')],
                    low=row[('price', 'min')],
                    close=row[('price', 'last')],
                    volume=row[('quantity', 'sum')],
                    tick_count=int(row[('price', 'count')])
                ))
        
        return candles


class AnalyticsEngine:
    """Compute various analytics on price data"""
    
    @staticmethod
    def compute_returns(prices: pd.Series) -> pd.Series:
        """Compute log returns with proper handling of zero/negative prices"""
        # Filter out zero and negative prices first
        valid_prices = prices[prices > 0].copy()
        
        if len(valid_prices) < 2:
            return pd.Series(dtype=float, index=prices.index)
        
        # Suppress warnings for log calculation
        with np.errstate(divide='ignore', invalid='ignore'):
            # Compute returns only on valid prices
            price_ratio = valid_prices / valid_prices.shift(1)
            # Replace inf and values <= 0 with NaN before log
            price_ratio = price_ratio.replace([np.inf, -np.inf], np.nan)
            price_ratio = price_ratio.where(price_ratio > 0)
            returns = np.log(price_ratio)
        
        # Reindex to match original series, filling missing values with 0
        returns = returns.reindex(prices.index, fill_value=0)
        
        return returns.fillna(0)
    
    @staticmethod
    def compute_volatility(returns: pd.Series, window: int = 20) -> pd.Series:
        """Compute rolling volatility with improved handling"""
        if returns.empty or len(returns) < 2:
            return pd.Series(dtype=float, index=returns.index)
        
        # Only compute volatility on non-zero returns
        vol = returns.rolling(window, min_periods=1).std() * np.sqrt(252)
        return vol.fillna(0)
    
    @staticmethod
    def compute_zscore(series: pd.Series, window: int = 20) -> pd.Series:
        """Compute rolling z-score"""
        if series.empty or len(series) < 2:
            return pd.Series(dtype=float, index=series.index)
        
        rolling_mean = series.rolling(window, min_periods=1).mean()
        rolling_std = series.rolling(window, min_periods=1).std()
        
        # Handle division by zero
        rolling_std = rolling_std.replace(0, np.nan)
        z_score = (series - rolling_mean) / rolling_std
        return z_score.fillna(0)
    
    @staticmethod
    def compute_spread(y: pd.Series, x: pd.Series, hedge_ratio: float) -> pd.Series:
        """Compute spread: y - hedge_ratio * x"""
        if y.empty or x.empty:
            return pd.Series(dtype=float)
        return y - hedge_ratio * x
    
    @staticmethod
    def compute_correlation(s1: pd.Series, s2: pd.Series, window: int = 20) -> pd.Series:
        """Compute rolling correlation"""
        if s1.empty or s2.empty or len(s1) < 2 or len(s2) < 2:
            return pd.Series(dtype=float)
        
        return s1.rolling(window, min_periods=1).corr(s2).fillna(0)
    
    @staticmethod
    def compute_hedge_ratio(y: pd.Series, x: pd.Series) -> Dict:
        """
        Compute hedge ratio using OLS regression with better error handling
        y = alpha + beta * x + epsilon
        """
        try:
            from sklearn.linear_model import LinearRegression
            
            # Remove NaN, inf, and ensure both series have valid data
            mask = ~(y.isna() | x.isna() | np.isinf(y) | np.isinf(x) | (y == 0) | (x == 0))
            y_clean = y[mask]
            x_clean = x[mask]
            
            if len(y_clean) < 10:  # Need minimum data points
                return {'beta': 0.0, 'alpha': 0.0, 'r_squared': 0.0}
            
            # Reshape for sklearn
            x_reshaped = x_clean.values.reshape(-1, 1)
            y_values = y_clean.values
            
            model = LinearRegression()
            model.fit(x_reshaped, y_values)
            
            beta = model.coef_[0]
            alpha = model.intercept_
            r_squared = model.score(x_reshaped, y_values)
            
            # Ensure finite values
            beta = float(beta) if np.isfinite(beta) else 0.0
            alpha = float(alpha) if np.isfinite(alpha) else 0.0
            r_squared = float(r_squared) if np.isfinite(r_squared) else 0.0
            
            return {
                'beta': beta,
                'alpha': alpha,
                'r_squared': r_squared
            }
        except Exception as e:
            logger.error(f"Hedge ratio computation error: {e}")
            return {'beta': 0.0, 'alpha': 0.0, 'r_squared': 0.0}
    
    @staticmethod
    def adf_test(series: pd.Series, test_type: str = 'spread') -> Dict:
        """
        Perform Augmented Dickey-Fuller test with proper preprocessing
        test_type: 'price', 'returns', 'spread'
        """
        try:
            series_clean = series.dropna()
            
            # Real-world minimum sample size
            if len(series_clean) < 100:
                return {
                    'adf_statistic': np.nan,
                    'p_value': np.nan,
                    'is_stationary': False,
                    'critical_values': {},
                    'sample_size': len(series_clean),
                    'warning': f'Insufficient data: {len(series_clean)} < 100 required'
                }
            
            # Preprocess based on test type
            if test_type == 'price':
                # For price levels, use log differences (returns)
                if len(series_clean) < 2:
                    return {'adf_statistic': np.nan, 'p_value': np.nan, 'is_stationary': False}
                
                # Convert to log returns
                log_prices = np.log(series_clean[series_clean > 0])
                if len(log_prices) < 2:
                    return {'adf_statistic': np.nan, 'p_value': np.nan, 'is_stationary': False}
                
                test_series = log_prices.diff().dropna()
                
            elif test_type == 'returns':
                # Already returns, use as-is
                test_series = series_clean
                
            elif test_type == 'spread':
                # For spread, test the level (this is what we want to be stationary)
                test_series = series_clean
                
            else:
                test_series = series_clean
            
            # Remove outliers (beyond 3 standard deviations)
            if len(test_series) > 10:
                mean_val = test_series.mean()
                std_val = test_series.std()
                if std_val > 0:
                    outlier_mask = np.abs(test_series - mean_val) < (3 * std_val)
                    test_series = test_series[outlier_mask]
            
            if len(test_series) < 50:
                return {
                    'adf_statistic': np.nan,
                    'p_value': np.nan,
                    'is_stationary': False,
                    'sample_size': len(test_series),
                    'warning': 'Insufficient data after preprocessing'
                }
            
            # Perform ADF test with proper regression options
            result = adfuller(
                test_series, 
                autolag='AIC',
                regression='c'  # Include constant term
            )
            
            # Interpret results
            adf_stat = float(result[0])
            p_value = float(result[1])
            critical_values = {k: float(v) for k, v in result[4].items()}
            
            # More nuanced stationarity determination
            is_stationary = (
                p_value < 0.05 and  # Reject null hypothesis at 5% level
                adf_stat < critical_values.get('5%', float('inf'))  # More conservative
            )
            
            # Confidence level
            if p_value < 0.01:
                confidence = "99%"
            elif p_value < 0.05:
                confidence = "95%"
            elif p_value < 0.10:
                confidence = "90%"
            else:
                confidence = "Not significant"
            
            return {
                'adf_statistic': adf_stat,
                'p_value': p_value,
                'critical_values': critical_values,
                'is_stationary': is_stationary,
                'confidence': confidence,
                'sample_size': len(test_series),
                'test_type': test_type,
                'interpretation': {
                    'stationary': is_stationary,
                    'mean_reverting': is_stationary and test_type == 'spread',
                    'unit_root': not is_stationary,
                    'reliability': 'High' if len(test_series) > 200 else 'Medium' if len(test_series) > 100 else 'Low'
                }
            }
            
        except Exception as e:
            logger.error(f"ADF test error: {e}")
            return {
                'adf_statistic': np.nan,
                'p_value': np.nan,
                'is_stationary': False,
                'error': str(e)
            }
    
    @staticmethod
    def get_capabilities(data_points: int) -> Dict:
        """Calculate which features are enabled based on data points"""
        return {
            'basic_price_tracking': data_points >= 1,
            'volume_analysis': data_points >= 10,
            'zscore_calculation': data_points >= 20,
            'volatility_metrics': data_points >= 50,
            'correlation_analysis': data_points >= 100,
            'spread_trading': data_points >= 100,
            'hedge_ratio_calc': data_points >= 150,
            'adf_stationarity': data_points >= 200,
            'full_historical_charts': data_points >= 200
        }


class DatabaseManager:
    """PostgreSQL database manager using SQLModel"""
    
    def __init__(self):
        init_db()
    
    def insert_tick(self, tick: TickData):
        """Insert single tick"""
        with Session(engine) as session:
            tick_record = TickRecord(
                timestamp=tick.timestamp,
                symbol=tick.symbol,
                price=tick.price,
                quantity=tick.quantity
            )
            session.add(tick_record)
            session.commit()
    
    def insert_ticks_batch(self, ticks: List[TickData]):
        """Insert multiple ticks"""
        if not ticks:
            return
        with Session(engine) as session:
            for tick in ticks:
                tick_record = TickRecord(
                    timestamp=tick.timestamp,
                    symbol=tick.symbol,
                    price=tick.price,
                    quantity=tick.quantity
                )
                session.add(tick_record)
            session.commit()

    def insert_alert(self, alert: Dict) -> int:
        """Insert alert and return ID"""
        with Session(engine) as session:
            alert_record = AlertRecord(
                name=alert['name'],
                condition=alert['condition'],
                symbol=alert['symbol'],
                value=alert['value'],
                active=alert.get('active', True),
                created_at=datetime.now().timestamp()
            )
            session.add(alert_record)
            session.commit()
            session.refresh(alert_record)
            return alert_record.id

    def get_alerts(self) -> List[Dict]:
        """Get all alerts from database"""
        with Session(engine) as session:
            statement = select(AlertRecord)
            results = session.exec(statement).all()
            return [r.dict() for r in results]

    def delete_alert(self, alert_id: int):
        """Delete alert from database - FIXED with cascade delete"""
        with Session(engine) as session:
            try:
                # First, delete all triggered alerts that reference this alert
                triggered_statement = select(TriggeredAlertRecord).where(
                    TriggeredAlertRecord.alert_id == alert_id
                )
                triggered_results = session.exec(triggered_statement).all()
                
                # Delete triggered alerts first
                for triggered_alert in triggered_results:
                    session.delete(triggered_alert)
                
                # Now delete the main alert
                alert_statement = select(AlertRecord).where(AlertRecord.id == alert_id)
                alert_result = session.exec(alert_statement).first()
                
                if alert_result:
                    session.delete(alert_result)
                    session.commit()
                    logger.info(f"✅ Deleted alert {alert_id} and {len(triggered_results)} related triggered alerts")
                else:
                    logger.warning(f"⚠️ Alert {alert_id} not found")
                    
            except Exception as e:
                session.rollback()
                logger.error(f"❌ Error deleting alert {alert_id}: {e}")
                raise

    def insert_triggered_alert(self, alert_event: Dict):
        """Insert triggered alert"""
        with Session(engine) as session:
            record = TriggeredAlertRecord(**alert_event)
            session.add(record)
            session.commit()

    # def get_triggered_alerts(self, limit: int = 100) -> List[Dict]:
    #     """Get recent triggered alerts"""
    #     with Session(engine) as session:
    #         statement = select(TriggeredAlertRecord).order_by(
    #             TriggeredAlertRecord.timestamp.desc()
    #         ).limit(limit)
    #         results = session.exec(statement).all()
    #         return [r.dict() for r in results]
    
    def get_triggered_alerts(self, limit: int = 100) -> List[Dict]:
        """Get recent triggered alerts from database"""
        with Session(engine) as session:
            statement = select(TriggeredAlertRecord).order_by(
                TriggeredAlertRecord.timestamp.desc()
            ).limit(limit)
            results = session.exec(statement).all()
            return [r.dict() for r in results]

    def insert_candle(self, candle: OHLCVData, timeframe: str):
        """Insert OHLCV candle"""
        with Session(engine) as session:
            candle_record = CandleRecord(
                timestamp=candle.timestamp,
                symbol=candle.symbol,
                timeframe=timeframe,
                open=candle.open,
                high=candle.high,
                low=candle.low,
                close=candle.close,
                volume=candle.volume,
                tick_count=candle.tick_count
            )
            session.merge(candle_record)
            session.commit()
    
    
    
    def get_ticks(self, symbol: str = None, start_time: Optional[float] = None, 
                  end_time: Optional[float] = None, limit: int = 10000) -> pd.DataFrame:
        """Retrieve ticks from database"""
        with Session(engine) as session:
            statement = select(TickRecord)
            
            if symbol:
                statement = statement.where(TickRecord.symbol == symbol)
            if start_time:
                statement = statement.where(TickRecord.timestamp >= start_time)
            if end_time:
                statement = statement.where(TickRecord.timestamp <= end_time)
            
            statement = statement.order_by(TickRecord.timestamp.desc()).limit(limit)
            
            results = session.exec(statement).all()
            
            if not results:
                return pd.DataFrame()
            
            return pd.DataFrame([
                {
                    'timestamp': r.timestamp,
                    'symbol': r.symbol,
                    'price': r.price,
                    'quantity': r.quantity
                } for r in results
            ])
    
    def get_candles(self, symbol: str, timeframe: str, limit: int = 1000) -> pd.DataFrame:
        """Retrieve candles from database"""
        with Session(engine) as session:
            statement = select(CandleRecord).where(
                CandleRecord.symbol == symbol,
                CandleRecord.timeframe == timeframe
            ).order_by(CandleRecord.timestamp.desc()).limit(limit)
            
            results = session.exec(statement).all()
            
            if not results:
                return pd.DataFrame()
            
            return pd.DataFrame([r.dict() for r in results])


class AlertManager:
    """Manage custom alerts"""
    
    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager
        self.alerts: List[Dict] = []
        self.triggered_alerts: deque = deque(maxlen=100)
        self._load_alerts()

    def _load_alerts(self):
        """Load alerts from database on startup"""
        self.alerts = self.db_manager.get_alerts()
        logger.info(f"Loaded {len(self.alerts)} alerts from database")
        
    def add_alert(self, name: str, condition: str, symbol: str, value: float):
        """Add alert - save to database"""
        alert = {
            'name': name,
            'condition': condition,
            'symbol': symbol,
            'value': value,
            'active': True,
            'created_at': datetime.now().isoformat()
        }
        
        # Save to database
        alert_id = self.db_manager.insert_alert(alert)
        alert['id'] = alert_id
        
        self.alerts.append(alert)
        logger.info(f"Alert added: {alert}")
        return alert
    
    def remove_alert(self, alert_id: int):
        """Remove alert - delete from database"""
        self.db_manager.delete_alert(alert_id)
        self.alerts = [a for a in self.alerts if a['id'] != alert_id]
        
    def get_alerts(self) -> List[Dict]:
        """Get all alerts"""
        return self.alerts
    
    def check_alerts(self, analytics: Dict):
        """Check if any alerts are triggered with improved logging"""
        if not analytics:
            logger.debug("No analytics data to check alerts against")
            return
            
        logger.debug(f"Checking {len(self.alerts)} alerts against analytics")
        
        for alert in self.alerts:
            if not alert.get('active', True):
                continue
            
            symbol = alert['symbol']
            condition = alert['condition']
            threshold = alert['value']
            
            triggered = False
            current_value = None
            
            try:
                if condition == 'zscore_above' and symbol in analytics.get('zscore', {}):
                    current_value = analytics['zscore'][symbol]
                    if not np.isnan(current_value) and current_value > threshold:
                        triggered = True
                        logger.info(f"🚨 Alert '{alert['name']}': zscore {current_value:.3f} > {threshold}")
                
                elif condition == 'zscore_below' and symbol in analytics.get('zscore', {}):
                    current_value = analytics['zscore'][symbol]
                    if not np.isnan(current_value) and current_value < threshold:
                        triggered = True
                        logger.info(f"🚨 Alert '{alert['name']}': zscore {current_value:.3f} < {threshold}")
                
                elif condition == 'price_above' and symbol in analytics.get('price', {}):
                    current_value = analytics['price'][symbol]
                    if current_value > threshold:
                        triggered = True
                        logger.info(f"🚨 Alert '{alert['name']}': price ${current_value:.2f} > ${threshold}")
                
                elif condition == 'price_below' and symbol in analytics.get('price', {}):
                    current_value = analytics['price'][symbol]
                    if current_value < threshold:
                        triggered = True
                        logger.info(f"🚨 Alert '{alert['name']}': price ${current_value:.2f} < ${threshold}")
                
                if triggered and current_value is not None:
                    alert_event = {
                        'alert_id': alert['id'],
                        'name': alert['name'],
                        'condition': condition,
                        'symbol': symbol,
                        'threshold': threshold,
                        'current_value': float(current_value),
                        'timestamp': datetime.now().timestamp()
                    }
                    
                    # Check if this alert was already triggered recently (within last 60 seconds)
                    recent_trigger = any(
                        ta.get('alert_id') == alert['id'] and 
                        (datetime.now().timestamp() - ta.get('timestamp', 0)) < 60
                        for ta in self.triggered_alerts
                    )
                    
                    if not recent_trigger:
                        self.triggered_alerts.append(alert_event)
                        
                        # Save to database
                        try:
                            self.db_manager.insert_triggered_alert(alert_event)
                            logger.info(f"✅ Alert triggered and saved: {alert['name']}")
                            
                            # Broadcast to connected clients
                            asyncio.create_task(self._broadcast_alert(alert_event))
                            
                        except Exception as e:
                            logger.error(f"Failed to save triggered alert: {e}")
                    else:
                        logger.debug(f"Alert '{alert['name']}' already triggered recently, skipping")
                        
            except Exception as e:
                logger.error(f"Error checking alert '{alert.get('name', 'Unknown')}': {e}")
                continue

    async def _broadcast_alert(self, alert_event: Dict):
        """Broadcast alert to connected WebSocket clients"""
        message = {
            "type": "alert_triggered",
            "alert": alert_event
        }
        
        # Import connected_clients from main module
        from __main__ import connected_clients
        
        disconnected = set()
        for client in connected_clients:
            try:
                await client.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send alert to client: {e}")
                disconnected.add(client)
        
        # Remove disconnected clients
        connected_clients.difference_update(disconnected)

class DataProcessor:
    """Main data processing coordinator"""
    
    def __init__(self):
        self.db_manager = DatabaseManager()
        self.resampler = DataResampler()
        self.analytics_engine = AnalyticsEngine()
        self.alert_manager = AlertManager(self.db_manager)  # ← Pass db_manager
        
        self.tick_buffers: Dict[str, TickBuffer] = {}
        self.latest_analytics: Dict = {}
        self.processing_task = None
        self.running = False
        
        # Track connected symbols
        self.active_symbols: Set[str] = set()
        
    def start_processing(self):
        """Start analytics processing loop"""
        if not self.running:
            self.running = True
            self.processing_task = asyncio.create_task(self.process_analytics_loop())
            logger.info("Analytics processing started")
    
    def stop_processing(self):
        """Stop analytics processing"""
        self.running = False
        if self.processing_task:
            self.processing_task.cancel()
        logger.info("Analytics processing stopped")
    
    async def process_analytics_loop(self):
        """Continuously process analytics"""
        batch_buffer = []
        last_save = datetime.now()
        
        while self.running:
            try:
                # Compute analytics
                await self.compute_analytics()
                
                # Save to database every 10 seconds

                if (datetime.now() - last_save).seconds >= 10:
                    for symbol, buffer in self.tick_buffers.items():
                        recent_ticks = buffer.get_recent(100)
                        if recent_ticks:
                            self.db_manager.insert_ticks_batch(recent_ticks)
                    last_save = datetime.now()
                    logger.info(f"Saved ticks to database for {len(self.tick_buffers)} symbols")

                await asyncio.sleep(0.5)  # Update every 500ms
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Analytics processing error: {e}", exc_info=True)
                await asyncio.sleep(5)
    
    def process_tick(self, tick_data: Dict):
        """Process incoming tick from WebSocket with enhanced validation"""
        try:
            # Log raw data for debugging
            logger.debug(f"Received tick data: {tick_data}")
            
            # Parse tick data from HTML tool format
            # Format from HTML: {symbol, ts, price, size}
            symbol = tick_data.get('symbol', '').upper()
            
            # Parse timestamp - could be ISO string or timestamp
            ts_raw = tick_data.get('ts')
            if isinstance(ts_raw, str):
                timestamp = datetime.fromisoformat(ts_raw.replace('Z', '+00:00')).timestamp() * 1000
            else:
                # Normalize numeric timestamps to milliseconds
                if ts_raw is None:
                    timestamp = datetime.now().timestamp() * 1000
                else:
                    t = float(ts_raw)
                    # ns -> ms
                    if t > 1e12:
                        timestamp = t / 1e6
                    # ms
                    elif t > 1e10:
                        timestamp = t
                    # seconds -> ms
                    else:
                        timestamp = t * 1000
            
            # Try different possible price fields
            price = None
            for price_field in ['price', 'p', 'last', 'lastPrice']:
                if price_field in tick_data:
                    try:
                        price = float(tick_data[price_field])
                        if price > 0:
                            break
                    except (ValueError, TypeError):
                        continue
            
            # Try different possible quantity fields
            quantity = None
            for qty_field in ['size', 'quantity', 'q', 'qty', 'volume', 'v']:
                if qty_field in tick_data:
                    try:
                        quantity = float(tick_data[qty_field])
                        break
                    except (ValueError, TypeError):
                        continue
            
            # Set defaults if not found
            if price is None:
                price = 0.0
            if quantity is None:
                quantity = 0.0
            
            # Enhanced validation - reject invalid data
            if not symbol:
                logger.warning(f"Missing symbol in tick data: {tick_data}")
                return
            
            if price <= 0:
                logger.warning(f"Invalid price ({price}) for {symbol}. Raw data: {tick_data}")
                return
            
            if quantity < 0:
                logger.warning(f"Invalid quantity ({quantity}) for {symbol}, skipping tick")
                return
            
            # Allow zero quantity for price-only ticks
            if quantity == 0:
                logger.debug(f"Zero quantity tick for {symbol}, price: {price}")
            
            tick = TickData(
                timestamp=timestamp,
                symbol=symbol,
                price=price,
                quantity=quantity
            )
            
            # Add to buffer
            if symbol not in self.tick_buffers:
                self.tick_buffers[symbol] = TickBuffer()
                self.active_symbols.add(symbol)
                logger.info(f"Created buffer for new symbol: {symbol}")
            
            self.tick_buffers[symbol].add(tick)
            logger.debug(f"Added tick: {symbol} @ {price}")
            
        except Exception as e:
            logger.error(f"Error processing tick: {e}, data: {tick_data}", exc_info=True)
    
    async def compute_analytics(self):
        """Compute all analytics with better error handling"""
        analytics = {
            'timestamp': datetime.now().isoformat(),
            'price': {},
            'volume': {},
            'zscore': {},
            'spread': {},
            'correlation': {},
            'hedge_ratio': {},
            'volatility': {},
            'tick_count': {},
            'adf_test': {},
            'capabilities': {},  # Add capabilities
            'data_points': 0  # Add total data points
        }
        
        symbols = list(self.active_symbols)
        total_data_points = 0
        
        for symbol in symbols:
            buffer = self.tick_buffers.get(symbol)
            if not buffer or len(buffer.ticks) < 5:
                continue
            
            try:
                df = buffer.to_dataframe()
                if df.empty:
                    continue
                
                # Filter out invalid prices
                df = df[df['price'] > 0].copy()
                if len(df) < 5:
                    continue
                
                # Latest price and volume
                analytics['price'][symbol] = float(df['price'].iloc[-1])
                analytics['volume'][symbol] = float(df['quantity'].sum())
                analytics['tick_count'][symbol] = len(df)
                total_data_points += len(df)
                
                # Compute z-score on prices
                zscore = self.analytics_engine.compute_zscore(df['price'], window=min(20, len(df)))
                if not zscore.empty and len(zscore) > 0:
                    last_zscore = zscore.iloc[-1]
                    analytics['zscore'][symbol] = float(last_zscore) if np.isfinite(last_zscore) else 0.0
                else:
                    analytics['zscore'][symbol] = 0.0
                
                # Compute volatility
                returns = self.analytics_engine.compute_returns(df['price'])
                vol = self.analytics_engine.compute_volatility(returns, window=min(20, len(df)))
                if not vol.empty and len(vol) > 0:
                    last_vol = vol.iloc[-1]
                    analytics['volatility'][symbol] = float(last_vol) if np.isfinite(last_vol) else 0.0
                else:
                    analytics['volatility'][symbol] = 0.0
                    
            except Exception as e:
                logger.error(f"Error computing single symbol analytics for {symbol}: {e}")
                # Set default values to prevent missing keys
                analytics['price'][symbol] = 0.0
                analytics['volume'][symbol] = 0.0
                analytics['tick_count'][symbol] = 0
                analytics['zscore'][symbol] = 0.0
                analytics['volatility'][symbol] = 0.0
                continue
        
        # Add total data points and capabilities
        analytics['data_points'] = total_data_points
        analytics['capabilities'] = AnalyticsEngine.get_capabilities(total_data_points)
        
        # Compute pair analytics if we have multiple symbols
        if len(symbols) >= 2:
            s1, s2 = symbols[0], symbols[1]
            b1 = self.tick_buffers.get(s1)
            b2 = self.tick_buffers.get(s2)
            
            if b1 and b2 and len(b1.ticks) > 20 and len(b2.ticks) > 20:
                try:
                    df1 = b1.to_dataframe()
                    df2 = b2.to_dataframe()
                    
                    # Filter valid prices and remove duplicates
                    df1 = df1[df1['price'] > 0].copy()
                    df2 = df2[df2['price'] > 0].copy()
                    
                    # Remove duplicate timestamps BEFORE setting index
                    df1 = df1.drop_duplicates(subset=['timestamp'], keep='last')
                    df2 = df2.drop_duplicates(subset=['timestamp'], keep='last')
                    
                    if len(df1) < 10 or len(df2) < 10:
                        return analytics
                    
                    # Sort by timestamp
                    df1 = df1.sort_values('timestamp')
                    df2 = df2.sort_values('timestamp')
                    
                    # Use simple index-based alignment instead of timestamp merging
                    # Take last N points from each
                    n_points = min(100, len(df1), len(df2))
                    p1 = df1['price'].tail(n_points).reset_index(drop=True)
                    p2 = df2['price'].tail(n_points).reset_index(drop=True)
                    
                    # Ensure same length
                    min_len = min(len(p1), len(p2))
                    if min_len < 10:
                        return analytics
                        
                    p1 = p1.iloc[:min_len].reset_index(drop=True)
                    p2 = p2.iloc[:min_len].reset_index(drop=True)
                    
                    pair_key = f"{s1}_{s2}"
                    
                    # Hedge ratio
                    hedge = self.analytics_engine.compute_hedge_ratio(p1, p2)
                    analytics['hedge_ratio'][pair_key] = hedge
                    
                    # Spread and other pair analytics
                    if hedge['beta'] != 0:
                        spread = self.analytics_engine.compute_spread(p1, p2, hedge['beta'])
                        if not spread.empty and len(spread) > 0:
                            last_spread = spread.iloc[-1]
                            if np.isfinite(last_spread):
                                analytics['spread'][pair_key] = float(last_spread)
                                
                                # ADF test on spread
                                if len(spread) >= 100:  # Increased minimum requirement
                                    adf_result = self.analytics_engine.adf_test(spread, test_type='spread')
                                    analytics['adf_test'][pair_key] = adf_result
                                    
                                    # Also test individual price series for comparison
                                    adf_p1 = self.analytics_engine.adf_test(p1, test_type='price')
                                    adf_p2 = self.analytics_engine.adf_test(p2, test_type='price')
                                    
                                    analytics['adf_test'][f"{s1}_price"] = adf_p1
                                    analytics['adf_test'][f"{s2}_price"] = adf_p2
                                    
                                    logger.info(f"ADF Tests - Spread: {adf_result['is_stationary']} (p={adf_result['p_value']:.4f})")
                                else:
                                    logger.debug(f"Insufficient data for ADF test: {len(spread)} < 100")
                    
                    # Correlation
                    corr = self.analytics_engine.compute_correlation(p1, p2, window=min(20, len(p1)))
                    if not corr.empty and len(corr) > 0:
                        last_corr = corr.iloc[-1]
                        if np.isfinite(last_corr):
                            analytics['correlation'][pair_key] = float(last_corr)
                        
                except Exception as e:
                    logger.error(f"Error computing pair analytics for {s1}/{s2}: {e}", exc_info=True)
        
        self.latest_analytics = analytics
        
        # Check alerts
        try:
            self.alert_manager.check_alerts(analytics)
        except Exception as e:
            logger.error(f"Error checking alerts: {e}")
        
        return analytics
    
    def get_latest_analytics(self) -> Dict:
        """Get latest computed analytics"""
        return self.latest_analytics
    
    def export_data(self, symbol: str = None, start_time: Optional[float] = None,
                   end_time: Optional[float] = None, format: str = 'csv') -> str:
        """Export data for download"""
        df = self.db_manager.get_ticks(symbol, start_time, end_time)
        
        if df.empty:
            return None
        
        # Create exports directory
        Path("exports").mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        symbol_str = symbol if symbol else "all"
        
        if format == 'csv':
            filepath = f"exports/ticks_{symbol_str}_{timestamp}.csv"
            df.to_csv(filepath, index=False)
        elif format == 'json':
            filepath = f"exports/ticks_{symbol_str}_{timestamp}.json"
            df.to_json(filepath, orient='records', lines=True)
        else:
            filepath = f"exports/ticks_{symbol_str}_{timestamp}.csv"
            df.to_csv(filepath, index=False)
        
        return filepath
    
    def get_historical_data(self, symbol: str, timeframe: str = '1m', limit: int = 1000) -> List[Dict]:
        """Get historical OHLCV data - prioritize database, fallback to memory"""
        # Try database first
        df = self.db_manager.get_candles(symbol.upper(), timeframe, limit)
        
        if not df.empty:
            # Sort by timestamp descending and return as list of dicts
            df = df.sort_values('timestamp', ascending=True)
            return df.to_dict('records')
        
        # Fallback to in-memory buffer if no DB data
        buffer = self.tick_buffers.get(symbol)
        if not buffer or len(buffer.ticks) < 2:
            return []
        
        recent_ticks = buffer.get_recent(limit)
        candles = self.resampler.resample(recent_ticks, timeframe)
        
        return [c.to_dict() for c in candles]


# Global data processor instance
data_processor = DataProcessor()

# FastAPI app
app = FastAPI(title="Trading Analytics Backend")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket connections for broadcasting analytics
connected_clients: Set[WebSocket] = set()


@app.on_event("startup")
async def startup_event():
    """Start analytics processing on app startup"""
    data_processor.start_processing()
    logger.info("FastAPI app started")


@app.on_event("shutdown")
async def shutdown_event():
    """Stop analytics processing on app shutdown"""
    data_processor.stop_processing()
    logger.info("FastAPI app shutting down")


@app.websocket("/ws/from_tool")
async def websocket_from_tool(websocket: WebSocket):
    """WebSocket endpoint to receive data from HTML tool"""
    await websocket.accept()
    logger.info("HTML tool connected")
    
    try:
        while True:
            # Receive tick data from HTML tool
            data = await websocket.receive_text()
            tick_data = json.loads(data)
            
            # Process the tick
            data_processor.process_tick(tick_data)
            
    except WebSocketDisconnect:
        logger.info("HTML tool disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")


@app.websocket("/ws/analytics")
async def websocket_analytics(websocket: WebSocket):
    """WebSocket endpoint to broadcast analytics to frontend clients"""
    await websocket.accept()
    connected_clients.add(websocket)
    logger.info(f"Frontend client connected. Total clients: {len(connected_clients)}")
    
    try:
        # Send initial analytics
        analytics = data_processor.get_latest_analytics()
        await websocket.send_json(analytics)
        
        # Keep connection alive and send updates
        while True:
            await asyncio.sleep(1)
            analytics = data_processor.get_latest_analytics()
            await websocket.send_json(analytics)
            
    except WebSocketDisconnect:
        connected_clients.discard(websocket)
        logger.info(f"Frontend client disconnected. Total clients: {len(connected_clients)}")
    except Exception as e:
        logger.error(f"WebSocket analytics error: {e}")
        connected_clients.discard(websocket)


@app.get("/api/analytics")
async def get_analytics():
    """Get latest analytics via REST API"""
    return JSONResponse(data_processor.get_latest_analytics())


@app.get("/api/symbols")
async def get_symbols():
    """Get list of active symbols"""
    return JSONResponse({
        "symbols": list(data_processor.active_symbols),
        "count": len(data_processor.active_symbols)
    })

@app.get("/api/price_history/{symbol}")
async def get_price_history(symbol: str, limit: int = 100):
    """Get recent price points (simplified for charting)"""
    buffer = data_processor.tick_buffers.get(symbol.upper())
    if not buffer:
        return JSONResponse({"error": "Symbol not found"}, status_code=404)
    
    ticks = buffer.get_recent(limit)
    
    # Convert to simple price points
    price_points = []
    for tick in ticks:
        price_points.append({
            'timestamp': tick.timestamp,
            'price': tick.price,
            'volume': tick.quantity
        })
    
    return JSONResponse(price_points)


@app.get("/api/historical/{symbol}")
async def get_historical(symbol: str, timeframe: str = '1m', limit: int = 1000):
    """Get historical OHLCV data for a symbol"""
    data = data_processor.get_historical_data(symbol.upper(), timeframe, limit)
    return JSONResponse(data)


@app.get("/api/ticks/{symbol}")
async def get_ticks(symbol: str, limit: int = 1000):
    """Get recent ticks for a symbol"""
    buffer = data_processor.tick_buffers.get(symbol.upper())
    if not buffer:
        return JSONResponse({"error": "Symbol not found"}, status_code=404)
    
    ticks = buffer.get_recent(limit)
    return JSONResponse([t.to_dict() for t in ticks])


@app.post("/api/alerts")
async def create_alert(alert: Dict):
    """Create a new alert"""
    result = data_processor.alert_manager.add_alert(
        name=alert['name'],
        condition=alert['condition'],
        symbol=alert['symbol'],
        value=alert['value']
    )
    return JSONResponse(result)


@app.get("/api/alerts")
async def get_alerts():
    """Get all alerts - FIXED VERSION"""
    try:
        logger.info("📡 GET /api/alerts called")
        
        alerts = data_processor.alert_manager.get_alerts()
        
        logger.info(f"✅ Found {len(alerts)} alerts")
        
        # Ensure proper format
        formatted = []
        for alert in alerts:
            formatted.append({
                'id': alert.get('id', 0),
                'name': alert.get('name', 'Unknown'),
                'condition': alert.get('condition', ''),
                'symbol': alert.get('symbol', ''),
                'value': float(alert.get('value', 0)),
                'active': alert.get('active', True),
                'created_at': alert.get('created_at', '')
            })
        
        logger.info(f"📤 Returning {len(formatted)} alerts")
        return JSONResponse(formatted)
        
    except Exception as e:
        logger.error(f"❌ Error in get_alerts: {e}", exc_info=True)
        return JSONResponse([])


@app.delete("/api/alerts/{alert_id}")
async def delete_alert_endpoint(alert_id: int):
    """Delete an alert - FIXED VERSION"""
    try:
        logger.info(f"🗑️ DELETE /api/alerts/{alert_id} called")
        
        # Use the alert manager to remove the alert
        data_processor.alert_manager.remove_alert(alert_id)
        
        logger.info(f"✅ Alert {alert_id} deleted successfully")
        return JSONResponse({
            "success": True,
            "message": f"Alert {alert_id} deleted",
            "id": alert_id
        })
        
    except Exception as e:
        logger.error(f"❌ Error deleting alert {alert_id}: {e}", exc_info=True)
        return JSONResponse(
            {"error": str(e)}, 
            status_code=500
        )@app.post("/api/upload/ohlc")
async def upload_ohlc_data(file: UploadFile = File(...)):
    """
    Upload historical OHLC CSV to bootstrap analytics
    
    CSV Format:
    timestamp,symbol,open,high,low,close,volume
    1729857045123,BTCUSDT,67500.0,67600.0,67400.0,67550.0,125.5
    """
    try:
        # Read and parse CSV
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        
        # Validate columns
        required_cols = ['timestamp', 'symbol', 'open', 'high', 'low', 'close', 'volume']
        if not all(col in df.columns for col in required_cols):
            return JSONResponse(
                {"error": f"CSV must have columns: {required_cols}"},
                status_code=400
            )
        
        logger.info(f"📤 Uploading {len(df)} OHLC records from {file.filename}")
        
        # Insert candles into database
        inserted_candles = 0
        for _, row in df.iterrows():
            candle = OHLCVData(
                timestamp=float(row['timestamp']),
                symbol=str(row['symbol']).upper(),
                open=float(row['open']),
                high=float(row['high']),
                low=float(row['low']),
                close=float(row['close']),
                volume=float(row['volume']),
                tick_count=1  # ← ADD THIS: Default to 1 for uploaded candles
            )
            data_processor.db_manager.insert_candle(candle, timeframe='1m')
            inserted_candles += 1
        
        # Backfill tick buffers with synthetic ticks
        symbols_processed = set()
        inserted_ticks = 0
        
        for symbol in df['symbol'].unique():
            symbol = str(symbol).upper()
            symbols_processed.add(symbol)
            
            # Ensure tick buffer exists
            if symbol not in data_processor.tick_buffers:
                data_processor.tick_buffers[symbol] = TickBuffer()
                data_processor.active_symbols.add(symbol)
            
            # Convert OHLC to synthetic ticks (using close prices)
            symbol_df = df[df['symbol'] == symbol].sort_values('timestamp')
            for _, row in symbol_df.iterrows():
                tick = TickData(
                    timestamp=float(row['timestamp']),
                    symbol=symbol,
                    price=float(row['close']),
                    quantity=float(row['volume'])
                )
                data_processor.tick_buffers[symbol].add(tick)
                inserted_ticks += 1
        
        # Force immediate analytics computation
        await data_processor.compute_analytics()
        
        # Broadcast to all connected clients
        analytics = data_processor.get_latest_analytics()
        for client in connected_clients:
            try:
                await client.send_json({
                    "type": "upload_complete",
                    "analytics": analytics
                })
            except:
                pass
        
        logger.info(f"✅ Upload complete: {inserted_candles} candles, {inserted_ticks} ticks")
        
        return JSONResponse({
            "success": True,
            "candles_inserted": inserted_candles,
            "ticks_created": inserted_ticks,
            "symbols": list(symbols_processed),
            "message": f"Historical data loaded. All analytics now available!",
            "capabilities": analytics.get("capabilities", {})
        })
        
    except Exception as e:
        logger.error(f"❌ Upload error: {str(e)}", exc_info=True)
        return JSONResponse(
            {"error": str(e)}, 
            status_code=500
        )


@app.get("/api/export/template")
async def download_csv_template():
    """Download CSV template for OHLC upload"""
    template = """timestamp,symbol,open,high,low,close,volume
1729857045000,BTCUSDT,67500.00,67600.00,67400.00,67550.00,125.5
1729857105000,BTCUSDT,67550.00,67650.00,67500.00,67600.00,98.3
1729857165000,ETHUSDT,3500.00,3510.00,3495.00,3505.00,450.2
"""
    
    return JSONResponse({
        "template": template,
        "instructions": {
            "timestamp": "Unix timestamp in milliseconds",
            "symbol": "Trading pair (e.g., BTCUSDT)",
            "open": "Opening price for period",
            "high": "Highest price in period",
            "low": "Lowest price in period",
            "close": "Closing price for period",
            "volume": "Trading volume"
        }
    })

@app.get("/api/alerts/triggered")
async def get_triggered_alerts():
    """Get triggered alerts - FIXED VERSION"""
    try:
        logger.info("📡 GET /api/alerts/triggered called")
        
        # Get directly from database manager
        triggered = data_processor.db_manager.get_triggered_alerts(limit=100)
        
        logger.info(f"✅ Found {len(triggered)} triggered alerts in database")
        
        # Ensure proper format and convert SQLModel objects to dicts
        formatted = []
        for alert in triggered:
            # Handle both dict and SQLModel object
            if hasattr(alert, 'dict'):
                alert_dict = alert.dict()
            else:
                alert_dict = alert
                
            formatted.append({
                'id': alert_dict.get('id', 0),
                'alert_id': alert_dict.get('alert_id', 0),
                'name': alert_dict.get('name', 'Unknown'),
                'condition': alert_dict.get('condition', ''),
                'symbol': alert_dict.get('symbol', ''),
                'threshold': float(alert_dict.get('threshold', 0)),
                'current_value': float(alert_dict.get('current_value', 0)),
                'timestamp': float(alert_dict.get('timestamp', 0))
            })
        
        # Sort by timestamp descending
        formatted.sort(key=lambda x: x['timestamp'], reverse=True)
        
        logger.info(f"📤 Returning {len(formatted)} triggered alerts")
        return JSONResponse(formatted)
        
    except Exception as e:
        logger.error(f"❌ Error in get_triggered_alerts: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)

# Add this endpoint AFTER the existing endpoints (around line 800)

@app.get("/analytics/latest")
async def get_latest_analytics_detailed(symbol1: str = None, symbol2: str = None):
    """Get latest analytics with detailed pair analysis - FIXED VERSION"""
    try:
        logger.info(f"📊 GET /analytics/latest called with symbol1={symbol1}, symbol2={symbol2}")
        
        analytics = data_processor.get_latest_analytics()
        
        # If specific symbols requested, filter the response
        if symbol1 and symbol2:
            pair_key = f"{symbol1.upper()}_{symbol2.upper()}"
            
            filtered = {
                'timestamp': analytics.get('timestamp'),
                'price': {},
                'zscore': {},
                'spread': {},
                'correlation': {},
                'hedge_ratio': {},
                'adf_test': {},
                'volatility': {},
                'tick_count': {}
            }
            
            # Add individual symbol data
            for symbol in [symbol1.upper(), symbol2.upper()]:
                if symbol in analytics.get('price', {}):
                    filtered['price'][symbol] = analytics['price'][symbol]
                if symbol in analytics.get('zscore', {}):
                    filtered['zscore'][symbol] = analytics['zscore'][symbol]
                if symbol in analytics.get('volatility', {}):
                    filtered['volatility'][symbol] = analytics['volatility'][symbol]
                if symbol in analytics.get('tick_count', {}):
                    filtered['tick_count'][symbol] = analytics['tick_count'][symbol]
            
            # Add pair data
            if pair_key in analytics.get('spread', {}):
                filtered['spread'][pair_key] = analytics['spread'][pair_key]
            if pair_key in analytics.get('correlation', {}):
                filtered['correlation'][pair_key] = analytics['correlation'][pair_key]
            if pair_key in analytics.get('hedge_ratio', {}):
                filtered['hedge_ratio'][pair_key] = analytics['hedge_ratio'][pair_key]
            if pair_key in analytics.get('adf_test', {}):
                filtered['adf_test'][pair_key] = analytics['adf_test'][pair_key]
            
            logger.info(f"✅ Returning filtered analytics for {pair_key}")
            return JSONResponse(filtered)
        
        logger.info("✅ Returning full analytics")
        return JSONResponse(analytics)
        
    except Exception as e:
        logger.error(f"❌ Error in get_latest_analytics_detailed: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/export")
async def export_data_endpoint(symbol: str = None, format: str = 'csv'):
    """Export data as downloadable file - FIXED VERSION"""
    try:
        logger.info(f"📥 Export requested: symbol={symbol}, format={format}")
        
        # Get data from database
        df = data_processor.db_manager.get_ticks(symbol=symbol.upper() if symbol else None, limit=10000)
        
        if df.empty:
            return JSONResponse(
                {"error": f"No data found for symbol: {symbol}"}, 
                status_code=404
            )
        
        # Create exports directory
        Path("exports").mkdir(exist_ok=True)
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        symbol_str = symbol.upper() if symbol else "all_symbols"
        
        if format.lower() == 'csv':
            filename = f"ticks_{symbol_str}_{timestamp}.csv"
            filepath = f"exports/{filename}"
            
            # Sort by timestamp and export
            df_sorted = df.sort_values('timestamp')
            df_sorted.to_csv(filepath, index=False)
            
            logger.info(f"✅ Exported {len(df_sorted)} records to {filepath}")
            
            # Return file for download
            return FileResponse(
                filepath,
                media_type="text/csv",
                filename=filename,
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        
        elif format.lower() == 'json':
            filename = f"ticks_{symbol_str}_{timestamp}.json"
            filepath = f"exports/{filename}"
            
            df_sorted = df.sort_values('timestamp')
            df_sorted.to_json(filepath, orient='records', lines=True)
            
            logger.info(f"✅ Exported {len(df_sorted)} records to {filepath}")
            
            return FileResponse(
                filepath,
                media_type="application/json",
                filename=filename,
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        
        else:
            return JSONResponse(
                {"error": "Unsupported format. Use 'csv' or 'json'"}, 
                status_code=400
            )
            
    except FileNotFoundError:
        return JSONResponse(
            {"error": f"No data available for symbol: {symbol}"}, 
            status_code=404
        )
    except Exception as e:
        logger.error(f"❌ Export error: {e}", exc_info=True)
        return JSONResponse(
            {"error": f"Export failed: {str(e)}"}, 
            status_code=500
        )


@app.get("/debug/alerts")
async def debug_alerts():
    """Debug endpoint to check alert system status"""
    try:
        alerts = data_processor.alert_manager.get_alerts()
        triggered = data_processor.alert_manager.get_triggered_alerts(count=50)
        analytics = data_processor.get_latest_analytics()
        
        debug_info = {
            "total_alerts": len(alerts),
            "active_alerts": len([a for a in alerts if a.get('active', True)]),
            "triggered_count": len(triggered),
            "alerts_detail": [
                {
                    "id": a.get('id'),
                    "name": a.get('name'),
                    "symbol": a.get('symbol'),
                    "condition": a.get('condition'),
                    "threshold": a.get('value'),
                    "active": a.get('active', True),
                    "current_value": (
                        analytics.get('price', {}).get(a['symbol']) if 'price' in a.get('condition', '')
                        else analytics.get('zscore', {}).get(a['symbol']) if 'zscore' in a.get('condition', '')
                        else None
                    )
                }
                for a in alerts
            ],
            "recent_triggers": triggered[-10:] if triggered else []
        }
        
        return JSONResponse(debug_info)
    except Exception as e:
        logger.error(f"Debug alerts error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/analytics/detailed/{symbol1}/{symbol2}")
async def get_detailed_pair_analysis(symbol1: str, symbol2: str):
    """Get detailed statistical analysis for a trading pair"""
    try:
        b1 = data_processor.tick_buffers.get(symbol1.upper())
        b2 = data_processor.tick_buffers.get(symbol2.upper())
        
        if not b1 or not b2:
            return JSONResponse({"error": "Symbols not found"}, status_code=404)
        
        if len(b1.ticks) < 200 or len(b2.ticks) < 200:
            return JSONResponse({
                "error": f"Insufficient data. Need 200+ points, have {len(b1.ticks)}, {len(b2.ticks)}",
                "recommendation": "Upload historical data or collect more real-time data"
            }, status_code=400)
        
        # Get last 1000 points for analysis
        df1 = b1.to_dataframe().tail(1000)
        df2 = b2.to_dataframe().tail(1000)
        
        # Clean and align data
        df1 = df1[df1['price'] > 0].drop_duplicates(subset=['timestamp'])
        df2 = df2[df2['price'] > 0].drop_duplicates(subset=['timestamp'])
        
        # Simple alignment by index
        min_len = min(len(df1), len(df2))
        p1 = df1['price'].tail(min_len).reset_index(drop=True)
        p2 = df2['price'].tail(min_len).reset_index(drop=True)
        
        # Calculate spread
        hedge = AnalyticsEngine.compute_hedge_ratio(p1, p2)
        spread = AnalyticsEngine.compute_spread(p1, p2, hedge['beta'])
        
        # Comprehensive ADF analysis
        adf_spread = AnalyticsEngine.adf_test(spread, 'spread')
        adf_p1 = AnalyticsEngine.adf_test(p1, 'price')
        adf_p2 = AnalyticsEngine.adf_test(p2, 'price')
        
        # Calculate additional statistics
        spread_stats = {
            'mean': float(spread.mean()),
            'std': float(spread.std()),
            'min': float(spread.min()),
            'max': float(spread.max()),
            'current': float(spread.iloc[-1]) if len(spread) > 0 else None
        }
        
        analysis = {
            'pair': f"{symbol1}/{symbol2}",
            'data_points': min_len,
            'hedge_ratio': hedge,
            'spread_statistics': spread_stats,
            'adf_tests': {
                'spread': adf_spread,
                f'{symbol1}_price': adf_p1,
                f'{symbol2}_price': adf_p2
            },
            'interpretation': {
                'cointegrated': adf_spread.get('is_stationary', False),
                'mean_reverting': adf_spread.get('is_stationary', False) and abs(spread_stats['mean']) < spread_stats['std'],
                'trading_signal': 'BUY' if spread_stats['current'] and spread_stats['current'] < -spread_stats['std'] else 'SELL' if spread_stats['current'] and spread_stats['current'] > spread_stats['std'] else 'HOLD',
                'reliability': adf_spread.get('interpretation', {}).get('reliability', 'Unknown')
            }
        }
        
        return JSONResponse(analysis)
        
    except Exception as e:
        logger.error(f"Detailed analysis error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/debug/status")
async def debug_status():
    """Debug endpoint to check system status"""
    status = {
        "system": {
            "running": data_processor.running,
            "active_symbols": list(data_processor.active_symbols),
            "connected_clients": len(connected_clients)
        },
        "buffers": {
            symbol: {
                "tick_count": len(buffer.ticks),
                "latest_price": buffer.ticks[-1].price if buffer.ticks else None,
                "latest_timestamp": buffer.ticks[-1].timestamp if buffer.ticks else None
            }
            for symbol, buffer in data_processor.tick_buffers.items()
        },
        "analytics": data_processor.get_latest_analytics(),
        "alerts": {
            "total": len(data_processor.alert_manager.get_alerts()),
            "triggered": len(data_processor.alert_manager.get_triggered_alerts())
        }
    }
    return JSONResponse(status)


@app.get("/")
async def root():
    """Root endpoint with API documentation"""
    return {
        "service": "Trading Analytics Backend",
        "version": "1.0.0",
        "status": "running",
        "active_symbols": list(data_processor.active_symbols),
        "tick_counts": {symbol: len(buffer.ticks) for symbol, buffer in data_processor.tick_buffers.items()},
        "endpoints": {
            "websocket_data": "ws://localhost:8000/ws/from_tool",
            "websocket_analytics": "ws://localhost:8000/ws/analytics",
            "rest_analytics": "/api/analytics",
            "rest_symbols": "/api/symbols",
            "rest_historical": "/api/historical/{symbol}?timeframe=1m&limit=1000",
            "rest_ticks": "/api/ticks/{symbol}?limit=1000",
            "rest_alerts": "/api/alerts",
            "rest_export": "/api/export?symbol=BTCUSDT&format=csv",
            "analytics_latest": "/analytics/latest?symbol1=BTCUSDT&symbol2=ETHUSDT",
            "debug_status": "/debug/status"
        }
    }


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )