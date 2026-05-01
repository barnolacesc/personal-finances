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
        // if (path === '/bank') return 'bank';
        if (path === '/recurring') return 'bank';
        if (path === '/unclassified') return 'unclassified';
        return 'home';
    }

    render() {
        const page = this.currentPage;

        const tabs = [
            { id: 'home',         label: 'Home',         icon: 'home',     href: '/' },
            { id: 'expenses',     label: 'Expenses',     icon: 'payments', href: '/expenses' },
            { id: 'add',          label: 'Add',          icon: 'add',      href: '/add', isFab: true },
            { id: 'unclassified', label: 'Unclassified', icon: 'category', href: '/unclassified' },
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
                <div class="top-nav-inner">
                    <a class="vault-brand d-flex align-items-center" href="/" style="text-decoration: none;">
                        <span class="font-headline" style="font-size: 1.25rem; font-weight: 800; color: var(--primary-container); letter-spacing: -0.03em; text-transform: uppercase;">Vault</span>
                    </a>
                    // <div class="d-flex align-items-center gap-2" id="syncStatus" style="color: var(--on-surface-variant); font-size: 0.625rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; opacity: 0.5;">
                    //     <span class="material-symbols-outlined" style="font-size: 1rem; font-variation-settings: 'wght' 700; color: var(--primary-container);">sync</span>
                    // </div>
                </div>
            </nav>
            <nav class="bottom-nav">
                ${tabsHtml}
            </nav>
        `;
    }
}

customElements.define('nav-bar', NavBar);
