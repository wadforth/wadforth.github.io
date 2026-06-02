document.getElementById('btn-set-company-logo').addEventListener('click', () => {
    if (!state.currentLayer) return;
    document.getElementById('file-logo').click();
});

document.getElementById('file-logo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
        state.companyLogo = ev.target.result;
        updateLayerToolbar();
        saveCurrentLayerNow();
        showToast('Logo updated', 'success');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
});

document.getElementById('btn-set-company-name').addEventListener('click', async () => {
    if (!state.currentLayer) return;
    const name = await showPrompt('Company Name', state.companyName || '');
    if (name !== null) {
        state.companyName = name.trim();
        updateLayerToolbar();
        saveCurrentLayerNow();
        showToast('Company name updated', 'success');
    }
});

document.getElementById('btn-set-author').addEventListener('click', async () => {
    if (!state.currentLayer) return;
    const author = await showPrompt('Report Author', state.author || '');
    if (author !== null) {
        state.author = author.trim();
        saveCurrentLayerNow();
        showToast('Author updated', 'success');
    }
});
