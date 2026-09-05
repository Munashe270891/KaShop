/**
 * Tuckshop POS Stock Intake & Expenses Module
 * Handles receiving goods, logging damages/supplier notes, and tracking operational costs.
 */

import { initDB, getAllData, saveData } from './db.js';

// DOM ELEMENTS
const selectIntakeProduct = document.getElementById('intake-product-select');
const inputSupplierName = document.getElementById('intake-supplier-name');
const inputQtyGood = document.getElementById('intake-qty-good');
const inputQtyDamaged = document.getElementById('intake-qty-damaged');
const inputQtyExpired = document.getElementById('intake-qty-expired');
const inputQtyShort = document.getElementById('intake-qty-short');
const inputUnitCostUsd = document.getElementById('intake-unit-cost');
const btnSubmitIntake = document.getElementById('btn-submit-intake');

const selectExpenseCategory = document.getElementById('expense-category-select');
const inputExpenseAmount = document.getElementById('expense-amount-usd');
const inputExpenseNotes = document.getElementById('expense-notes');
const btnSubmitExpense = document.getElementById('btn-submit-expense');

// 1. INITIALIZE FORMS IN QUIET MODE
export async function initStockAndExpenseForms() {
    await populateProductDropdown();

    if (btnSubmitIntake) {
        btnSubmitIntake.addEventListener('click', handleStockIntakeSubmit);
    }

    if (btnSubmitExpense) {
        btnSubmitExpense.addEventListener('click', handleExpenseSubmit);
    }
}

// Populate product selector for stock intake
async function populateProductDropdown() {
    if (!selectIntakeProduct) return;
    
    selectIntakeProduct.innerHTML = '<option value="">-- Select Product --</option>';
    const products = await getAllData('products');

    products.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        selectIntakeProduct.appendChild(option);
    });
}

// 2. HANDLE STOCK INTAKE (Receiving Goods)
async function handleStockIntakeSubmit(e) {
    e.preventDefault();

    const productId = selectIntakeProduct.value;
    const supplierName = inputSupplierName.value.trim();
    const qtyGood = parseInt(inputQtyGood.value) || 0;
    const qtyDamaged = parseInt(inputQtyDamaged.value) || 0;
    const qtyExpired = parseInt(inputQtyExpired.value) || 0;
    const qtyShort = parseInt(inputQtyShort.value) || 0;
    const unitCostUsd = parseFloat(inputUnitCostUsd.value) || 0;

    if (!productId) {
        alert('Please select a product.');
        return;
    }

    if (!supplierName) {
        alert('Please enter supplier name (e.g., Bakers Inn, Mega Market).');
        return;
    }

    if (qtyGood === 0 && qtyDamaged === 0 && qtyExpired === 0 && qtyShort === 0) {
        alert('Please enter quantities received.');
        return;
    }

    const intakeId = 'intake_' + Date.now();
    const timestamp = new Date().toISOString();

    const intakeRecord = {
        id: intakeId,
        product_id: productId,
        supplier_name: supplierName,
        qty_good: qtyGood,
        qty_damaged: qtyDamaged,
        qty_expired: qtyExpired,
        qty_short: qtyShort,
        unit_cost_usd: unitCostUsd,
        timestamp: timestamp,
        sync_status: 'PENDING'
    };

    try {
        // A. Save intake log
        await saveData('stock_intake_logs', intakeRecord);

        // B. Update product stock count & cost price in master inventory
        const products = await getAllData('products');
        const targetProduct = products.find(p => p.id === productId);

        if (targetProduct) {
            targetProduct.stock_count += qtyGood; // Only good condition items enter active stock
            if (unitCostUsd > 0) {
                targetProduct.cost_price_usd = unitCostUsd; // Update COGS cost price
            }
            await saveData('products', targetProduct);
        }

        // C. If there was damaged/expired stock, automatically record it as a stock loss expense
        const totalLossQty = qtyDamaged + qtyExpired + qtyShort;
        if (totalLossQty > 0 && unitCostUsd > 0) {
            const lossExpenseRecord = {
                id: 'loss_' + Date.now(),
                category: 'STOCK_LOSS',
                amount_usd: totalLossQty * unitCostUsd,
                notes: `Delivery Loss from ${supplierName}: ${qtyDamaged} damaged, ${qtyExpired} expired, ${qtyShort} short.`,
                timestamp: timestamp,
                sync_status: 'PENDING'
            };
            await saveData('shop_expenses', lossExpenseRecord);
        }

        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        alert(`Stock received successfully! Added ${qtyGood} items to inventory.`);

        // Clear Form
        inputSupplierName.value = '';
        inputQtyGood.value = '';
        inputQtyDamaged.value = '';
        inputQtyExpired.value = '';
        inputQtyShort.value = '';
        inputUnitCostUsd.value = '';

    } catch (err) {
        console.error('Stock intake failed:', err);
        alert('Failed to save stock intake log.');
    }
}

// 3. HANDLE OPERATING EXPENSES & LOSSES
async function handleExpenseSubmit(e) {
    e.preventDefault();

    const category = selectExpenseCategory.value;
    const amountUsd = parseFloat(inputExpenseAmount.value) || 0;
    const notes = inputExpenseNotes.value.trim();

    if (!category) {
        alert('Please select an expense category.');
        return;
    }

    if (amountUsd <= 0) {
        alert('Please enter a valid expense amount in USD.');
        return;
    }

    const expenseRecord = {
        id: 'exp_' + Date.now(),
        category: category,
        amount_usd: amountUsd,
        notes: notes,
        timestamp: new Date().toISOString(),
        sync_status: 'PENDING'
    };

    try {
        await saveData('shop_expenses', expenseRecord);
        
        if (navigator.vibrate) navigator.vibrate(100);
        alert(`Expense of $${amountUsd.toFixed(2)} USD logged under ${category}.`);

        // Clear Form
        inputExpenseAmount.value = '';
        inputExpenseNotes.value = '';

    } catch (err) {
        console.error('Failed to log expense:', err);
        alert('Could not record expense.');
    }
}
