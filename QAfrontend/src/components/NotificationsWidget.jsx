import React, { memo } from 'react';
import { Bell, Clock, X } from 'lucide-react';

const NotificationCard = memo(({ alert, onDismiss }) => {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString();
  };

  const getConditionText = (condition) => {
    return condition.replace(/_/g, ' ').toUpperCase();
  };

  return (
    <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-4 h-4 text-red-400" />
            <span className="font-semibold text-red-300 text-sm">
              {alert.name}
            </span>
          </div>
          
          <div className="text-xs text-gray-300 mb-1">
            <span className="font-medium">{alert.symbol}</span> • {getConditionText(alert.condition)}
          </div>
          
          <div className="text-xs text-gray-400 flex items-center gap-4">
            <span>
              Threshold: <span className="text-white">{alert.threshold}</span>
            </span>
            <span>
              Current: <span className="text-yellow-400">{alert.current_value?.toFixed(3)}</span>
            </span>
          </div>
          
          <div className="text-xs text-gray-500 flex items-center gap-1 mt-2">
            <Clock className="w-3 h-3" />
            {formatTime(alert.timestamp)}
          </div>
        </div>
        
        {onDismiss && (
          <button
            onClick={() => onDismiss(alert.id)}
            className="text-gray-400 hover:text-white p-1 hover:bg-gray-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
});

const NotificationsWidget = ({ triggeredAlerts = [], onDismiss }) => {
  console.log('🔔 NotificationsWidget render:', { 
    alertsCount: triggeredAlerts.length,
    alerts: triggeredAlerts 
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Notifications ({triggeredAlerts.length})
        </h4>
        {triggeredAlerts.length > 0 && onDismiss && (
          <button
            onClick={() => {
              triggeredAlerts.forEach(alert => onDismiss(alert.id));
            }}
            className="text-xs text-gray-400 hover:text-white"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pr-1">
        {triggeredAlerts.length === 0 ? (
          <div className="text-gray-500 text-center py-6 text-sm bg-gray-700/30 rounded-lg">
            <Bell className="w-6 h-6 mx-auto mb-2 text-gray-600" />
            <p className="text-xs">No notifications</p>
            <p className="text-xs text-gray-600 mt-1">
              Alert triggers will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {triggeredAlerts
              .sort((a, b) => b.timestamp - a.timestamp)
              .map((alert, index) => (
                <NotificationCard
                  key={`${alert.id}-${alert.timestamp}-${index}`}
                  alert={alert}
                  onDismiss={onDismiss}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(NotificationsWidget);