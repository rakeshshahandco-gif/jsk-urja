import React, { useCallback, useEffect, useState } from 'react';
import { ITEM_IMAGE_TYPES } from '@/config/itemImage.config';
import { listItemImages } from '@/services/itemImageApi';
import { ItemImageActions } from './ItemImageActions';
import { useAuth } from '@/hooks/useAuth';

export function ItemTextileImagesTab({ itemId, companyId }) {
    const { hasPermission } = useAuth();
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);

    const canView = hasPermission('inventory.item_images.view');
    const canUpload = hasPermission('inventory.item_images.upload');
    const canDelete = hasPermission('inventory.item_images.delete');
    const canDownload = hasPermission('inventory.item_images.download');

    const load = useCallback(async () => {
        if (!itemId || !canView) return;
        setLoading(true);
        try {
            const list = await listItemImages(itemId, companyId ? { companyId } : {});
            setImages(list);
        } catch {
            setImages([]);
        } finally {
            setLoading(false);
        }
    }, [itemId, companyId, canView]);

    useEffect(() => {
        load();
    }, [load]);

    if (!itemId) {
        return (
            <p style={{ padding: 16, color: '#64748b', fontSize: 14 }}>
                Save the item record first, then upload textile images here.
            </p>
        );
    }

    if (!canView) {
        return <p style={{ padding: 16, color: '#b91c1c', fontSize: 14 }}>You do not have permission to view item images.</p>;
    }

    return (
        <div style={{ padding: '8px 0' }}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                Upload JPG, PNG, WEBP, or PDF. Use mobile scan for camera capture. Images are stored on disk — not in MongoDB.
            </p>
            {loading && <p style={{ fontSize: 12, color: '#94a3b8' }}>Loading images…</p>}
            {ITEM_IMAGE_TYPES.map(({ id, label, multiple }) => (
                <div key={id} style={{ marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{label}</h4>
                    <ItemImageActions
                        itemId={itemId}
                        companyId={companyId}
                        imageType={id}
                        multiple={multiple}
                        images={images}
                        canView={canView}
                        canUpload={canUpload}
                        canDelete={canDelete}
                        canDownload={canDownload}
                        onRefresh={load}
                    />
                </div>
            ))}
        </div>
    );
}
