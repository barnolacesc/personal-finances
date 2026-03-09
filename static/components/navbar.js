class NavBar extends HTMLElement {
    constructor() {
        super();
        this.currentPage = this.getCurrentPage();
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        this.checkTestEnvironment();
    }

    async checkTestEnvironment() {
        try {
            const response = await fetch('/api/env');
            const data = await response.json();
            if (data.is_test) {
                this.showTestBadge();
            }
            if (data.version) {
                this.showVersion(data.version);
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

    showVersion(version) {
        const brand = this.querySelector('.navbar-brand span');
        if (brand) {
            const ver = document.createElement('span');
            ver.style.cssText = 'font-size: 0.55rem; vertical-align: middle; opacity: 0.4; margin-left: 5px; font-family: monospace;';
            ver.textContent = version;
            brand.appendChild(ver);
        }
    }

    getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('add-expense')) return 'add-expense';
        if (path.includes('expenses')) return 'expenses';
        if (path.includes('recurring')) return 'recurring';
        if (path === '/bank') return 'bank';
        if (path === '/unclassified') return 'unclassified';
        return 'home';
    }

    render() {
        const page = this.currentPage;

        const tabs = [
            { id: 'home',        label: 'Home',      icon: 'house-fill',      href: '/' },
            { id: 'add-expense', label: 'Add',       icon: 'plus-circle-fill', href: '/static/add-expense.html' },
            { id: 'expenses',    label: 'Expenses',  icon: 'list-ul',         href: '/static/expenses.html' },
            { id: 'recurring',   label: 'Recurring', icon: 'arrow-repeat',    href: '/recurring' },
            { id: 'bank',        label: 'Bank',      icon: 'bank',            href: '/bank' },
        ];

        const tabsHtml = tabs.map(tab => {
            const isActive = tab.id === page || (tab.id === 'bank' && page === 'unclassified');
            return `
                <a href="${tab.href}" class="bottom-nav-item${isActive ? ' active' : ''}">
                    <i class="bi bi-${tab.icon}"></i>
                    <span>${tab.label}</span>
                </a>
            `;
        }).join('');

        this.innerHTML = `
            <nav class="top-nav">
                <div class="container top-nav-inner">
                    <a class="navbar-brand fw-bold d-flex align-items-center" href="/">
                        <div class="d-inline-flex align-items-center justify-content-center me-2" style="width: 32px; height: 32px; background: var(--primary-gradient); border-radius: 8px;">
                            <i class="bi bi-wallet2 text-white fs-6"></i>
                        </div>
                        <span>Finances</span>
                    </a>
                    <button class="btn btn-link text-muted p-2" id="themeToggle" aria-label="Toggle dark mode">
                        <i class="bi bi-moon-fill fs-5"></i>
                    </button>
                </div>
            </nav>
            <nav class="bottom-nav">
                ${tabsHtml}
            </nav>
        `;
    }

    setupEventListeners() {
        const themeToggle = this.querySelector('#themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-bs-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-bs-theme', newTheme);
                localStorage.setItem('theme', newTheme);
                this.updateThemeIcon(newTheme);
                if (window.categoryChart) {
                    window.categoryChart.update();
                }
            });
        }

        const currentTheme = document.documentElement.getAttribute('data-bs-theme') || 'light';
        this.updateThemeIcon(currentTheme);
    }

    updateThemeIcon(theme) {
        const icon = this.querySelector('#themeToggle i');
        if (icon) {
            icon.className = theme === 'dark' ? 'bi bi-sun-fill fs-5' : 'bi bi-moon-fill fs-5';
        }
    }
}

customElements.define('nav-bar', NavBar);
