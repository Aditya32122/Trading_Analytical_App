import React, { createContext, useContext, useState, useCallback } from 'react';

const ModalContext = createContext();

export const ModalProvider = ({ children }) => {
  const [modals, setModals] = useState({});

  const openModal = useCallback((modalId, props = {}) => {
    setModals(prev => ({
      ...prev,
      [modalId]: { isOpen: true, props }
    }));
  }, []);

  const closeModal = useCallback((modalId) => {
    setModals(prev => ({
      ...prev,
      [modalId]: { isOpen: false, props: {} }
    }));
  }, []);

  const isModalOpen = useCallback((modalId) => {
    return modals[modalId]?.isOpen || false;
  }, [modals]);

  const getModalProps = useCallback((modalId) => {
    return modals[modalId]?.props || {};
  }, [modals]);

  return (
    <ModalContext.Provider value={{ openModal, closeModal, isModalOpen, getModalProps }}>
      {children}
    </ModalContext.Provider>
  );
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within ModalProvider');
  }
  return context;
};