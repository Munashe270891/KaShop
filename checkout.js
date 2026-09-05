/**
 * Tuckshop POS Checkout Engine
 * Manages Cart State, Haptic Taps, Stock Deductions, and Transaction Writes
 */

import { initDB, saveData, getAllData } from './db.js';

// --- ACTIVE SESSION STATE ---
let activeCart = [];
let activeRates = {};

// 1. INITIALIZE ENGINE & LOAD LOCAL RATES
export async function initCheckoutEngine() {
    const ratesList = await getAllData('exchange_rates');
    ratesList.forEach(r => {
        activeRates[r.currency_code] = r.rate_to_usd;
    });
}

// 2. BOX 3 ACTION: ADD PRODUCT VIA TOUCH (RUSH HOUR GRID)
export function addProductToCart(product) {
    // Rule 1 / Haptic Feedback: Instant tactile confirmation for rush hour
    if (navigator.vibrate) {
        navigator.vibrate(50); // 50ms pulse
    }

    const existingIndex = activeCart.findIndex(item => item.product_id === product.id);

    if (existingIndex > -1) {
        activeCart[existingIndex].quantity += 1;
    } else {
        activeCart.push({
            product_id: product.id,
            name: product.name,
            unit_price_usd: product.price_usd,
            quantity: 1
        });
    }

    return getCartTotals();
}

// 3. CART CALCULATION LOGIC
export function getCartTotals() {
    const totalUSD = activeCart.reduce((sum, item) => sum + (item.unit_price_usd * item.quantity), 0);
    const zigRate = activeRates['ZiG_ECOCASH'] || 26.65;

    return {
        itemCount: activeCart.reduce((sum, item) => sum + item.quantity, 0),
        totalUSD: parseFloat(totalUSD.toFixed(2)),
        totalZiG: parseFloat((totalUSD * zigRate).toFixed(2)),
        cartItems: [...activeCart]
    };
}

// 4. CLEAR CURRENT CART
export function clearCart() {
    activeCart = [];
    return getCartTotals();
}

// 5. PROCESS COMPLETE SALE (OFFLINE-FIRST)
export async function processCheckout({ paymentSplits = [], isCredit = false, customerId = null }) {
    if (activeCart.length === 0) {
        throw new Error("Cannot complete sale: Cart is empty.");
    }

    const db = await initDB();
    const totals = getCartTotals();
    const saleId = 'sale_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const timestamp = new Date().toISOString();

    // Build the Offline Sale Object
    const saleRecord = {
        id: saleId,
        timestamp: timestamp,
        total_usd: totals.totalUSD,
        items: activeCart,
        payment_splits: paymentSplits,
        is_credit: isCredit ? 1 : 0,
        customer_id: customerId,
        sync_status: 'PENDING'
    };

    // ATOMIC TRANSACTION: Save Sale + Update Inventory + Update Customer Debt (if Credit)
    return new Promise((resolve, reject) => {
        const stores = ['sales', 'products'];
        if (isCredit) stores.push('customers');

        const tx = db.transaction(stores, 'readwrite');
        
        // A. Write Sale Record
        const salesStore = tx.objectStore('sales');
        salesStore.put(saleRecord);

        // B. Decrement Local Stock Counts
        const productStore = tx.objectStore('products');
        activeCart.forEach(item => {
            const getReq = productStore.get(item.product_id);
            getReq.onsuccess = () => {
                const product = getReq.result;
                if (product) {
                    product.stock_count = Math.max(0, product.stock_count - item.quantity);
                    productStore.put(product);
                }
            };
        });

        // C. Update Customer Debt (Chikwereti) if applicable
        if (isCredit && customerId) {
            const customerStore = tx.objectStore('customers');
            const custReq = customerStore.get(customerId);
            custReq.onsuccess = () => {
                const customer = custReq.result;
                if (customer) {
                    customer.current_debt_usd = parseFloat((customer.current_debt_usd + totals.totalUSD).toFixed(2));
                    customer.updated_at = timestamp;
                    customerStore.put(customer);
                }
            };
        }

        tx.oncomplete = () => {
            // Success Haptic Feedback (Double Pulse)
            if (navigator.vibrate) {
                navigator.vibrate([100, 50, 100]);
            }
            clearCart();
            resolve({ success: true, saleId: saleId });
        };

        tx.onerror = (event) => {
            reject("Transaction failed: " + event.target.error);
        };
    });
}
