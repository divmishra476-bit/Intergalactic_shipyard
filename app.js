/**
 * app.js
 * ------
 * Main application controller for the Hostile Data Dashboard.
 * Fetches data, renders ship cards, handles filtering/sorting/search,
 * and manages UI state (grid/list, modal, error/loading/empty).
 */

(function () {
    'use strict';

    // ============================================================
    //  CONFIG
    // ============================================================

    const API_URL = '/api/ships'; // Proxied through server.js to bypass CORS
    const DEBOUNCE_MS = 250;

    // ============================================================
    //  STATE
    // ============================================================

    let allShips = [];          // Full normalized array
    let filteredShips = [];     // Currently displayed (after filter/sort/search)
    let currentView = 'grid';   // 'grid' | 'list'
    let alertsOnly = false;

    // ============================================================
    //  DOM REFERENCES
    // ============================================================

    const dom = {
        shipGrid:       document.getElementById('ship-grid'),
        loadingState:   document.getElementById('loading-state'),
        errorState:     document.getElementById('error-state'),
        emptyState:     document.getElementById('empty-state'),
        analyticsPanel: document.getElementById('analytics-panel'),
        errorMessage:   document.getElementById('error-message'),
        retryBtn:       document.getElementById('retry-btn'),
        searchInput:    document.getElementById('search-input'),
        totalCount:     document.getElementById('total-count'),
        alertCount:     document.getElementById('alert-count'),
        filterClass:    document.getElementById('filter-class'),
        filterStatus:   document.getElementById('filter-status'),
        filterCore:     document.getElementById('filter-core'),
        filterAlertsBtn:document.getElementById('filter-alerts-btn'),
        sortSelect:     document.getElementById('sort-select'),
        viewGridBtn:    document.getElementById('view-grid-btn'),
        viewListBtn:    document.getElementById('view-list-btn'),
        modal:          document.getElementById('ship-modal'),
        modalBody:      document.getElementById('modal-body'),
        modalCloseBtn:  document.getElementById('modal-close-btn'),
    };

    // ============================================================
    //  INITIALIZATION
    // ============================================================

    async function init() {
        bindEvents();
        await fetchAndRender();
    }

    function bindEvents() {
        dom.retryBtn.addEventListener('click', fetchAndRender);
        dom.searchInput.addEventListener('input', debounce(applyFilters, DEBOUNCE_MS));
        dom.filterClass.addEventListener('change', applyFilters);
        dom.filterStatus.addEventListener('change', applyFilters);
        dom.filterCore.addEventListener('change', applyFilters);
        dom.sortSelect.addEventListener('change', applyFilters);

        dom.filterAlertsBtn.addEventListener('click', () => {
            alertsOnly = !alertsOnly;
            dom.filterAlertsBtn.setAttribute('aria-pressed', String(alertsOnly));
            applyFilters();
        });

        dom.viewGridBtn.addEventListener('click', () => setView('grid'));
        dom.viewListBtn.addEventListener('click', () => setView('list'));

        dom.modalCloseBtn.addEventListener('click', closeModal);
        dom.modal.addEventListener('click', (e) => {
            if (e.target === dom.modal) closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });
    }

    // ============================================================
    //  DATA FETCHING
    // ============================================================

    async function fetchAndRender() {
        showState('loading');

        try {
            const response = await fetch(API_URL);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const rawData = await response.json();
            allShips = window.DataNormalizer.normalizeShipData(rawData);

            if (allShips.length === 0) {
                showState('empty');
                return;
            }

            populateFilterDropdowns();
            updateStats();
            applyFilters();
            showState('grid');

        } catch (err) {
            console.error('[App] Fetch failed:', err);
            dom.errorMessage.textContent = err.message || 'Unable to reach the shipyard API.';
            showState('error');
        }
    }

    // ============================================================
    //  STATE MANAGEMENT
    // ============================================================

    function showState(state) {
        dom.loadingState.classList.toggle('hidden', state !== 'loading');
        dom.errorState.classList.toggle('hidden', state !== 'error');
        dom.emptyState.classList.toggle('hidden', state !== 'empty');
        dom.shipGrid.classList.toggle('hidden', state !== 'grid');
        if (dom.analyticsPanel) dom.analyticsPanel.classList.toggle('hidden', state !== 'grid');
    }

    function setView(view) {
        currentView = view;
        dom.viewGridBtn.classList.toggle('active', view === 'grid');
        dom.viewListBtn.classList.toggle('active', view === 'list');
        dom.shipGrid.classList.toggle('list-view', view === 'list');
    }

    // ============================================================
    //  FILTER DROPDOWN POPULATION
    // ============================================================

    function populateFilterDropdowns() {
        const classes = new Set();
        const statuses = new Set();
        const cores = new Set();

        allShips.forEach(ship => {
            if (ship.shipClass && ship.shipClass !== 'Unclassified') classes.add(ship.shipClass);
            if (ship.status && ship.status !== 'Unknown') statuses.add(ship.status);
            if (ship.coreType) cores.add(ship.coreTypeFormatted);
        });

        populateSelect(dom.filterClass, [...classes].sort(), 'All Classes');
        populateSelect(dom.filterStatus, [...statuses].sort(), 'All Statuses');
        populateSelect(dom.filterCore, [...cores].sort(), 'All Cores');
    }

    function populateSelect(selectEl, options, defaultLabel) {
        selectEl.innerHTML = `<option value="all">${defaultLabel}</option>`;
        options.forEach(opt => {
            const optEl = document.createElement('option');
            optEl.value = opt;
            optEl.textContent = opt;
            selectEl.appendChild(optEl);
        });
    }

    // ============================================================
    //  FILTERING, SORTING, SEARCHING
    // ============================================================

    function applyFilters() {
        const searchTerm = dom.searchInput.value.trim().toLowerCase();
        const classFilter = dom.filterClass.value;
        const statusFilter = dom.filterStatus.value;
        const coreFilter = dom.filterCore.value;
        const sortKey = dom.sortSelect.value;

        // Filter
        filteredShips = allShips.filter(ship => {
            // Alerts-only toggle
            if (alertsOnly && !ship.isCriticalAlert) return false;

            // Search
            if (searchTerm) {
                const haystack = [
                    ship.name,
                    ship.shipClass,
                    ship.status,
                    ship.coreTypeFormatted,
                    ship.priceFormatted,
                ].join(' ').toLowerCase();
                if (!haystack.includes(searchTerm)) return false;
            }

            // Class filter
            if (classFilter !== 'all' && ship.shipClass !== classFilter) return false;

            // Status filter
            if (statusFilter !== 'all' && ship.status !== statusFilter) return false;

            // Core filter
            if (coreFilter !== 'all' && ship.coreTypeFormatted !== coreFilter) return false;

            return true;
        });

        // Sort
        filteredShips.sort((a, b) => {
            switch (sortKey) {
                case 'name-asc':
                    return a.name.localeCompare(b.name);
                case 'name-desc':
                    return b.name.localeCompare(a.name);
                case 'price-asc':
                    return (a.price ?? Infinity) - (b.price ?? Infinity);
                case 'price-desc':
                    return (b.price ?? -Infinity) - (a.price ?? -Infinity);
                case 'capacity-asc':
                    return (a.capacity ?? Infinity) - (b.capacity ?? Infinity);
                case 'capacity-desc':
                    return (b.capacity ?? -Infinity) - (a.capacity ?? -Infinity);
                default:
                    return 0;
            }
        });

        renderShips();
        updateCharts();

        // Show empty state if no results
        if (filteredShips.length === 0 && allShips.length > 0) {
            showState('empty');
        } else if (filteredShips.length > 0) {
            showState('grid');
        }
    }

    // ============================================================
    //  STATS & CHARTS
    // ============================================================

    function updateStats() {
        dom.totalCount.textContent = allShips.length;
        const alertShips = allShips.filter(s => s.isCriticalAlert);
        dom.alertCount.textContent = alertShips.length;
    }

    let charts = {};

    function updateCharts() {
        if (!window.Chart) return;

        Chart.defaults.color = '#8b92a8';
        Chart.defaults.font.family = "'Outfit', sans-serif";

        const statusCounts = {};
        const coreCounts = {};
        const classCounts = {};

        filteredShips.forEach(s => {
            statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
            coreCounts[s.coreTypeFormatted] = (coreCounts[s.coreTypeFormatted] || 0) + 1;
            classCounts[s.shipClass] = (classCounts[s.shipClass] || 0) + 1;
        });

        const getChartData = (counts) => {
            const labels = Object.keys(counts).sort((a,b) => counts[b] - counts[a]).slice(0, 5);
            const data = labels.map(l => counts[l]);
            return { labels, data };
        };

        const statusData = getChartData(statusCounts);
        const coreData = getChartData(coreCounts);
        const classData = getChartData(classCounts);

        if (charts.status) charts.status.destroy();
        charts.status = new Chart(document.getElementById('statusChart'), {
            type: 'doughnut',
            data: {
                labels: statusData.labels,
                datasets: [{
                    data: statusData.data,
                    backgroundColor: ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#7b2ff7'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });

        if (charts.core) charts.core.destroy();
        charts.core = new Chart(document.getElementById('coreChart'), {
            type: 'bar',
            data: {
                labels: coreData.labels,
                datasets: [{
                    label: 'Ships',
                    data: coreData.data,
                    backgroundColor: '#00d4ff',
                    borderRadius: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });

        if (charts.class) charts.class.destroy();
        charts.class = new Chart(document.getElementById('classChart'), {
            type: 'pie',
            data: {
                labels: classData.labels,
                datasets: [{
                    data: classData.data,
                    backgroundColor: ['#7b2ff7', '#00d4ff', '#f59e0b', '#ef4444', '#22c55e'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });
    }

    // ============================================================
    //  RENDERING
    // ============================================================

    function renderShips() {
        dom.shipGrid.innerHTML = '';

        const fragment = document.createDocumentFragment();

        filteredShips.forEach((ship, idx) => {
            const card = createShipCard(ship, idx);
            fragment.appendChild(card);
        });

        dom.shipGrid.appendChild(fragment);
    }

    function createShipCard(ship, index) {
        const card = document.createElement('article');
        card.className = `ship-card${ship.isCriticalAlert ? ' ship-card--alert' : ''}`;
        card.id = ship.id;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `View details for ${ship.name}`);
        card.style.animationDelay = `${Math.min(index * 0.03, 0.5)}s`;

        // Status CSS class
        const statusClass = getStatusClass(ship.status);

        card.innerHTML = `
            ${ship.isCriticalAlert ? `
                <div class="alert-badge">
                    <span class="alert-badge-dot"></span>
                    Critical
                </div>
            ` : ''}
            <div class="card-header">
                <div>
                    <div class="card-name">${escapeHtml(ship.name)}</div>
                </div>
                <span class="card-class">${escapeHtml(ship.shipClass)}</span>
            </div>
            <div class="card-stats">
                <div class="card-stat">
                    <span class="card-stat-label">Price</span>
                    <span class="card-stat-value card-stat-value--highlight">${escapeHtml(ship.priceFormatted)}</span>
                </div>
                <div class="card-stat">
                    <span class="card-stat-label">Capacity</span>
                    <span class="card-stat-value">${escapeHtml(ship.capacityFormatted)}</span>
                </div>
                <div class="card-stat">
                    <span class="card-stat-label">Built</span>
                    <span class="card-stat-value">${escapeHtml(ship.manufactureDate)}</span>
                </div>
                <div class="card-stat">
                    <span class="card-stat-label">Core</span>
                    <span class="card-stat-value">${ship.coreType
                        ? `<span class="core-chip core-chip--${ship.coreType}">${escapeHtml(ship.coreTypeFormatted)}</span>`
                        : '<span class="core-chip">Unknown</span>'
                    }</span>
                </div>
            </div>
            <div class="card-footer">
                <span class="status-badge status-badge--${statusClass}">
                    <span class="status-dot"></span>
                    ${escapeHtml(ship.status)}
                </span>
                <span class="data-quality data-quality--${ship.dataQuality}" title="Data quality: ${ship.fieldsPresent}/7 fields parsed">
                    ${ship.dataQuality === 'clean' ? '●●●' : ship.dataQuality === 'partial' ? '●●○' : '●○○'}
                    ${ship.dataQuality}
                </span>
            </div>
        `;

        card.addEventListener('click', () => openModal(ship));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openModal(ship);
            }
        });

        return card;
    }

    function getStatusClass(status) {
        if (!status) return 'default';
        const lower = status.toLowerCase();

        const mapping = {
            operational: 'operational',
            active: 'active',
            ready: 'ready',
            working: 'working',
            new: 'new',
            pristine: 'new',
            automated: 'active',
            exploring: 'active',
            'en route': 'active',
            idle: 'active',
            experimental: 'active',
            restored: 'active',

            damaged: 'damaged',
            scrap: 'scrap',
            destroyed: 'destroyed',
            critical: 'critical',
            infected: 'infected',
            crashed: 'crashed',
            hellish: 'hellish',
            fragmented: 'destroyed',
            'piece of junk': 'scrap',

            maintenance: 'maintenance',
            refurbished: 'refurbished',
            aging: 'aging',
            decommissioned: 'decommissioned',
            classic: 'classic',
            storage: 'maintenance',
            'battle-worn': 'aging',
            parked: 'maintenance',
            pregnant: 'maintenance',

            missing: 'missing',
            classified: 'classified',
            unknown: 'unknown',
            improbable: 'improbable',
            'lost in space': 'missing',
            'in combat': 'active',
        };

        return mapping[lower] || 'default';
    }

    // ============================================================
    //  MODAL
    // ============================================================

    function openModal(ship) {
        const rawJson = ship.rawData ? JSON.stringify(ship.rawData, null, 2) : 'No raw data available';

        dom.modalBody.innerHTML = `
            ${ship.isCriticalAlert ? `
                <div class="modal-alert-banner">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    CRITICAL ALERT — Plasma Core · High Capacity Vessel
                </div>
            ` : ''}
            <h2 class="modal-ship-name" id="modal-ship-name">${escapeHtml(ship.name)}</h2>
            <p class="modal-ship-class">${escapeHtml(ship.shipClass)}</p>

            <div class="modal-section">
                <h3 class="modal-section-title">Vessel Information</h3>
                <div class="modal-detail-grid">
                    <div class="modal-detail-item">
                        <span class="modal-detail-label">Price</span>
                        <span class="modal-detail-value">${escapeHtml(ship.priceFormatted)}</span>
                    </div>
                    <div class="modal-detail-item">
                        <span class="modal-detail-label">Capacity</span>
                        <span class="modal-detail-value">${escapeHtml(ship.capacityFormatted)}</span>
                    </div>
                    <div class="modal-detail-item">
                        <span class="modal-detail-label">Build Date</span>
                        <span class="modal-detail-value">${escapeHtml(ship.manufactureDate)}</span>
                    </div>
                    <div class="modal-detail-item">
                        <span class="modal-detail-label">Status</span>
                        <span class="modal-detail-value">${escapeHtml(ship.status)}</span>
                    </div>
                    <div class="modal-detail-item">
                        <span class="modal-detail-label">Core Type</span>
                        <span class="modal-detail-value">${escapeHtml(ship.coreTypeFormatted)}</span>
                    </div>
                    <div class="modal-detail-item">
                        <span class="modal-detail-label">Data Quality</span>
                        <span class="modal-detail-value">${ship.fieldsPresent}/7 fields · ${ship.dataQuality}</span>
                    </div>
                </div>
            </div>

            <div class="modal-section">
                <h3 class="modal-section-title">Raw API Data</h3>
                <pre style="
                    font-family: var(--font-mono);
                    font-size: 0.75rem;
                    background: rgba(0,0,0,0.3);
                    border: 1px solid var(--border-subtle);
                    border-radius: var(--radius-sm);
                    padding: 1rem;
                    overflow-x: auto;
                    color: var(--text-secondary);
                    line-height: 1.5;
                    max-height: 300px;
                    overflow-y: auto;
                ">${escapeHtml(rawJson)}</pre>
            </div>
        `;

        dom.modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        dom.modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    // ============================================================
    //  UTILITIES
    // ============================================================

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const text = String(str);
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function debounce(fn, ms) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    // ============================================================
    //  AMBIENT PARTICLES (subtle background effect)
    // ============================================================

    function initParticles() {
        const canvas = document.getElementById('particle-canvas');
        if (!canvas) return;

        // Create floating dots using CSS only (no canvas/WebGL overhead)
        const count = 35;
        for (let i = 0; i < count; i++) {
            const dot = document.createElement('div');
            const size = Math.random() * 3 + 1;
            const x = Math.random() * 100;
            const y = Math.random() * 100;
            const duration = Math.random() * 40 + 30;
            const delay = Math.random() * -40;
            const opacity = Math.random() * 0.3 + 0.05;

            dot.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                background: ${Math.random() > 0.5 ? 'rgba(0,212,255,' : 'rgba(123,47,247,'}${opacity});
                border-radius: 50%;
                left: ${x}%;
                top: ${y}%;
                animation: particle-drift ${duration}s linear ${delay}s infinite;
                pointer-events: none;
            `;
            canvas.appendChild(dot);
        }

        // Add the keyframes dynamically
        const style = document.createElement('style');
        style.textContent = `
            @keyframes particle-drift {
                0% { transform: translate(0, 0) scale(1); opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { transform: translate(${Math.random() > 0.5 ? '' : '-'}${Math.random() * 200 + 50}px, -${Math.random() * 300 + 100}px) scale(0.5); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    //  BOOT
    // ============================================================

    initParticles();
    init();

})();
