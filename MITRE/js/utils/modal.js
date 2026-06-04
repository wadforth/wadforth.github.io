export const Modal = (() => {
    const instances = new Map();
    let backdropEl = null;
    let openModals = [];

    function createBackdrop() {
        if (backdropEl) return backdropEl;
        backdropEl = document.createElement('div');
        backdropEl.className = 'modal-backdrop';
        backdropEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1040;opacity:0;transition:opacity 0.15s ease;';
        document.body.appendChild(backdropEl);
        requestAnimationFrame(() => { backdropEl.style.opacity = '1'; });
        return backdropEl;
    }

    function removeBackdrop() {
        if (!backdropEl) return;
        backdropEl.style.opacity = '0';
        const el = backdropEl;
        backdropEl = null;
        setTimeout(() => el.remove(), 150);
    }

    function lockBody() {
        document.body.style.overflow = 'hidden';
        document.body.style.paddingRight = window.innerWidth - document.documentElement.clientWidth + 'px';
    }

    function unlockBody() {
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }

    class ModalInstance {
        constructor(element) {
            this.element = typeof element === 'string' ? document.querySelector(element) : element;
            if (!this.element) return;
            this.isOpen = false;
            instances.set(this.element, this);
            this._onKeydown = (e) => {
                if (e.key === 'Escape' && this.isOpen && openModals[openModals.length - 1] === this) {
                    this.hide();
                }
            };
            this._onBackdropClick = (e) => {
                if (e.target === this.element && this.isOpen) {
                    this.hide();
                }
            };
        }

        show() {
            if (this.isOpen) return;
            this.isOpen = true;
            createBackdrop();
            lockBody();
            this.element.style.display = 'block';
            this.element.style.opacity = '0';
            this.element.style.transition = 'opacity 0.15s ease';
            this.element.setAttribute('aria-modal', 'true');
            this.element.setAttribute('role', 'dialog');
            this.element.classList.add('show');
            openModals.push(this);
            requestAnimationFrame(() => { this.element.style.opacity = '1'; });
            document.addEventListener('keydown', this._onKeydown);
            this.element.addEventListener('click', this._onBackdropClick);
            this.element.dispatchEvent(new CustomEvent('shown.bs.modal', { bubbles: true }));
        }

        hide() {
            if (!this.isOpen) return;
            this.isOpen = false;
            this.element.style.opacity = '0';
            openModals = openModals.filter(m => m !== this);
            setTimeout(() => {
                this.element.style.display = 'none';
                this.element.classList.remove('show');
                this.element.removeAttribute('aria-modal');
                this.element.removeAttribute('role');
                if (openModals.length === 0) {
                    removeBackdrop();
                    unlockBody();
                }
                document.removeEventListener('keydown', this._onKeydown);
                this.element.removeEventListener('click', this._onBackdropClick);
                this.element.dispatchEvent(new CustomEvent('hidden.bs.modal', { bubbles: true }));
            }, 150);
        }

        static getInstance(element) {
            const el = typeof element === 'string' ? document.querySelector(element) : element;
            return instances.get(el) || null;
        }

        static getOrCreateInstance(element) {
            const el = typeof element === 'string' ? document.querySelector(element) : element;
            return instances.get(el) || new ModalInstance(el);
        }
    }

    return ModalInstance;
})();

export const bootstrap = { Modal };

document.addEventListener('click', (e) => {
    const dismissBtn = e.target.closest('[data-dismiss="modal"], [data-bs-dismiss="modal"]');
    if (dismissBtn) {
        const modalEl = dismissBtn.closest('.modal');
        if (modalEl) {
            const instance = Modal.getInstance(modalEl);
            if (instance) instance.hide();
        }
    }

    const tabBtn = e.target.closest('[data-toggle="tab"], [data-bs-toggle="tab"]');
    if (tabBtn) {
        e.preventDefault();
        const target = tabBtn.getAttribute('data-target') || tabBtn.getAttribute('data-bs-target');
        const container = tabBtn.closest('.tech-tabs, .nav, [role="tablist"]');
        if (!container) return;
        container.querySelectorAll('[data-toggle="tab"], [data-bs-toggle="tab"]').forEach(t => t.classList.remove('active'));
        tabBtn.classList.add('active');
        const tabContent = tabBtn.closest('.tech-modal-body, .modal-body, .tech-tab-content')?.querySelector('.tab-content, .tech-tab-content');
        const parentContent = tabBtn.closest('.tech-modal-scroll, .modal-body')?.querySelector('.tab-content');
        const contentContainer = parentContent || tabContent;
        if (contentContainer) {
            contentContainer.querySelectorAll('.tab-pane').forEach(p => {
                p.classList.remove('show', 'active');
            });
            if (target) {
                const targetPane = contentContainer.querySelector(target);
                if (targetPane) {
                    targetPane.classList.add('show', 'active');
                }
            }
        }
    }
});

// Legacy Window Bindings
window.Modal = Modal;
window.bootstrap = bootstrap;
