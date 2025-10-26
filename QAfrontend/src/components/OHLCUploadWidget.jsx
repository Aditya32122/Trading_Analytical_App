import { useState } from 'react';
import { Upload, Download, CheckCircle, Circle, Lock } from 'lucide-react';

const OHLCUploadWidget = ({ analytics, onUploadComplete }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  // Calculate capabilities based on data points
  const getCapabilities = () => {
    const dataPoints = analytics?.tick_count 
      ? Object.values(analytics.tick_count).reduce((a, b) => a + b, 0) 
      : 0;

    return {
      basicPriceTracking: { enabled: dataPoints >= 1, required: 1, name: 'Price Tracking' },
      volumeAnalysis: { enabled: dataPoints >= 10, required: 10, name: 'Volume Analysis' },
      zScoreCalculation: { enabled: dataPoints >= 20, required: 20, name: 'Z-Score Calculation' },
      volatilityMetrics: { enabled: dataPoints >= 50, required: 50, name: 'Volatility Metrics' },
      correlationAnalysis: { enabled: dataPoints >= 100, required: 100, name: 'Correlation Analysis' },
      spreadTrading: { enabled: dataPoints >= 100, required: 100, name: 'Spread Trading' },
      hedgeRatioCalc: { enabled: dataPoints >= 150, required: 150, name: 'Hedge Ratio' },
      adfStationarity: { enabled: dataPoints >= 200, required: 200, name: 'ADF Test (Stationarity)' },
      fullHistoricalCharts: { enabled: dataPoints >= 200, required: 200, name: 'Full Historical Charts' }
    };
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setUploading(true);
    setUploadStatus('Uploading...');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('http://localhost:8000/api/upload/ohlc', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        setUploadStatus(`✅ Uploaded ${result.candles_inserted} candles for ${result.symbols.join(', ')}`);
        
        // Notify parent component
        if (onUploadComplete) {
          onUploadComplete(result);
        }
        
        // Auto-clear status after 5 seconds
        setTimeout(() => {
          setUploadStatus(null);
        }, 5000);
      } else {
        setUploadStatus(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setUploadStatus(`❌ Upload failed: ${error.message}`);
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
  const dataPoints = analytics?.tick_count 
    ? Object.values(analytics.tick_count).reduce((a, b) => a + b, 0) 
    : 0;
  const enabledCount = Object.values(capabilities).filter(c => c.enabled).length;
  const totalCount = Object.keys(capabilities).length;
  const progressPercent = (enabledCount / totalCount) * 100;

  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-blue-500/50 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-400" />
            Bootstrap Analytics with Historical Data
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Upload OHLC CSV to unlock features instantly (optional - app works in real-time mode)
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm flex items-center gap-2 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download Template
        </button>
      </div>
      
      {/* Upload Input */}
      <div className="flex items-center gap-4 mb-4">
        <label className="flex-1">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={uploading}
            className="block w-full text-sm text-gray-400
              file:mr-4 file:py-2 file:px-4
              file:rounded-lg file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-600 file:text-white
              hover:file:bg-blue-700
              file:cursor-pointer cursor-pointer
              disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>
        
        {uploadStatus && (
          <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
            uploadStatus.startsWith('✅') 
              ? 'bg-green-900/50 text-green-200 border border-green-600' 
              : uploadStatus.startsWith('Uploading') 
              ? 'bg-blue-900/50 text-blue-200 border border-blue-600 animate-pulse'
              : 'bg-red-900/50 text-red-200 border border-red-600'
          }`}>
            {uploadStatus}
          </div>
        )}
      </div>
      
      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-400">Feature Unlock Progress</span>
          <span className="text-white font-semibold">{enabledCount} / {totalCount} Enabled</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
          <div className="text-gray-400 text-xs mb-1">Total Data Points</div>
          <div className="text-2xl font-bold text-white">
            {dataPoints.toLocaleString()}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
          <div className="text-gray-400 text-xs mb-1">Features Unlocked</div>
          <div className="text-2xl font-bold text-green-400">
            {enabledCount} / {totalCount}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
          <div className="text-gray-400 text-xs mb-1">Time to Full Features</div>
          <div className="text-2xl font-bold text-blue-400">
            {dataPoints >= 200 ? 'Ready! 🎉' : `~${Math.ceil((200 - dataPoints) / 10)}m`}
          </div>
        </div>
      </div>

      {/* Feature List */}
      <div className="border-t border-gray-700 pt-4">
        <h4 className="text-sm font-semibold text-gray-300 mb-3">Available Features:</h4>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(capabilities).map(([key, capability]) => (
            <div 
              key={key}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                capability.enabled 
                  ? 'bg-green-900/20 border-green-600/50 text-green-200' 
                  : 'bg-gray-900/30 border-gray-700 text-gray-500'
              }`}
            >
              {capability.enabled ? (
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              ) : (
                <Lock className="w-4 h-4 text-gray-600 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{capability.name}</div>
                {!capability.enabled && (
                  <div className="text-xs text-gray-600">
                    Need {capability.required} pts
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Help Text */}
      {dataPoints < 200 && (
        <div className="mt-4 bg-blue-900/20 border border-blue-600/50 rounded-lg p-3">
          <p className="text-xs text-blue-200">
            💡 <strong>Tip:</strong> Upload historical OHLC data to unlock all features immediately, 
            or continue streaming real-time data to unlock features progressively.
          </p>
        </div>
      )}
    </div>
  );
};

export default OHLCUploadWidget;
