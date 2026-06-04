export function renderList(containerId, items) {
    const container = document.getElementById(containerId);
    const sorted = [...items].sort((a, b) => {
        const idA = a.external_references?.[0]?.external_id || '';
        const idB = b.external_references?.[0]?.external_id || '';
        return idA.localeCompare(idB, undefined, { numeric: true });
    });

    container.innerHTML = sorted.map(item => {
        const id = item.external_references?.[0]?.external_id || '';
        const desc = item.description || '';
        const extraBadges = item.type === 'tool' ? '<span class="badge badge-type me-1">Tool</span>' :
                           item.type === 'malware' ? '<span class="badge bg-danger me-1">Malware</span>' : '';
        return `<div class="list-card">
            <h6 class="card-title">${item.name}</h6>
            <div class="mb-2"><span class="badge badge-id">${id}</span>${extraBadges}</div>
            <p class="card-desc">${desc}</p>
        </div>`;
    }).join('');

    const parent = container.parentElement;
    const searchInput = parent.querySelector('input[type="text"]');
    if (searchInput) {
        searchInput.oninput = () => {
            const filter = searchInput.value.toLowerCase();
            container.querySelectorAll('.list-card').forEach(card => {
                card.style.display = card.textContent.toLowerCase().includes(filter) ? '' : 'none';
            });
        };
    }
}



// Legacy Window Bindings
window.renderList = renderList;
