import { useEffect, useRef } from 'react';

export const useAutoRefresh = (refreshFn, interval = 5000, enabled = true) => {
    const savedCallback = useRef(refreshFn);

    // Remember the latest callback if it changes.
    useEffect(() => {
        savedCallback.current = refreshFn;
    }, [refreshFn]);

    // Set up the interval.
    useEffect(() => {
        // Don't schedule if no refresh callback or disabled
        if (!enabled) {
            return;
        }

        const tick = () => {
            if (savedCallback.current) {
                savedCallback.current();
            }
        };

        const id = setInterval(tick, interval);
        return () => clearInterval(id);
    }, [interval, enabled]);
};
