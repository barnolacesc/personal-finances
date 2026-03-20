import { BaseComponent } from './event-manager.js';
import { CONFIG, CurrencyHelper } from './config.js';

class BankStatus extends BaseComponent {
    connectedCallback() {
        this.render();
        this.loadStatus();
        this.loadLogs();
        this.loadMerchants();
    }

    render() {
        this.innerHTML = `
            <style>
                .bank-section {
                    background: var(--surface-container);
                    border-radius: 1rem;
                    padding: 1.25rem;
                    margin-bottom: 0.75rem;
                    border: 1px solid rgba(86, 67, 52, 0.1);
                }
                .bank-section-title {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 0.75rem;
                }
                .bank-section-title h6 {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-weight: 700;
                    color: var(--on-surface);
                    font-size: 0.875rem;
                    margin: 0;
                }
                .bank-section-title .material-symbols-outlined {
                    font-size: 1.125rem;
                    color: var(--primary);
                }
                .status-badge {
                    font-size: 0.6875rem;
                    padding: 0.25rem 0.625rem;
                    border-radius: 9999px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.02em;
                }
                .status-connected {
                    background: rgba(133, 207, 255, 0.15);
                    color: var(--tertiary);
                }
                .status-disconnected {
                    background: rgba(255, 180, 171, 0.15);
                    color: var(--error);
                }
                .status-loading {
                    background: var(--surface-container-highest);
                    color: var(--outline);
                }
                .status-details {
                    color: var(--outline);
                    font-size: 0.8125rem;
                    margin-bottom: 0.75rem;
                    line-height: 1.6;
                }
                .status-details strong {
                    color: var(--on-surface);
                }
                .bank-actions {
                    display: flex;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                }
                .bank-btn {
                    padding: 0.5rem 0.875rem;
                    border-radius: 0.5rem;
                    border: none;
                    font-size: 0.8125rem;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.375rem;
                    transition: all 0.15s;
                    text-decoration: none;
                }
                .bank-btn .material-symbols-outlined {
                    font-size: 1rem;
                }
                .btn-sync {
                    background: linear-gradient(135deg, var(--primary-container), var(--primary));
                    color: var(--on-primary);
                    box-shadow: 0 4px 12px rgba(255, 140, 0, 0.3);
                }
                .btn-sync:hover { opacity: 0.9; }
                .btn-sync:disabled { opacity: 0.5; cursor: default; box-shadow: none; }
                .btn-auth {
                    background: var(--surface-container-highest);
                    color: var(--on-surface);
                }
                .btn-auth:hover { background: rgba(255, 140, 0, 0.15); color: var(--primary); }
                .btn-unclassified {
                    background: var(--surface-container-highest);
                    color: var(--primary);
                }
                .btn-unclassified:hover { background: rgba(255, 140, 0, 0.15); }

                /* Merchant section */
                .merchant-form {
                    display: none;
                    margin-bottom: 0.75rem;
                }
                .merchant-form.show { display: block; }
                .merchant-form-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 0.5rem;
                    margin-bottom: 0.5rem;
                }
                @media (max-width: 480px) {
                    .merchant-form-grid { grid-template-columns: 1fr; }
                }
                .merchant-form-grid input,
                .merchant-form-grid select {
                    width: 100%;
                    padding: 0.5rem 0.625rem;
                    border: none;
                    border-bottom: 2px solid var(--outline-variant);
                    background: transparent;
                    color: var(--on-surface);
                    font-size: 0.8125rem;
                    font-family: 'Inter', sans-serif;
                    border-radius: 0;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .merchant-form-grid input:focus,
                .merchant-form-grid select:focus {
                    border-bottom-color: var(--primary);
                }
                .merchant-form-grid select option {
                    background: var(--surface-container);
                    color: var(--on-surface);
                }
                .merchant-form-actions {
                    display: flex;
                    gap: 0.5rem;
                }
                .merchant-form-actions button {
                    padding: 0.375rem 0.75rem;
                    border-radius: 0.5rem;
                    border: none;
                    font-size: 0.75rem;
                    font-weight: 600;
                    cursor: pointer;
                }
                .merchant-save-btn {
                    background: var(--primary-container);
                    color: var(--on-primary);
                }
                .merchant-cancel-btn {
                    background: var(--surface-container-highest);
                    color: var(--on-surface);
                }
                .add-merchant-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: var(--surface-container-highest);
                    border: none;
                    color: var(--on-surface);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.15s;
                }
                .add-merchant-btn:hover {
                    background: rgba(255, 140, 0, 0.2);
                    color: var(--primary);
                }
                .merchant-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0.5rem 0;
                    border-bottom: 1px solid rgba(86, 67, 52, 0.06);
                }
                .merchant-item:last-child { border-bottom: none; }
                .merchant-pattern {
                    font-weight: 600;
                    color: var(--on-surface);
                    font-size: 0.8125rem;
                }
                .merchant-arrow {
                    color: var(--outline);
                    margin: 0 0.375rem;
                    font-size: 0.75rem;
                }
                .merchant-cat {
                    color: var(--outline);
                    font-size: 0.8125rem;
                }
                .merchant-delete-btn {
                    background: none;
                    border: none;
                    color: var(--error);
                    cursor: pointer;
                    padding: 0.25rem;
                    border-radius: 0.25rem;
                    transition: background 0.15s;
                }
                .merchant-delete-btn:hover {
                    background: rgba(255, 180, 171, 0.1);
                }
                .merchant-empty {
                    color: var(--outline);
                    font-size: 0.8125rem;
                }

                /* Sync logs */
                .sync-timeline {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .sync-log-item {
                    display: flex;
                    align-items: flex-start;
                    gap: 0.75rem;
                    padding: 0.5rem 0;
                }
                .sync-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    margin-top: 0.25rem;
                    flex-shrink: 0;
                }
                .sync-dot-ok { background: var(--tertiary); }
                .sync-dot-error { background: var(--error); }
                .sync-log-content {
                    flex: 1;
                    min-width: 0;
                }
                .sync-log-time {
                    font-size: 0.75rem;
                    color: var(--outline);
                    margin-bottom: 0.125rem;
                }
                .sync-log-stats {
                    font-size: 0.8125rem;
                    color: var(--on-surface);
                }
                .sync-log-error {
                    font-size: 0.75rem;
                    color: var(--error);
                    margin-top: 0.125rem;
                }
                .sync-empty {
                    color: var(--outline);
                    font-size: 0.8125rem;
                }
                .spinner-sm {
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(255,255,255,0.2);
                    border-top-color: var(--on-primary);
                    border-radius: 50%;
                    animation: spin 0.6s linear infinite;
                    display: inline-block;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>

            <div>
                <!-- Connection status -->
                <div class="bank-section">
                    <div class="bank-section-title">
                        <h6>
                            <span class="material-symbols-outlined">account_balance</span>
                            Bank Connection
                        </h6>
                        <span id="connectionBadge" class="status-badge status-loading">Loading…</span>
                    </div>
                    <div id="statusDetails" class="status-details"></div>
                    <div class="bank-actions">
                        <button id="syncBtn" class="bank-btn btn-sync">
                            <span class="material-symbols-outlined">sync</span>Sync Now
                        </button>
                        <button id="authBtn" class="bank-btn btn-auth">
                            <span class="material-symbols-outlined">open_in_new</span>Authorize
                        </button>
                        <a href="/unclassified" class="bank-btn btn-unclassified">
                            <span class="material-symbols-outlined">category</span>Unclassified
                        </a>
                    </div>
                </div>

                <!-- Merchant mappings -->
                <div class="bank-section">
                    <div class="bank-section-title">
                        <h6>
                            <span class="material-symbols-outlined">store</span>
                            Merchant Mappings
                        </h6>
                        <button id="addMerchantBtn" class="add-merchant-btn">
                            <span class="material-symbols-outlined" style="font-size: 1.125rem;">add</span>
                        </button>
                    </div>
                    <div id="merchantForm" class="merchant-form">
                        <div class="merchant-form-grid">
                            <input id="merchantPattern" type="text" placeholder="Pattern (e.g. MERCADONA)">
                            <select id="merchantCategory">
                                <option value="">Category…</option>
                            </select>
                            <input id="merchantDescription" type="text" placeholder="Label">
                        </div>
                        <div class="merchant-form-actions">
                            <button id="saveMerchantBtn" class="merchant-save-btn">Save</button>
                            <button id="cancelMerchantBtn" class="merchant-cancel-btn">Cancel</button>
                        </div>
                    </div>
                    <div id="merchantList" class="merchant-empty">Loading…</div>
                </div>

                <!-- Sync logs -->
                <div class="bank-section">
                    <div class="bank-section-title">
                        <h6>
                            <span class="material-symbols-outlined">history</span>
                            Sync History
                        </h6>
                    </div>
                    <div id="syncLogs" class="sync-empty">Loading…</div>
                </div>
            </div>
        `;

        this._populateCategorySelect();
        this._setupListeners();
    }

    _populateCategorySelect() {
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
            this.querySelector('#merchantForm').classList.toggle('show');
        });
        this.querySelector('#cancelMerchantBtn').addEventListener('click', () => {
            this.querySelector('#merchantForm').classList.remove('show');
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
                badge.className = 'status-badge status-connected';
                badge.textContent = 'Connected';
                const expiresAt = data.expires_at ? new Date(data.expires_at).toLocaleString() : '—';
                const lastSync = data.last_sync_at ? new Date(data.last_sync_at).toLocaleString() : 'Never';
                details.innerHTML = `
                    <div>Token expires: <strong>${expiresAt}</strong></div>
                    <div>Last sync: <strong>${lastSync}</strong></div>
                `;
            } else {
                badge.className = 'status-badge status-disconnected';
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
                container.className = 'sync-empty';
                container.textContent = 'No sync history yet.';
                return;
            }
            container.className = 'sync-timeline';
            container.innerHTML = data.logs.map(log => `
                <div class="sync-log-item">
                    <div class="sync-dot ${log.status === 'ok' ? 'sync-dot-ok' : 'sync-dot-error'}"></div>
                    <div class="sync-log-content">
                        <div class="sync-log-time">${log.ran_at ? new Date(log.ran_at).toLocaleString() : '—'}</div>
                        <div class="sync-log-stats">
                            ${log.status === 'ok' ? `${log.expenses_added} added · ${log.unclassified} unclassified` : `Error`}
                        </div>
                        ${log.error_message ? `<div class="sync-log-error">${log.error_message}</div>` : ''}
                    </div>
                </div>
            `).join('');
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
                container.className = 'merchant-empty';
                container.textContent = 'No mappings yet. Add one to auto-classify transactions.';
                return;
            }
            container.className = '';
            container.innerHTML = data.mappings.map(m => `
                <div class="merchant-item">
                    <div>
                        <span class="merchant-pattern">${m.pattern}</span>
                        <span class="merchant-arrow">→</span>
                        <span class="merchant-cat">${m.category} (${m.description})</span>
                    </div>
                    <button class="merchant-delete-btn" data-delete-merchant="${m.id}" aria-label="Delete">
                        <span class="material-symbols-outlined" style="font-size: 1rem;">delete</span>
                    </button>
                </div>
            `).join('');
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
                window.showToast(data.error || 'Failed to get auth URL', 'error');
            }
        } catch (e) {
            window.showToast('Error: ' + e.message, 'error');
        }
    }

    async triggerSync() {
        const btn = this.querySelector('#syncBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-sm"></span> Syncing…';
        try {
            const res = await fetch('/api/bank/sync', { method: 'POST' });
            const data = await res.json();
            if (data.error) {
                window.showToast('Sync failed: ' + data.error, 'error');
            } else {
                const msg = `Sync complete: ${data.expenses_added ?? 0} added, ${data.unclassified ?? 0} unclassified`;
                window.showToast(msg, 'success');
                this.loadStatus();
                this.loadLogs();
            }
        } catch (e) {
            window.showToast('Sync error: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined">sync</span>Sync Now';
        }
    }

    async saveMerchant() {
        const pattern = this.querySelector('#merchantPattern').value.trim();
        const category = this.querySelector('#merchantCategory').value;
        const description = this.querySelector('#merchantDescription').value.trim();

        if (!pattern || !category || !description) {
            window.showToast('All fields are required', 'error');
            return;
        }

        try {
            const res = await fetch('/api/merchants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern, category, description }),
            });
            if (!res.ok) throw new Error(await res.text());
            this.querySelector('#merchantForm').classList.remove('show');
            this.querySelector('#merchantPattern').value = '';
            this.querySelector('#merchantCategory').value = '';
            this.querySelector('#merchantDescription').value = '';
            window.showToast('Mapping saved', 'success');
            this.loadMerchants();
        } catch (e) {
            window.showToast('Error: ' + e.message, 'error');
        }
    }

    async deleteMerchant(id) {
        try {
            await fetch(`/api/merchants/${id}`, { method: 'DELETE' });
            this.loadMerchants();
        } catch (e) {
            window.showToast('Delete failed', 'error');
        }
    }
}

customElements.define('bank-status', BankStatus);
