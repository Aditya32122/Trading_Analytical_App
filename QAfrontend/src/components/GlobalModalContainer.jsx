import React from 'react';
import { useModal } from './ModalManager';
import AlertModal from './AlertModal';

const GlobalModalContainer = () => {
  const { isModalOpen, closeModal, getModalProps } = useModal();

  const alertModalOpen = isModalOpen('createAlert');
  const alertModalProps = getModalProps('createAlert');

  const handleCloseAlertModal = () => {
    console.log('🔒 Closing alert modal');
    closeModal('createAlert');
  };

  const handleAlertSuccess = async () => {
    console.log('✅ Alert created successfully');
    closeModal('createAlert');
    if (alertModalProps.onRefreshAlerts) {
      console.log('🔄 Refreshing alerts...');
      await alertModalProps.onRefreshAlerts();
    }
  };

  console.log('🎭 GlobalModalContainer render:', { 
    alertModalOpen, 
    hasProps: !!alertModalProps.analytics 
  });

  return (
    <>
      {alertModalOpen && (
        <AlertModal
          isOpen={alertModalOpen}
          analytics={alertModalProps.analytics}
          selectedSymbol1={alertModalProps.selectedSymbol1}
          onClose={handleCloseAlertModal}
          onSuccess={handleAlertSuccess}
        />
      )}
    </>
  );
};

export default GlobalModalContainer;