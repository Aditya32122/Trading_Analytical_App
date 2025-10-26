import React, { memo } from 'react';
import { Bell, X, Plus } from 'lucide-react';
import { useModal } from './ModalManager';

const AlertCard = memo(({ alert, analytics, onDelete }) => {
  const handleDelete = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (window.confirm('🗑️ Delete this alert?')) {
      onDelete(alert.id);
    }
  };

  const getCurrentValue = () => {
    if (!analytics) return 'N/A';
    
    if (alert.condition.includes('price') && analytics.price?.[alert.symbol]) {
      return `$${analytics.price[alert.symbol].toFixed(2)}`;
    }
    if (alert.condition.includes('zscore') && analytics.zscore?.[alert.symbol] !== undefined) {
      return analytics.zscore[alert.symbol].toFixed(3);
    }
    return 'N/A';
  };

  const getValueColor = () => {
    if (!analytics) return 'text-gray-400';
    
    if (alert.condition.includes('price') && analytics.price?.[alert.symbol]) {
      return analytics.price[alert.symbol] > alert.value ? 'text-green-400' : 'text-red-400';
    }
    return 'text-blue-400';
  };

  return (
    <div className="bg-gray-700/50 rounded p-2 border border-gray-600 hover:border-gray-500 transition-colors">
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white text-xs truncate">
            {alert.name}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {alert.symbol} • {alert.condition.replace(/_/g, ' ')} {alert.value}
          </div>
          <div className="text-xs mt-0.5">
            <span className="text-gray-500">Current: </span>
            <span className={getValueColor()}>
              {getCurrentValue()}
            </span>
          </div>
        </div>
        <div className="flex gap-1 items-center flex-shrink-0">
          <span className={`px-1.5 py-0.5 rounded text-xs ${alert.active ? 'bg-green-600' : 'bg-gray-600'}`}>
            {alert.active ? '✓' : '✗'}
          </span>
          <button
            type="button"
            onClick={handleDelete}
            className="text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded p-0.5 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
});

const AlertsWidget = ({ alerts, analytics, selectedSymbol1, onDeleteAlert, onRefreshAlerts }) => {
  const { openModal } = useModal();

  const handleCreateClick = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    console.log('📝 Opening alert modal...', { analytics, selectedSymbol1 });
    openModal('createAlert', { analytics, selectedSymbol1, onRefreshAlerts });
  };

  console.log('🔄 AlertsWidget render:', { alertsCount: alerts.length });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h4 className="text-sm font-semibold text-gray-300">
          Alerts ({alerts?.length || 0})
        </h4>
        <button
          type="button"
          onClick={handleCreateClick}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs flex items-center gap-1 transition-colors"
        >
          <Plus className="w-3 h-3" />
          New
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pr-1">
        {!alerts || alerts.length === 0 ? (
          <div className="text-gray-500 text-center py-6 text-sm bg-gray-700/30 rounded-lg">
            <Bell className="w-6 h-6 mx-auto mb-2 text-gray-600" />
            <p className="text-xs">No alerts set</p>
            <button 
              type="button"
              onClick={handleCreateClick}
              className="mt-2 text-blue-400 hover:text-blue-300 text-xs"
            >
              + Create alert
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                analytics={analytics}
                onDelete={onDeleteAlert}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(AlertsWidget);