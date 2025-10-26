import React, { useState, useEffect } from 'react';
import { X, Bell, BellRing, Plus, RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import AlertModal from './AlertModal';

const AlertsWidget = ({ expandedWidget, setExpandedWidget }) => {
  const [alerts, setAlerts] = useState([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(null);
  const [error, setError] = useState(null);
  
  // Alert Modal state
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState('');

  // Fetch alerts from backend
  const fetchAlerts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('http://localhost:8000/api/alerts');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('❌ Error fetching alerts:', err);
      setError(`Failed to load alerts: ${err.message}`);
      setAlerts([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch current analytics for modal
  const fetchAnalytics = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/analytics');
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Error fetching analytics for modal:', err);
    }
  };

  // Fetch triggered alerts
  const fetchTriggeredAlerts = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/alerts/triggered');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setTriggeredAlerts(Array.isArray(data) ? data.slice(0, 5) : []);
    } catch (err) {
      console.error('❌ Error fetching triggered alerts:', err);
      setTriggeredAlerts([]);
    }
  };

  // DELETE ALERT FUNCTION
  const deleteAlert = async (alertId) => {
    try {
      setDeleteLoading(alertId);
      setError(null);
      
      const response = await fetch(`http://localhost:8000/api/alerts/${alertId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      
      // Remove from local state immediately
      setAlerts(prevAlerts => prevAlerts.filter(alert => alert.id !== alertId));
      
      // Show success notification
      console.log('✅ Alert deleted:', result.message);
      
      // Refresh the alerts list to ensure sync
      setTimeout(() => {
        fetchAlerts();
      }, 500);
      
    } catch (err) {
      console.error('❌ Error deleting alert:', err);
      setError(`Failed to delete alert: ${err.message}`);
    } finally {
      setDeleteLoading(null);
    }
  };

  // DELETE TRIGGERED ALERT FUNCTION
  const deleteTriggeredAlert = async (triggeredId) => {
    try {
      // Remove from local state immediately for better UX
      setTriggeredAlerts(prev => prev.filter((alert, index) => 
        alert.id !== triggeredId && index !== triggeredId
      ));
      
    } catch (err) {
      console.error('❌ Error deleting triggered alert:', err);
      // Re-add to state if deletion failed
      fetchTriggeredAlerts();
    }
  };

  // Confirm delete with user
  const handleDeleteClick = (alert) => {
    const confirmMessage = `Delete "${alert.name}" alert?\n\nThis action cannot be undone.`;
      
    if (window.confirm(confirmMessage)) {
      deleteAlert(alert.id);
    }
  };

  // Handle triggered alert deletion
  const handleDeleteTriggeredAlert = (alert, index) => {
    // Use index if id is not available
    const identifier = alert.id || index;
    deleteTriggeredAlert(identifier);
  };

  // Handle create alert button click
  const handleCreateAlert = async () => {
    // Fetch latest analytics before opening modal
    await fetchAnalytics();
    
    // Try to get a symbol from existing alerts or analytics
    let defaultSymbol = '';
    if (analytics && analytics.price) {
      defaultSymbol = Object.keys(analytics.price)[0] || '';
    }
    
    setSelectedSymbol(defaultSymbol);
    setShowAlertModal(true);
  };

  // Handle alert creation success
  const handleAlertCreated = () => {
    setShowAlertModal(false);
    fetchAlerts(); // Refresh alerts list
  };

  // Handle modal close
  const handleModalClose = () => {
    setShowAlertModal(false);
  };

  // Load alerts on component mount
  useEffect(() => {
    fetchAlerts();
    fetchTriggeredAlerts();
    fetchAnalytics();
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchAlerts();
      fetchTriggeredAlerts();
      fetchAnalytics();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Format condition for display
  const formatCondition = (condition, value) => {
    const conditions = {
      'zscore_above': `Z-Score > ${value}`,
      'zscore_below': `Z-Score < ${value}`,
      'price_above': `Price > $${value}`,
      'price_below': `Price < $${value}`
    };
    return conditions[condition] || `${condition} ${value}`;
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    try {
      const date = new Date(typeof timestamp === 'string' ? timestamp : timestamp * 1000);
      return date.toLocaleTimeString();
    } catch (e) {
      return 'Invalid';
    }
  };

  const isExpanded = expandedWidget === 'alerts';

  return (
    <>
      <div className={`bg-gray-800 rounded-lg shadow-lg border border-gray-700 transition-all duration-300 ${
        isExpanded ? 'col-span-2 row-span-2' : ''
      }`}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <Bell className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Alerts</h3>
              <p className="text-sm text-gray-400">{alerts.length} active</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Create Alert Button */}
            <button
              onClick={handleCreateAlert}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              title="Create new alert"
            >
              <Plus className="w-4 h-4 text-blue-400 hover:text-blue-300" />
            </button>
            
            <button
              onClick={() => {
                fetchAlerts();
                fetchTriggeredAlerts();
              }}
              disabled={isLoading}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh alerts"
            >
              <RefreshCw className={`w-4 h-4 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            
            <button
              onClick={() => setExpandedWidget(isExpanded ? null : 'alerts')}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              <div className={`w-4 h-4 text-gray-400 transform transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}>
                ⌄
              </div>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={`p-6 ${isExpanded ? 'max-h-none' : 'max-h-80'} overflow-y-auto`}>
          
          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{error}</span>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && alerts.length === 0 && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto"></div>
              <p className="text-gray-400 mt-3 text-sm">Loading alerts...</p>
            </div>
          )}

          {/* Empty State */}
          {alerts.length === 0 && !isLoading && !error && (
            <div className="text-center py-8">
              <div className="p-3 bg-gray-700/50 rounded-full w-fit mx-auto mb-3">
                <Bell className="w-6 h-6 text-gray-500" />
              </div>
              <p className="text-gray-400 text-sm">No active alerts</p>
              <p className="text-gray-500 text-xs mt-1">Create your first alert to get started</p>
              <button
                onClick={handleCreateAlert}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
              >
                Create Alert
              </button>
            </div>
          )}

          {/* Active Alerts */}
          {alerts.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-300 flex items-center space-x-2">
                <span>Active Alerts</span>
                <span className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full text-xs">
                  {alerts.length}
                </span>
              </h4>
              
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="group flex items-center justify-between p-4 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h5 className="font-medium text-white text-sm truncate">{alert.name}</h5>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          alert.active ? 'bg-green-500' : 'bg-gray-500'
                        }`} />
                      </div>
                      <div className="text-xs text-gray-300 mb-1">
                        <span className="font-medium">{alert.symbol}:</span> {formatCondition(alert.condition, alert.value)}
                      </div>
                      <div className="flex items-center text-xs text-gray-400">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatTimestamp(alert.created_at)}
                      </div>
                    </div>
                    
                    {/* Delete Button */}
                    <button
                      onClick={() => handleDeleteClick(alert)}
                      disabled={deleteLoading === alert.id}
                      className={`ml-3 p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100 hover:bg-red-900/30 ${
                        deleteLoading === alert.id ? 'opacity-100' : ''
                      }`}
                      title="Delete alert"
                    >
                      {deleteLoading === alert.id ? (
                        <div className="animate-spin w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full"></div>
                      ) : (
                        <X className="w-4 h-4 text-red-400 hover:text-red-300" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Triggered Alerts */}
          {triggeredAlerts.length > 0 && (
            <div className={`${alerts.length > 0 ? 'mt-6 pt-6 border-t border-gray-700' : ''}`}>
              <h4 className="text-sm font-medium text-gray-300 flex items-center space-x-2 mb-3">
                <BellRing className="w-4 h-4" />
                <span>Recent Triggers</span>
                <span className="bg-orange-900/50 text-orange-400 px-2 py-0.5 rounded-full text-xs">
                  {triggeredAlerts.length}
                </span>
              </h4>
              
              <div className="space-y-2">
                {triggeredAlerts.slice(0, isExpanded ? 10 : 3).map((trigger, index) => (
                  <div
                    key={`${trigger.alert_id}-${trigger.timestamp}-${index}`}
                    className="group flex items-center justify-between p-3 bg-orange-900/20 border border-orange-500/30 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h5 className="font-medium text-orange-300 text-sm">{trigger.name}</h5>
                        <span className="text-orange-400 text-xs">{formatTimestamp(trigger.timestamp)}</span>
                      </div>
                      <div className="text-orange-200 text-xs mb-1">
                        <span className="font-medium">{trigger.symbol}:</span> {formatCondition(trigger.condition, trigger.threshold)}
                      </div>
                      <div className="text-orange-300 text-xs">
                        Triggered at: {trigger.current_value?.toFixed(4)}
                      </div>
                    </div>
                    
                    {/* Delete Triggered Alert Button */}
                    <button
                      onClick={() => handleDeleteTriggeredAlert(trigger, index)}
                      className="ml-3 p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 hover:bg-red-900/30"
                      title="Remove notification"
                    >
                      <X className="w-4 h-4 text-red-400 hover:text-red-300" />
                    </button>
                  </div>
                ))}
                
                {triggeredAlerts.length > 3 && !isExpanded && (
                  <button
                    onClick={() => setExpandedWidget('alerts')}
                    className="w-full text-center py-2 text-sm text-gray-400 hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    View {triggeredAlerts.length - 3} more triggers...
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Expanded View: Action Buttons */}
          {isExpanded && (
            <div className="mt-6 pt-6 border-t border-gray-700">
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleCreateAlert}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Alert</span>
                </button>
                
                <button
                  onClick={() => {
                    fetchAlerts();
                    fetchTriggeredAlerts();
                  }}
                  disabled={isLoading}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-sm hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh All</span>
                </button>
                
                {triggeredAlerts.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm('Clear all triggered alert history?')) {
                        setTriggeredAlerts([]);
                      }
                    }}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-700 border border-red-500/50 text-red-400 rounded-lg text-sm hover:bg-red-900/20 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    <span>Clear History</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlertModal}
        analytics={analytics}
        selectedSymbol1={selectedSymbol}
        onClose={handleModalClose}
        onSuccess={handleAlertCreated}
      />
    </>
  );
};

export default AlertsWidget;