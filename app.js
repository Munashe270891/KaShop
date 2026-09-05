/**
 * Tuckshop POS Main Controller (Box 3 & Application Wiring)
 * Connects DOM elements to db.js, checkout.js, and sync.js
 */

import { initDB, seedInitialData, getAllData } from './db.js';
import { initCheckoutEngine, addProductToCart, getCartTotals, clearCart, processCheckout } from './checkout.js';
import { initSyncEngine } from './sync.js';

// DOM ELEMENTS
const productGrid = document.getElementById('product-grid');
const cartCountEl = document.getElementById('cart-count');
const cartUsdEl = document.getElementById('cart-usd');
const cartZigEl = document.getElementById('cart-zig');
const syncBadge = document.getElementById('sync-badge');

const btnClearCart = document.getElementById('btn-clear-cart');
const btnCompleteSale = document.getElementById('btn-complete-sale');
const btnToggleMode = document.getElementById('btn-toggle-mode');

const checkoutModal = document.getElementById('checkout-modal');
const modalDueUsd = document.getElementById('modal-due-usd');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCreditSale = document.getElementById('btn-credit-sale');
const paymentButtons = document.querySelectorAll('.btn-payment');

// 1. APPLICATION INITIALIZATION
async function initApp() {
    try {
        // Initialize local IndexedDB and seed initial data if empty
        await initDB();
        await seedInitialData();

        // Initialize Checkout Calculation Engine
        await initCheckoutEngine();

        // Render the Rush Hour Touch Grid
        await renderProductGrid();

        // Start Sync Engine and Connection Monitor (Box 4)
        initSyncEngine(updateSyncBadge);

        // Bind UI Event Listeners
        setupEventListeners();

    } catch (error) {
        console.error('App initialization failed:', error);
    }
}

// 2. RENDER RUSH HOUR GRID TILES
async function renderProductGrid() {
    productGrid.innerHTML = '';
    const products = await getAllData('products');

    // Sort products by their defined shortcut grid position
    products.sort((a, b) => (a.shortcut_pos || 99) - (b.shortcut_pos || 99));

    products.forEach(product => {
        const tile = document.createElement('button');
        tile.className = 'tile';
        tile.dataset.id = product.id;

        tile.innerHTML = `
            <span class="tile-title">${product.name}</span>
            <span class="tile-price">$${product.price_usd.toFixed(2)}</span>
            <span class="tile-stock">Stock: ${product.stock_count}</span>
        `;

        // BOX 3 ACTION: Rapid Tap Product Selection
        tile.addEventListener('click', () => {
            const totals = addProductToCart(product);
            updateCartDisplay(totals);
        });

        productGrid.appendChild(tile);
    });
}

// 3. UPDATE RUNNING TOTAL DISPLAY (BOX 1)
function updateCartDisplay(totals) {
    cartCountEl.textContent = totals.itemCount;
    cartUsdEl.textContent = `$${totals.totalUSD.toFixed(2)}`;
    cartZigEl.textContent = `${totals.totalZiG.toFixed(2)} ZiG`;
}

// 4. UI EVENT LISTENERS
function setupEventListeners() {
    // Clear Cart Button
    btnClearCart.addEventListener('click', () => {
        if (navigator.vibrate) navigator.vibrate(100);
        const totals = clearCart();
        updateCartDisplay(totals);
    });

    // Open Checkout Modal
    btnCompleteSale.addEventListener('click', () => {
        const totals = getCartTotals();
        if (totals.itemCount === 0) return;

        modalDueUsd.textContent = `$${totals.totalUSD.toFixed(2)} USD`;
        checkoutModal.classList.remove('hidden');
    });

    // Close Modal
    btnCloseModal.addEventListener('click', () => {
        checkoutModal.classList.add('hidden');
    });

    // Multi-Currency Payment Option Taps
    paymentButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const method = e.currentTarget.dataset.method;
            if (!method) return; // Skip if it's the credit button

            const totals = getCartTotals();
            const paymentSplits = [{
                method: method,
                amount_tendered: totals.totalUSD,
                usd_equivalent: totals.totalUSD
            }];

            await executeCheckoutTransaction({ paymentSplits, isCredit: false });
        });
    });

    // "Chikwereti" (Store Credit) Checkout Tap
    btnCreditSale.addEventListener('click', async () => {
        // Quick assignment for default credit account (e.g., Mai Tinashe)
        const customerId = 'cust_001'; 

        await executeCheckoutTransaction({ 
            paymentSplits: [], 
            isCredit: true, 
            customerId: customerId 
        });
    });

    // Toggle Mode Placeholder
    btnToggleMode.addEventListener('click', () => {
        alert('Switching to Quiet Mode for Stock Reconciliation & Bookkeeping Ledger.');
    });
}

// 5. TRANSACTION EXECUTION HELPER
async function executeCheckoutTransaction({ paymentSplits, isCredit, customerId }) {
    try {
        await processCheckout({ paymentSplits, isCredit, customerId });
        
        // Hide Modal and Update UI
        checkoutModal.classList.add('hidden');
        updateCartDisplay(getCartTotals());
        
        // Refresh product grid to show updated stock balances
        await renderProductGrid();

    } catch (err) {
        alert(err.message || 'Checkout failed');
    }
}

// 6. SYNC BADGE STATUS UPDATER (BOX 4)
function updateSyncBadge(status) {
    syncBadge.className = 'sync-badge';

    switch (status) {
        case 'ONLINE':
            syncBadge.textContent = 'ONLINE';
            syncBadge.classList.add('online');
            break;
        case 'OFFLINE':
            syncBadge.textContent = 'OFFLINE';
            syncBadge.classList.add('offline');
            break;
        case 'SYNCING':
            syncBadge.textContent = 'SYNCING...';
            syncBadge.classList.add('syncing');
            break;
        case 'SYNC_COMPLETE':
            syncBadge.textContent = 'SYNCED';
            syncBadge.classList.add('online');
            break;
        default:
            syncBadge.textContent = 'OFFLINE';
            syncBadge.classList.add('offline');
    }
}

// Start application when DOM content is loaded
document.addEventListener('DOMContentLoaded', initApp);
