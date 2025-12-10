document.addEventListener('DOMContentLoaded', () => {
    // Dynamic Year
    const yearSpan = document.getElementById('year');
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
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
    const cards = document.querySelectorAll('.project-card');
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
        { text: 'Loading modules: security, network, dev...', delay: 1200 },
        { text: 'Mounting file system...', delay: 1800 },
        { text: 'Starting SOC interface...', delay: 2400 },
        { text: 'System ready.', delay: 3000, color: 'text-accent' },
        { text: "Welcome to Kieran's Interactive Terminal v1.0.0", delay: 3500 },
        { text: "Type <span class='text-accent'>'help'</span> to see available commands.", delay: 3600 }
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
            help: 'Available commands: <span class="text-accent">help</span>, <span class="text-accent">whoami</span>, <span class="text-accent">skills</span>, <span class="text-accent">contact</span>, <span class="text-accent">projects</span>, <span class="text-accent">experience</span>, <span class="text-accent">certs</span>, <span class="text-accent">social</span>, <span class="text-accent">resume</span>, <span class="text-accent">clear</span><br><span class="text-slate-500 text-xs">Hint: Try some Linux commands... or type "matrix"</span>',
            whoami: 'Kieran | Senior SOC Analyst & Developer based in the UK.',
            skills: 'Security: SIEM, Splunk, Wireshark, Threat Hunting<br>Dev: Python, React, TypeScript, Node.js',
            contact: 'LinkedIn: linkedin.com/in/kieranwadforth | GitHub: @wadforth',
            projects: '<span class="text-accent font-bold">Featured Projects:</span><br>• <span class="text-white">Pulse Optimizer</span> - System optimization tool (Electron, React)<br>• <span class="text-white">Malware Simulation</span> - Isolated malware analysis environment<br>• <span class="text-white">Network-Dumper</span> - Network traffic analysis utility<br>• <span class="text-white">SteamSwitcher</span> - Quick Steam account switching tool',
            experience: '<span class="text-accent font-bold">Current Role:</span><br><span class="text-white">Senior SOC Analyst @ EDF</span> (Nov 2025 - Present)<br><br><span class="text-accent font-bold">Previous:</span><br>• Senior Security Analyst @ Performanta (Mar 2024 - Nov 2025)<br>• MDR & Threat Intelligence Analyst @ Performanta (Jun 2022 - Mar 2024)',
            certs: '<span class="text-accent font-bold">Certifications:</span><br>• Chronicle Certified SOAR Developer (CCSD)<br>• Siemplify Certified SOAR Analyst (SCSA)<br>• CompTIA CySA+ (CS0-002)',
            social: '<span class="text-accent font-bold">Connect with me:</span><br>• GitHub: <a href="https://github.com/wadforth" target="_blank" class="text-blue-400 hover:text-accent">github.com/wadforth</a><br>• LinkedIn: <a href="https://www.linkedin.com/in/kieranwadforth/" target="_blank" class="text-blue-400 hover:text-accent">linkedin.com/in/kieranwadforth</a>',

            clear: 'CLEAR',
            // Easter eggs
            hack: `<span class="text-red-400 font-bold">⚠ UNAUTHORIZED ACCESS DETECTED ⚠</span><br><span class="text-accent">Initiating security challenge...</span><br><br>You've discovered a hidden system. Crack the password to gain access!<br><span class="text-slate-400 text-xs">Type your password guess or use "hint" for a clue. Type "exit" to quit.</span>`,
            matrix: '<span class="text-accent">Wake up, Neo...</span><br><pre class="text-accent text-xs leading-tight mt-2">01010111 01100001 01101011 01100101<br>01110101 01110000 00101100 00100000<br>01001110 01100101 01101111 00101110<br>01010100 01101000 01100101 00100000<br>01001101 01100001 01110100 01110010<br>01101001 01111000 00100000 01101000<br>01100001 01110011 00100000 01111001<br>01101111 01110101 00101110 00101110</pre><br><span class="text-slate-500 text-xs">The Matrix has you...</span>',
            sudo: '<span class="text-red-400">Permission denied.</span> Nice try! 😎<br><span class="text-slate-500 text-xs">Kieran is not in the sudoers file. This incident will be reported.</span>',
            ls: '<span class="text-blue-400">portfolio/</span>  <span class="text-accent">projects/</span>  <span class="text-white">experience.txt</span>  <span class="text-white">certifications.txt</span>  <span class="text-white">cv.pdf</span>',
            cat: '<span class="text-yellow-400">Usage:</span> cat [file]<br><span class="text-slate-500">Try: cat experience.txt or cat cv.pdf</span>',
            'cat experience.txt': '<span class="text-accent">--- WORK EXPERIENCE ---</span><br>Currently hunting threats @ EDF 🎯<br>Previously securing systems @ Performanta 🔒',
            'cat cv.pdf': '<span class="text-red-400">Error:</span> Cannot display binary file.<br>Download instead: <a href="https://drive.proton.me/urls/DS7PFEEW54#66DDSIOQpcgP" target="_blank" class="text-blue-400 hover:text-accent">Proton Drive Link</a>',
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
});
