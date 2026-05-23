function showToast(message, type = 'info') {
    const container = document.getElementById('app-toast');
    const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', info: 'bi-info-circle-fill' };
    const id = 'toast-' + Date.now();
    const html = `
        <div id="${id}" class="toast app-toast toast-${type} show" role="alert">
            <div class="toast-body">
                <i class="bi ${icons[type] || icons.info} toast-icon"></i>
                <span>${message}</span>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
    setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.remove();
    }, 3000);
}

function showPrompt(title, defaultValue = '') {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-prompt-modal');
        document.getElementById('custom-prompt-title').textContent = title;
        const input = document.getElementById('custom-prompt-input');
        input.value = defaultValue;

        let resolved = false;
        const resolveOnce = (val) => {
            if (resolved) return;
            resolved = true;
            resolve(val);
        };

        const onOk = () => { resolveOnce(input.value); };
        const onCancel = () => { resolveOnce(null); };

        const cleanup = () => {
            document.getElementById('custom-prompt-ok').removeEventListener('click', onOk);
            modal.removeEventListener('hidden.bs.modal', onCancel);
        };

        document.getElementById('custom-prompt-ok').addEventListener('click', onOk);
        modal.addEventListener('hidden.bs.modal', onCancel);

        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        setTimeout(() => input.focus(), 300);
    });
}

function showConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        document.getElementById('custom-confirm-title').textContent = title;
        document.getElementById('custom-confirm-message').textContent = message;

        let resolved = false;
        const resolveOnce = (val) => {
            if (resolved) return;
            resolved = true;
            resolve(val);
        };

        const onOk = () => { resolveOnce(true); };
        const onCancel = () => { resolveOnce(false); };

        const cleanup = () => {
            document.getElementById('custom-confirm-ok').removeEventListener('click', onOk);
            modal.removeEventListener('hidden.bs.modal', onCancel);
        };

        document.getElementById('custom-confirm-ok').addEventListener('click', onOk);
        modal.addEventListener('hidden.bs.modal', onCancel);

        new bootstrap.Modal(modal).show();
    });
}
