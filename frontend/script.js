/**
 * script.js — Core Dashboard Application Logic
 * Handles navigation, inventory CRUD, reorder prediction, order lifecycle,
 * reports, history, and PDF export.
 */

// ============================================
// 1. AUTH GUARD & INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async function () {
    if (!requireAuth()) return;

    const user = getLoggedInUser();
    document.getElementById('userName').textContent = user;
    document.getElementById('userAvatar').textContent = user.charAt(0).toUpperCase();
    document.getElementById('dashGreetUser').textContent = user;

    setupNavigation();
    await setupInventory();
    setupReports();
    await loadOrderHistory();
    await refreshDashboard();
    setupDemandPredictor();
});

// ============================================
// 2. NAVIGATION — SPA‑style section switching
// ============================================
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-section]');
    const sections = document.querySelectorAll('.content-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.section;

            // Update active nav
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // Show target section
            sections.forEach(s => s.classList.remove('active'));
            document.getElementById('section' + capitalize(target)).classList.add('active');

            // Refresh section data
            if (target === 'dashboard') refreshDashboard();
            if (target === 'reports') refreshReportsView();
            if (target === 'history') loadOrderHistory();
            if (target === 'reorder') refreshReorderAlerts();
            if (target === 'predictor') refreshPredictorView();
            if (target === 'catalog') setupCatalog();

            // Close mobile sidebar
            closeMobileSidebar();
        });
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Mobile hamburger
    document.getElementById('hamburgerBtn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebarOverlay').classList.toggle('visible');
    });
    document.getElementById('sidebarOverlay').addEventListener('click', closeMobileSidebar);
}

function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('visible');
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================
// 3. DATA HELPERS — Backend REST API
// ============================================

/** Shared fetch helper that attaches JWT auth header */
async function apiFetch(url, options = {}) {
    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        logout(); // Token expired — redirect to login
        return null;
    }
    return response.json();
}

/** Get all completed orders for current user from backend */
async function getCompletedOrders() {
    const data = await apiFetch('/api/inventory/orders');
    return data && data.success ? data.orders : [];
}

/** Get current in-progress order (array of products) from backend */
async function getCurrentOrder() {
    const data = await apiFetch('/api/inventory/current-order');
    return data && data.success ? data.products : null;
}

/** Save current order to backend */
async function saveCurrentOrder(products) {
    await apiFetch('/api/inventory/current-order', {
        method: 'POST',
        body: JSON.stringify({ products })
    });
}

/** Clear current order on backend */
async function clearCurrentOrder() {
    await apiFetch('/api/inventory/current-order', { method: 'DELETE' });
}

// ============================================
// 4. REORDER CALCULATION HELPERS
// ============================================

/**
 * Calculate reorder data for a product.
 * Reorder Level = (Daily Consumption × Lead Time) + Safety Stock
 * Reorder Quantity = Reorder Level − Current Stock
 */
function calcReorder(product) {
    const reorderLevel = (product.dailyConsumption * product.leadTime) + product.safetyStock;
    const reorderQty = reorderLevel - product.currentStock;
    const needsReorder = reorderQty > 0;
    return {
        reorderLevel: reorderLevel,
        reorderQty: Math.max(reorderQty, 0), // Display 0 if stock sufficient, but flag is based on raw calc
        rawReorderQty: reorderQty,
        needsReorder: needsReorder,
        status: needsReorder ? 'Reorder Required' : 'Stock Sufficient'
    };
}

// ============================================
// 5. INVENTORY SECTION
// ============================================
async function setupInventory() {
    const startBtn = document.getElementById('startOrderBtn');
    const form = document.getElementById('productForm');

    // Check if there's already an active order
    const existing = await getCurrentOrder();
    if (existing && existing.length > 0) {
        showActiveOrder();
        renderInventoryTable(existing);
    }

    startBtn.addEventListener('click', async () => {
        const active = await getCurrentOrder();
        if (active && active.length > 0) {
            if (!confirm('An order is already in progress. Start a new one? (Current products will be lost)')) return;
        }
        await saveCurrentOrder([]);
        showActiveOrder();
        renderInventoryTable([]);
    });

    // Prevent non-numeric input on number fields
    const numberFields = [
        'plannedQty', 'plannedRate', 'actualQty', 'actualRate',
        'currentStock', 'minStock', 'dailyConsumption', 'leadTime', 'safetyStock'
    ];
    numberFields.forEach(id => {
        document.getElementById(id).addEventListener('keydown', function (e) {
            if ([46, 8, 9, 27, 13, 110, 190].includes(e.keyCode) ||
                (e.keyCode === 65 && (e.ctrlKey || e.metaKey)) ||
                (e.keyCode >= 35 && e.keyCode <= 40)) {
                return;
            }
            if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) &&
                (e.keyCode < 96 || e.keyCode > 105)) {
                e.preventDefault();
            }
        });
    });

    // Add product
    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const name = document.getElementById('prodName').value.trim();
        const pQty = parseFloat(document.getElementById('plannedQty').value);
        const pRate = parseFloat(document.getElementById('plannedRate').value);
        const aQty = parseFloat(document.getElementById('actualQty').value);
        const aRate = parseFloat(document.getElementById('actualRate').value);

        // Reorder fields
        const curStock = parseFloat(document.getElementById('currentStock').value);
        const minStk = parseFloat(document.getElementById('minStock').value);
        const dailyCons = parseFloat(document.getElementById('dailyConsumption').value);
        const lt = parseFloat(document.getElementById('leadTime').value);
        const safStk = parseFloat(document.getElementById('safetyStock').value);

        if (!name || [pQty, pRate, aQty, aRate, curStock, minStk, dailyCons, lt, safStk].some(v => isNaN(v))) return;

        const products = (await getCurrentOrder()) || [];
        products.push({
            name,
            plannedQty: pQty,
            plannedRate: pRate,
            actualQty: aQty,
            actualRate: aRate,
            plannedCost: pQty * pRate,
            actualCost: aQty * aRate,
            currentStock: curStock,
            minStock: minStk,
            dailyConsumption: dailyCons,
            leadTime: lt,
            safetyStock: safStk
        });
        await saveCurrentOrder(products);
        renderInventoryTable(products);

        form.reset();
        document.getElementById('prodName').focus();
    });
}

function showActiveOrder() {
    document.getElementById('noOrderState').style.display = 'none';
    document.getElementById('activeOrderArea').style.display = 'block';
    document.getElementById('startOrderBtn').innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg> Restart Order';
}

function renderInventoryTable(products) {
    const tbody = document.getElementById('inventoryBody');
    const tableCard = document.getElementById('inventoryTableCard');

    if (products.length === 0) {
        tableCard.style.display = 'none';
        return;
    }

    tableCard.style.display = 'block';
    tbody.innerHTML = '';

    products.forEach((p, i) => {
        const r = calcReorder(p);
        const badgeClass = r.needsReorder ? 'badge-reorder' : 'badge-stockok';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td>₹${formatNum(p.plannedCost)}</td>
            <td>₹${formatNum(p.actualCost)}</td>
            <td><span class="status-badge ${badgeClass}">${r.status}</span></td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="removeProduct(${i})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    Remove
                </button>
            </td>`;
        tbody.appendChild(tr);
    });
}

/** Remove a product by index */
async function removeProduct(index) {
    const products = (await getCurrentOrder()) || [];
    products.splice(index, 1);
    await saveCurrentOrder(products);
    renderInventoryTable(products);
}

// ============================================
// 6. REORDER ALERTS SECTION
// ============================================
async function refreshReorderAlerts() {
    const products = await getCurrentOrder();
    const emptyState = document.getElementById('noReorderState');
    const alertArea = document.getElementById('reorderAlertArea');

    if (!products || products.length === 0) {
        emptyState.style.display = 'flex';
        alertArea.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    alertArea.style.display = 'block';

    let reorderCount = 0;
    let okCount = 0;

    const tbody = document.getElementById('reorderBody');
    tbody.innerHTML = '';

    products.forEach((p, i) => {
        const r = calcReorder(p);
        if (r.needsReorder) reorderCount++; else okCount++;

        const badgeClass = r.needsReorder ? 'badge-reorder' : 'badge-stockok';
        const rowClass = r.needsReorder ? 'reorder-row-warn' : '';
        const tr = document.createElement('tr');
        tr.className = rowClass;
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td>${p.currentStock}</td>
            <td>${formatNum(r.reorderLevel)}</td>
            <td>${r.needsReorder ? formatNum(r.rawReorderQty) : '0'}</td>
            <td><span class="status-badge ${badgeClass}">${r.status}</span></td>`;
        tbody.appendChild(tr);
    });

    document.getElementById('reorderRequiredCount').textContent = reorderCount;
    document.getElementById('stockOkCount').textContent = okCount;
}

// ============================================
// 7. REPORTS SECTION
// ============================================
function setupReports() {
    document.getElementById('completeOrderBtn').addEventListener('click', completeOrder);
    document.getElementById('exportPdfBtn').addEventListener('click', exportPdf);
    document.getElementById('newOrderFromReportBtn').addEventListener('click', () => {
        clearCurrentOrder();
        document.getElementById('reportSummaryArea').style.display = 'none';
        document.querySelector('.nav-item[data-section="inventory"]').click();
        saveCurrentOrder([]);
        showActiveOrder();
        renderInventoryTable([]);
    });
}

async function refreshReportsView() {
    const products = await getCurrentOrder();
    const summaryArea = document.getElementById('reportSummaryArea');
    const activeArea = document.getElementById('reportActiveArea');
    const emptyState = document.getElementById('noReportState');

    if (summaryArea.style.display === 'block') return;

    if (!products || products.length === 0) {
        emptyState.style.display = 'flex';
        activeArea.style.display = 'none';
    } else {
        emptyState.style.display = 'none';
        activeArea.style.display = 'block';
        document.getElementById('reportProductCount').textContent =
            products.length + ' product' + (products.length > 1 ? 's' : '') + ' in current order';
    }
}

/** Complete the current order — sends request to backend */
async function completeOrder() {
    const products = await getCurrentOrder();
    if (!products || products.length === 0) {
        alert('No products in the current order.');
        return;
    }

    const data = await apiFetch('/api/inventory/orders', { method: 'POST' });

    if (!data || !data.success) {
        alert('Failed to complete order: ' + (data ? data.message : 'Server error'));
        return;
    }

    const order = data.order;

    // Reset inventory view
    document.getElementById('noOrderState').style.display = 'flex';
    document.getElementById('activeOrderArea').style.display = 'none';
    document.getElementById('startOrderBtn').innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Start New Order';

    // Show summary
    showOrderSummary(order);
}

function showOrderSummary(order) {
    document.getElementById('reportActiveArea').style.display = 'none';
    document.getElementById('noReportState').style.display = 'none';
    document.getElementById('reportSummaryArea').style.display = 'block';

    document.getElementById('reportOrderId').textContent = order.id;
    document.getElementById('reportPlannedCost').textContent = '₹' + formatNum(order.totalPlanned);
    document.getElementById('reportActualCost').textContent = '₹' + formatNum(order.totalActual);
    document.getElementById('reportVariance').textContent = '₹' + formatNum(order.variance);

    const statusEl = document.getElementById('reportStatus');
    statusEl.textContent = order.status;
    statusEl.className = 'summary-value status ' + (order.status === 'Profit' ? 'profit' : 'loss');

    // Cost breakdown table
    const tbody = document.getElementById('reportBody');
    tbody.innerHTML = '';
    order.products.forEach((p, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td>${escapeHtml(p.name)}</td>
            <td>₹${formatNum(p.plannedCost)}</td>
            <td>₹${formatNum(p.actualCost)}</td>`;
        tbody.appendChild(tr);
    });

    // Reorder status table in report
    const reorderTbody = document.getElementById('reportReorderBody');
    reorderTbody.innerHTML = '';
    order.reorderItems.forEach((r, i) => {
        const badgeClass = r.needsReorder ? 'badge-reorder' : 'badge-stockok';
        const tr = document.createElement('tr');
        tr.className = r.needsReorder ? 'reorder-row-warn' : '';
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td>${escapeHtml(r.name)}</td>
            <td>${r.currentStock}</td>
            <td>${formatNum(r.reorderLevel)}</td>
            <td>${r.needsReorder ? formatNum(r.reorderQty) : '0'}</td>
            <td><span class="status-badge ${badgeClass}">${r.status}</span></td>`;
        reorderTbody.appendChild(tr);
    });

    // Store for PDF
    window._lastOrder = order;
}

// ============================================
// 8. PDF EXPORT using jsPDF
// ============================================
function exportPdf() {
    const order = window._lastOrder;
    if (!order) { alert('No order summary to export.'); return; }

    if (!window.jspdf) {
        alert('PDF library is still loading. Please try again in a moment.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Title
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59);
    doc.text('Order Summary', 14, 22);

    // Order ID & Date
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text('Order ID: ' + order.id, 14, 32);
    doc.text('Date: ' + order.date, 14, 38);
    doc.text('User: ' + getLoggedInUser(), 14, 44);

    // Summary
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    let y = 56;
    doc.text('Total Planned Cost:  \u20B9' + formatNum(order.totalPlanned), 14, y);
    doc.text('Total Actual Cost:   \u20B9' + formatNum(order.totalActual), 14, y + 8);
    doc.text('Variance:            \u20B9' + formatNum(order.variance), 14, y + 16);
    doc.text('Status:              ' + order.status, 14, y + 24);

    // ---- Cost Breakdown Table ----
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('Cost Breakdown', 14, y + 38);

    const costData = order.products.map((p, i) => [
        i + 1,
        p.name,
        p.plannedQty,
        '\u20B9' + formatNum(p.plannedRate),
        '\u20B9' + formatNum(p.plannedCost),
        p.actualQty,
        '\u20B9' + formatNum(p.actualRate),
        '\u20B9' + formatNum(p.actualCost)
    ]);

    doc.autoTable({
        startY: y + 44,
        head: [['#', 'Product', 'Plan Qty', 'Plan Rate', 'Plan Cost', 'Act Qty', 'Act Rate', 'Act Cost']],
        body: costData,
        theme: 'grid',
        headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 3 },
        alternateRowStyles: { fillColor: [248, 250, 252] }
    });

    // ---- Reorder Status Table ----
    const reorderStartY = doc.lastAutoTable.finalY + 14;
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('Reorder Status', 14, reorderStartY);

    const reorderData = order.reorderItems.map((r, i) => [
        i + 1,
        r.name,
        r.currentStock,
        formatNum(r.reorderLevel),
        r.needsReorder ? formatNum(r.reorderQty) : '0',
        r.status
    ]);

    doc.autoTable({
        startY: reorderStartY + 6,
        head: [['#', 'Product', 'Current Stock', 'Reorder Level', 'Reorder Qty', 'Status']],
        body: reorderData,
        theme: 'grid',
        headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 3 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 5) {
                if (data.cell.raw === 'Reorder Required') {
                    data.cell.styles.textColor = [239, 68, 68];
                    data.cell.styles.fontStyle = 'bold';
                } else {
                    data.cell.styles.textColor = [16, 185, 129];
                }
            }
        }
    });

    doc.save(order.id + '_summary.pdf');
}

// ============================================
// 9. ORDER HISTORY
// ============================================
async function loadOrderHistory() {
    const orders = await getCompletedOrders();
    const emptyState = document.getElementById('noHistoryState');
    const tableCard = document.getElementById('historyTableCard');

    if (!orders || orders.length === 0) {
        emptyState.style.display = 'flex';
        tableCard.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    tableCard.style.display = 'block';

    const tbody = document.getElementById('historyBody');
    tbody.innerHTML = '';

    // Backend already returns newest first (ORDER BY id DESC)
    orders.forEach(order => {
        const tr = document.createElement('tr');
        const statusClass = order.status === 'Profit' ? 'badge-profit' : 'badge-loss';
        const reorderCount = order.reorderRequired || 0;
        const reorderBadge = reorderCount > 0
            ? `<span class="status-badge badge-reorder">${reorderCount} item${reorderCount > 1 ? 's' : ''}</span>`
            : `<span class="status-badge badge-stockok">All OK</span>`;
        tr.innerHTML = `
            <td><strong>${order.id}</strong></td>
            <td>${order.date}</td>
            <td>₹${formatNum(order.totalPlanned)}</td>
            <td>₹${formatNum(order.totalActual)}</td>
            <td>₹${formatNum(order.variance)}</td>
            <td><span class="status-badge ${statusClass}">${order.status}</span></td>
            <td>${reorderBadge}</td>`;
        tbody.appendChild(tr);
    });
}

// ============================================
// 10. DASHBOARD WIDGETS
// ============================================
async function refreshDashboard() {
    // --- Widget 1: Reports Summary ---
    const orders = await getCompletedOrders();
    const totalOrders = orders.length;
    let totalPlanned = 0, totalActual = 0;

    orders.forEach(o => {
        totalPlanned += o.totalPlanned;
        totalActual += o.totalActual;
    });

    const variance = Math.abs(totalPlanned - totalActual);

    document.getElementById('dashTotalOrders').textContent = totalOrders;
    document.getElementById('dashTotalPlanned').textContent = '₹' + (totalOrders ? formatNum(totalPlanned) : '0');
    document.getElementById('dashTotalActual').textContent = '₹' + (totalOrders ? formatNum(totalActual) : '0');
    document.getElementById('dashVariance').textContent = '₹' + (totalOrders ? formatNum(variance) : '0');

    const plEl = document.getElementById('dashProfitLoss');
    if (totalOrders === 0) {
        plEl.innerHTML = '<span class="widget-badge widget-badge-neutral">No orders yet</span>';
    } else if (totalActual < totalPlanned) {
        plEl.innerHTML = '<span class="widget-badge widget-badge-profit">✓ Overall Profit — saved ₹' + formatNum(variance) + '</span>';
    } else if (totalActual > totalPlanned) {
        plEl.innerHTML = '<span class="widget-badge widget-badge-loss">⚠ Overall Loss — exceeded by ₹' + formatNum(variance) + '</span>';
    } else {
        plEl.innerHTML = '<span class="widget-badge widget-badge-even">≈ Break Even</span>';
    }

    // --- Widget 2: Current Products ---
    const products = await getCurrentOrder();
    const noProds = document.getElementById('dashNoProducts');
    const prodsTable = document.getElementById('dashProductsTable');
    const prodCount = document.getElementById('dashProductCount');

    if (!products || products.length === 0) {
        noProds.style.display = 'block';
        prodsTable.style.display = 'none';
        prodCount.textContent = '0';
    } else {
        noProds.style.display = 'none';
        prodsTable.style.display = 'block';
        prodCount.textContent = products.length;

        const tbody = document.getElementById('dashProductsBody');
        tbody.innerHTML = '';
        products.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(p.name)}</td>
                <td>₹${formatNum(p.plannedCost)}</td>
                <td>₹${formatNum(p.actualCost)}</td>`;
            tbody.appendChild(tr);
        });
    }

    // --- Widget 3: Emergency Reorder Alerts ---
    const noAlerts = document.getElementById('dashNoAlerts');
    const alertsTable = document.getElementById('dashAlertsTable');
    const alertCount = document.getElementById('dashAlertCount');

    const alertProducts = [];
    if (products && products.length > 0) {
        products.forEach(p => {
            const r = calcReorder(p);
            if (r.needsReorder) {
                alertProducts.push({ name: p.name, currentStock: p.currentStock, reorderLevel: r.reorderLevel, reorderQty: r.rawReorderQty });
            }
        });
    }

    alertCount.textContent = alertProducts.length;

    if (alertProducts.length === 0) {
        noAlerts.style.display = 'block';
        alertsTable.style.display = 'none';
    } else {
        noAlerts.style.display = 'none';
        alertsTable.style.display = 'block';

        const tbody = document.getElementById('dashAlertsBody');
        tbody.innerHTML = '';
        alertProducts.forEach(a => {
            const tr = document.createElement('tr');
            tr.className = 'alert-row';
            tr.innerHTML = `
                <td>${escapeHtml(a.name)}</td>
                <td>${a.currentStock}</td>
                <td>${formatNum(a.reorderLevel)}</td>
                <td class="alert-qty">${formatNum(a.reorderQty)}</td>`;
            tbody.appendChild(tr);
        });
    }
}

// ============================================
// 11. UTILITIES
// ============================================
function formatNum(n) {
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================
// 12. AI DEMAND PREDICTOR MODULE
// ============================================
function setupDemandPredictor() {
    const trendSlider = document.getElementById('trendShiftSlider');
    const safetySlider = document.getElementById('safetyMarginSlider');
    const productSelect = document.getElementById('predictorProductSelect');
    const applyBtn = document.getElementById('applyAiSafetyStockBtn');

    if (!trendSlider || !safetySlider || !productSelect || !applyBtn) return;

    // Live update parameters on slider input
    trendSlider.addEventListener('input', () => {
        document.getElementById('trendShiftVal').textContent = (trendSlider.value >= 0 ? '+' : '') + trendSlider.value + '%';
        recalculateAiPredictions();
    });

    safetySlider.addEventListener('input', () => {
        document.getElementById('safetyMarginVal').textContent = parseFloat(safetySlider.value).toFixed(1) + 'x';
        recalculateAiPredictions();
    });

    productSelect.addEventListener('change', () => {
        recalculateAiPredictions();
    });

    applyBtn.addEventListener('click', async () => {
        const products = await getCurrentOrder();
        if (!products || products.length === 0) return;

        const selectIndex = parseInt(productSelect.value);
        if (isNaN(selectIndex) || selectIndex < 0 || selectIndex >= products.length) return;

        const product = products[selectIndex];
        const valShift = parseFloat(trendSlider.value);
        const valMargin = parseFloat(safetySlider.value);

        // Calculate recommended safety stock buffer (independent of current safetyStock setting)
        const recommendedSafetyStock = Math.ceil(
            product.dailyConsumption * product.leadTime * (valMargin - 1) * (1 + (valShift / 100))
        );

        // Update product's safety stock configuration baseline with the recommendation
        product.safetyStock = recommendedSafetyStock;
        await saveCurrentOrder(products);

        // Show success alert
        const successMsg = document.getElementById('aiApplySuccess');
        successMsg.style.display = 'block';
        setTimeout(() => {
            successMsg.style.display = 'none';
        }, 3000);

        // Refresh views
        await recalculateAiPredictions();
        await refreshDashboard();
        await refreshReorderAlerts();
    });
}

async function refreshPredictorView() {
    const products = await getCurrentOrder();
    const emptyState = document.getElementById('noPredictorState');
    const predictorArea = document.getElementById('predictorArea');
    const select = document.getElementById('predictorProductSelect');

    if (!products || products.length === 0) {
        emptyState.style.display = 'flex';
        predictorArea.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    predictorArea.style.display = 'block';

    // Populate dropdown selector while preserving selection if possible
    const lastSelectedVal = select.value;
    select.innerHTML = '';
    products.forEach((p, idx) => {
        const option = document.createElement('option');
        option.value = idx;
        option.textContent = p.name;
        select.appendChild(option);
    });

    if (lastSelectedVal !== "" && parseInt(lastSelectedVal) < products.length) {
        select.value = lastSelectedVal;
    } else {
        select.value = "0";
    }

    await recalculateAiPredictions();
}

async function recalculateAiPredictions() {
    const products = await getCurrentOrder();
    const select = document.getElementById('predictorProductSelect');
    if (!products || products.length === 0) return;

    const idx = parseInt(select.value);
    if (isNaN(idx) || idx < 0 || idx >= products.length) return;

    const product = products[idx];
    const trendShift = parseFloat(document.getElementById('trendShiftSlider').value);
    const safetyMargin = parseFloat(document.getElementById('safetyMarginSlider').value);

    // Calculate prediction math using independent variables to prevent compounding
    const baseDemand = product.dailyConsumption * product.leadTime * (1 + (trendShift / 100));
    const safetyBuffer = Math.ceil(product.dailyConsumption * product.leadTime * (safetyMargin - 1) * (1 + (trendShift / 100)));
    const saferStock = Math.ceil(baseDemand + safetyBuffer);

    // Update markup labels
    document.getElementById('aiSaferStockLabel').textContent = saferStock + ' units';
    document.getElementById('aiStockBreakdownLabel').textContent = `Base demand forecast: ${Math.ceil(baseDemand)} + Suggested buffer: ${Math.ceil(safetyBuffer)}`;

    // Calculate chart bars heights
    const maxVal = Math.max(product.currentStock, product.safetyStock, saferStock) || 1;
    const barCurrent = document.getElementById('barCurrentStock');
    const barStandard = document.getElementById('barStandardSafety');
    const barAi = document.getElementById('barAiSafer');

    barCurrent.style.height = `${(product.currentStock / maxVal) * 100}%`;
    barCurrent.title = `Current Stock: ${product.currentStock}`;

    barStandard.style.height = `${(product.safetyStock / maxVal) * 100}%`;
    barStandard.title = `Standard Safety Stock: ${product.safetyStock}`;

    barAi.style.height = `${(saferStock / maxVal) * 100}%`;
    barAi.title = `Recommended Safer Stock: ${saferStock}`;

    // Update status info explanation panel
    const statusBox = document.getElementById('aiStatusBox');
    statusBox.className = 'ai-status-box'; // reset

    if (product.currentStock < saferStock) {
        statusBox.classList.add('ai-status-danger');
        const daysRemaining = Math.max(0, Math.floor(product.currentStock / (product.dailyConsumption || 1)));
        statusBox.innerHTML = `
            <strong>⚠ CRISIS THREAT DETECTED:</strong> stock levels are critically low relative to projected demand. 
            A stockout is forecasted within <strong>${daysRemaining} day(s)</strong> under elevated trend limits. 
            Increase stock margins to prevent sales disruption.
        `;
    } else if (product.currentStock < saferStock * 1.3) {
        statusBox.classList.add('ai-status-warning');
        statusBox.innerHTML = `
            <strong>⚡ MARGINS TIGHT:</strong> Current inventory is sufficient for baseline ops but holds less than 30% margin above peak safety projections. Applying the recommended safety stock is advised.
        `;
    } else {
        statusBox.classList.add('ai-status-safe');
        statusBox.innerHTML = `
            <strong>✓ INVENTORY SECURE:</strong> Current stock levels exceed the calculated crisis-prevention thresholds. Ample supply buffer exists to cover forecast trends.
        `;
    }
}
// ============================================
// 11. CATALOG MANAGER
// ============================================
let catalogInitialized = false;

async function setupCatalog() {
    // Switch tabs
    const tabs = document.querySelectorAll('.catalog-tab');
    const panels = document.querySelectorAll('.catalog-panel');

    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            panels.forEach(p => p.style.display = 'none');
            const key = tab.dataset.tab;
            document.getElementById('catalog' + capitalize(key)).style.display = 'block';
        };
    });

    // Load all three data sets in parallel
    await Promise.all([loadCatalogProducts(), loadCatalogCategories(), loadCatalogSuppliers()]);

    if (!catalogInitialized) {
        catalogInitialized = true;
        setupCatalogForms();
    }
}

async function loadCatalogProducts() {
    const [prodData, catData, supData] = await Promise.all([
        apiFetch('/api/products'),
        apiFetch('/api/categories'),
        apiFetch('/api/suppliers')
    ]);

    // Populate dropdowns on add product form
    const catSelect = document.getElementById('cpCategory');
    const supSelect = document.getElementById('cpSupplier');
    catSelect.innerHTML = '<option value="">— None —</option>';
    supSelect.innerHTML = '<option value="">— None —</option>';

    if (catData && catData.success) {
        catData.categories.forEach(c => {
            const o = document.createElement('option');
            o.value = c.id;
            o.textContent = c.name;
            catSelect.appendChild(o);
        });
    }
    if (supData && supData.success) {
        supData.suppliers.forEach(s => {
            const o = document.createElement('option');
            o.value = s.id;
            o.textContent = s.name;
            supSelect.appendChild(o);
        });
    }

    const tbody = document.getElementById('catalogProductBody');
    const products = (prodData && prodData.success) ? prodData.products : [];
    document.getElementById('catalogProductCount').textContent = products.length + ' product' + (products.length !== 1 ? 's' : '');

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;opacity:0.5;">No products yet. Add one above.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    products.forEach((p, i) => {
        const reorderLevel = (p.daily_consumption * p.lead_time) + p.safety_stock;
        const needsReorder = p.current_stock < reorderLevel;
        const statusBadge = needsReorder
            ? '<span class="status-badge badge-reorder">Reorder Required</span>'
            : '<span class="status-badge badge-stockok">Stock OK</span>';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td>${escapeHtml(p.category_name || '—')}</td>
            <td>${escapeHtml(p.supplier_name || '—')}</td>
            <td>${p.current_stock}</td>
            <td>${p.min_stock}</td>
            <td>${p.safety_stock}</td>
            <td>${statusBadge}</td>`;
        tbody.appendChild(tr);
    });
}

async function loadCatalogCategories() {
    const data = await apiFetch('/api/categories');
    const categories = (data && data.success) ? data.categories : [];
    const tbody = document.getElementById('catalogCategoryBody');
    document.getElementById('catalogCategoryCount').textContent = categories.length + ' categor' + (categories.length !== 1 ? 'ies' : 'y');

    if (categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;opacity:0.5;">No categories yet. Add one above.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    categories.forEach((c, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${i + 1}</td><td><strong>${escapeHtml(c.name)}</strong></td><td>${escapeHtml(c.description || '—')}</td>`;
        tbody.appendChild(tr);
    });
}

async function loadCatalogSuppliers() {
    const data = await apiFetch('/api/suppliers');
    const suppliers = (data && data.success) ? data.suppliers : [];
    const tbody = document.getElementById('catalogSupplierBody');
    document.getElementById('catalogSupplierCount').textContent = suppliers.length + ' supplier' + (suppliers.length !== 1 ? 's' : '');

    if (suppliers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;opacity:0.5;">No suppliers yet. Add one above.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    suppliers.forEach((s, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${i + 1}</td><td><strong>${escapeHtml(s.name)}</strong></td><td>${escapeHtml(s.contact_person || '—')}</td><td>${escapeHtml(s.email || '—')}</td><td>${escapeHtml(s.phone || '—')}</td>`;
        tbody.appendChild(tr);
    });
}

function setupCatalogForms() {
    // --- Products ---
    const showProductBtn = document.getElementById('showAddProductForm');
    const productFormCard = document.getElementById('addProductFormCard');
    const cancelProduct = document.getElementById('cancelAddProduct');
    showProductBtn.addEventListener('click', () => productFormCard.style.display = 'block');
    cancelProduct.addEventListener('click', () => productFormCard.style.display = 'none');

    document.getElementById('catalogProductForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        const payload = {
            name: document.getElementById('cpName').value.trim(),
            category_id: document.getElementById('cpCategory').value || null,
            supplier_id: document.getElementById('cpSupplier').value || null,
            current_stock: parseFloat(document.getElementById('cpStock').value) || 0,
            min_stock: parseFloat(document.getElementById('cpMinStock').value) || 0,
            safety_stock: parseFloat(document.getElementById('cpSafetyStock').value) || 0,
            daily_consumption: parseFloat(document.getElementById('cpDailyCons').value) || 0,
            lead_time: parseFloat(document.getElementById('cpLeadTime').value) || 0,
            planned_rate: parseFloat(document.getElementById('cpPlannedRate').value) || 0,
            actual_rate: parseFloat(document.getElementById('cpActualRate').value) || 0
        };
        const data = await apiFetch('/api/products', { method: 'POST', body: JSON.stringify(payload) });
        if (data && data.success) {
            this.reset();
            productFormCard.style.display = 'none';
            await loadCatalogProducts();
        } else {
            alert(data ? data.message : 'Failed to create product.');
        }
    });

    // --- Categories ---
    const showCatBtn = document.getElementById('showAddCategoryForm');
    const catFormCard = document.getElementById('addCategoryFormCard');
    const cancelCat = document.getElementById('cancelAddCategory');
    showCatBtn.addEventListener('click', () => catFormCard.style.display = 'block');
    cancelCat.addEventListener('click', () => catFormCard.style.display = 'none');

    document.getElementById('catalogCategoryForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        const payload = {
            name: document.getElementById('ccName').value.trim(),
            description: document.getElementById('ccDesc').value.trim() || null
        };
        const data = await apiFetch('/api/categories', { method: 'POST', body: JSON.stringify(payload) });
        if (data && data.success) {
            this.reset();
            catFormCard.style.display = 'none';
            await loadCatalogCategories();
            await loadCatalogProducts(); // refresh product dropdowns too
        } else {
            alert(data ? data.message : 'Failed to create category.');
        }
    });

    // --- Suppliers ---
    const showSupBtn = document.getElementById('showAddSupplierForm');
    const supFormCard = document.getElementById('addSupplierFormCard');
    const cancelSup = document.getElementById('cancelAddSupplier');
    showSupBtn.addEventListener('click', () => supFormCard.style.display = 'block');
    cancelSup.addEventListener('click', () => supFormCard.style.display = 'none');

    document.getElementById('catalogSupplierForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        const payload = {
            name: document.getElementById('csName').value.trim(),
            contact_person: document.getElementById('csContact').value.trim() || null,
            email: document.getElementById('csEmail').value.trim() || null,
            phone: document.getElementById('csPhone').value.trim() || null,
            address: document.getElementById('csAddress').value.trim() || null
        };
        const data = await apiFetch('/api/suppliers', { method: 'POST', body: JSON.stringify(payload) });
        if (data && data.success) {
            this.reset();
            supFormCard.style.display = 'none';
            await loadCatalogSuppliers();
            await loadCatalogProducts(); // refresh product dropdowns too
        } else {
            alert(data ? data.message : 'Failed to create supplier.');
        }
    });
}
