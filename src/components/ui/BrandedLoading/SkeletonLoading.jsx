import React from 'react';
import styles from './BrandedLoading.module.scss';
import clsx from 'clsx';
import { BrandedLoader } from './BrandedLoader';

export const SkeletonText = ({ className }) => (
    <div className={clsx(styles.skeleton, styles.skeletonText, className)} />
);

export const TableSkeleton = ({ rows = 5, cols = 5 }) => {
    return (
        <div className="w-full p-6 relative min-h-[400px]">
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}>
                <BrandedLoader size={120} />
            </div>
            <div className="flex justify-between mb-8">
                <SkeletonText className="w-48 h-10" />
                <SkeletonText className="w-32 h-10" />
            </div>
            <table className={styles.skeletonTable}>
                <thead>
                    <tr>
                        {Array(cols).fill(0).map((_, i) => (
                            <th key={i} className="p-4"><SkeletonText className="h-4" /></th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {Array(rows).fill(0).map((_, i) => (
                        <tr key={i}>
                            {Array(cols).fill(0).map((_, j) => (
                                <td key={j}><SkeletonText className="h-4" /></td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export const FormSkeleton = () => {
    return (
        <div className="p-8 space-y-8 relative min-h-[400px]">
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}>
                <BrandedLoader size={120} />
            </div>
            <SkeletonText className="w-64 h-12" />
            <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                    <SkeletonText className="w-32 h-4" />
                    <SkeletonText className="h-10" />
                </div>
                <div className="space-y-4">
                    <SkeletonText className="w-32 h-4" />
                    <SkeletonText className="h-10" />
                </div>
            </div>
            <div className="space-y-4">
                <SkeletonText className="w-32 h-4" />
                <SkeletonText className="h-32" />
            </div>
            <div className="flex justify-end gap-4">
                <SkeletonText className="w-32 h-10" />
                <SkeletonText className="w-48 h-10" />
            </div>
        </div>
    );
};
