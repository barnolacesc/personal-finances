class NavBar extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    render() {
        this.innerHTML = `
            <nav class="navbar navbar-expand-lg shadow-sm mb-3">
                <div class="container">
                    <a class="navbar-brand fw-semibold" href="/">Monthly Spends</a>
                    <button class="btn btn-outline-secondary" id="themeToggle" aria-label="Toggle dark mode">
                        <i class="bi bi-moon-fill"></i>
                    </button>
                </div>
            </nav>
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
    }
}

customElements.define('nav-bar', NavBar); 