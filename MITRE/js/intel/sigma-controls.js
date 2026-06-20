function closeSigmaMultiSelects(except) {
    document.querySelectorAll('.sigma-multi-select.open').forEach(el => {
        if (el !== except) {
            el.classList.remove('open');
            el.querySelector('.sigma-multi-select-header')?.setAttribute('aria-expanded', 'false');
        }
    });
}

document.addEventListener('click', event => {
    const header = event.target.closest('.sigma-multi-select-header');
    if (header) {
        const parent = header.closest('.sigma-multi-select');
        const isOpen = parent.classList.contains('open');
        closeSigmaMultiSelects(parent);
        parent.classList.toggle('open', !isOpen);
        header.setAttribute('aria-expanded', String(!isOpen));
        event.stopPropagation();
        return;
    }

    if (event.target.closest('.sigma-multi-select-dropdown')) {
        event.stopPropagation();
        return;
    }

    closeSigmaMultiSelects();
});

document.addEventListener('keydown', event => {
    const header = event.target.closest('.sigma-multi-select-header');
    if (!header) return;
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        header.click();
    } else if (event.key === 'Escape') {
        closeSigmaMultiSelects();
        header.focus();
    }
});

window.closeSigmaMultiSelects = closeSigmaMultiSelects;
