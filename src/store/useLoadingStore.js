import { create } from 'zustand';

export const useLoadingStore = create((set, get) => ({
    isLoading: false,
    showLoader: false,
    timer: null,
    requestCount: 0,

    startLoading: () => {
        const currentCount = get().requestCount;
        set({ requestCount: currentCount + 1 });

        if (currentCount === 0) {
            set({ isLoading: true });
            
            // Smart Rule: Only show loader after 500ms
            const timer = setTimeout(() => {
                if (get().isLoading) {
                    set({ showLoader: true });
                }
            }, 500);

            set({ timer });
        }
    },

    stopLoading: () => {
        const currentCount = get().requestCount;
        const newCount = Math.max(0, currentCount - 1);
        set({ requestCount: newCount });

        if (newCount === 0) {
            if (get().timer) clearTimeout(get().timer);
            set({ isLoading: false, showLoader: false, timer: null });
        }
    }
}));
