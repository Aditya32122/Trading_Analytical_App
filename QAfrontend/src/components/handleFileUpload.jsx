import { useState } from 'react';
import { Upload, Download } from 'lucide-react';



const [uploading, setUploading] = useState(false);
const [uploadStatus, setUploadStatus] = useState(null);

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
      
      // Refresh data
      setTimeout(() => {
        window.location.reload();
      }, 2000);
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
  const response = await fetch('http://localhost:8000/api/export/template');
  const data = await response.json();
  
  const blob = new Blob([data.template], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ohlc_template.csv';
  a.click();
};

// Add to your dashboard UI:
return (
  <div className="dashboard">
    {/* Upload Section - Add at top */}
    <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-blue-500">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Bootstrap Analytics with Historical Data
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Upload OHLC CSV to enable all features immediately (optional - app works without this)
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Download Template
        </button>
      </div>
      
      <div className="flex items-center gap-4">
        <label className="flex-1">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={uploading}
            className="block w-full text-sm text-gray-400
              file:mr-4 file:py-2 file:px-4
              file:rounded file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-600 file:text-white
              hover:file:bg-blue-700
              file:cursor-pointer cursor-pointer"
          />
        </label>
        
        {uploadStatus && (
          <div className={`px-4 py-2 rounded text-sm ${
            uploadStatus.startsWith('✅') ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'
          }`}>
            {uploadStatus}
          </div>
        )}
      </div>
      
      {/* Data status */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="bg-gray-900 rounded p-3">
          <div className="text-gray-400">Total Data Points</div>
          <div className="text-2xl font-bold text-white">
            {analytics?.data_points || 0}
          </div>
        </div>
        <div className="bg-gray-900 rounded p-3">
          <div className="text-gray-400">Features Enabled</div>
          <div className="text-2xl font-bold text-green-400">
            {Object.values(capabilities).filter(Boolean).length} / {Object.keys(capabilities).length}
          </div>
        </div>
        <div className="bg-gray-900 rounded p-3">
          <div className="text-gray-400">Time to Full Analytics</div>
          <div className="text-2xl font-bold text-blue-400">
            {analytics?.data_points >= 100 ? 'Ready!' : `~${Math.ceil((100 - (analytics?.data_points || 0)) / 10)}m`}
          </div>
        </div>
      </div>
    </div>
    
    {/* Rest of dashboard... */}
  </div>
);