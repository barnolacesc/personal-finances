class NavBar extends HTMLElement {
    constructor() {
        super();
        this.currentPage = this.getCurrentPage();
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('add-expense.html')) return 'add-expense';
        if (path.includes('expenses.html')) return 'expenses';
        return 'home';
    }

    getContextualActions() {
        switch (this.currentPage) {
            case 'add-expense':
                return [
                    { icon: 'chart-bar', label: 'View Expenses', href: '/static/expenses.html', variant: 'outline-success' }
                ];
            case 'expenses':
                return [
                    { icon: 'plus-circle', label: 'Add Expense', href: '/static/add-expense.html', variant: 'outline-primary' },
                    { icon: 'download', label: 'Export', action: 'export', variant: 'outline-success' }
                ];
            default:
                return [];
        }
    }

    render() {
        const actions = this.getContextualActions();

        const actionsHtml = actions.map(action => {
            if (action.href) {
                return `
                    <a href="${action.href}" class="btn btn-${action.variant} d-flex align-items-center me-2">
                        <i class="bi bi-${action.icon} d-md-none"></i>
                        <span class="d-none d-md-inline">
                            <i class="bi bi-${action.icon} me-2"></i>${action.label}
                        </span>
                    </a>
                `;
            } else {
                return `
                    <button class="btn btn-${action.variant} d-flex align-items-center me-2" data-action="${action.action}">
                        <i class="bi bi-${action.icon} d-md-none"></i>
                        <span class="d-none d-md-inline">
                            <i class="bi bi-${action.icon} me-2"></i>${action.label}
                        </span>
                    </button>
                `;
            }
        }).join('');

        this.innerHTML = `
            <nav class="navbar navbar-expand-lg shadow-sm mb-3">
                <div class="container">
                    <a class="navbar-brand fw-semibold" href="/static/index.html">Personal Finances</a>
                    <div class="d-flex align-items-center">
                        ${actionsHtml}
                        <button class="btn btn-outline-secondary" id="themeToggle" aria-label="Toggle dark mode">
                            <i class="bi bi-moon-fill"></i>
                        </button>
                    </div>
                </div>
            </nav>
            <style>
                /* Mobile responsive button styling */
                @media (max-width: 767px) {
                    .navbar .btn {
                        padding: 0.5rem 0.75rem;
                        font-size: 1.1rem;
                        min-width: 44px;
                        min-height: 44px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .navbar .btn i {
                        font-size: 1.2rem;
                    }
                }

                /* Desktop styling */
                @media (min-width: 768px) {
                    .navbar .btn {
                        padding: 0.5rem 1rem;
                    }
                }
            </style>
        `;
    }

    setupEventListeners() {
        const themeToggle = this.querySelector('#themeToggle');
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-bs-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

            document.documentElement.setAttribute('data-bs-theme', newTheme);
            localStorage.setItem('theme', newTheme);

            // Update icon
            themeToggle.innerHTML = newTheme === 'dark'
                ? '<i class="bi bi-sun-fill"></i>'
                : '<i class="bi bi-moon-fill"></i>';

            // Update chart if it exists
            if (window.categoryChart) {
                window.categoryChart.update();
            }
        });

        // Set initial icon based on current theme
        const currentTheme = document.documentElement.getAttribute('data-bs-theme');
        themeToggle.innerHTML = currentTheme === 'dark'
            ? '<i class="bi bi-sun-fill"></i>'
            : '<i class="bi bi-moon-fill"></i>';

        // Handle contextual action buttons
        const actionButtons = this.querySelectorAll('[data-action]');
        actionButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleAction(action, e.currentTarget);
            });
        });
    }

    handleAction(action, button) {
        switch (action) {
            case 'export':
                this.handleExport(button);
                break;
            default:
                console.warn(`Unknown action: ${action}`);
        }
    }

    async handleExport(button) {
        // Create and show export modal similar to backup-button component
        this.showExportModal();
    }

    showExportModal() {
        // Remove any existing modal
        const oldModal = document.getElementById('navbarExportModal');
        if (oldModal) oldModal.remove();

        // Create modal HTML
        const modal = document.createElement('div');
        modal.id = 'navbarExportModal';
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-download me-2"></i>Export Your Data
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-3">Choose how you want to export and backup your expense data:</p>
                        <div class="d-grid gap-3">
                            <button id="navbarDownloadBackupBtn" class="btn btn-success btn-lg">
                                <i class="bi bi-download me-2"></i>
                                <div class="d-flex flex-column align-items-start">
                                    <span class="fw-bold">Download to Device</span>
                                    <small class="text-white-50">Save CSV file to your device</small>
                                </div>
                            </button>
                            <button id="navbarBackupToServerBtn" class="btn btn-outline-primary btn-lg">
                                <i class="bi bi-cloud-upload me-2"></i>
                                <div class="d-flex flex-column align-items-start">
                                    <span class="fw-bold">Backup to Server</span>
                                    <small class="text-muted">Create server backup for later download</small>
                                </div>
                            </button>
                        </div>
                        <div class="mt-3 text-center">
                            <small class="text-muted">
                                <i class="bi bi-info-circle me-1"></i>
                                Both options export all your expense data to CSV format
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Setup event listeners
        modal.querySelector('#navbarBackupToServerBtn').addEventListener('click', () => {
            this.hideExportModal();
            this.handleBackup();
        });
        modal.querySelector('#navbarDownloadBackupBtn').addEventListener('click', () => {
            this.hideExportModal();
            this.downloadBackup();
        });

        // Show the modal
        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();
        this._exportModalInstance = modalInstance;
    }

    hideExportModal() {
        if (this._exportModalInstance) {
            this._exportModalInstance.hide();
        }
    }

    async handleBackup() {
        if (!confirm('Are you sure you want to create a backup of all data to CSV?')) return;

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
        }
    }

    async downloadBackup() {
        if (!confirm('Are you sure you want to download a backup of all data to CSV?')) return;

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
        }
    }
}

customElements.define('nav-bar', NavBar);
