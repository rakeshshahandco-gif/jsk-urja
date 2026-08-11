import React from 'react';
import { useParams } from 'react-router-dom';
import DataExtractorSimpleLeadSearchPage from './DataExtractorSimpleLeadSearchPage';

/**
 * Dedicated search-run window. Backend job continues if this tab closes.
 */
export default function DataExtractorRunPage() {
    const { sessionId } = useParams();
    return <DataExtractorSimpleLeadSearchPage initialSessionId={sessionId} runMode />;
}
