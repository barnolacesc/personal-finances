class NavBar extends HTMLElement {
    constructor() {
        super();
        this.currentPage = this.getCurrentPage();
    }

    connectedCallback() {
        this.render();
        this.checkTestEnvironment();
        this.setupApiModal();
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
        if (path === '/' || path.includes('add-expense') || path === '/add') return 'log';
        if (path.includes('expenses')) return 'browse';
        if (path.includes('trends')) return 'trends';
        if (path === '/recurring') return 'recurring';
        return 'log';
    }

    render() {
        const page = this.currentPage;

        const tabs = [
            { id: 'log',       label: 'Log',       icon: 'bolt',         href: '/' },
            { id: 'browse',    label: 'Browse',    icon: 'payments',     href: '/expenses' },
            { id: 'recurring', label: 'Recurring', icon: 'event_repeat', href: '/recurring' },
            { id: 'trends',    label: 'Trends',    icon: 'insights',     href: '/trends' },
        ];

        const tabsHtml = tabs.map(tab => {
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
                <div class="top-nav-inner d-flex align-items-center justify-content-between">
                    <a class="vault-brand d-flex align-items-center" href="/" style="text-decoration: none;">
                        <span class="font-headline" style="font-size: 1.25rem; font-weight: 800; color: var(--primary-container); letter-spacing: -0.03em; text-transform: uppercase;">Vault</span>
                    </a>
                    ${page !== 'log' ? `<button type="button" class="btn btn-sm d-flex align-items-center gap-1" id="navApiBtn"
                            style="background: var(--surface-container-high); border: 1px solid var(--outline-variant); color: var(--on-surface-variant); border-radius: 9999px; padding: 0.3rem 0.75rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;">
                        <span class="material-symbols-outlined" style="font-size: 1rem; color: var(--primary);">terminal</span>
                        <span>API</span>
                    </button>` : ''}
                </div>
            </nav>

            <nav class="bottom-nav">
                ${tabsHtml}
            </nav>

            <!-- API & Shortcuts Integration Modal -->
            ${page !== 'log' ? `<div id="navApiModal" class="inline-edit-backdrop">
                <div class="inline-edit-card" style="max-width: 520px;">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <div class="d-flex align-items-center gap-2">
                            <span class="material-symbols-outlined" style="color: var(--primary); font-size: 1.5rem;">integration_instructions</span>
                            <h5 class="mb-0 font-headline" style="color: var(--on-surface);">API & Shortcuts</h5>
                        </div>
                        <button type="button" id="closeNavApiModalBtn" style="background: transparent; border: none; color: var(--on-surface-variant); cursor: pointer; padding: 4px;">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <div class="mb-3">
                        <p class="text-muted mb-2" style="font-size: 0.8125rem;">
                            Log expenses instantly from <strong>iOS Shortcuts, Siri, curl, or AI assistants</strong> via the lightweight quick-add API.
                        </p>
                    </div>

                    <!-- Quick Add Endpoint -->
                    <div class="mb-3 p-3" style="background: var(--surface-container-lowest); border-radius: 0.75rem; border: 1px solid var(--outline-variant);">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span class="badge" style="background: var(--primary-container); color: var(--on-primary); font-size: 0.7rem; font-weight: 700;">POST</span>
                            <code style="color: var(--primary); font-size: 0.8125rem;">/api/expenses/quick</code>
                        </div>
                        <p class="mb-2 text-muted" style="font-size: 0.75rem;">Example curl command:</p>
                        <div class="position-relative">
                            <pre class="p-2 mb-0" style="background: var(--surface-container-high); border-radius: 0.5rem; font-size: 0.75rem; color: var(--on-surface); overflow-x: auto;">curl -X POST "${window.location.origin}/api/expenses/quick" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "14.50 lunch with team"}'</pre>
                        </div>
                    </div>

                    <!-- Apple Shortcuts Guide -->
                    <div class="mb-3 p-3" style="background: var(--surface-container-lowest); border-radius: 0.75rem; border: 1px solid var(--outline-variant);">
                        <h6 class="font-headline mb-1 d-flex align-items-center gap-1" style="font-size: 0.875rem;">
                            <span class="material-symbols-outlined" style="font-size: 1rem; color: #3b82f6;">phone_iphone</span>
                            Apple iOS Shortcut / Siri
                        </h6>
                        <ol class="mb-0 ps-3 text-muted" style="font-size: 0.75rem; line-height: 1.5;">
                            <li>Create a new iOS Shortcut named <strong>Log Expense</strong>.</li>
                            <li>Add action: <em>Ask for Input</em> ("Expense text").</li>
                            <li>Add action: <em>Get Contents of URL</em> with POST to <code>${window.location.origin}/api/expenses/quick</code>.</li>
                            <li>Now say: <em>"Hey Siri, Log Expense"</em> and speak your expense!</li>
                        </ol>
                    </div>

                    <div class="d-grid">
                        <button type="button" class="btn btn-secondary" id="dismissNavApiModalBtn" style="height: 42px; font-weight: 600;">
                            Done
                        </button>
                    </div>
                </div>
            </div>` : ''}
        `;
    }

    setupApiModal() {
        const openBtn = this.querySelector('#navApiBtn');
        const modal = this.querySelector('#navApiModal');
        const closeBtn = this.querySelector('#closeNavApiModalBtn');
        const dismissBtn = this.querySelector('#dismissNavApiModalBtn');

        const open = () => modal && modal.classList.add('show');
        const close = () => modal && modal.classList.remove('show');

        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (dismissBtn) dismissBtn.addEventListener('click', close);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) close();
            });
        }
    }
}

customElements.define('nav-bar', NavBar);
