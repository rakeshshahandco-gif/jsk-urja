import React from 'react';
import { Construction } from 'lucide-react';

export const PlaceholderPage = ({ title }) => {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center p-8">
            <div className="w-24 h-24 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6 shadow-sm">
                <Construction size={48} strokeWidth={1.5} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-3">
                {title ? `${title} - Under Construction` : 'Page Under Construction'}
            </h2>
            <p className="text-slate-500 max-w-md">
                This module is currently being developed and will be available in a future update. Please check back later.
            </p>
        </div>
    );
};
