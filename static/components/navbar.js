class NavBar extends HTMLElement {
    constructor() {
        super();
        this.currentPage = this.getCurrentPage();
    }

    connectedCallback() {
        this.render();
        this.checkTestEnvironment();
    }

    async checkTestEnvironment() {
        try {
            const response = await fetch('/api/env');
            const data = await response.json();
            if (data.is_test) {
                this.showTestBadge();
                if (data.version) {
                    this.showVersion(data.version);
                }
            }
        } catch (error) {
            // Silently ignore - not critical
        }
    }

    showTestBadge() {
        const brand = this.querySelector('.vault-brand');
        if (brand) {
            const badge = document.createElement('span');
            badge.className = 'badge bg-danger';
            badge.style.cssText = 'font-size: 0.5rem; vertical-align: middle; margin-left: 6px; padding: 0.2em 0.5em;';
            badge.textContent = 'TEST';
            brand.appendChild(badge);
        }
    }

    showVersion(version) {
        const brand = this.querySelector('.vault-brand');
        if (brand) {
            const ver = document.createElement('span');
            ver.style.cssText = 'font-size: 0.55rem; vertical-align: middle; opacity: 0.4; margin-left: 5px; font-family: monospace;';
            ver.textContent = version;
            brand.appendChild(ver);
        }
    }

    getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('add-expense')) return 'add';
        if (path.includes('expenses')) return 'expenses';
        if (path.includes('trends')) return 'trends';
        if (path.includes('reconcil')) return 'reconcile';
        // if (path === '/bank') return 'bank';
        if (path === '/recurring') return 'recurring';
        if (path === '/unclassified') return 'unclassified';
        return 'home';
    }

    render() {
        const page = this.currentPage;

        const tabs = [
            { id: 'home',         label: 'Home',         icon: 'home',     href: '/' },
            { id: 'expenses',     label: 'Expenses',     icon: 'payments', href: '/expenses' },
            { id: 'add',          label: 'Add',          icon: 'add',      href: '/add', isFab: true },
            { id: 'recurring', label: 'Recurring', icon: 'event_repeat', href: '/recurring' },
            { id: 'trends',       label: 'Trends',       icon: 'insights', href: '/trends' },
        ];

        const tabsHtml = tabs.map(tab => {
            if (tab.isFab) {
                return `
                    <a href="${tab.href}" class="fab-add">
                        <div class="fab-add-btn">
                            <span class="material-symbols-outlined">add</span>
                        </div>
                        <span class="fab-add-label">Add</span>
                    </a>
                `;
            }
            const isActive = tab.id === page;
            return `
                <a href="${tab.href}" class="bottom-nav-item${isActive ? ' active' : ''}">
                    <span class="material-symbols-outlined">${tab.icon}</span>
                    <span>${tab.label}</span>
                </a>
            `;
        }).join('');

        this.innerHTML = `
            <nav class="top-nav">
                <div class="top-nav-inner" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <a class="vault-brand d-flex align-items-center" href="/" style="text-decoration: none;">
                        <span class="font-headline" style="font-size: 1.25rem; font-weight: 800; color: var(--primary-container); letter-spacing: -0.03em; text-transform: uppercase;">Vault</span>
                    </a>
                    <a href="/reconcile" class="top-nav-reconcile-link ${page === 'reconcile' ? 'active' : ''}" style="text-decoration: none; font-size: 0.75rem; font-weight: 700; color: ${page === 'reconcile' ? 'var(--primary)' : 'var(--on-surface)'}; display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.3rem 0.6rem; border-radius: 9999px; background: ${page === 'reconcile' ? 'rgba(255, 140, 0, 0.2)' : 'var(--surface-container-high)'}; transition: all 0.2s;">
                        <span class="material-symbols-outlined" style="font-size: 0.875rem;">link</span>
                        <span>Reconcile</span>
                    </a>
                </div>
            </nav>
            <nav class="bottom-nav">
                ${tabsHtml}
            </nav>
        `;
    }
}

customElements.define('nav-bar', NavBar);
