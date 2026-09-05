/**
 * Tuckshop POS Database Engine (Updated for Step 6)
 * Handled via Native Browser IndexedDB (Offline-First)
 */

const DB_NAME = 'HarareTuckshopDB';
const DB_VERSION = 2; // Incremented to trigger schema upgrade

let dbInstance = null;

// Initialize and Open Database
export function initDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // Runs on first install or version upgrade
        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // 1. PRODUCTS STORE
            if (!db.objectStoreNames.contains('products')) {
                const productStore = db.createObjectStore('products', { keyPath: 'id' });
                productStore.createIndex('shortcut_pos', 'shortcut_pos', { unique: true });
            }

            // 2. CUSTOMERS (Chikwereti Ledger)
            if (!db.objectStoreNames.contains('customers')) {
                const customerStore = db.createObjectStore('customers', { keyPath: 'id' });
                customerStore.createIndex('phone', 'phone', { unique: false });
            }

            // 3. SALES HEADER STORE
            if (!db.objectStoreNames.contains('sales')) {
                const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
                salesStore.createIndex('sync_status', 'sync_status', { unique: false });
            }

            // 4. DEBT REPAYMENTS STORE
            if (!db.objectStoreNames.contains('debt_repayments')) {
                const repaymentStore = db.createObjectStore('debt_repayments', { keyPath: 'id' });
                repaymentStore.createIndex('sync_status', 'sync_status', { unique: false });
            }

            // 5. EXCHANGE RATES STORE
            if (!db.objectStoreNames.contains('exchange_rates')) {
                db.createObjectStore('exchange_rates', { keyPath: 'currency_code' });
            }

            // 6. STOCK INTAKE LOGS (Supplier & Condition Tracking)
            if (!db.objectStoreNames.contains('stock_intake_logs')) {
                const intakeStore = db.createObjectStore('stock_intake_logs', { keyPath: 'id' });
                intakeStore.createIndex('sync_status', 'sync_status', { unique: false });
                intakeStore.createIndex('product_id', 'product_id', { unique: false });
            }

            // 7. SHOP EXPENSES (Operating Costs & Damages for P&L)
            if (!db.objectStoreNames.contains('shop_expenses')) {
                const expenseStore = db.createObjectStore('shop_expenses', { keyPath: 'id' });
                expenseStore.createIndex('sync_status', 'sync_status', { unique: false });
                expenseStore.createIndex('category', 'category', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };

        request.onerror = (event) => {
            reject('IndexedDB Error: ' + event.target.errorCode);
        };
    });
}

// Seed Initial Products and Default Exchange Rates
export async function seedInitialData() {
    const db = await initDB();

    // Seed Rates
    const rateTx = db.transaction('exchange_rates', 'readwrite');
    const rateStore = rateTx.objectStore('exchange_rates');
    
    const defaultRates = [
        { currency_code: 'USD_CASH', rate_to_usd: 1.0, updated_at: new Date().toISOString() },
        { currency_code: 'ZiG_ECOCASH', rate_to_usd: 26.65, updated_at: new Date().toISOString() },
        { currency_code: 'ZiG_CASH', rate_to_usd: 26.65, updated_at: new Date().toISOString() }
    ];

    defaultRates.forEach(rate => rateStore.put(rate));

    // Seed Sample Products with Cost Prices for COGS / Profit Calculation
    const prodTx = db.transaction('products', 'readwrite');
    const prodStore = prodTx.objectStore('products');

    const sampleProducts = [
        { id: 'prod_1', name: 'Loaf Bread', price_usd: 1.00, cost_price_usd: 0.80, stock_count: 50, shortcut_pos: 1 },
        { id: 'prod_2', name: '2L Cooking Oil', price_usd: 3.50, cost_price_usd: 2.90, stock_count: 20, shortcut_pos: 2 },
        { id: 'prod_3', name: '1kg Sugar', price_usd: 1.20, cost_price_usd: 0.95, stock_count: 40, shortcut_pos: 3 },
        { id: 'prod_4', name: 'Single Cigarette', price_usd: 0.10, cost_price_usd: 0.05, stock_count: 200, shortcut_pos: 4 }
    ];

    sampleProducts.forEach(prod => prodStore.put(prod));
}

// Helper: Generic Save/Put Item
export async function saveData(storeName, item) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(item);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// Helper: Generic Fetch All Items
export async function getAllData(storeName) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
