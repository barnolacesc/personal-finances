class BackupButton extends HTMLElement {
    connectedCallback() {
        this.render();
        this.button = this.querySelector('.backup-trigger');
        this.button.addEventListener('click', () => this.showOptions());
    }

    render() {
        this.innerHTML = `
            <style>
                .backup-trigger {
                    padding: 0.375rem 0.75rem;
                    border-radius: 0.5rem;
                    background: var(--surface-container-highest);
                    border: none;
                    color: var(--on-surface);
                    font-size: 0.75rem;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.375rem;
                    transition: background 0.15s;
                }
                .backup-trigger:hover {
                    background: rgba(255, 140, 0, 0.2);
                    color: var(--primary);
                }
                .backup-trigger .material-symbols-outlined {
                    font-size: 1rem;
                }
                .backup-trigger:disabled {
                    opacity: 0.5;
                    cursor: default;
                }
                .backup-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.6);
                    z-index: 1500;
                    display: none;
                    align-items: center;
                    justify-content: center;
                    padding: 1rem;
                }
                .backup-overlay.show {
                    display: flex;
                }
                .backup-modal {
                    background: var(--surface-container);
                    border-radius: 1rem;
                    max-width: 400px;
                    width: 100%;
                    border: 1px solid rgba(86, 67, 52, 0.15);
                    overflow: hidden;
                    animation: modalIn 0.2s ease-out;
                }
                @keyframes modalIn {
                    from { opacity: 0; transform: scale(0.95) translateY(8px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                .backup-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem 1.25rem;
                    border-bottom: 1px solid rgba(86, 67, 52, 0.1);
                }
                .backup-modal-header h5 {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-weight: 700;
                    color: var(--on-surface);
                    font-size: 0.9375rem;
                    margin: 0;
                }
                .backup-modal-close {
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
                }
                .backup-modal-close:hover {
                    background: rgba(255, 140, 0, 0.2);
                }
                .backup-modal-body {
                    padding: 1.25rem;
                }
                .backup-modal-body p {
                    color: var(--outline);
                    font-size: 0.8125rem;
                    margin-bottom: 1rem;
                }
                .backup-options {
                    display: flex;
                    flex-direction: column;
                    gap: 0.625rem;
                }
                .backup-option-btn {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.875rem 1rem;
                    border-radius: 0.75rem;
                    border: 1px solid rgba(86, 67, 52, 0.1);
                    background: var(--surface-container-low);
                    color: var(--on-surface);
                    cursor: pointer;
                    transition: all 0.15s;
                    text-align: left;
                    width: 100%;
                }
                .backup-option-btn:hover {
                    background: var(--surface-container-high);
                    border-color: var(--primary-container);
                }
                .backup-option-btn .material-symbols-outlined {
                    font-size: 1.5rem;
                    color: var(--primary);
                }
                .backup-option-text {
                    flex: 1;
                }
                .backup-option-text strong {
                    display: block;
                    font-size: 0.875rem;
                    margin-bottom: 0.125rem;
                }
                .backup-option-text small {
                    color: var(--outline);
                    font-size: 0.75rem;
                }
                .backup-hint {
                    text-align: center;
                    margin-top: 0.75rem;
                    font-size: 0.6875rem;
                    color: var(--outline);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.25rem;
                }
                .spinner-sm {
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(255,255,255,0.2);
                    border-top-color: currentColor;
                    border-radius: 50%;
                    animation: spin 0.6s linear infinite;
                    display: inline-block;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>

            <button class="backup-trigger" title="Export & backup your expense data">
                <span class="material-symbols-outlined">download</span>
                <span class="backup-label">Export</span>
            </button>
        `;
    }

    showOptions() {
        // Remove old overlay if exists
        const old = document.getElementById('backupOverlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'backupOverlay';
        overlay.className = 'backup-overlay show';
        overlay.innerHTML = `
            <div class="backup-modal">
                <div class="backup-modal-header">
                    <h5>
                        <span class="material-symbols-outlined" style="color: var(--primary);">download</span>
                        Export Your Data
                    </h5>
                    <button class="backup-modal-close" id="closeBackupModal">
                        <span class="material-symbols-outlined" style="font-size: 1rem;">close</span>
                    </button>
                </div>
                <div class="backup-modal-body">
                    <p>Choose how to export and backup your expense data:</p>
                    <div class="backup-options">
                        <button class="backup-option-btn" id="downloadBackupBtn">
                            <span class="material-symbols-outlined">save_alt</span>
                            <div class="backup-option-text">
                                <strong>Download to Device</strong>
                                <small>Save CSV file to your device</small>
                            </div>
                        </button>
                        <button class="backup-option-btn" id="backupToServerBtn">
                            <span class="material-symbols-outlined">cloud_upload</span>
                            <div class="backup-option-text">
                                <strong>Backup to Server</strong>
                                <small>Create server backup for later download</small>
                            </div>
                        </button>
                    </div>
                    <div class="backup-hint">
                        <span class="material-symbols-outlined" style="font-size: 0.75rem;">info</span>
                        Both options export all expense data to CSV format
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.hideModal();
        });
        overlay.querySelector('#closeBackupModal').addEventListener('click', () => this.hideModal());
        overlay.querySelector('#downloadBackupBtn').addEventListener('click', () => {
            this.hideModal();
            this.downloadBackup();
        });
        overlay.querySelector('#backupToServerBtn').addEventListener('click', () => {
            this.hideModal();
            this.handleBackup();
        });
    }

    hideModal() {
        const overlay = document.getElementById('backupOverlay');
        if (overlay) overlay.remove();
    }

    async handleBackup() {
        if (!confirm('Create a backup of all data to CSV on the server?')) return;
        this.setLoading(true);
        try {
            const res = await fetch('/api/backup', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                window.showToast('Backup created successfully!', 'success');
            } else {
                window.showToast('Backup failed: ' + (data.error || 'Unknown error'), 'error');
            }
        } catch (e) {
            window.showToast('Backup failed: ' + e, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async downloadBackup() {
        if (!confirm('Download a backup of all data to CSV?')) return;
        this.setLoading(true);
        try {
            const res = await fetch('/api/backup/download');
            if (!res.ok) throw new Error('Failed to download backup');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'expenses_backup.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            window.showToast('Backup downloaded!', 'success');
        } catch (e) {
            window.showToast('Download failed: ' + e, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        if (loading) {
            this.button.disabled = true;
            this.button.innerHTML = '<span class="spinner-sm"></span> Exporting…';
        } else {
            this.button.disabled = false;
            this.button.innerHTML = `
                <span class="material-symbols-outlined">download</span>
                <span class="backup-label">Export</span>
            `;
        }
    }
}

customElements.define('backup-button', BackupButton);
