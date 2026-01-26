class NavBar extends HTMLElement {
    constructor() {
        super();
        this.currentPage = this.getCurrentPage();
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        this.updateActiveState();
        this.checkTestEnvironment();
    }

    async checkTestEnvironment() {
        try {
            const response = await fetch('/api/env');
            const data = await response.json();
            if (data.is_test) {
                this.showTestBadge();
            }
        } catch (error) {
            // Silently ignore - not critical
        }
    }

    showTestBadge() {
        const brand = this.querySelector('.navbar-brand span');
        if (brand) {
            const badge = document.createElement('span');
            badge.className = 'badge bg-danger ms-2';
            badge.style.cssText = 'font-size: 0.6rem; vertical-align: middle;';
            badge.textContent = 'TEST';
            brand.appendChild(badge);
        }
    }

    getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('add-expense.html')) return 'add-expense';
        if (path.includes('expenses.html')) return 'expenses';
        return 'home';
    }

    render() {
        const actions = this.getContextualActions();

        const actionsHtml = actions.map(action => {
            // Mobile-friendly button styling
            const isPrimary = action.variant && action.variant.includes('primary');
            const btnClass = isPrimary ? 'btn-primary' : 'btn-link text-decoration-none text-muted';

            if (action.href) {
                return `
                    <a href="${action.href}" class="btn ${btnClass} d-flex align-items-center ms-2">
                        <i class="bi bi-${action.icon} ${isPrimary ? '' : 'fs-5'}"></i>
                        <span class="d-none d-md-inline ms-2">${action.label}</span>
                    </a>
                `;
            } else {
                return `
                    <button class="btn ${btnClass} d-flex align-items-center ms-2" data-action="${action.action}">
                        <i class="bi bi-${action.icon} ${isPrimary ? '' : 'fs-5'}"></i>
                        <span class="d-none d-md-inline ms-2">${action.label}</span>
                    </button>
                `;
            }
        }).join('');

        this.innerHTML = `
            <nav class="navbar navbar-expand top-nav">
                <div class="container">
                    <a class="navbar-brand fw-bold d-flex align-items-center" href="/static/index.html">
                        <div class="d-inline-flex align-items-center justify-content-center me-2" style="width: 32px; height: 32px; background: var(--primary-gradient); border-radius: 8px;">
                            <i class="bi bi-wallet2 text-white fs-6"></i>
                        </div>
                        <span>Finances</span>
                    </a>

                    <div class="d-flex align-items-center">
                        ${actionsHtml}
                        <button class="btn btn-link text-muted ms-2" id="themeToggle" aria-label="Toggle dark mode">
                            <i class="bi bi-moon-fill fs-5"></i>
                        </button>
                    </div>
                </div>
            </nav>
        `;
    }

    getContextualActions() {
        const page = this.currentPage;
        const actions = [];

        if (page === 'home') {
            // No specific actions for home, maybe just Add?
            // User liked the big buttons, so maybe keep nav clean or add a small "Add"
            // Let's add "Add" as a primary action for quick access
            actions.push({
                label: 'Add',
                icon: 'plus-lg',
                href: '/static/add-expense.html',
                variant: 'primary'
            });
        } else if (page === 'expenses') {
            actions.push({
                label: 'Export',
                icon: 'download',
                action: 'export',
                variant: 'secondary'
            });
            actions.push({
                label: 'Add',
                icon: 'plus-lg',
                href: '/static/add-expense.html',
                variant: 'primary'
            });
        } else if (page === 'add-expense') {
            actions.push({
                label: 'Expenses',
                icon: 'list-ul',
                href: '/static/expenses.html',
                variant: 'secondary'
            });
        }

        return actions;
    }

    setupEventListeners() {
        // Theme Toggle
        const themeToggle = this.querySelector('#themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-bs-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

                document.documentElement.setAttribute('data-bs-theme', newTheme);
                localStorage.setItem('theme', newTheme);
                this.updateThemeIcons(newTheme);

                // Update chart if it exists
                if (window.categoryChart) {
                    window.categoryChart.update();
                }
            });
        }

        // Initial Icon State
        const currentTheme = document.documentElement.getAttribute('data-bs-theme') || 'light';
        this.updateThemeIcons(currentTheme);

        // Contextual Actions
        const actionButtons = this.querySelectorAll('[data-action]');
        actionButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                if (action === 'export') {
                    this.showExportModal();
                }
            });
        });
    }

    updateThemeIcons(theme) {
        const icon = this.querySelector('#themeToggle i');
        if (icon) {
            icon.className = theme === 'dark' ? 'bi bi-sun-fill fs-5' : 'bi bi-moon-fill fs-5';
        }
    }

    updateActiveState() {
        // Handled in render for simplicity, but could be dynamic here
    }

    showExportModal() {
        // Reuse the existing export modal logic or create a new one
        // For now, we'll create a simple one compatible with the new UI
        const oldModal = document.getElementById('navbarExportModal');
        if (oldModal) oldModal.remove();

        const modal = document.createElement('div');
        modal.id = 'navbarExportModal';
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header border-0 pb-0">
                        <h5 class="modal-title fw-bold">Export Data</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body pt-4">
                        <div class="d-grid gap-3">
                            <button id="navbarDownloadBackupBtn" class="btn btn-light p-3 text-start d-flex align-items-center">
                                <i class="bi bi-phone fs-4 me-3 text-primary"></i>
                                <div>
                                    <div class="fw-bold">Save to Device</div>
                                    <div class="small text-muted">Download CSV file</div>
                                </div>
                            </button>
                            <button id="navbarBackupToServerBtn" class="btn btn-light p-3 text-start d-flex align-items-center">
                                <i class="bi bi-cloud-arrow-up fs-4 me-3 text-primary"></i>
                                <div>
                                    <div class="fw-bold">Backup to Server</div>
                                    <div class="small text-muted">Save to Pi storage</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#navbarBackupToServerBtn').addEventListener('click', () => {
            this.hideExportModal();
            this.handleBackup();
        });
        modal.querySelector('#navbarDownloadBackupBtn').addEventListener('click', () => {
            this.hideExportModal();
            this.downloadBackup();
        });

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
        if (!confirm('Create server backup?')) return;
        try {
            const res = await fetch('/api/backup', { method: 'POST' });
            const data = await res.json();
            this.showToast(data.success ? 'Backup created!' : 'Failed: ' + data.error, data.success ? 'success' : 'error');
        } catch (e) {
            this.showToast('Error: ' + e, 'error');
        }
    }

    async downloadBackup() {
        try {
            const res = await fetch('/api/backup/download');
            if (!res.ok) throw new Error('Failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'expenses_backup.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            this.showToast('Download started', 'success');
        } catch (e) {
            this.showToast('Download failed', 'error');
        }
    }

    showToast(message, type = 'success') {
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            alert(message);
        }
    }
}

customElements.define('nav-bar', NavBar);
