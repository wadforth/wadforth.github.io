document.addEventListener('DOMContentLoaded', () => {
    // Dynamic Year
    const yearSpan = document.getElementById('year');
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }

    // Visitor Counter
    const visitorCountSpan = document.getElementById('visitor-count');
    if (visitorCountSpan) {
        let count = localStorage.getItem('visitorCount');
        if (!count) {
            count = Math.floor(Math.random() * (5000 - 1000 + 1) + 1000); // Random start
        } else {
            count = parseInt(count) + 1;
        }
        localStorage.setItem('visitorCount', count);
        visitorCountSpan.textContent = count.toLocaleString();
    }

    // Typing Effect
    const typingText = document.querySelector('.typing-text');
    const phrases = [
        'SOC Analyst',
        'Security Engineer',
        'Threat Hunter',
        'Full Stack Developer'
    ];

    let phraseIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let typeSpeed = 100;

    function type() {
        if (!typingText) return;

        const currentPhrase = phrases[phraseIndex];

        if (isDeleting) {
            typingText.textContent = currentPhrase.substring(0, charIndex - 1);
            charIndex--;
            typeSpeed = 50;
        } else {
            typingText.textContent = currentPhrase.substring(0, charIndex + 1);
            charIndex++;
            typeSpeed = 100;
        }

        if (!isDeleting && charIndex === currentPhrase.length) {
            isDeleting = true;
            typeSpeed = 2000;
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            phraseIndex = (phraseIndex + 1) % phrases.length;
            typeSpeed = 500;
        }

        setTimeout(type, typeSpeed);
    }

    type();

    // Copy Email Functionality
    const copyEmailBtn = document.getElementById('copy-email-btn');
    if (copyEmailBtn) {
        copyEmailBtn.addEventListener('click', () => {
            const email = copyEmailBtn.getAttribute('data-email');
            navigator.clipboard.writeText(email).then(() => {
                const originalContent = copyEmailBtn.innerHTML;

                copyEmailBtn.innerHTML = '<i class="fa-solid fa-check text-accent"></i> <span class="text-accent">Copied!</span>';
                copyEmailBtn.classList.add('border-accent/50', 'bg-accent/10');

                setTimeout(() => {
                    copyEmailBtn.innerHTML = originalContent;
                    copyEmailBtn.classList.remove('border-accent/50', 'bg-accent/10');
                }, 2000);
            });
        });
    }

    // Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileMenuClose = document.getElementById('mobile-menu-close');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

    function openMobileMenu() {
        if (mobileMenu) {
            mobileMenu.classList.remove('opacity-0', 'pointer-events-none');
            mobileMenu.classList.add('opacity-100');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeMobileMenu() {
        if (mobileMenu) {
            mobileMenu.classList.add('opacity-0', 'pointer-events-none');
            mobileMenu.classList.remove('opacity-100');
            document.body.style.overflow = '';
        }
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', openMobileMenu);
    }

    if (mobileMenuClose) {
        mobileMenuClose.addEventListener('click', closeMobileMenu);
    }

    // Close menu when clicking nav links
    mobileNavLinks.forEach(link => {
        link.addEventListener('click', () => {
            closeMobileMenu();
        });
    });

    // Close menu when clicking outside
    if (mobileMenu) {
        mobileMenu.addEventListener('click', (e) => {
            if (e.target === mobileMenu) {
                closeMobileMenu();
            }
        });
    }

    // Active Navigation State
    const sections = document.querySelectorAll('section');
    const navLinks = document.querySelectorAll('.nav-link');

    window.addEventListener('scroll', () => {
        let current = '';

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (pageYOffset >= (sectionTop - 200)) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active-nav');
            if (link.getAttribute('href').includes(current)) {
                link.classList.add('active-nav');
            }
        });

        // Scroll to Top Button Visibility
        const scrollTopBtn = document.getElementById('scroll-top');
        if (scrollTopBtn) {
            if (window.scrollY > 500) {
                scrollTopBtn.classList.remove('translate-y-20', 'opacity-0');
            } else {
                scrollTopBtn.classList.add('translate-y-20', 'opacity-0');
            }
        }
    });

    // Scroll to Top Action
    const scrollTopBtn = document.getElementById('scroll-top');
    if (scrollTopBtn) {
        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Card Glow Effect
    const cards = document.querySelectorAll('.project-card, .spotlight-card');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });

    // Project Filtering
    const filterBtns = document.querySelectorAll('.filter-btn');
    const projectCards = document.querySelectorAll('.project-card');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons
            filterBtns.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');

            const filter = btn.getAttribute('data-filter');

            projectCards.forEach(card => {
                if (filter === 'all' || card.getAttribute('data-category') === filter) {
                    card.style.display = 'flex';
                    setTimeout(() => {
                        card.style.opacity = '1';
                        card.style.transform = 'translateY(0)';
                    }, 50);
                } else {
                    card.style.opacity = '0';
                    card.style.transform = 'translateY(10px)';
                    setTimeout(() => {
                        card.style.display = 'none';
                    }, 300);
                }
            });
        });
    });

    // Interactive Terminal
    const terminalInput = document.getElementById('terminal-input');
    const terminalOutput = document.getElementById('terminal-output');
    const terminalInputLine = document.getElementById('terminal-input-line');
    let terminalBooted = false;

    // Boot Sequence
    const bootLines = [
        { text: 'Initializing kernel...', delay: 500 },
        { text: 'Loading modules: security, network, dev...', delay: 300 },
        { text: 'Mounting file system...', delay: 300 },
        { text: 'Starting SOC interface...', delay: 400 },
        { text: 'Access granted.', delay: 400, color: 'text-accent' },
        { text: "Welcome to Kieran's Interactive Terminal v2.0", delay: 800, color: 'text-white font-bold' },
        { text: "Type <span class='text-accent'>'help'</span> to see available commands.", delay: 0 }
    ];

    const runBootSequence = async () => {
        if (terminalBooted) return;
        terminalBooted = true;

        for (const line of bootLines) {
            await new Promise(resolve => setTimeout(resolve, line.delay - (bootLines[bootLines.indexOf(line) - 1]?.delay || 0)));
            const div = document.createElement('div');
            div.className = `mb-1 font-mono text-xs ${line.color || 'text-slate-400'}`;
            div.innerHTML = line.text;
            terminalOutput.insertBefore(div, terminalInputLine);
            terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }

        terminalInputLine.style.display = 'flex';
        if (terminalInput) terminalInput.focus();
    };

    // Trigger boot when terminal is in view
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                runBootSequence();
                observer.disconnect();
            }
        });
    }, { threshold: 0.5 });

    const terminalSection = document.getElementById('about');
    if (terminalSection) {
        observer.observe(terminalSection);
    }

    if (terminalInput && terminalOutput) {
        // Easter egg game state
        let hackGameActive = false;
        let hackAttempts = 0;
        let hackPassword = '';
        const hackPasswords = ['cyberdefense', 'th2025', 'soc4life', 'kqlmaster', 'sentinelops'];

        const commands = {
            help: '<div class="space-y-1"><div class="text-white mb-2">Available commands:</div><div class="grid grid-cols-[100px_1fr] gap-2"><span class="text-accent">about</span><span class="text-slate-400">View profile summary</span><span class="text-accent">projects</span><span class="text-slate-400">List my projects</span><span class="text-accent">contact</span><span class="text-slate-400">Get contact info</span><span class="text-accent">social</span><span class="text-slate-400">Social media links</span><span class="text-accent">ls</span><span class="text-slate-400">List directory contents</span><span class="text-accent">cat</span><span class="text-slate-400">Read file contents</span><span class="text-accent">whoami</span><span class="text-slate-400">Current user info</span><span class="text-accent">pwd</span><span class="text-slate-400">Print working directory</span><span class="text-accent">joke</span><span class="text-slate-400">Tell a joke</span><span class="text-accent">hack</span><span class="text-slate-400">Start hack simulation</span><span class="text-accent">matrix</span><span class="text-slate-400">Enter the matrix</span><span class="text-accent">sudo</span><span class="text-slate-400">Execute as superuser</span><span class="text-accent">clear</span><span class="text-slate-400">Clear terminal</span></div></div>',
            whoami: 'Kieran | Senior SOC Analyst & Developer based in the UK.',
            skills: 'Security: SIEM, Splunk, Wireshark, Threat Hunting<br>Dev: Python, React, TypeScript, Node.js',
            contact: 'LinkedIn: linkedin.com/in/kieranwadforth | GitHub: @wadforth',
            projects: '<span class="text-accent font-bold">Featured Projects:</span><br>• <span class="text-white">Pulse Optimizer</span> - System optimization tool (Electron, React)<br>• <span class="text-white">Malware Simulation</span> - Isolated malware analysis environment<br>• <span class="text-white">Network-Dumper</span> - Network traffic analysis utility<br>• <span class="text-white">SteamSwitcher</span> - Quick Steam account switching tool',
            social: '<span class="text-accent font-bold">Connect with me:</span><br>• GitHub: <a href="https://github.com/wadforth" target="_blank" class="text-blue-400 hover:text-accent">github.com/wadforth</a><br>• LinkedIn: <a href="https://www.linkedin.com/in/kieranwadforth/" target="_blank" class="text-blue-400 hover:text-accent">linkedin.com/in/kieranwadforth</a>',

            clear: 'CLEAR',
            // Easter eggs
            hack: `<span class="text-red-400 font-bold">⚠ UNAUTHORIZED ACCESS DETECTED ⚠</span><br><span class="text-accent">Initiating security challenge...</span><br><br>You've discovered a hidden system. Crack the password to gain access!<br><span class="text-slate-400 text-xs">Type your password guess or use "hint" for a clue. Type "exit" to quit.</span>`,
            matrix: '<span class="text-accent">Wake up, Neo...</span><br><pre class="text-accent text-xs leading-tight mt-2">01010111 01100001 01101011 01100101<br>01110101 01110000 00101100 00100000<br>01001110 01100101 01101111 00101110<br>01010100 01101000 01100101 00100000<br>01001101 01100001 01110100 01110010<br>01101001 01111000 00100000 01101000<br>01100001 01110011 00100000 01111001<br>01101111 01110101 00101110 00101110</pre><br><span class="text-slate-500 text-xs">The Matrix has you...</span>',
            sudo: '<span class="text-red-400">Permission denied.</span> Nice try! 😎<br><span class="text-slate-500 text-xs">Kieran is not in the sudoers file. This incident will be reported.</span>',
            ls: '<span class="text-blue-400">portfolio/</span>  <span class="text-accent">projects/</span>  <span class="text-white">experience.txt</span>  <span class="text-white">certifications.txt</span>',
            cat: '<span class="text-yellow-400">Usage:</span> cat [file]<br><span class="text-slate-500">Try: cat experience.txt</span>',
            'cat experience.txt': '<span class="text-accent">--- WORK EXPERIENCE ---</span><br>Currently hunting threats @ EDF 🎯<br>Previously securing systems @ Performanta 🔒',
            pwd: '<span class="text-blue-400">/home/kieran/portfolio</span>',
            'whoami --real': '<span class="text-accent">A cybersecurity professional who drinks too much coffee ☕</span><br><span class="text-white">and writes code that (usually) works on the first try.</span>',
            joke: '<span class="text-accent">Why do programmers prefer dark mode?</span><br>Because light attracts bugs! 🐛'
        };

        terminalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const input = terminalInput.value.trim().toLowerCase();

                // Add input line to history
                const inputLine = document.createElement('div');
                inputLine.className = 'mb-1';
                inputLine.innerHTML = `<span class="text-accent">➜</span> <span class="text-blue-400">~</span> <span class="text-slate-200">${terminalInput.value.trim()}</span>`;
                terminalOutput.insertBefore(inputLine, terminalInputLine);

                // Handle hack game logic
                if (hackGameActive) {
                    if (input === 'exit') {
                        hackGameActive = false;
                        hackAttempts = 0;
                        const exitLine = document.createElement('div');
                        exitLine.className = 'mb-4 text-yellow-400';
                        exitLine.textContent = 'Access attempt terminated. Security system standing down.';
                        terminalOutput.insertBefore(exitLine, terminalInputLine);
                    } else if (input === 'hint') {
                        hackAttempts++;
                        const hints = [
                            `💡 Hint: It's related to ${hackPassword.includes('cyber') ? 'cybersecurity' : hackPassword.includes('kql') ? 'SIEM queries' : hackPassword.includes('soc') ? 'security operations' : hackPassword.includes('th') ? 'threat hunting' : 'Sentinel operations'}...`,
                            `💡 Hint: ${hackPassword.length} characters long`,
                            `💡 Hint: Starts with "${hackPassword[0]}"`,
                            `💡 Final Hint: ${hackPassword.split('').map((c, i) => i < hackPassword.length - 2 ? c : '_').join('')}`
                        ];
                        const hintLine = document.createElement('div');
                        hintLine.className = 'mb-4 text-yellow-400';
                        hintLine.innerHTML = hints[Math.min(hackAttempts - 1, hints.length - 1)];
                        terminalOutput.insertBefore(hintLine, terminalInputLine);
                    } else if (input === hackPassword) {
                        hackGameActive = false;
                        const successLine = document.createElement('div');
                        successLine.className = 'mb-4 text-accent';
                        successLine.innerHTML = `<span class="font-bold">✅ ACCESS GRANTED</span><br>Password cracked in ${hackAttempts + 1} attempts!<br><span class="text-white">You've proven your worth, ${hackAttempts < 3 ? 'elite hacker' : hackAttempts < 6 ? 'skilled analyst' : 'persistent one'}! 🎉</span>`;
                        terminalOutput.insertBefore(successLine, terminalInputLine);
                        hackAttempts = 0;
                    } else {
                        hackAttempts++;
                        const failLine = document.createElement('div');
                        failLine.className = 'mb-4 text-red-400';
                        failLine.innerHTML = `❌ Access Denied. Attempt ${hackAttempts}/∞<br><span class="text-slate-500 text-xs">Try again or type "hint" for a clue</span>`;
                        terminalOutput.insertBefore(failLine, terminalInputLine);
                    }
                }
                // Process normal commands
                else if (input in commands) {
                    if (input === 'clear') {
                        while (terminalOutput.firstChild && terminalOutput.firstChild !== terminalInputLine) {
                            terminalOutput.removeChild(terminalOutput.firstChild);
                        }
                        const welcome = document.createElement('div');
                        welcome.className = 'mb-2 text-slate-400';
                        welcome.textContent = "Terminal cleared.";
                        terminalOutput.insertBefore(welcome, terminalInputLine);
                    } else if (input === 'hack') {
                        hackGameActive = true;
                        hackAttempts = 0;
                        hackPassword = hackPasswords[Math.floor(Math.random() * hackPasswords.length)];
                        const responseLine = document.createElement('div');
                        responseLine.className = 'mb-4 text-slate-300';
                        responseLine.innerHTML = commands[input];
                        terminalOutput.insertBefore(responseLine, terminalInputLine);
                    } else {
                        const responseLine = document.createElement('div');
                        responseLine.className = 'mb-4 text-slate-300';
                        responseLine.innerHTML = commands[input];
                        terminalOutput.insertBefore(responseLine, terminalInputLine);
                    }
                } else if (input !== '') {
                    const errorLine = document.createElement('div');
                    errorLine.className = 'mb-4 text-red-400';
                    errorLine.textContent = `Command not found: ${input}. Type 'help' for available commands.`;
                    terminalOutput.insertBefore(errorLine, terminalInputLine);
                }

                terminalInput.value = '';
                terminalOutput.scrollTop = terminalOutput.scrollHeight;
            }
        });
    }

    // Fetch and display recent blog posts
    const recentPostsContainer = document.getElementById('recent-posts');
    if (recentPostsContainer) {
        fetch('/.netlify/functions/blog-api?action=list')
            .then(res => res.json())
            .then(data => {
                const posts = (data.posts || [])
                    .filter(p => p.status === 'published')
                    .slice(0, 3);

                if (!posts.length) {
                    recentPostsContainer.innerHTML = '<p class="col-span-full text-center text-slate-500 text-sm py-4">No posts yet</p>';
                    return;
                }

                recentPostsContainer.innerHTML = posts.map(p => `
                    <a href="blog/" class="block p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all group">
                        <div class="text-xs text-purple-400 mb-2 font-mono">${new Date(p.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                        <div class="font-medium text-white group-hover:text-purple-400 transition-colors text-sm line-clamp-2">${p.title}</div>
                        <div class="text-xs text-slate-500 mt-1">${p.readingTime || 5} min read</div>
                    </a>
                `).join('');
            })
            .catch(() => {
                recentPostsContainer.innerHTML = '<p class="col-span-full text-center text-slate-500 text-sm py-4">Could not load posts</p>';
            });
    }

    // Load announcements on page load
    loadPublicAnnouncements();
});

// ====== ANNOUNCEMENT & ADMIN SYSTEM ======
const ANNOUNCEMENTS_API = '/.netlify/functions/announcements-api';
let adminToken = sessionStorage.getItem('portfolio_admin_token');
let currentAnnouncements = [];

// Announcement type styles
const ANNOUNCEMENT_STYLES = {
    info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', icon: 'fa-circle-info' },
    success: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', icon: 'fa-check-circle' },
    warning: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: 'fa-triangle-exclamation' },
    alert: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: 'fa-circle-exclamation' }
};

// Secret keyboard shortcut to open admin
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        openAdminModal();
    }
});

// Load public announcements
async function loadPublicAnnouncements() {
    const container = document.getElementById('announcements-container');
    if (!container) return;

    try {
        const res = await fetch(`${ANNOUNCEMENTS_API}?action=list`);
        const data = await res.json();
        const announcements = data.announcements || [];

        // Get dismissed announcements from localStorage
        const dismissed = JSON.parse(localStorage.getItem('dismissed_announcements') || '[]');
        const visible = announcements.filter(a => !dismissed.includes(a.id));

        if (!visible.length) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = visible.map(a => {
            const style = ANNOUNCEMENT_STYLES[a.type] || ANNOUNCEMENT_STYLES.info;
            return `
                <div class="announcement-banner ${style.bg} border-b ${style.border} py-3 px-4" data-id="${a.id}">
                    <div class="max-w-6xl mx-auto flex items-center justify-between gap-4">
                        <div class="flex items-center gap-3 flex-1">
                            <i class="fa-solid ${style.icon} ${style.text}"></i>
                            <span class="text-sm text-white">${a.message}</span>
                            ${a.link ? `<a href="${a.link}" class="${style.text} text-sm font-medium hover:underline ml-2" target="_blank">${a.linkText || 'Learn more'} →</a>` : ''}
                        </div>
                        ${a.dismissible ? `
                            <button onclick="dismissAnnouncement('${a.id}')" class="text-slate-500 hover:text-white text-sm p-1">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Failed to load announcements:', e);
    }
}

// Dismiss announcement
function dismissAnnouncement(id) {
    const dismissed = JSON.parse(localStorage.getItem('dismissed_announcements') || '[]');
    dismissed.push(id);
    localStorage.setItem('dismissed_announcements', JSON.stringify(dismissed));

    const banner = document.querySelector(`[data-id="${id}"]`);
    if (banner) {
        banner.style.opacity = '0';
        setTimeout(() => banner.remove(), 200);
    }
}

// Open admin modal
function openAdminModal() {
    document.getElementById('admin-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    if (adminToken) {
        showAdminDashboard();
    } else {
        document.getElementById('admin-login-view').classList.remove('hidden');
        document.getElementById('admin-dashboard-view').classList.add('hidden');
        document.getElementById('admin-password').focus();
    }
}

// Close admin modal
function closeAdminModal() {
    document.getElementById('admin-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

// Admin login form
document.getElementById('admin-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('admin-password').value;
    const errorEl = document.getElementById('admin-login-error');

    try {
        const res = await fetch('/.netlify/functions/blog-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();

        if (data.success && data.token) {
            adminToken = data.token;
            sessionStorage.setItem('portfolio_admin_token', adminToken);
            showAdminDashboard();
        } else {
            errorEl.textContent = 'Invalid password';
            errorEl.classList.remove('hidden');
        }
    } catch {
        errorEl.textContent = 'Login failed';
        errorEl.classList.remove('hidden');
    }
});

// Show admin dashboard
function showAdminDashboard() {
    document.getElementById('admin-login-view').classList.add('hidden');
    document.getElementById('admin-dashboard-view').classList.remove('hidden');
    loadAdminAnnouncements();
}

// Load announcements for admin
async function loadAdminAnnouncements() {
    const list = document.getElementById('announcements-list');

    try {
        const res = await fetch(`${ANNOUNCEMENTS_API}?action=list`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        currentAnnouncements = data.announcements || [];

        if (!currentAnnouncements.length) {
            list.innerHTML = '<div class="text-center text-slate-500 text-sm py-8">No announcements yet</div>';
            return;
        }

        list.innerHTML = currentAnnouncements.map(a => {
            const style = ANNOUNCEMENT_STYLES[a.type] || ANNOUNCEMENT_STYLES.info;
            return `
                <div class="p-4 bg-dark rounded-xl border border-white/10 ${!a.active ? 'opacity-50' : ''}">
                    <div class="flex items-start justify-between gap-4">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-2">
                                <i class="fa-solid ${style.icon} ${style.text}"></i>
                                <span class="text-xs uppercase tracking-wider ${a.active ? 'text-accent' : 'text-slate-500'}">${a.active ? 'Active' : 'Inactive'}</span>
                                <span class="text-xs text-slate-600">${a.type}</span>
                            </div>
                            <p class="text-sm text-white">${a.message}</p>
                            ${a.link ? `<p class="text-xs text-slate-500 mt-1">${a.link}</p>` : ''}
                        </div>
                        <div class="flex gap-2 shrink-0">
                            <button onclick="toggleAnnouncement('${a.id}', ${!a.active})" class="p-2 hover:bg-white/10 rounded-lg transition-colors ${a.active ? 'text-yellow-500' : 'text-green-500'}" title="${a.active ? 'Deactivate' : 'Activate'}">
                                <i class="fa-solid ${a.active ? 'fa-pause' : 'fa-play'} text-xs"></i>
                            </button>
                            <button onclick="editAnnouncement('${a.id}')" class="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400" title="Edit">
                                <i class="fa-solid fa-pen text-xs"></i>
                            </button>
                            <button onclick="deleteAnnouncement('${a.id}')" class="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-red-400" title="Delete">
                                <i class="fa-solid fa-trash text-xs"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch {
        list.innerHTML = '<div class="text-center text-red-400 text-sm py-8">Failed to load</div>';
    }
}

// Show create announcement form
function showCreateAnnouncement() {
    document.getElementById('panel-announcements').classList.add('hidden');
    document.getElementById('announcement-form-view').classList.remove('hidden');
    document.getElementById('form-title').textContent = 'New Announcement';
    document.getElementById('announcement-id').value = '';
    document.getElementById('announcement-message').value = '';
    document.getElementById('announcement-type').value = 'info';
    document.getElementById('announcement-dismissible').value = 'true';
    document.getElementById('announcement-link').value = '';
    document.getElementById('announcement-link-text').value = '';
}

// Edit announcement
function editAnnouncement(id) {
    const ann = currentAnnouncements.find(a => a.id === id);
    if (!ann) return;

    document.getElementById('panel-announcements').classList.add('hidden');
    document.getElementById('announcement-form-view').classList.remove('hidden');
    document.getElementById('form-title').textContent = 'Edit Announcement';
    document.getElementById('announcement-id').value = ann.id;
    document.getElementById('announcement-message').value = ann.message;
    document.getElementById('announcement-type').value = ann.type;
    document.getElementById('announcement-dismissible').value = String(ann.dismissible);
    document.getElementById('announcement-link').value = ann.link || '';
    document.getElementById('announcement-link-text').value = ann.linkText || '';
}

// Hide form
function hideAnnouncementForm() {
    document.getElementById('announcement-form-view').classList.add('hidden');
    document.getElementById('panel-announcements').classList.remove('hidden');
}

// Save announcement (create or update)
document.getElementById('announcement-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('announcement-id').value;
    const action = id ? 'update' : 'create';
    const payload = {
        message: document.getElementById('announcement-message').value,
        type: document.getElementById('announcement-type').value,
        dismissible: document.getElementById('announcement-dismissible').value === 'true',
        link: document.getElementById('announcement-link').value || null,
        linkText: document.getElementById('announcement-link-text').value || null
    };

    if (id) payload.id = id;

    try {
        const res = await fetch(`${ANNOUNCEMENTS_API}?action=${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            hideAnnouncementForm();
            loadAdminAnnouncements();
            loadPublicAnnouncements();
        }
    } catch (e) {
        console.error('Save failed:', e);
    }
});

// Toggle announcement active state
async function toggleAnnouncement(id, active) {
    try {
        await fetch(`${ANNOUNCEMENTS_API}?action=update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ id, active })
        });
        loadAdminAnnouncements();
        loadPublicAnnouncements();
    } catch (e) {
        console.error('Toggle failed:', e);
    }
}

// Delete announcement
async function deleteAnnouncement(id) {
    if (!confirm('Delete this announcement?')) return;

    try {
        await fetch(`${ANNOUNCEMENTS_API}?action=delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ id })
        });
        loadAdminAnnouncements();
        loadPublicAnnouncements();
    } catch (e) {
        console.error('Delete failed:', e);
    }
}

// Close modal on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAdminModal();
});
