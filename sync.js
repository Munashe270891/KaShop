/**
 * Tuckshop POS Sync Engine (Box 4 Connection)
 * Handles Network Detection, Queue Processing, and Server Syncing
 */

import { initDB } from './db.js';

// Configuration API Endpoint
const API_BASE_URL = 'https://api.yourtuckshop.co.zw/v1';

let isSyncing = false;

// 1. INITIALIZE SYNC ENGINE & NETWORK LISTENERS
export function initSyncEngine(onStatusChangeCallback) {
    // Monitor Online / Offline status transitions
    window.addEventListener('online', () => {
        if (onStatusChangeCallback) onStatusChangeCallback('ONLINE');
        triggerSyncProcess(onStatusChangeCallback);
    });

    window.addEventListener('offline', () => {
        if (onStatusChangeCallback) onStatusChangeCallback('OFFLINE');
    });

    // Auto-trigger sync on initial app launch if connected
    if (navigator.onLine) {
        triggerSyncProcess(onStatusChangeCallback);
    }
}

// 2. MAIN SYNC PROCESSOR
export async function triggerSyncProcess(statusCallback) {
    if (!navigator.onLine || isSyncing) return;

    isSyncing = true;
    if (statusCallback) statusCallback('SYNCING');

    try {
        const pendingSales = await getPendingRecords('sales');
        const pendingRepayments = await getPendingRecords('debt_repayments');

        // Process Sales
        if (pendingSales.length > 0) {
            await syncSalesBatch(pendingSales);
        }

        // Process Debt Repayments
        if (pendingRepayments.length > 0) {
            await syncRepaymentsBatch(pendingRepayments);
        }

        if (statusCallback) statusCallback('SYNC_COMPLETE');
    } catch (error) {
        console.error('Sync process interrupted:', error);
        if (statusCallback) statusCallback('SYNC_ERROR');
    } finally {
        isSyncing = false;
    }
}

// 3. FETCH PENDING RECORDS FROM INDEXEDDB
async function getPendingRecords(storeName) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index('sync_status');
        const request = index.getAll('PENDING');

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// 4. SYNC PENDING SALES TO BACKEND
async function syncSalesBatch(salesList) {
    for (const sale of salesList) {
        try {
            const response = await fetch(`${API_BASE_URL}/sales/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sale)
            });

            if (response.ok) {
                await markRecordSynced('sales', sale.id);
            } else {
                // Server returned error (e.g., 500) - stop batch processing to preserve sequence
                break;
            }
        } catch (netError) {
            // Internet dropped mid-request
            console.warn(`Failed to push sale ${sale.id}. Retrying when connection stabilizes.`);
            break;
        }
    }
}

// 5. SYNC DEBT REPAYMENTS TO BACKEND
async function syncRepaymentsBatch(repaymentsList) {
    for (const record of repaymentsList) {
        try {
            const response = await fetch(`${API_BASE_URL}/debt/repayments/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(record)
            });

            if (response.ok) {
                await markRecordSynced('debt_repayments', record.id);
            } else {
                break;
            }
        } catch (netError) {
            console.warn(`Failed to push repayment ${record.id}. Retrying later.`);
            break;
        }
    }
}

// 6. UPDATE RECORD SYNC STATUS LOCALLY
async function markRecordSynced(storeName, recordId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        const getReq = store.get(recordId);
        getReq.onsuccess = () => {
            const record = getReq.result;
            if (record) {
                record.sync_status = 'SYNCED';
                store.put(record);
            }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
