import { useState, useEffect, useCallback } from 'react';

const useAlertsManager = (analytics, selectedSymbol1) => {
  const [alerts, setAlerts] = useState([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch alerts from backend
  const fetchAlerts = useCallback(async () => {
    try {
      console.log('📡 Fetching alerts...');
      setLoading(true);
      setError(null);

      const response = await fetch('http://localhost:8000/api/alerts');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Alerts fetched:', data);
      
      const alertsArray = Array.isArray(data) ? data : [];
      setAlerts(alertsArray);

    } catch (err) {
      console.error('❌ Error fetching alerts:', err);
      setError(err.message);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch triggered alerts
  const fetchTriggeredAlerts = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8000/api/alerts/triggered');
      
      if (!response.ok) {
        if (response.status === 404 || response.status === 500) {
          console.warn('⚠️ Triggered alerts endpoint not ready');
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const triggeredArray = Array.isArray(data) ? data : [];
      setTriggeredAlerts(triggeredArray);

    } catch (err) {
      console.warn('⚠️ Could not fetch triggered alerts:', err.message);
    }
  }, []);

  // Delete alert
  const deleteAlert = useCallback(async (alertId) => {
    try {
      console.log(`🗑️ Deleting alert ${alertId}...`);
      setError(null);

      const response = await fetch(`http://localhost:8000/api/alerts/${alertId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      console.log('✅ Alert deleted');
      
      // Remove from local state immediately
      setAlerts(prev => prev.filter(alert => alert.id !== alertId));
      
      // Refresh to ensure sync
      setTimeout(fetchAlerts, 100);

    } catch (err) {
      console.error('❌ Error deleting alert:', err);
      setError(`Failed to delete alert: ${err.message}`);
      fetchAlerts(); // Refresh to check actual state
      throw err;
    }
  }, [fetchAlerts]);

  // Create alert
  const createAlert = useCallback(async (alertData) => {
    try {
      console.log('📝 Creating alert:', alertData);
      setError(null);

      const response = await fetch('http://localhost:8000/api/alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(alertData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Alert created:', result);

      await fetchAlerts();
      return result;

    } catch (err) {
      console.error('❌ Error creating alert:', err);
      setError(`Failed to create alert: ${err.message}`);
      throw err;
    }
  }, [fetchAlerts]);

  // Dismiss triggered alert
  const dismissTriggeredAlert = useCallback((alertId) => {
    setTriggeredAlerts(prev => 
      prev.filter(alert => alert.id !== alertId)
    );
  }, []);

  // Initial load and polling
  useEffect(() => {
    fetchAlerts();
    fetchTriggeredAlerts();
    
    const interval = setInterval(fetchTriggeredAlerts, 15000);
    return () => clearInterval(interval);
  }, [fetchAlerts, fetchTriggeredAlerts]);

  // WebSocket listener for real-time alerts
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/analytics');
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'alert_triggered') {
          console.log('🚨 Alert triggered via WebSocket:', data.alert);
          setTriggeredAlerts(prev => [data.alert, ...prev.slice(0, 99)]);
          
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Alert Triggered!', {
              body: `${data.alert.name}: ${data.alert.symbol} ${data.alert.condition}`,
              icon: '/favicon.ico'
            });
          }
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };
    
    ws.onerror = (error) => {
      console.warn('WebSocket connection error:', error);
    };
    
    return () => ws.close();
  }, []);

  return {
    alerts,
    triggeredAlerts,
    loading,
    error,
    deleteAlert,
    createAlert,
    dismissTriggeredAlert,
    refreshAlerts: fetchAlerts,
    refreshTriggeredAlerts: fetchTriggeredAlerts
  };
};

export default useAlertsManager;