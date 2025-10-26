import React, { useState, useEffect, useCallback } from 'react';

const AlertsManager = ({ analytics, selectedSymbol1, onAlertsUpdate }) => {
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
      
      // Ensure data is an array
      const alertsArray = Array.isArray(data) ? data : [];
      setAlerts(alertsArray);
      
      if (onAlertsUpdate) {
        onAlertsUpdate(alertsArray);
      }

    } catch (err) {
      console.error('❌ Error fetching alerts:', err);
      setError(err.message);
      setAlerts([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  }, [onAlertsUpdate]);

  // Fetch triggered alerts - UPDATED WITH ERROR HANDLING
  const fetchTriggeredAlerts = useCallback(async () => {
    try {
      console.log('📡 Fetching triggered alerts...');
      
      const response = await fetch('http://localhost:8000/api/alerts/triggered');
      
      if (!response.ok) {
        // If endpoint doesn't exist (404) or has server error (500), skip silently
        if (response.status === 404) {
          console.warn('⚠️ Triggered alerts endpoint not implemented yet');
          return;
        } else if (response.status === 500) {
          console.warn('⚠️ Server error fetching triggered alerts - endpoint may not be ready');
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Triggered alerts fetched:', data);
      
      // Ensure data is an array
      const triggeredArray = Array.isArray(data) ? data : [];
      setTriggeredAlerts(triggeredArray);

    } catch (err) {
      // Only log error, don't break the app
      console.warn('⚠️ Could not fetch triggered alerts:', err.message);
      // Keep existing triggered alerts, don't clear them
    }
  }, []);

  // Delete alert - FIXED VERSION
  const deleteAlert = useCallback(async (alertId) => {
    try {
      console.log(`🗑️ Deleting alert ${alertId}...`);
      setError(null);

      const response = await fetch(`http://localhost:8000/api/alerts/${alertId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Alert deleted:', result);

      // Remove from local state immediately
      setAlerts(prev => prev.filter(alert => alert.id !== alertId));
      
      // Refresh alerts to ensure sync
      setTimeout(() => {
        fetchAlerts();
      }, 100);

    } catch (err) {
      console.error('❌ Error deleting alert:', err);
      setError(`Failed to delete alert: ${err.message}`);
      
      // Refresh alerts to check actual state
      fetchAlerts();
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

      // Refresh alerts
      await fetchAlerts();
      return result;

    } catch (err) {
      console.error('❌ Error creating alert:', err);
      setError(`Failed to create alert: ${err.message}`);
      throw err;
    }
  }, [fetchAlerts]);

  // Initial load
  useEffect(() => {
    fetchAlerts();
    fetchTriggeredAlerts();
    
    // Set up polling for triggered alerts - REDUCED FREQUENCY TO AVOID SPAM
    const interval = setInterval(() => {
      fetchTriggeredAlerts();
    }, 15000); // Changed from 5s to 15s to reduce errors
    
    return () => clearInterval(interval);
  }, [fetchAlerts, fetchTriggeredAlerts]);

  // Listen for WebSocket alert notifications
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/analytics');
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'alert_triggered') {
          console.log('🚨 Alert triggered via WebSocket:', data.alert);
          
          // Add to triggered alerts
          setTriggeredAlerts(prev => [data.alert, ...prev.slice(0, 99)]);
          
          // Show browser notification if supported
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
      console.error('WebSocket error:', error);
    };
    
    return () => {
      ws.close();
    };
  }, []);

  return {
    alerts,
    triggeredAlerts,
    loading,
    error,
    deleteAlert,
    createAlert,
    refreshAlerts: fetchAlerts,
    refreshTriggeredAlerts: fetchTriggeredAlerts
  };
};

export default AlertsManager;