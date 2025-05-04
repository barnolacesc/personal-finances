class NavBar extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        this.innerHTML = `
            <nav class="navbar navbar-expand-lg navbar-light bg-white shadow-sm">
                <div class="container">
                    <a class="navbar-brand" href="/">Personal Finance Tracker</a>
                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                        <span class="navbar-toggler-icon"></span>
                    </button>
                    <div class="collapse navbar-collapse" id="navbarNav">
                        <ul class="navbar-nav">
                            <li class="nav-item">
                                <a class="nav-link" href="/"><i class="bi bi-house me-1"></i>Home</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="#add"><i class="bi bi-plus-circle me-1"></i>Add</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link active" href="/expenses"><i class="bi bi-list-ul me-1"></i>Expenses</a>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>
        `;
    }
}

customElements.define('nav-bar', NavBar); 