class BackupButton extends HTMLElement {
    connectedCallback() {
        this.render();
        this.button = this.querySelector('button');
        this.button.addEventListener('click', () => this.showOptions());
        this.createModal();
    }

    render() {
        this.innerHTML = `
            <button class="btn btn-outline-secondary btn-sm" title="Backup all data to CSV">
                <i class="bi bi-download me-1"></i> Backup CSV
            </button>
        `;
    }

    createModal() {
        // Remove any existing modal
        const oldModal = document.getElementById('backupOptionsModal');
        if (oldModal) oldModal.remove();
        // Create modal HTML
        const modal = document.createElement('div');
        modal.id = 'backupOptionsModal';
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Backup Options</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <p>Choose how you want to backup your data:</p>
                        <div class="d-grid gap-2">
                            <button id="backupToServerBtn" class="btn btn-outline-primary">Backup to server</button>
                            <button id="downloadBackupBtn" class="btn btn-outline-success">Download to device</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        // Setup event listeners
        modal.querySelector('#backupToServerBtn').addEventListener('click', () => {
            this.hideModal();
            this.handleBackup();
        });
        modal.querySelector('#downloadBackupBtn').addEventListener('click', () => {
            this.hideModal();
            this.downloadBackup();
        });
    }

    showOptions() {
        // Show the modal using Bootstrap's modal API
        const modal = new bootstrap.Modal(document.getElementById('backupOptionsModal'));
        modal.show();
        this._modalInstance = modal;
    }

    hideModal() {
        if (this._modalInstance) {
            this._modalInstance.hide();
        }
    }

    async handleBackup() {
        if (!confirm('Are you sure you want to create a backup of all data to CSV?')) return;
        this.button.disabled = true;
        this.button.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Backing up...';
        try {
            const res = await fetch('/api/backup', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                window.showToast ? window.showToast('Backup created successfully!', 'success') : alert('Backup created successfully!');
            } else {
                window.showToast ? window.showToast('Backup failed: ' + (data.error || 'Unknown error'), 'error') : alert('Backup failed: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            window.showToast ? window.showToast('Backup failed: ' + e, 'error') : alert('Backup failed: ' + e);
        } finally {
            this.button.disabled = false;
            this.button.innerHTML = '<i class="bi bi-download me-1"></i> Backup CSV';
        }
    }

    async downloadBackup() {
        if (!confirm('Are you sure you want to download a backup of all data to CSV?')) return;
        this.button.disabled = true;
        this.button.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Downloading...';
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
            window.showToast ? window.showToast('Backup downloaded!', 'success') : alert('Backup downloaded!');
        } catch (e) {
            window.showToast ? window.showToast('Download failed: ' + e, 'error') : alert('Download failed: ' + e);
        } finally {
            this.button.disabled = false;
            this.button.innerHTML = '<i class="bi bi-download me-1"></i> Backup CSV';
        }
    }
}

customElements.define('backup-button', BackupButton); 