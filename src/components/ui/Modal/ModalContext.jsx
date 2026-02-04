import React, { createContext, useContext, useState, useCallback } from 'react';
import { Modal } from './Modal';

const ModalContext = createContext({
    openModal: () => { },
    closeModal: () => { },
    closeAll: () => { },
    modals: []
});

export const useModal = () => useContext(ModalContext);

export const ModalProvider = ({ children }) => {
    const [modals, setModals] = useState([]);

    /**
     * Open a new modal
     * @param {React.Component} content - Component to render
     * @param {Object} props - Props to pass to the component
     * @returns {string} modalId
     */
    const openModal = useCallback((content, props = {}) => {
        const id = Math.random().toString(36).substr(2, 9);
        setModals(prev => [...prev, { id, content, props }]);
        return id;
    }, []);

    /**
     * Close a specific modal by ID
     * @param {string} id 
     */
    const closeModal = useCallback((id) => {
        setModals(prev => prev.filter(modal => modal.id !== id));
    }, []);

    /**
     * Close all modals
     */
    const closeAll = useCallback(() => {
        setModals([]);
    }, []);

    return (
        <ModalContext.Provider value={{ openModal, closeModal, closeAll, modals }}>
            {children}
            {/* Modal Container */}
            {modals.length > 0 && (
                <div id="modal-root">
                    {modals.map((modal, index) => {
                        const zIndex = 1000 + (index * 10);
                        return (
                            <Modal
                                key={modal.id}
                                zIndex={zIndex}
                                onClose={() => closeModal(modal.id)}
                                {...modal.props}
                            >
                                {/* Render the dynamic content component */}
                                <modal.content
                                    {...modal.props}
                                    modalId={modal.id}
                                    closeModal={() => closeModal(modal.id)}
                                />
                            </Modal>
                        );
                    })}
                </div>
            )}
        </ModalContext.Provider>
    );
};
