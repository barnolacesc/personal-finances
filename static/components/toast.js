import { BaseComponent, EventManager } from './event-manager.js';
class ToastContainer extends BaseComponent {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                .toast-container {
                    position: fixed;
                    bottom: 6rem;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 2000;
                    pointer-events: none;
                    width: 90%;
                    max-width: 400px;
                }
                .toast {
                    background: #1F1F1F;
                    border-radius: 0.75rem;
                    padding: 1rem 1.25rem;
                    margin-bottom: 0.5rem;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                    animation: slideUp 0.3s ease-out;
                    pointer-events: auto;
                    display: flex;
                    align-items: center;
                    min-width: 250px;
                    color: #E2E2E2;
                    font-family: 'Inter', sans-serif;
                    font-size: 0.875rem;
                }
                .toast.success {
                    border-left: 4px solid #FF8C00;
                }
                .toast.error {
                    border-left: 4px solid #FFB4AB;
                }
                .toast .icon {
                    font-family: 'Material Symbols Outlined';
                    font-size: 1.25rem;
                    margin-right: 0.75rem;
                    font-variation-settings: 'FILL' 0, 'wght' 400;
                }
                @keyframes slideUp {
                    from {
                        transform: translateY(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
                @keyframes fadeOut {
                    from {
                        transform: translateY(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateY(100%);
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

        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.textContent = type === 'success' ? 'check_circle' : 'error';

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
