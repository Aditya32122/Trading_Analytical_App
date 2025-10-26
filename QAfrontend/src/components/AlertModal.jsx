import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

const AlertModal = ({ isOpen, analytics, selectedSymbol1, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    condition: 'zscore_above',
    symbol: '',
    value: '2.0'
  });

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: `${selectedSymbol1 || 'Symbol'} Alert`,
        condition: 'zscore_above',
        symbol: selectedSymbol1 || '',
        value: '2.0'
      });
    }
  }, [isOpen, selectedSymbol1]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const value = parseFloat(formData.value);
    if (isNaN(value)) {
      alert('❌ Invalid threshold value');
      return;
    }

    if (!formData.symbol) {
      alert('❌ Please enter a symbol');
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, value })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      alert(`✅ Alert "${result.name}" created!`);
      onSuccess();
    } catch (err) {
      console.error('❌ Error creating alert:', err);
      alert('Error creating alert: ' + err.message);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center p-4"
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0,
        zIndex: 99999 
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div 
        className="bg-gray-800 rounded-lg p-6 max-w-md w-full border border-gray-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-white mb-4">Create Alert</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Symbol</label>
            <input
              type="text"
              value={formData.symbol}
              onChange={(e) => setFormData({...formData, symbol: e.target.value.toUpperCase()})}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              required
              placeholder="e.g., BTCUSDT"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Condition</label>
            <select
              value={formData.condition}
              onChange={(e) => setFormData({...formData, condition: e.target.value})}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="zscore_above">Z-Score Above</option>
              <option value="zscore_below">Z-Score Below</option>
              <option value="price_above">Price Above</option>
              <option value="price_below">Price Below</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Threshold</label>
            <input
              type="number"
              step="0.01"
              value={formData.value}
              onChange={(e) => setFormData({...formData, value: e.target.value})}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              required
            />
            {analytics && formData.symbol && (
              <div className="text-xs text-gray-500 mt-1">
                Current: {
                  formData.condition.includes('price') && analytics.price?.[formData.symbol]
                    ? `$${analytics.price[formData.symbol].toFixed(2)}`
                    : formData.condition.includes('zscore') && analytics.zscore?.[formData.symbol] !== undefined
                    ? analytics.zscore[formData.symbol].toFixed(3)
                    : 'N/A'
                }
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors"
            >
              Create Alert
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};

export default AlertModal;