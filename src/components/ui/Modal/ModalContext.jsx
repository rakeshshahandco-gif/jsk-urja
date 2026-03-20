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

    const openModal = useCallback((contentOrConfig, props = {}) => {
        let content;
        let finalProps = { ...props };
        
        if (contentOrConfig && typeof contentOrConfig === 'object' && !React.isValidElement(contentOrConfig) && contentOrConfig.content) {
            content = contentOrConfig.content;
            finalProps = { ...finalProps, ...contentOrConfig };
            delete finalProps.content;
        } else {
            content = contentOrConfig;
        }

        const id = Math.random().toString(36).substr(2, 9);
        setModals(prev => [...prev, { id, content, props: finalProps }]);
        return id;
    }, []);

    const closeModal = useCallback((id) => {
        setModals(prev => {
            if (!id) {
                // If no id provided, close the topmost modal
                return prev.slice(0, -1);
            }
            return prev.filter(modal => modal.id !== id);
        });
    }, []);

    const closeAll = useCallback(() => {
        setModals([]);
    }, []);

    return (
        <ModalContext.Provider value={{ openModal, closeModal, closeAll, modals }}>
            {children}
            {modals.length > 0 && (
                <div id="modal-root">
                    {modals.map((modal, index) => {
                        const zIndex = 2000 + (index * 10);
                        return (
                            <Modal
                                key={modal.id}
                                zIndex={zIndex}
                                onClose={() => closeModal(modal.id)}
                                {...modal.props}
                            >
                                {React.isValidElement(modal.content) 
                                    ? React.cloneElement(modal.content, {
                                        ...modal.props,
                                        modalId: modal.id,
                                        closeModal: () => closeModal(modal.id)
                                    })
                                    : (
                                        typeof modal.content === 'function' || typeof modal.content === 'object' ?
                                        React.createElement(modal.content, {
                                            ...modal.props,
                                            modalId: modal.id,
                                            closeModal: () => closeModal(modal.id)
                                        }) : modal.content
                                    )
                                }
                            </Modal>
                        );
                    })}
                </div>
            )}
        </ModalContext.Provider>
    );
};
