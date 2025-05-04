class ToastContainer extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                .toast-container {
                    position: fixed;
                    bottom: 1rem;
                    right: 1rem;
                    z-index: 1050;
                    pointer-events: none;
                }
                .toast {
                    background: white;
                    border-radius: 4px;
                    padding: 1rem 1.5rem;
                    margin-bottom: 0.5rem;
                    box-shadow: 0 0.25rem 0.75rem rgba(0, 0, 0, 0.1);
                    animation: slideIn 0.3s ease-out;
                    pointer-events: auto;
                    display: flex;
                    align-items: center;
                    min-width: 250px;
                }
                .toast.success {
                    border-left: 4px solid #10b981;
                    color: #065f46;
                }
                .toast.error {
                    border-left: 4px solid #ef4444;
                    color: #991b1b;
                }
                .toast i {
                    font-size: 1.25rem;
                    margin-right: 0.75rem;
                }
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes fadeOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            </style>
            <div class="toast-container"></div>
        `;
    }

    showToast(message, type = 'success') {
        const container = this.shadowRoot.querySelector('.toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = document.createElement('i');
        icon.className = `bi bi-${type === 'success' ? 'check-circle' : 'exclamation-circle'}`;
        
        const text = document.createElement('span');
        text.textContent = message;
        
        toast.appendChild(icon);
        toast.appendChild(text);
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease-out forwards';
            setTimeout(() => {
                container.removeChild(toast);
            }, 300);
        }, 3000);
    }
}

customElements.define('toast-container', ToastContainer);

// Global toast function
window.showToast = function(message, type = 'success') {
    const toastContainer = document.querySelector('toast-container');
    if (toastContainer) {
        toastContainer.showToast(message, type);
    }
}; 