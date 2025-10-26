import React, { useState, useEffect } from 'react';
import { Upload, Download, CheckCircle, Lock, ArrowLeft, Database, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const UploadPage = () => {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  // Fetch current analytics to show capabilities
  useEffect(() => {
    const fetchAnalytics = () => {
      fetch('http://localhost:8000/api/analytics')
        .then(res => res.json())
        .then(data => setAnalytics(data))
        .catch(err => console.error('Error fetching analytics:', err));
    };
    
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 5000);
    return () => clearInterval(interval);
  }, []);

  const getCapabilities = () => {
    const dataPoints = analytics?.data_points || 0;

    return {
      basicPriceTracking: { enabled: dataPoints >= 1, required: 1, name: 'Price Tracking', icon: '📊', description: 'Real-time price monitoring' },
      volumeAnalysis: { enabled: dataPoints >= 10, required: 10, name: 'Volume Analysis', icon: '📈', description: 'Trading volume metrics' },
      zScoreCalculation: { enabled: dataPoints >= 20, required: 20, name: 'Z-Score Calculation', icon: '📉', description: 'Statistical price deviation' },
      volatilityMetrics: { enabled: dataPoints >= 50, required: 50, name: 'Volatility Metrics', icon: '⚡', description: 'Price volatility analysis' },
      correlationAnalysis: { enabled: dataPoints >= 100, required: 100, name: 'Correlation Analysis', icon: '🔗', description: 'Multi-asset correlation' },
      spreadTrading: { enabled: dataPoints >= 100, required: 100, name: 'Spread Trading', icon: '↔️', description: 'Pair spread calculations' },
      hedgeRatioCalc: { enabled: dataPoints >= 150, required: 150, name: 'Hedge Ratio', icon: '⚖️', description: 'Optimal hedge ratios' },
      adfStationarity: { enabled: dataPoints >= 200, required: 200, name: 'ADF Test (Stationarity)', icon: '🔬', description: 'Mean reversion testing' },
      fullHistoricalCharts: { enabled: dataPoints >= 200, required: 200, name: 'Full Historical Charts', icon: '📊', description: 'Complete chart history' }
    };
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setUploading(true);
    setUploadStatus({ type: 'loading', message: 'Uploading and processing...' });
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('http://localhost:8000/api/upload/ohlc', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        setUploadStatus({
          type: 'success',
          message: `✅ Successfully uploaded ${result.candles_inserted} candles for ${result.symbols.join(', ')}`,
          details: result
        });
        
        // Refresh analytics
        const analyticsRes = await fetch('http://localhost:8000/api/analytics');
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData);
        
        // Show explanation
        setTimeout(() => {
          alert(
            `📊 Upload Complete!\n\n` +
            `✓ ${result.candles_inserted} historical candles inserted\n` +
            `✓ ${result.ticks_created} synthetic ticks created\n` +
            `✓ Symbols: ${result.symbols.join(', ')}\n\n` +
            `🎯 What happens now:\n` +
            `• Historical data is stored in database\n` +
            `• Synthetic ticks bootstrap analytics calculations\n` +
            `• All features are now unlocked!\n` +
            `• Ready for live streaming data\n\n` +
            `Redirecting to dashboard...`
          );
        }, 500);
        
        // Auto-redirect to dashboard after 5 seconds
        setTimeout(() => {
          navigate('/');
        }, 5000);
      } else {
        setUploadStatus({
          type: 'error',
          message: `❌ Error: ${result.error}`
        });
      }
    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: `❌ Upload failed: ${error.message}`
      });
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/export/template');
      const data = await response.json();
      
      const blob = new Blob([data.template], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ohlc_template.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading template:', error);
      alert('Failed to download template');
    }
  };

  const capabilities = getCapabilities();
  const dataPoints = analytics?.data_points || 0;
  const enabledCount = Object.values(capabilities).filter(c => c.enabled).length;
  const totalCount = Object.keys(capabilities).length;
  const progressPercent = (enabledCount / totalCount) * 100;

  // Calculate data source breakdown
  const tickCounts = analytics?.tick_count || {};
  const symbolCount = Object.keys(tickCounts).length;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </button>
        
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Bootstrap Analytics with Historical Data
        </h1>
        <p className="text-gray-400">
          Upload historical OHLC CSV data to instantly unlock all analytics features
        </p>
      </div>

      {/* Data Source Explanation */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="bg-blue-900/20 border border-blue-600/50 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-400" />
            How Data Points Work
          </h3>
          <div className="text-sm text-blue-200 space-y-2">
            <p>
              <strong>📤 Uploaded Data:</strong> Each OHLC candle in your CSV becomes 1 synthetic tick for analytics calculations.
              This lets you bootstrap the system with historical data.
            </p>
            <p>
              <strong>🔴 Live Streaming:</strong> Real-time ticks from WebSocket connections add to the data points continuously.
              The system tracks both sources.
            </p>
            <p>
              <strong>🎯 Total Data Points = Uploaded Ticks + Live Streaming Ticks</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Main Upload Section */}
      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-800 rounded-lg p-6 border border-blue-500/50 shadow-lg mb-6">
          {/* Upload Area */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Upload className="w-6 h-6 text-blue-400" />
                Upload OHLC Data
              </h2>
              <button
                onClick={downloadTemplate}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Template
              </button>
            </div>
            
            {/* File Input */}
            <label className="block">
              <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
                uploading 
                  ? 'border-blue-500 bg-blue-900/20' 
                  : 'border-gray-600 hover:border-blue-500 hover:bg-gray-700/50'
              }`}>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
                <Upload className={`w-12 h-12 mx-auto mb-3 ${uploading ? 'text-blue-400 animate-bounce' : 'text-gray-400'}`} />
                <p className="text-white font-medium mb-1">
                  {uploading ? 'Uploading...' : 'Click to upload or drag and drop'}
                </p>
                <p className="text-sm text-gray-400">
                  CSV files only (timestamp, symbol, open, high, low, close, volume)
                </p>
              </div>
            </label>
          </div>

          {/* Upload Status */}
          {uploadStatus && (
            <div className={`rounded-lg p-4 mb-6 border ${
              uploadStatus.type === 'success' 
                ? 'bg-green-900/50 text-green-200 border-green-600' 
                : uploadStatus.type === 'loading'
                ? 'bg-blue-900/50 text-blue-200 border-blue-600 animate-pulse'
                : 'bg-red-900/50 text-red-200 border-red-600'
            }`}>
              <p className="font-medium">{uploadStatus.message}</p>
              {uploadStatus.type === 'success' && uploadStatus.details && (
                <div className="mt-2 text-sm">
                  <p>• Candles inserted: {uploadStatus.details.candles_inserted}</p>
                  <p>• Ticks created: {uploadStatus.details.ticks_created}</p>
                  <p>• Symbols: {uploadStatus.details.symbols.join(', ')}</p>
                  <p className="mt-2 text-green-300">✓ All analytics features now available!</p>
                  <p className="text-green-300">→ Redirecting to dashboard...</p>
                </div>
              )}
            </div>
          )}

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Feature Unlock Progress</span>
              <span className="text-white font-semibold">{enabledCount} / {totalCount} Enabled</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                <Activity className="w-4 h-4" />
                Total Data Points
              </div>
              <div className="text-3xl font-bold text-white">
                {dataPoints.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {symbolCount} symbol{symbolCount !== 1 ? 's' : ''} tracked
              </div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-xs mb-1">Features Unlocked</div>
              <div className="text-3xl font-bold text-green-400">
                {enabledCount} / {totalCount}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {progressPercent.toFixed(0)}% complete
              </div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-xs mb-1">Status</div>
              <div className="text-3xl font-bold text-blue-400">
                {dataPoints >= 200 ? '✓ Ready' : '⏳ Building'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {dataPoints >= 200 ? 'All features active' : `${200 - dataPoints} more needed`}
              </div>
            </div>
          </div>
        </div>

        {/* Feature List */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-xl font-semibold text-white mb-4">Analytics Features</h3>
          <div className="grid grid-cols-1 gap-3">
            {Object.entries(capabilities).map(([key, capability]) => (
              <div 
                key={key}
                className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-all ${
                  capability.enabled 
                    ? 'bg-green-900/20 border-green-600/50' 
                    : 'bg-gray-900/30 border-gray-700'
                }`}
              >
                <div className="text-2xl mt-1">
                  {capability.enabled ? <CheckCircle className="w-6 h-6 text-green-400" /> : <Lock className="w-6 h-6 text-gray-600" />}
                </div>
                <div className="flex-1">
                  <div className={`font-medium text-lg ${capability.enabled ? 'text-green-200' : 'text-gray-500'}`}>
                    {capability.icon} {capability.name}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    {capability.description}
                  </div>
                  {!capability.enabled && (
                    <div className="text-xs text-gray-600 mt-1">
                      Requires {capability.required} data points ({capability.required - dataPoints} more needed)
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CSV Format Instructions */}
        <div className="mt-6 bg-blue-900/20 border border-blue-600/50 rounded-lg p-4">
          <h4 className="text-white font-semibold mb-2">📋 CSV Format Requirements</h4>
          <div className="text-sm text-blue-200 space-y-1">
            <p>• <strong>timestamp</strong>: Unix timestamp in milliseconds (e.g., 1729857045000)</p>
            <p>• <strong>symbol</strong>: Trading pair symbol (e.g., BTCUSDT, ETHUSDT)</p>
            <p>• <strong>open</strong>: Opening price for the period</p>
            <p>• <strong>high</strong>: Highest price in the period</p>
            <p>• <strong>low</strong>: Lowest price in the period</p>
            <p>• <strong>close</strong>: Closing price for the period</p>
            <p>• <strong>volume</strong>: Trading volume for the period</p>
          </div>
          <div className="mt-3 p-3 bg-gray-900/50 rounded font-mono text-xs text-gray-300">
            <div>timestamp,symbol,open,high,low,close,volume</div>
            <div>1729857045000,BTCUSDT,67500.00,67600.00,67400.00,67550.00,125.5</div>
          </div>
          <div className="mt-3 text-xs text-blue-300">
            💡 <strong>Tip:</strong> Download the template above to see the exact format required
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;
