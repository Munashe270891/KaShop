/**
 * Tuckshop POS Quiet Mode Module
 * Inventory Restocking, Rate Management, and Debt Overview
 */

import { initDB, getAllData, saveData } from './db.js';

// DOM ELEMENTS
const quietView = document.getElementById('quiet-mode-view');
const rushView = document.getElementById('rush-hour-view');
const btnToggleMode = document.getElementById('btn-toggle-mode');

const stockTableBody = document.getElementById('stock-table-body');
const rateInputsContainer = document.getElementById('rate-inputs-container');
const totalUnpaidDebtEl = document.getElementById('total-unpaid-debt');
const btnSaveRates = document.getElementById('btn-save-rates');

// 1. MODE SWITCHING LOGIC (Box 1 & 3)
export function initQuietMode() {
    btnToggleMode.addEventListener('click', async () => {
        if (quietView.classList.contains('hidden')) {
            // Switch to Quiet Mode
            rushView.classList.add('hidden');
            quietView.classList.remove('hidden');
            btnToggleMode.textContent = 'RUSH HOUR';
            btnToggleMode.classList.add('btn-rush');

            // Load Quiet Mode Data
            await loadStockTable();
            await loadExchangeRatesUI();
            await loadDebtSummary();
        } else {
            // Switch to Rush Hour Mode
            quietView.classList.add('hidden');
            rushView.classList.remove('hidden');
            btnToggleMode.textContent = 'QUIET MODE';
            btnToggleMode.classList.remove('btn-rush');
        }
    });

    btnSaveRates.addEventListener('click', saveExchangeRates);
}

// 2. INVENTORY RESTOCKING TABLE (Box 2 & 3)
async function loadStockTable() {
    stockTableBody.innerHTML = '';
    const products = await getAllData('products');

    products.forEach(product => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="prod-name">${product.name}</td>
            <td class="prod-price">$${product.price_usd.toFixed(2)}</td>
            <td class="stock-control">
                <button class="btn-qty" data-id="${product.id}" data-action="dec">-</button>
                <span class="stock-val" id="stock-${product.id}">${product.stock_count}</span>
                <button class="btn-qty" data-id="${product.id}" data-action="inc">+</button>
            </td>
        `;

        // Direct Quantity Adjustment Handlers
        row.querySelectorAll('.btn-qty').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                const prodId = e.currentTarget.dataset.id;
                adjustStock(prodId, action, product);
            });
        });

        stockTableBody.appendChild(row);
    });
}

async function adjustStock(productId, action, productRef) {
    if (action === 'inc') productRef.stock_count += 1;
    if (action === 'dec' && productRef.stock_count > 0) productRef.stock_count -= 1;

    // Update UI immediately
    document.getElementById(`stock-${productId}`).textContent = productRef.stock_count;

    // Save to IndexedDB (Offline-First)
    await saveData('products', productRef);
}

// 3. DAILY EXCHANGE RATES MANAGEMENT (USD Cash / ZiG / EcoCash)
async function loadExchangeRatesUI() {
    rateInputsContainer.innerHTML = '';
    const rates = await getAllData('exchange_rates');

    rates.forEach(rate => {
        const card = document.createElement('div');
        card.className = 'rate-card';
        card.innerHTML = `
            <label>${rate.currency_code.replace('_', ' ')}</label>
            <input type="number" 
                   step="0.01" 
                   class="rate-input" 
                   data-code="${rate.currency_code}" 
                   value="${rate.rate_to_usd}" />
        `;
        rateInputsContainer.appendChild(card);
    });
}

async function saveExchangeRates() {
    const inputs = rateInputsContainer.querySelectorAll('.rate-input');
    const timestamp = new Date().toISOString();

    for (const input of inputs) {
        const code = input.dataset.code;
        const newRate = parseFloat(input.value);

        if (!isNaN(newRate) && newRate > 0) {
            const rateRecord = {
                currency_code: code,
                rate_to_usd: newRate,
                updated_at: timestamp
            };
            await saveData('exchange_rates', rateRecord);
        }
    }

    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    alert("Today's exchange rates updated successfully!");
}

// 4. DEBT SUMMARY OVERVIEW (Chikwereti Ledger)
async function loadDebtSummary() {
    const customers = await getAllData('customers');
    const totalDebt = customers.reduce((sum, c) => sum + (c.current_debt_usd || 0), 0);
    totalUnpaidDebtEl.textContent = `$${totalDebt.toFixed(2)} USD`;
}
