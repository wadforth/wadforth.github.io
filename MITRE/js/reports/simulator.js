/* ========================================================
   MITRE ATT&CK Matrix Coverage What-If Simulator
   Allows real-time simulation of coverage & maturity grades
   ======================================================== */

(function () {
    // Sandbox state for the simulator session
    let sandboxTechniques = []; // maps techniqueID -> { checked: boolean, originalChecked: boolean, hasOriginalQueries: boolean }
    let simulatorModal = null;

    // Initialize Simulator Hooks
    document.addEventListener('DOMContentLoaded', () => {
        const btnSim = document.getElementById('btn-coverage-simulator');
        if (btnSim) {
            btnSim.addEventListener('click', openSimulator);
        }
    });

    function openSimulator() {
        if (!state.currentLayer || !state.techniques) {
            showToast('No active layer or techniques loaded', 'warning');
            return;
        }

        // Initialize sandbox copy from current layer
        sandboxTechniques = [];
        
        // Find all STIX techniques (both parent and sub-techniques)
        state.techniques.forEach(stixTech => {
            const techId = stixTech.external_references?.[0]?.external_id;
            if (!techId) return;

            const layerTech = state.currentLayer.techniques?.find(lt => lt.techniqueID === techId);
            const isCovered = !!(layerTech?.queries && layerTech.queries.length > 0);

            sandboxTechniques.push({
                id: techId,
                name: stixTech.name,
                isSub: !!stixTech.x_mitre_is_subtechnique,
                tactics: stixTech.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack').map(k => k.phase_name) || [],
                checked: isCovered,
                originalChecked: isCovered,
                hasOriginalQueries: isCovered && (layerTech?.queries?.length > 0)
            });
        });

        // Initialize Bootstrap Modal if not already
        const modalEl = document.getElementById('coverage-simulator-modal');
        if (modalEl) {
            simulatorModal = new bootstrap.Modal(modalEl);
            simulatorModal.show();

            // Populate Techniques Toggles List
            renderSimTechniques();

            // Calculate & Update stats dial
            updateSimStats();

            // Wire up event listeners inside simulator modal
            setupSimulatorListeners();
        }
    }

    function renderSimTechniques(filterText = '', filterCoveredOnly = false) {
        const scrollContainer = document.getElementById('sim-techniques-scroll');
        if (!scrollContainer) return;

        // Group techniques by tactic for clean readability
        const tacticMap = {};
        state.tactics.forEach(t => {
            tacticMap[t.x_mitre_shortname] = {
                name: t.name,
                techniques: []
            };
        });

        sandboxTechniques.forEach(tech => {
            // Apply text filter
            if (filterText) {
                const matchId = tech.id.toLowerCase().includes(filterText.toLowerCase());
                const matchName = tech.name.toLowerCase().includes(filterText.toLowerCase());
                if (!matchId && !matchName) return;
            }

            // Apply covered-only filter
            if (filterCoveredOnly && !tech.checked) {
                return;
            }

            tech.tactics.forEach(tacticShortname => {
                if (tacticMap[tacticShortname]) {
                    tacticMap[tacticShortname].techniques.push(tech);
                }
            });
        });

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        let html = '';
        let sectionCount = 0;

        Object.entries(tacticMap).forEach(([tacticShortname, tacticData]) => {
            if (tacticData.techniques.length === 0) return;
            sectionCount++;

            html += `
                <div class="sim-tactic-section mb-3" style="border: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}; border-radius: 8px; overflow: hidden; background: ${isDark ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.005)'};">
                    <div style="background: ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'}; padding: 6px 12px; font-size: 11px; font-weight: 700; color: var(--on-surface-secondary); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; justify-content: space-between;">
                        <span>${escapeHtml(tacticData.name)}</span>
                        <span style="font-size: 9px; opacity: 0.8; background: var(--surface); padding: 1px 6px; border-radius: 4px; font-weight: 600;">${tacticData.techniques.length} Techs</span>
                    </div>
                    <div style="padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; max-height: 250px; overflow-y: auto;">
            `;

            tacticData.techniques.forEach(tech => {
                html += `
                    <label class="d-flex align-items-center gap-2 text-xs" style="margin-bottom: 0; cursor: pointer; padding: 4px 6px; border-radius: 4px; transition: background 0.2s ease; background: ${tech.checked ? (isDark ? 'rgba(16, 185, 129, 0.06)' : 'rgba(16, 185, 129, 0.04)') : 'transparent'};">
                        <input type="checkbox" class="sim-tech-checkbox form-check-input" data-tech-id="${tech.id}" ${tech.checked ? 'checked' : ''} style="width: 14px; height: 14px; cursor: pointer;">
                        <span style="font-family: monospace; font-weight: bold; min-width: 75px; color: ${tech.checked ? 'var(--accent-green)' : 'var(--on-surface-tertiary)'};">
                            ${tech.id}
                        </span>
                        <span style="flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: ${tech.checked ? '600' : 'normal'}; color: ${tech.checked ? 'var(--on-surface)' : 'var(--on-surface-secondary)'};">
                            ${escapeHtml(tech.name)}
                        </span>
                        ${tech.isSub ? `<span style="font-size: 8px; color: var(--on-surface-tertiary); background: ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}; padding: 1px 4px; border-radius: 3px; font-weight: bold;">SUB</span>` : ''}
                    </label>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        if (sectionCount === 0) {
            html = `<div class="text-center py-5 text-on-surface-tertiary text-xs"><i class="bi bi-search" style="font-size: 2rem; display: block; margin-bottom: 8px; opacity: 0.4;"></i>No techniques found matching filter.</div>`;
        }

        scrollContainer.innerHTML = html;

        // Wire up checklist toggle events
        scrollContainer.querySelectorAll('.sim-tech-checkbox').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const techId = e.target.dataset.techId;
                const checked = e.target.checked;
                
                // Update sandbox item state
                const tech = sandboxTechniques.find(t => t.id === techId);
                if (tech) {
                    tech.checked = checked;
                }

                // Apply dynamic visual highlight to parent label
                const label = e.target.closest('label');
                if (label) {
                    label.style.background = checked ? (isDark ? 'rgba(16, 185, 129, 0.06)' : 'rgba(16, 185, 129, 0.04)') : 'transparent';
                    const idSpan = label.querySelector('span');
                    if (idSpan) idSpan.style.color = checked ? 'var(--accent-green)' : 'var(--on-surface-tertiary)';
                    const nameSpan = label.querySelectorAll('span')[1];
                    if (nameSpan) {
                        nameSpan.style.fontWeight = checked ? '600' : 'normal';
                        nameSpan.style.color = checked ? 'var(--on-surface)' : 'var(--on-surface-secondary)';
                    }
                }

                // Update real-time SVG Dial & maturity labels
                updateSimStats();
            });
        });
    }

    function updateSimStats() {
        const parentTechs = sandboxTechniques.filter(t => !t.isSub);
        const subTechs = sandboxTechniques.filter(t => t.isSub);

        const totalParents = parentTechs.length;
        const totalSubs = subTechs.length;
        const totalAll = totalParents + totalSubs;

        // Calculate covered counts in simulator
        const coveredIds = new Set(sandboxTechniques.filter(t => t.checked).map(t => t.id));

        let coveredParentsCount = 0;
        parentTechs.forEach(parentTech => {
            const parentId = parentTech.id;
            if (coveredIds.has(parentId)) {
                coveredParentsCount++;
                return;
            }
            // If any subtechnique is covered, the parent is also counted as covered
            const hasCoveredSub = [...coveredIds].some(id => id.startsWith(parentId + '.'));
            if (hasCoveredSub) {
                coveredParentsCount++;
            }
        });

        let coveredSubsCount = 0;
        subTechs.forEach(subTech => {
            if (coveredIds.has(subTech.id)) {
                coveredSubsCount++;
            }
        });

        // Overall parent technique coverage percentage
        const parentsPct = totalParents > 0 ? (coveredParentsCount / totalParents) * 100 : 0;
        const parentsPctRounded = Math.round(parentsPct * 10) / 10;

        // Maturity Grade letter logic (A: >=70%, B: 50-70%, C: 30-50%, D/F: <30%)
        let gradeLetter = 'D';
        let gradeColor = 'var(--accent-red)';
        if (parentsPct >= 70) {
            gradeLetter = 'A';
            gradeColor = 'var(--accent-green)';
        } else if (parentsPct >= 50) {
            gradeLetter = 'B';
            gradeColor = 'var(--accent-tan)';
        } else if (parentsPct >= 30) {
            gradeLetter = 'C';
            gradeColor = '#f59e0b';
        }

        // Update Dial Circular SVG Gauge
        const progressCircle = document.getElementById('sim-dial-progress');
        if (progressCircle) {
            // Circumference of radius 58 circle = 2 * PI * 58 = 364.42
            const circumference = 364.42;
            const offset = circumference * (1 - parentsPct / 100);
            progressCircle.style.strokeDashoffset = offset;
            progressCircle.style.stroke = gradeColor;
        }

        // Update Dial Text Inside Circle
        const gradeText = document.getElementById('sim-dial-grade');
        if (gradeText) {
            gradeText.textContent = gradeLetter;
            gradeText.style.color = gradeColor;
        }

        const percentageText = document.getElementById('sim-dial-percentage');
        if (percentageText) {
            percentageText.textContent = `${parentsPctRounded}%`;
        }

        // Update Simulated Metrics Labels
        const parentsStat = document.getElementById('sim-stat-parents');
        if (parentsStat) {
            parentsStat.textContent = `${coveredParentsCount} / ${totalParents} (${Math.round(parentsPct)}%)`;
        }

        const subsStat = document.getElementById('sim-stat-subs');
        if (subsStat) {
            const subsPct = totalSubs > 0 ? Math.round((coveredSubsCount / totalSubs) * 100) : 0;
            subsStat.textContent = `${coveredSubsCount} / ${totalSubs} (${subsPct}%)`;
        }

        const totalStat = document.getElementById('sim-stat-total');
        if (totalStat) {
            const totalChecked = coveredIds.size;
            const overallPct = totalAll > 0 ? Math.round((totalChecked / totalAll) * 100) : 0;
            totalStat.textContent = `${totalChecked} / ${totalAll} (${overallPct}%)`;
        }
    }

    function setupSimulatorListeners() {
        // Search filter input
        const searchInput = document.getElementById('sim-tech-search');
        if (searchInput) {
            searchInput.value = ''; // Clear prior search
            searchInput.addEventListener('input', (e) => {
                const text = e.target.value;
                const onlyCoveredBtn = document.getElementById('sim-btn-only-covered');
                const isCoveredOnly = onlyCoveredBtn?.classList.contains('active');
                renderSimTechniques(text, isCoveredOnly);
            });
        }

        // Select All button
        const btnSelectAll = document.getElementById('sim-btn-select-all');
        if (btnSelectAll) {
            btnSelectAll.onclick = () => {
                sandboxTechniques.forEach(t => t.checked = true);
                renderSimTechniques(searchInput?.value || '');
                updateSimStats();
            };
        }

        // Clear Checked button
        const btnDeselectAll = document.getElementById('sim-btn-deselect-all');
        if (btnDeselectAll) {
            btnDeselectAll.onclick = () => {
                sandboxTechniques.forEach(t => t.checked = false);
                renderSimTechniques(searchInput?.value || '');
                updateSimStats();
            };
        }

        // Only Covered button filter
        const btnOnlyCovered = document.getElementById('sim-btn-only-covered');
        const btnAllTypes = document.getElementById('sim-btn-all-types');
        if (btnOnlyCovered && btnAllTypes) {
            btnOnlyCovered.onclick = () => {
                btnOnlyCovered.classList.add('active');
                btnAllTypes.classList.remove('active');
                renderSimTechniques(searchInput?.value || '', true);
            };

            btnAllTypes.onclick = () => {
                btnAllTypes.classList.add('active');
                btnOnlyCovered.classList.remove('active');
                renderSimTechniques(searchInput?.value || '', false);
            };
        }

        // Revert / Reset Button
        const btnReset = document.getElementById('sim-btn-reset');
        if (btnReset) {
            btnReset.onclick = () => {
                sandboxTechniques.forEach(t => {
                    t.checked = t.originalChecked;
                });
                renderSimTechniques(searchInput?.value || '');
                updateSimStats();
                showToast('Simulator checklist reset to current matrix state', 'info');
            };
        }

        // Apply Changes (Commit) Button
        const btnCommit = document.getElementById('sim-btn-commit');
        if (btnCommit) {
            btnCommit.onclick = () => {
                showConfirm('Commit Simulation', 'Applying these changes will overwrite your current layer queries: checking unchecked techniques will inject dynamic placeholder queries to establish coverage, and unchecking checked techniques will remove their queries. Proceed?')
                    .then(confirmed => {
                        if (confirmed) {
                            commitSimulation();
                        }
                    });
            };
        }
    }

    function commitSimulation() {
        if (!state.currentLayer) return;

        let addedCount = 0;
        let removedCount = 0;

        sandboxTechniques.forEach(tech => {
            const layerTechIndex = state.currentLayer.techniques?.findIndex(lt => lt.techniqueID === tech.id);
            const hasQuery = tech.checked;

            if (hasQuery) {
                // If it should have coverage
                if (layerTechIndex !== undefined && layerTechIndex !== -1) {
                    const lt = state.currentLayer.techniques[layerTechIndex];
                    if (!lt.queries || lt.queries.length === 0) {
                        // Needs a placeholder query to count as covered
                        lt.queries = [{
                            id: `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            name: 'Simulated Detection Check',
                            language: 'custom',
                            month: new Date().toISOString().slice(0, 7),
                            query: '# Simulated Coverage Draft Query\n# Generated via What-If Simulator\n',
                            description: 'Established via the coverage simulator sandbox.',
                            source: 'Coverage Simulator'
                        }];
                        lt.enabled = true;
                        addedCount++;
                    } else if (lt.enabled === false) {
                        lt.enabled = true;
                        addedCount++;
                    }
                } else {
                    // Create technique annotation from scratch
                    state.currentLayer.techniques.push({
                        techniqueID: tech.id,
                        enabled: true,
                        color: null,
                        score: null,
                        comment: 'Annotated via Coverage Simulator',
                        queries: [{
                            id: `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            name: 'Simulated Detection Check',
                            language: 'custom',
                            month: new Date().toISOString().slice(0, 7),
                            query: '# Simulated Coverage Draft Query\n# Generated via What-If Simulator\n',
                            description: 'Established via the coverage simulator sandbox.',
                            source: 'Coverage Simulator'
                        }]
                    });
                    addedCount++;
                }
            } else {
                // If it shouldn't have coverage (unchecked in simulator)
                if (layerTechIndex !== undefined && layerTechIndex !== -1) {
                    const lt = state.currentLayer.techniques[layerTechIndex];
                    if (lt.queries && lt.queries.length > 0) {
                        lt.queries = []; // Clear queries to remove coverage
                        removedCount++;
                    }
                }
            }
        });

        // Save new layer and re-render workspace
        autoSaveLayer();
        renderMatrix();
        
        // Hide Simulator Modal
        if (simulatorModal) {
            simulatorModal.hide();
        }

        // Show Toast Summary
        showToast(`Simulation committed! Added ${addedCount} placeholder detections & cleared ${removedCount} coverage gaps.`, 'success');
    }
})();
