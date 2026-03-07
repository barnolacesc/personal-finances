import { BaseComponent } from './event-manager.js';
import { CurrencyHelper, DateHelper } from './config.js';

class BankStatus extends BaseComponent {
    connectedCallback() {
        this.render();
        this.loadStatus();
        this.loadLogs();
        this.loadMerchants();
    }

    render() {
        this.innerHTML = `
            <div>
                <!-- Connection status card -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center justify-content-between mb-3">
                            <h6 class="fw-bold mb-0">
                                <i class="bi bi-bank me-2"></i>Bank Connection
                            </h6>
                            <span id="connectionBadge" class="badge bg-secondary">Loading…</span>
                        </div>
                        <div id="statusDetails" class="text-muted small"></div>
                        <div class="mt-3 d-flex gap-2 flex-wrap">
                            <button id="authBtn" class="btn btn-sm btn-outline-primary">
                                <i class="bi bi-box-arrow-up-right me-1"></i>Authorize Bank
                            </button>
                            <button id="syncBtn" class="btn btn-sm btn-primary">
                                <i class="bi bi-arrow-clockwise me-1"></i>Sync Now
                            </button>
                            <a href="/unclassified" class="btn btn-sm btn-outline-warning">
                                <i class="bi bi-question-circle me-1"></i>Unclassified
                            </a>
                        </div>
                    </div>
                </div>

                <!-- Merchant mappings card -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center justify-content-between mb-3">
                            <h6 class="fw-bold mb-0">
                                <i class="bi bi-shop me-2"></i>Merchant Mappings
                            </h6>
                            <button id="addMerchantBtn" class="btn btn-sm btn-outline-primary">
                                <i class="bi bi-plus-lg"></i>
                            </button>
                        </div>
                        <!-- Add merchant form (hidden by default) -->
                        <div id="merchantForm" class="d-none mb-3">
                            <div class="row g-2">
                                <div class="col-12 col-sm-4">
                                    <input id="merchantPattern" type="text" class="form-control form-control-sm"
                                        placeholder="Pattern (e.g. MERCADONA)">
                                </div>
                                <div class="col-12 col-sm-4">
                                    <select id="merchantCategory" class="form-select form-select-sm">
                                        <option value="">Category…</option>
                                    </select>
                                </div>
                                <div class="col-12 col-sm-4">
                                    <input id="merchantDescription" type="text" class="form-control form-control-sm"
                                        placeholder="Label (e.g. Supermarket)">
                                </div>
                                <div class="col-12 d-flex gap-2">
                                    <button id="saveMerchantBtn" class="btn btn-sm btn-primary">Save</button>
                                    <button id="cancelMerchantBtn" class="btn btn-sm btn-outline-secondary">Cancel</button>
                                </div>
                            </div>
                        </div>
                        <div id="merchantList" class="small"></div>
                    </div>
                </div>

                <!-- Sync logs card -->
                <div class="card">
                    <div class="card-body">
                        <h6 class="fw-bold mb-3">
                            <i class="bi bi-clock-history me-2"></i>Sync History
                        </h6>
                        <div id="syncLogs" class="small text-muted">Loading…</div>
                    </div>
                </div>
            </div>
        `;

        this._populateCategorySelect();
        this._setupListeners();
    }

    _populateCategorySelect() {
        // Dynamically import config to get category list
        import('./config.js').then(({ CONFIG }) => {
            const sel = this.querySelector('#merchantCategory');
            if (!sel) return;
            Object.entries(CONFIG.CATEGORIES).forEach(([key, cat]) => {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = cat.label;
                sel.appendChild(opt);
            });
        });
    }

    _setupListeners() {
        this.querySelector('#authBtn').addEventListener('click', () => this.openAuthUrl());
        this.querySelector('#syncBtn').addEventListener('click', () => this.triggerSync());
        this.querySelector('#addMerchantBtn').addEventListener('click', () => {
            this.querySelector('#merchantForm').classList.toggle('d-none');
        });
        this.querySelector('#cancelMerchantBtn').addEventListener('click', () => {
            this.querySelector('#merchantForm').classList.add('d-none');
        });
        this.querySelector('#saveMerchantBtn').addEventListener('click', () => this.saveMerchant());
    }

    async loadStatus() {
        try {
            const res = await fetch('/api/bank/status');
            const data = await res.json();
            const badge = this.querySelector('#connectionBadge');
            const details = this.querySelector('#statusDetails');

            if (data.connected) {
                badge.className = 'badge bg-success';
                badge.textContent = 'Connected';
                const expiresAt = data.expires_at ? new Date(data.expires_at).toLocaleString() : '—';
                const lastSync = data.last_sync_at ? new Date(data.last_sync_at).toLocaleString() : 'Never';
                details.innerHTML = `
                    <div>Token expires: <strong>${expiresAt}</strong></div>
                    <div>Last sync: <strong>${lastSync}</strong></div>
                `;
            } else {
                badge.className = 'badge bg-danger';
                badge.textContent = 'Not connected';
                details.textContent = 'Authorize your bank account to start syncing.';
            }
        } catch (e) {
            console.error('loadStatus error', e);
        }
    }

    async loadLogs() {
        try {
            const res = await fetch('/api/bank/logs');
            const data = await res.json();
            const container = this.querySelector('#syncLogs');
            if (!data.logs || data.logs.length === 0) {
                container.textContent = 'No sync history yet.';
                return;
            }
            container.innerHTML = `
                <table class="table table-sm mb-0">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Status</th>
                            <th>Added</th>
                            <th>Unclassified</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.logs.map(log => `
                            <tr>
                                <td>${log.ran_at ? new Date(log.ran_at).toLocaleString() : '—'}</td>
                                <td>
                                    <span class="badge ${log.status === 'ok' ? 'bg-success' : 'bg-danger'}">
                                        ${log.status}
                                    </span>
                                </td>
                                <td>${log.expenses_added}</td>
                                <td>${log.unclassified}</td>
                            </tr>
                            ${log.error_message ? `
                            <tr>
                                <td colspan="4" class="text-danger small">${log.error_message}</td>
                            </tr>` : ''}
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            console.error('loadLogs error', e);
        }
    }

    async loadMerchants() {
        try {
            const res = await fetch('/api/merchants');
            const data = await res.json();
            const container = this.querySelector('#merchantList');
            if (!data.mappings || data.mappings.length === 0) {
                container.textContent = 'No mappings yet. Add one to auto-classify transactions.';
                return;
            }
            container.innerHTML = `
                <ul class="list-group list-group-flush">
                    ${data.mappings.map(m => `
                        <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                            <div>
                                <span class="fw-semibold">${m.pattern}</span>
                                <span class="text-muted ms-2">→ ${m.category}</span>
                                <span class="text-muted ms-1">(${m.description})</span>
                            </div>
                            <button class="btn btn-sm btn-link text-danger p-0"
                                data-delete-merchant="${m.id}" aria-label="Delete">
                                <i class="bi bi-trash"></i>
                            </button>
                        </li>
                    `).join('')}
                </ul>
            `;
            container.querySelectorAll('[data-delete-merchant]').forEach(btn => {
                btn.addEventListener('click', () => this.deleteMerchant(btn.dataset.deleteMerchant));
            });
        } catch (e) {
            console.error('loadMerchants error', e);
        }
    }

    async openAuthUrl() {
        try {
            const res = await fetch('/api/bank/auth-url');
            const data = await res.json();
            if (data.url) {
                window.open(data.url, '_blank');
            } else {
                window.showToast && window.showToast(data.error || 'Failed to get auth URL', 'error');
            }
        } catch (e) {
            window.showToast && window.showToast('Error: ' + e.message, 'error');
        }
    }

    async triggerSync() {
        const btn = this.querySelector('#syncBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Syncing…';
        try {
            const res = await fetch('/api/bank/sync', { method: 'POST' });
            const data = await res.json();
            if (data.error) {
                window.showToast && window.showToast('Sync failed: ' + data.error, 'error');
            } else {
                const msg = `Sync complete: ${data.expenses_added ?? 0} added, ${data.unclassified ?? 0} unclassified`;
                window.showToast && window.showToast(msg, 'success');
                this.loadStatus();
                this.loadLogs();
            }
        } catch (e) {
            window.showToast && window.showToast('Sync error: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i>Sync Now';
        }
    }

    async saveMerchant() {
        const pattern = this.querySelector('#merchantPattern').value.trim();
        const category = this.querySelector('#merchantCategory').value;
        const description = this.querySelector('#merchantDescription').value.trim();

        if (!pattern || !category || !description) {
            window.showToast && window.showToast('All fields are required', 'error');
            return;
        }

        try {
            const res = await fetch('/api/merchants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern, category, description }),
            });
            if (!res.ok) throw new Error(await res.text());
            this.querySelector('#merchantForm').classList.add('d-none');
            this.querySelector('#merchantPattern').value = '';
            this.querySelector('#merchantCategory').value = '';
            this.querySelector('#merchantDescription').value = '';
            window.showToast && window.showToast('Mapping saved', 'success');
            this.loadMerchants();
        } catch (e) {
            window.showToast && window.showToast('Error: ' + e.message, 'error');
        }
    }

    async deleteMerchant(id) {
        try {
            await fetch(`/api/merchants/${id}`, { method: 'DELETE' });
            this.loadMerchants();
        } catch (e) {
            window.showToast && window.showToast('Delete failed', 'error');
        }
    }
}

customElements.define('bank-status', BankStatus);
