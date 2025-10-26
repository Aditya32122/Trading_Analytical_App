import React from 'react'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { ModalProvider } from './components/ModalManager';
import GlobalModalContainer from './components/GlobalModalContainer';
import TradingDashboard from './components/TradingDashboard';
import UploadPage from './components/UploadPage';

const App = () => {
  return (
    <ModalProvider>
      <Router>
        <Routes>
          <Route path="/" element={<TradingDashboard />} />
          <Route path="/upload" element={<UploadPage />} />
        </Routes>
        <GlobalModalContainer />
      </Router>
    </ModalProvider>
  );
}

export default App