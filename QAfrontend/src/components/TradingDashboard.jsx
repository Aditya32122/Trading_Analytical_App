import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, Activity, BarChart3, GitCompare, Bell, Settings, RefreshCw, Download, Maximize2, Minimize2, AlertCircle, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AlertsWidget from './AlertsWidget';
import NotificationsWidget from './NotificationsWidget';
import useAlertsManager from '../hooks/useAlertsManager';


const TradingAnalyticsDashboard = () => {
  const navigate = useNavigate();
  const [wsConnected, setWsConnected] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [symbols, setSymbols] = useState([]);
  const [selectedSymbol1, setSelectedSymbol1] = useState('');
  const [selectedSymbol2, setSelectedSymbol2] = useState('');
  const [timeframe, setTimeframe] = useState('1m');
  const [rollingWindow, setRollingWindow] = useState(20);
  const [historicalData, setHistoricalData] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState([]);
  const [expandedWidget, setExpandedWidget] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Add refs to prevent unnecessary re-renders
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const analyticsUpdateTimerRef = useRef(null);
  const lastAnalyticsRef = useRef(null);
  
  // Buffered history with fixed max size
  const MAX_HISTORY_POINTS = 100;
  const [zscoreHistory, setZscoreHistory] = useState([]);
  const [spreadHistory, setSpreadHistory] = useState([]);

  // Use the alerts manager hook
  const {
    alerts: alertsFromHook,
    triggeredAlerts: triggeredAlertsFromHook,
    loading: alertsLoading,
    error: alertsError,
    deleteAlert,
    createAlert,
    dismissTriggeredAlert,
    refreshAlerts,
    refreshTriggeredAlerts
  } = useAlertsManager(analytics, selectedSymbol1);

  // Update local state when hook values change
  useEffect(() => {
    setAlerts(alertsFromHook);
    setTriggeredAlerts(triggeredAlertsFromHook);
  }, [alertsFromHook, triggeredAlertsFromHook]);

   // Handle alert deletion
  const handleDeleteAlert = useCallback(async (alertId) => {
    try {
      await deleteAlert(alertId);
      console.log('✅ Alert deleted successfully');
    } catch (error) {
      console.error('❌ Failed to delete alert:', error);
    }
  }, [deleteAlert]);

  // Handle notification dismissal
  const handleDismissNotification = useCallback((notificationId) => {
    // Use the hook function for proper state management
    dismissTriggeredAlert(notificationId);
  }, [dismissTriggeredAlert]);


  
// Optimized analytics update - only update changed fields
const updateAnalytics = useCallback((newAnalytics) => {
  setAnalytics(prev => {
    if (!prev) return newAnalytics;
    
    // Check if critical fields changed
    const priceChanged = JSON.stringify(prev.price) !== JSON.stringify(newAnalytics.price);
    const zscoreChanged = JSON.stringify(prev.zscore) !== JSON.stringify(newAnalytics.zscore);
    const spreadChanged = JSON.stringify(prev.spread) !== JSON.stringify(newAnalytics.spread);
    
    // Only update if something actually changed
    if (priceChanged || zscoreChanged || spreadChanged) {
      return newAnalytics;
    }
    
    return prev; // No change, keep previous reference
  });
}, []);
  // WebSocket connection with reconnection logic
  useEffect(() => {
    const connect = () => {
      try {
        const ws = new WebSocket('ws://localhost:8000/ws/analytics');
        wsRef.current = ws;
        
        ws.onopen = () => {
          console.log('✅ WebSocket connected');
          setWsConnected(true);
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Use debounced update
            updateAnalytics(data);
            
            // Build z-score history with deduplication
            if (selectedSymbol1 && data.zscore?.[selectedSymbol1] !== undefined) {
              setZscoreHistory(prev => {
                const timestamp = new Date(data.timestamp).toLocaleTimeString();
                const zscore = data.zscore[selectedSymbol1];
                
                // Prevent duplicate timestamps
                const lastPoint = prev[prev.length - 1];
                if (lastPoint && lastPoint.timestamp === timestamp) {
                  return prev;
                }
                
                const newPoint = {
                  timestamp,
                  zscore,
                  time: Date.now()
                };
                
                // Keep only last N points
                const updated = [...prev, newPoint];
                if (updated.length > MAX_HISTORY_POINTS) {
                  return updated.slice(-MAX_HISTORY_POINTS);
                }
                return updated;
              });
            }
            
            // Build spread history with deduplication
            const pairKey = `${selectedSymbol1}_${selectedSymbol2}`;
            if (selectedSymbol1 && selectedSymbol2 && data.spread?.[pairKey] !== undefined) {
              setSpreadHistory(prev => {
                const timestamp = new Date(data.timestamp).toLocaleTimeString();
                const spread = data.spread[pairKey];
                
                // Prevent duplicate timestamps
                const lastPoint = prev[prev.length - 1];
                if (lastPoint && lastPoint.timestamp === timestamp) {
                  return prev;
                }
                
                const newPoint = {
                  timestamp,
                  spread,
                  time: Date.now()
                };
                
                const updated = [...prev, newPoint];
                if (updated.length > MAX_HISTORY_POINTS) {
                  return updated.slice(-MAX_HISTORY_POINTS);
                }
                return updated;
              });
            }
          } catch (error) {
            console.error('Error parsing analytics:', error);
          }
        };
        
        ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          setWsConnected(false);
        };
        
        ws.onclose = () => {
          console.log('🔌 WebSocket disconnected');
          setWsConnected(false);
          
          // Attempt reconnection after 5 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('🔄 Attempting to reconnect...');
            connect();
          }, 5000);
        };
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        setWsConnected(false);
      }
    };
    
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (analyticsUpdateTimerRef.current) {
        clearTimeout(analyticsUpdateTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [selectedSymbol1, selectedSymbol2, updateAnalytics]);

  // Fetch available symbols
 useEffect(() => {
  const fetchSymbols = () => {
    fetch('http://localhost:8000/api/symbols')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data.symbols && Array.isArray(data.symbols) && data.symbols.length > 0) {
          setSymbols(prev => {
            // Only update if symbols actually changed
            if (JSON.stringify(prev) !== JSON.stringify(data.symbols)) {
              return data.symbols;
            }
            return prev;
          });
          if (!selectedSymbol1 && data.symbols[0]) {
            setSelectedSymbol1(data.symbols[0]);
          }
          if (!selectedSymbol2 && data.symbols.length > 1) {
            setSelectedSymbol2(data.symbols[1]);
          }
        }
      })
      .catch(err => console.error('Error fetching symbols:', err));
  };
  
  fetchSymbols();
  const interval = setInterval(fetchSymbols, 30000);
  return () => clearInterval(interval);
}, [selectedSymbol1, selectedSymbol2]); 

  // Fetch historical data for symbol1
  useEffect(() => {
    if (!selectedSymbol1 || !autoRefresh) return;
    
    const fetchData = () => {
      fetch(`http://localhost:8000/api/historical/${selectedSymbol1}?timeframe=${timeframe}&limit=100`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setHistoricalData(prev => ({ ...prev, [selectedSymbol1]: data }));
          }
        })
        .catch(err => console.error(`Error fetching ${selectedSymbol1} data:`, err));
    };
    
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [selectedSymbol1, timeframe, autoRefresh]);

useEffect(() => {
  if (!selectedSymbol1 || !autoRefresh) return;
  
  const fetchData = () => {
    fetch(`http://localhost:8000/api/price_history/${selectedSymbol1}?limit=100`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          console.log(`Received ${data.length} price points for ${selectedSymbol1}`);
          setHistoricalData(prev => {
            // Only update if data actually changed
            const prevData = prev[selectedSymbol1];
            if (!prevData || JSON.stringify(prevData) !== JSON.stringify(data)) {
              return { ...prev, [selectedSymbol1]: data };
            }
            return prev;
          });
        }
      })
      .catch(err => console.error(`Error fetching ${selectedSymbol1} data:`, err));
  };
  
  fetchData();
  const interval = setInterval(fetchData, 5000);
  return () => clearInterval(interval);
}, [selectedSymbol1, autoRefresh]);

// Apply the same pattern to the symbol2 fetch
useEffect(() => {
  if (!selectedSymbol2 || !autoRefresh) return;
  
  const fetchData = () => {
    fetch(`http://localhost:8000/api/price_history/${selectedSymbol2}?limit=100`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          console.log(`Received ${data.length} price points for ${selectedSymbol2}`);
          setHistoricalData(prev => {
            // Only update if data actually changed
            const prevData = prev[selectedSymbol2];
            if (!prevData || JSON.stringify(prevData) !== JSON.stringify(data)) {
              return { ...prev, [selectedSymbol2]: data };
            }
            return prev;
          });
        }
      })
      .catch(err => console.error(`Error fetching ${selectedSymbol2} data:`, err));
  };
  
  fetchData();
  const interval = setInterval(fetchData, 5000);
  return () => clearInterval(interval);
}, [selectedSymbol2, autoRefresh]);

const runADFTest = async () => {
  if (!selectedSymbol1 || !selectedSymbol2) {
    alert('⚠️ Please select both symbols for pair analysis');
    return;
  }
  
  try {
    console.log(`🧪 Running ADF test for ${selectedSymbol1}/${selectedSymbol2}`);
    
    const res = await fetch(`http://localhost:8000/api/analytics/detailed/${selectedSymbol1}/${selectedSymbol2}`);
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      
      if (res.status === 400) {
        // Handle insufficient data gracefully
        const capabilities = errorData.current_capabilities || {};
        let message = `⚠️ ${errorData.error}\n\n`;
        
        if (errorData.recommendation) {
          message += `📋 ${errorData.recommendation}\n\n`;
        }
        
        message += `📊 Current Capabilities:\n`;
        message += `├─ Basic Analysis: ${capabilities.basic_analysis ? '✅' : '❌'}\n`;
        message += `├─ Correlation: ${capabilities.correlation ? '✅' : '❌'}\n`;
        message += `└─ ADF Testing: ${capabilities.adf_test ? '✅' : '❌'}\n\n`;
        
        if (errorData.details) {
          message += `📈 ${errorData.details}`;
        }
        
        alert(message);
        return;
      } else if (res.status === 404) {
        alert(`❌ Symbols not found: ${errorData.error}\n\nAvailable symbols: ${errorData.available_symbols?.join(', ') || 'None'}`);
        return;
      }
      
      throw new Error(`HTTP ${res.status}: ${errorData.error || 'Unknown error'}`);
    }
    
    const data = await res.json();
    console.log('📊 ADF Analysis Result:', data);
    
    // Display comprehensive results
    const spreadADF = data.adf_tests?.spread;
    const interpretation = data.interpretation;
    const warnings = data.warnings || [];
    
    let message = `📊 Comprehensive Statistical Analysis\n`;
    message += `${'='.repeat(50)}\n\n`;
    
    message += `🎯 PAIR: ${data.pair}\n`;
    message += `📊 Data Points: ${data.data_points}\n`;
    message += `🕒 Analysis Time: ${new Date(data.timestamp).toLocaleTimeString()}\n\n`;
    
    // Data Quality Section
    message += `📈 DATA QUALITY:\n`;
    if (data.data_quality) {
      message += `├─ Raw Points: ${data.data_quality.raw_points?.symbol1 || 0} / ${data.data_quality.raw_points?.symbol2 || 0}\n`;
      message += `├─ Clean Points: ${data.data_quality.clean_points?.symbol1 || 0} / ${data.data_quality.clean_points?.symbol2 || 0}\n`;
      message += `└─ Aligned Points: ${data.data_quality.aligned_points || 0}\n\n`;
    }
    
    // Hedge Ratio Section
    if (data.hedge_ratio) {
      message += `🔗 HEDGE RATIO:\n`;
      message += `├─ Beta: ${data.hedge_ratio.beta?.toFixed(4) || 'N/A'}\n`;
      message += `├─ Alpha: ${data.hedge_ratio.alpha?.toFixed(4) || 'N/A'}\n`;
      message += `└─ R²: ${data.hedge_ratio.r_squared?.toFixed(4) || 'N/A'}\n\n`;
    }
    
    // Spread Statistics
    if (data.spread_statistics) {
      const stats = data.spread_statistics;
      message += `📊 SPREAD ANALYSIS:\n`;
      message += `├─ Current: ${stats.current?.toFixed(4) || 'N/A'}\n`;
      message += `├─ Mean: ${stats.mean?.toFixed(4) || 'N/A'}\n`;
      message += `├─ Std Dev: ${stats.std?.toFixed(4) || 'N/A'}\n`;
      message += `├─ Z-Score: ${stats.z_score?.toFixed(3) || 'N/A'}\n`;
      message += `├─ Min: ${stats.min?.toFixed(4) || 'N/A'}\n`;
      message += `└─ Max: ${stats.max?.toFixed(4) || 'N/A'}\n\n`;
    }
    
    // ADF Test Results
    message += `🧪 STATIONARITY TESTS (ADF):\n`;
    
    if (spreadADF) {
      if (spreadADF.error) {
        message += `├─ Spread Test: ❌ FAILED - ${spreadADF.error}\n`;
      } else {
        message += `├─ Spread Stationary: ${spreadADF.is_stationary ? '✅ YES' : '❌ NO'}\n`;
        message += `├─ P-Value: ${spreadADF.p_value?.toFixed(6) || 'N/A'}\n`;
        message += `├─ ADF Statistic: ${spreadADF.adf_statistic?.toFixed(6) || 'N/A'}\n`;
        message += `├─ Sample Size: ${spreadADF.sample_size || 'N/A'}\n`;
        message += `├─ Confidence: ${spreadADF.confidence || 'N/A'}\n`;
        message += `└─ Reliability: ${spreadADF.interpretation?.reliability || 'Unknown'}\n`;
      }
    } else {
      message += `├─ Spread Test: ❌ NOT AVAILABLE\n`;
    }
    message += `\n`;
    
    // Individual Symbol Tests
    const symbols = [selectedSymbol1.toUpperCase(), selectedSymbol2.toUpperCase()];
    symbols.forEach((symbol, idx) => {
      const adf = data.adf_tests?.[`${symbol}_price`];
      const prefix = idx === symbols.length - 1 ? '└─' : '├─';
      
      if (adf && !adf.error) {
        message += `${prefix} ${symbol}: ${adf.is_stationary ? '✅' : '❌'} (p=${adf.p_value?.toFixed(4) || 'N/A'})\n`;
      } else {
        message += `${prefix} ${symbol}: ❌ FAILED\n`;
      }
    });
    message += `\n`;
    
    // Trading Interpretation
    message += `💡 TRADING ANALYSIS:\n`;
    message += `├─ Cointegrated: ${interpretation?.cointegrated ? '✅ YES' : '❌ NO'}\n`;
    message += `├─ Mean Reverting: ${interpretation?.mean_reverting ? '✅ YES' : '❌ NO'}\n`;
    message += `├─ Signal: ${interpretation?.trading_signal || 'UNKNOWN'}\n`;
    message += `├─ Recommendation: ${interpretation?.recommendation || 'N/A'}\n`;
    message += `└─ Confidence: ${interpretation?.confidence_level || 'Unknown'}\n\n`;
    
    // Warnings
    if (warnings.length > 0) {
      message += `⚠️ WARNINGS:\n`;
      warnings.forEach((warning, idx) => {
        const prefix = idx === warnings.length - 1 ? '└─' : '├─';
        message += `${prefix} ${warning}\n`;
      });
      message += `\n`;
    }
    
    // Overall Assessment
    if (interpretation?.cointegrated) {
      message += `🎉 EXCELLENT! This pair shows cointegration - ideal for pairs trading!`;
    } else if (interpretation?.reliability === 'Low' || interpretation?.reliability === 'Very Low') {
      message += `📊 Need more data for reliable statistical analysis.`;
    } else {
      message += `⚠️ This pair may not be suitable for mean reversion strategies.`;
    }
    
    alert(message);
    
  } catch (err) {
    console.error('❌ ADF test error:', err);
    
    if (err.message.includes('Failed to fetch')) {
      alert('❌ Cannot connect to backend.\n\nCheck:\n• Backend running on port 8000\n• No CORS issues\n• Network connectivity');
    } else {
      alert(`❌ ADF Test Error:\n\n${err.message}\n\nCheck browser console for details.`);
    }
  }
};

  const exportData = async () => {
    if (!selectedSymbol1) {
      alert('⚠️ Please select a symbol first');
      return;
    }
    
    try {
      const url = `http://localhost:8000/api/export?symbol=${selectedSymbol1}&format=csv`;
      window.open(url, '_blank');
    } catch (err) {
      console.error('Error exporting data:', err);
      alert('❌ Error exporting data. Check console for details.');
    }
  };

  // Memoized Widget component to prevent unnecessary re-renders
  const Widget = React.memo(({ title, icon: Icon, children, widgetId }) => {
    const isExpanded = expandedWidget === widgetId;
    
    return (
      <div className={`bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700 transition-all ${isExpanded ? 'col-span-2 row-span-2' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">{title}</h3>
          </div>
          <button
            onClick={() => setExpandedWidget(isExpanded ? null : widgetId)}
            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-gray-700 rounded"
            title={isExpanded ? 'Minimize' : 'Expand'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
        <div className={isExpanded ? 'h-96' : 'h-64'}>
          {children}
        </div>
      </div>
    );
  });

 const formatChartData = useCallback((data) => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return [];
  }
  
  console.log(`Formatting ${data.length} price points for chart`);
  
  const formatted = data
    .map((item, index) => {
      // Parse timestamp (could be in milliseconds or seconds)
      const ts = item.timestamp > 1e12 ? item.timestamp : item.timestamp * 1000;
      const date = new Date(ts);
      
      return {
        timestamp: date.toLocaleTimeString(),
        fullTimestamp: date.toLocaleString(),
        price: parseFloat(item.price) || 0,
        volume: parseFloat(item.volume) || 0,
        // For line chart, we just need price
        close: parseFloat(item.price) || 0,
        high: parseFloat(item.price) || 0,
        low: parseFloat(item.price) || 0,
        open: parseFloat(item.price) || 0,
        originalIndex: index
      };
    })
    .filter(item => item.price > 0)
    .slice(-50); // Keep last 50 points
  
  console.log(`Formatted ${formatted.length} valid points`);
  return formatted;
}, []);

  // Memoized chart data formatters - NOW formatChartData is available
  const formattedPriceData = useMemo(() => {
    return formatChartData(historicalData[selectedSymbol1]);
  }, [historicalData[selectedSymbol1], formatChartData]);
  
  const formattedVolumeData = useMemo(() => {
    return formatChartData(historicalData[selectedSymbol1]);
  }, [historicalData[selectedSymbol1], formatChartData]);
  
  const formattedSymbol2Data = useMemo(() => {
    return formatChartData(historicalData[selectedSymbol2]);
  }, [historicalData[selectedSymbol2], formatChartData]);

  // Memoized helpers
  const getPairKey = useCallback(() => {
    if (selectedSymbol1 && selectedSymbol2) {
      return `${selectedSymbol1}_${selectedSymbol2}`;
    }
    return null;
  }, [selectedSymbol1, selectedSymbol2]);

  const getZScoreColor = useCallback((zscore) => {
    const abs = Math.abs(zscore || 0);
    if (abs > 2.5) return '#DC2626';
    if (abs > 2) return '#EF4444';
    if (abs > 1.5) return '#F59E0B';
    if (abs > 1) return '#FBBF24';
    return '#3B82F6';
  }, []);

  const handleUploadComplete = useCallback((result) => {
    console.log('Upload complete:', result);
    // Refresh symbols and analytics
    fetch('http://localhost:8000/api/symbols')
      .then(res => res.json())
      .then(data => {
        if (data.symbols) {
          setSymbols(data.symbols);
        }
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              Trading Analytics Dashboard
            </h1>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span className={`flex items-center gap-2 ${wsConnected ? 'text-green-400' : 'text-red-400'}`}>
                <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-red-400'} ${wsConnected ? 'animate-pulse' : ''}`}></div>
                {wsConnected ? 'Connected' : 'Disconnected'}
              </span>
              <span>Last Update: {analytics?.timestamp ? new Date(analytics.timestamp).toLocaleTimeString() : 'N/A'}</span>
              <span>Symbols: {symbols.length}</span>
              {/* {triggeredAlerts.length > 0 && (
                <span className="text-yellow-400 font-semibold animate-pulse flex items-center gap-1">
                  <Bell className="w-4 h-4" />
                  {triggeredAlerts.length} Alert{triggeredAlerts.length > 1 ? 's' : ''} Triggered!
                </span>
              )} */}
            </div>
          </div>
          
          <div className="flex gap-2">
            {/* ADD THIS BUTTON */}
            <button
              onClick={() => navigate('/upload')}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center gap-2 transition-colors"
              title="Upload historical data"
            >
              <Upload className="w-4 h-4" />
              Upload Data
            </button>
            
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${autoRefresh ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'} transition-colors`}
              title={autoRefresh ? 'Auto-refresh enabled' : 'Auto-refresh disabled'}
            >
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              Auto Refresh
            </button>
            {/* <button
              onClick={createAlert}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg flex items-center gap-2 transition-colors"
              title="Create new alert"
            >
              <Bell className="w-4 h-4" />
              New Alert
            </button> */}
            <button
              onClick={exportData}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg flex items-center gap-2 transition-colors"
              title="Export data to CSV"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* REMOVE OHLCUploadWidget - no longer needed here */}

      {/* Controls */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
        <div className="grid grid-cols-5 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Symbol 1</label>
            <select
              value={selectedSymbol1}
              onChange={(e) => {
                setSelectedSymbol1(e.target.value);
                setZscoreHistory([]);
              }}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select Symbol</option>
              {symbols.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-2">Symbol 2</label>
            <select
              value={selectedSymbol2}
              onChange={(e) => {
                setSelectedSymbol2(e.target.value);
                setSpreadHistory([]);
              }}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select Symbol</option>
              {symbols.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-2">Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="1s">1 Second</option>
              <option value="1m">1 Minute</option>
              <option value="5m">5 Minutes</option>
              <option value="15m">15 Minutes</option>
              <option value="1h">1 Hour</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-2">Rolling Window</label>
            <input
              type="number"
              value={rollingWindow}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 20;
                setRollingWindow(Math.max(5, Math.min(100, val)));
              }}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              min="5"
              max="100"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-2">ADF Test</label>
            <button
              onClick={runADFTest}
              disabled={!selectedSymbol1 || !selectedSymbol2}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded px-3 py-2 transition-colors"
            >
              Run Test
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {selectedSymbol1 && analytics?.price?.[selectedSymbol1] !== undefined && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors">
            <div className="text-sm text-gray-400 mb-1">{selectedSymbol1} Price</div>
            <div className="text-2xl font-bold text-green-400">
              ${analytics.price[selectedSymbol1].toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Vol: {(analytics.volatility?.[selectedSymbol1] || 0).toFixed(2)}%
            </div>
          </div>
        )}
        
        {selectedSymbol1 && analytics?.zscore?.[selectedSymbol1] !== undefined && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors">
            <div className="text-sm text-gray-400 mb-1">{selectedSymbol1} Z-Score</div>
            <div 
              className="text-2xl font-bold"
              style={{ color: getZScoreColor(analytics.zscore[selectedSymbol1]) }}
            >
              {analytics.zscore[selectedSymbol1].toFixed(3)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Ticks: {analytics.tick_count?.[selectedSymbol1] || 0}
            </div>
          </div>
        )}
        
        {selectedSymbol2 && analytics?.price?.[selectedSymbol2] !== undefined && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors">
            <div className="text-sm text-gray-400 mb-1">{selectedSymbol2} Price</div>
            <div className="text-2xl font-bold text-green-400">
              ${analytics.price[selectedSymbol2].toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Vol: {(analytics.volatility?.[selectedSymbol2] || 0).toFixed(2)}%
            </div>
          </div>
        )}
        
        {getPairKey() && analytics?.correlation?.[getPairKey()] !== undefined && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors">
            <div className="text-sm text-gray-400 mb-1">Correlation</div>
            <div className="text-2xl font-bold text-purple-400">
              {(analytics.correlation[getPairKey()] * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {selectedSymbol1}/{selectedSymbol2}
            </div>
          </div>
        )}
      </div>

      {/* Widgets Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Price Chart - Memoized */}
       <Widget title={`${selectedSymbol1 || 'Symbol 1'} Price Chart`} icon={TrendingUp} widgetId="price1">
        {formattedPriceData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formattedPriceData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="timestamp" 
                stroke="#9CA3AF" 
                fontSize={10}
                interval="preserveStartEnd"
              />
              <YAxis 
                stroke="#9CA3AF" 
                fontSize={11} 
                domain={['auto', 'auto']}
                width={70}
                tickFormatter={(value) => `$${value.toFixed(2)}`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  border: '1px solid #374151', 
                  borderRadius: '8px',
                  padding: '10px'
                }}
                labelStyle={{ color: '#9CA3AF', marginBottom: '5px' }}
                formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Price']}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              
              {/* Single THICK price line */}
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke="#10B981" 
                strokeWidth={3} 
                dot={false} 
                name="Price"
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <AlertCircle className="w-12 h-12 mb-2 text-gray-600" />
            <p className="text-center">
              {selectedSymbol1 
                ? 'Waiting for price data...\nMake sure data is streaming.' 
                : 'Please select a symbol'}
            </p>
          </div>
        )}
      </Widget>
        

        {/* Z-Score Chart - Optimized with stable data */}
        <Widget title={`${selectedSymbol1 || 'Symbol'} Z-Score Evolution`} icon={Activity} widgetId="zscore">
          {zscoreHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={zscoreHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="#9CA3AF" 
                  fontSize={12}
                  interval="preserveStartEnd"
                  minTickGap={50}
                />
                <YAxis stroke="#9CA3AF" fontSize={12} width={60} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1F2937', 
                    border: '1px solid #374151', 
                    borderRadius: '8px' 
                  }}
                  formatter={(value) => [Number(value).toFixed(3), 'Z-Score']}
                  isAnimationActive={false}
                />
                <ReferenceLine y={2} stroke="#EF4444" strokeDasharray="3 3" label={{ value: '+2σ', fill: '#EF4444', fontSize: 12 }} />
                <ReferenceLine y={-2} stroke="#EF4444" strokeDasharray="3 3" label={{ value: '-2σ', fill: '#EF4444', fontSize: 12 }} />
                <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="3 3" />
                <Area 
                  type="monotone" 
                  dataKey="zscore" 
                  stroke="#3B82F6" 
                  fill="#3B82F680" 
                  name="Z-Score"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Activity className="w-12 h-12 mb-2 text-gray-600 animate-pulse" />
              <p>{selectedSymbol1 ? 'Building z-score history...' : 'Please select a symbol'}</p>
            </div>
          )}
        </Widget>

        {/* Spread Chart - Optimized */}
        <Widget title={`Spread: ${selectedSymbol1}/${selectedSymbol2}`} icon={GitCompare} widgetId="spread">
          {spreadHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={spreadHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="#9CA3AF" 
                  fontSize={12}
                  interval="preserveStartEnd"
                  minTickGap={50}
                />
                <YAxis stroke="#9CA3AF" fontSize={12} width={60} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1F2937', 
                    border: '1px solid #374151', 
                    borderRadius: '8px' 
                  }}
                  formatter={(value) => [Number(value).toFixed(4), 'Spread']}
                  isAnimationActive={false}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="spread" 
                  stroke="#8B5CF6" 
                  strokeWidth={2} 
                  dot={false} 
                  name="Spread"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <GitCompare className="w-12 h-12 mb-2 text-gray-600 animate-pulse" />
              <p>Waiting for spread data (need both symbols)...</p>
            </div>
          )}
        </Widget>

        {/* Volume Chart - Optimized */}
        <Widget title={`${selectedSymbol1 || 'Symbol'} Volume Profile`} icon={BarChart3} widgetId="volume">
          {formattedVolumeData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={formattedVolumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="#9CA3AF" 
                  fontSize={12}
                  interval="preserveStartEnd"
                  minTickGap={50}
                />
                <YAxis stroke="#9CA3AF" fontSize={12} width={60} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1F2937', 
                    border: '1px solid #374151', 
                    borderRadius: '8px' 
                  }}
                  formatter={(value) => [Number(value).toFixed(4), 'Volume']}
                  isAnimationActive={false}
                />
                <Bar 
                  dataKey="volume" 
                  fill="#F59E0B" 
                  name="Volume"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <BarChart3 className="w-12 h-12 mb-2 text-gray-600" />
              <p>No volume data available</p>
            </div>
          )}
        </Widget>

         <AlertsWidget
  expandedWidget={expandedWidget}
  setExpandedWidget={setExpandedWidget}
/>


        <NotificationsWidget
    triggeredAlerts={triggeredAlerts}
    onDismiss={handleDismissNotification}
  />

        {/* Stats Summary */}
        <Widget title="Statistics Summary" icon={Settings} widgetId="stats">
          <div className="space-y-3 overflow-y-auto h-full">
            {getPairKey() && analytics?.hedge_ratio?.[getPairKey()] && (
              <div className="bg-gray-700 rounded p-3">
                <div className="text-sm text-gray-400">Hedge Ratio</div>
                <div className="text-xl font-semibold text-white">
                  β = {analytics.hedge_ratio[getPairKey()].beta?.toFixed(4) || 'N/A'}
                </div>
                <div className="text-xs text-gray-500">
                  R² = {analytics.hedge_ratio[getPairKey()].r_squared?.toFixed(4) || 'N/A'}
                </div>
              </div>
            )}
            
            {getPairKey() && analytics?.adf_test?.[getPairKey()] && (
              <div className="bg-gray-700 rounded p-3">
                <div className="text-sm text-gray-400">ADF Test</div>
                <div className="text-xl font-semibold text-white">
                  {analytics.adf_test[getPairKey()].is_stationary ? '✓ Stationary' : '✗ Non-Stationary'}
                </div>
                <div className="text-xs text-gray-500">
                  p-value: {analytics.adf_test[getPairKey()].p_value?.toFixed(4) || 'N/A'}
                </div>
              </div>
            )}
            
            {selectedSymbol1 && analytics?.volume?.[selectedSymbol1] && (
              <div className="bg-gray-700 rounded p-3">
                <div className="text-sm text-gray-400">{selectedSymbol1} Volume</div>
                <div className="text-xl font-semibold text-white">
                  {analytics.volume[selectedSymbol1].toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </Widget>
      </div>
    </div>
  );
};

export default TradingAnalyticsDashboard;