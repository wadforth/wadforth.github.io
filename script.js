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

    // Project Tab Switching
    const btnActive = document.getElementById('btn-active-projects');
    const btnArchived = document.getElementById('btn-archived-projects');
    const gridActive = document.getElementById('active-projects-grid');
    const gridArchived = document.getElementById('archived-projects-grid');

    function switchTab(target) {
        if (target === 'active') {
            btnActive.classList.add('text-accent', 'bg-white/5');
            btnActive.classList.remove('text-slate-400');
            btnArchived.classList.remove('text-accent', 'text-amber-500', 'bg-white/5');
            btnArchived.classList.add('text-slate-400');

            gridArchived.classList.add('opacity-0');
            setTimeout(() => {
                gridArchived.classList.add('hidden');
                gridActive.classList.remove('hidden');
                setTimeout(() => {
                    gridActive.classList.remove('opacity-0');
                }, 50);
            }, 300);
        } else {
            btnArchived.classList.add('text-amber-500', 'bg-white/5');
            btnArchived.classList.remove('text-slate-400');
            btnActive.classList.remove('text-accent', 'bg-white/5');
            btnActive.classList.add('text-slate-400');

            gridActive.classList.add('opacity-0');
            setTimeout(() => {
                gridActive.classList.add('hidden');
                gridArchived.classList.remove('hidden');
                setTimeout(() => {
                    gridArchived.classList.remove('opacity-0');
                }, 50);
            }, 300);
        }
    }

    if (btnActive && btnArchived && gridActive && gridArchived) {
        btnActive.addEventListener('click', () => switchTab('active'));
        btnArchived.addEventListener('click', () => switchTab('archived'));
    }

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

    // === 1. Network Particle Canvas Background ===
    const canvas = document.getElementById('particle-mesh');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];
        let mouse = { x: null, y: null, radius: 150 };

        // Handle Resize
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initParticles();
        }

        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('mousemove', (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        });
        window.addEventListener('mouseleave', () => {
            mouse.x = null;
            mouse.y = null;
        });

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 1.5 + 0.5;
                this.speedX = Math.random() * 0.4 - 0.2;
                this.speedY = Math.random() * 0.4 - 0.2;
            }

            update() {
                this.x += this.speedX;
                this.y += this.speedY;

                // Bounce off edges
                if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
                if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;

                // Mouse interaction (gravity pull)
                if (mouse.x !== null && mouse.y !== null) {
                    let dx = mouse.x - this.x;
                    let dy = mouse.y - this.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < mouse.radius) {
                        let force = (mouse.radius - distance) / mouse.radius;
                        this.x += (dx / distance) * force * 0.6;
                        this.y += (dy / distance) * force * 0.6;
                    }
                }
            }

            draw() {
                ctx.fillStyle = 'rgba(0, 255, 157, 0.4)'; // neon green
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function initParticles() {
            particles = [];
            // Spawn nodes proportional to screen area
            const numParticles = Math.floor((canvas.width * canvas.height) / 18000);
            for (let i = 0; i < Math.min(numParticles, 120); i++) {
                particles.push(new Particle());
            }
        }

        function connectParticles() {
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    let dx = particles[i].x - particles[j].x;
                    let dy = particles[i].y - particles[j].y;
                    let distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 100) {
                        let opacity = (100 - distance) / 100 * 0.08; // very faint web lines
                        ctx.strokeStyle = `rgba(0, 255, 157, ${opacity})`;
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.update();
                p.draw();
            });
            connectParticles();
            requestAnimationFrame(animate);
        }

        resizeCanvas();
        animate();
    }

    // === 2. SOC Security Operations Console Engine ===
    const initialAlerts = [
        {
            id: "ALRT-492",
            title: "LSASS Memory Dump via ProcDump",
            source: "CrowdStrike Falcon",
            severity: "CRITICAL",
            host: "UK-AD-DC01",
            ip: "10.10.12.8",
            mitreTechnique: "T1003.001 (OS Credential Dumping)",
            kql: `DeviceProcessEvents\n| where ProcessCommandLine has "procdump" and ProcessCommandLine has "lsass"\n| project TimeGenerated, DeviceName, InitiatingProcessFileName, ProcessCommandLine`,
            remediation: "This indicates a credential dumping attempt on the Active Domain Controller. Isolate host immediately to prevent credential theft and lateral movement.",
            timestamp: null,
            contained: false
        },
        {
            id: "ALRT-283",
            title: "Brute Force Attempt from Tor Exit Node",
            source: "Azure Sentinel",
            severity: "HIGH",
            host: "UK-PROD-WEB02",
            ip: "185.220.101.5",
            mitreTechnique: "T1110 (Brute Force)",
            kql: `SigninLogs\n| where IPAddress in (TorIPRange)\n| summarize FailureCount = countif(ResultType != 0) by UserPrincipalName, IPAddress\n| where FailureCount > 15`,
            remediation: "Multiple login failures detected originating from a known Tor exit node. Block the source IP at the Perimeter firewall to halt ongoing brute-forcing.",
            timestamp: null,
            contained: false
        },
        {
            id: "ALRT-108",
            title: "Webshell Spawning cmd.exe via IIS",
            source: "Microsoft Defender",
            severity: "CRITICAL",
            host: "UK-STAGE-APP01",
            ip: "192.168.42.108",
            mitreTechnique: "T1190 (Exploit Public-Facing Application)",
            kql: `DeviceProcessEvents\n| where InitiatingProcessFileName in~ ("w3wp.exe", "httpd.exe")\n| where ProcessCommandLine has_any ("cmd.exe", "powershell.exe", "whoami")`,
            remediation: "Web application server process spawned a command shell, indicating potential post-exploit web shell execution. Isolate server immediately.",
            timestamp: null,
            contained: false
        },
        {
            id: "ALRT-074",
            title: "Encoded PowerShell Execution",
            source: "Sysmon Logs",
            severity: "MEDIUM",
            host: "UK-CORP-LTP057",
            ip: "10.100.4.15",
            mitreTechnique: "T1059.001 (Command & Scripting: PowerShell)",
            kql: `DeviceProcessEvents\n| where ProcessCommandLine has_any ("-enc", "-encodedcommand")\n| where ProcessCommandLine matches regex @"[A-Za-z0-9+/]{50,}"`,
            remediation: "PowerShell executing with highly encoded command payload. Review raw Sysmon base64 decoded parameters in SIEM.",
            timestamp: null,
            contained: false
        }
    ];

    const incomingAlertPool = [
        {
            id: "ALRT-911",
            title: "DNS Tunneling Payload Exfiltration",
            source: "Palo Alto NGFW",
            severity: "HIGH",
            host: "UK-CORP-LTP812",
            ip: "10.100.22.47",
            mitreTechnique: "T1048.003 (Exfiltration Over Alternative Protocol)",
            kql: `CommonSecurityLog\n| where DeviceEventClassID == "dns-tunneling"\n| summarize RequestCount = count() by SourceIP, DestinationHostName\n| where RequestCount > 1000`,
            remediation: "Extremely high frequency of DNS requests querying malformed subdomains. Highly indicative of DNS tunneling for C2 exfiltration. Block destination domain and isolate client laptop.",
            contained: false
        },
        {
            id: "ALRT-805",
            title: "Kerberoasting SPN Request Anomaly",
            source: "Azure Sentinel",
            severity: "HIGH",
            host: "UK-AD-DC01",
            ip: "10.10.12.8",
            mitreTechnique: "T1558.003 (Steal or Acquire Tickets: Kerberoasting)",
            kql: `SecurityEvent\n| where EventID == 4769\n| where TicketOptions has "0x40810000" and TicketEncryptionType == 0x17\n| summarize count() by AccountName, IPAddress`,
            remediation: "An abnormal spike in Kerberos TGS requests for service principal names using weaker RC4 encryption. Investigate client user context and isolate host if necessary.",
            contained: false
        },
        {
            id: "ALRT-319",
            title: "Persistence RunKey Registry Addition",
            source: "Sysmon Logs",
            severity: "MEDIUM",
            host: "UK-CORP-LTP022",
            ip: "10.100.4.29",
            mitreTechnique: "T1547.001 (Registry Run Keys)",
            kql: `DeviceRegistryEvents\n| where RegistryKey has @"\\Microsoft\\Windows\\CurrentVersion\\Run"\n| where RegistryValueData has_any ("powershell.exe", "cmd.exe", "temp")`,
            remediation: "Suspicious application registered to run automatically on system boot. Inspect target registry path and delete malicious key payload.",
            contained: false
        },
        {
            id: "ALRT-662",
            title: "Phishing Attachment Macro Invocation",
            source: "Defender for Endpoint",
            severity: "HIGH",
            host: "UK-CORP-LTP114",
            ip: "10.100.12.91",
            mitreTechnique: "T1204.002 (User Execution: Malicious File)",
            kql: `DeviceProcessEvents\n| where InitiatingProcessFileName in~ ("excel.exe", "winword.exe")\n| where ProcessCommandLine has_any ("powershell.exe", "cmd.exe", "wscript.exe")`,
            remediation: "Office application spawned scripting host command line. Highly indicates phishing execution. Isolate corporate laptop immediately.",
            contained: false
        },
        {
            id: "ALRT-749",
            title: "Shadow Copy Deletion Attempt",
            source: "CrowdStrike Falcon",
            severity: "CRITICAL",
            host: "UK-PROD-SQL03",
            ip: "10.10.10.14",
            mitreTechnique: "T1490 (Inhibit System Recovery)",
            kql: `DeviceProcessEvents\n| where ProcessCommandLine has "vssadmin" and ProcessCommandLine has "delete" and ProcessCommandLine has "shadows"`,
            remediation: "Volume Shadow Copy deletion detected. Often associated with ransomware campaigns inhibiting recovery. Isolate high-value SQL server immediately.",
            contained: false
        }
    ];

    function initSOConsole() {
        const streamContainer = document.getElementById('live-alert-stream');
        const detailPane = document.getElementById('alert-detail-pane');
        const epsCounter = document.getElementById('eps-counter');
        const threatLevelText = document.getElementById('global-threat-level');

        if (!streamContainer || !detailPane) return;

        // Custom High-End Toast Notification Renderer
        function showToast(message, type = 'success') {
            let container = document.querySelector('.toast-container');
            if (!container) {
                container = document.createElement('div');
                container.className = 'toast-container';
                document.body.appendChild(container);
            }

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            
            let icon = 'fa-circle-check';
            if (type === 'error') icon = 'fa-triangle-exclamation';
            if (type === 'info') icon = 'fa-circle-info';

            toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
            container.appendChild(toast);

            setTimeout(() => toast.classList.add('show'), 50);

            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 4000);
        }

        function getFormattedTime(offsetSeconds = 0) {
            const d = new Date();
            if (offsetSeconds > 0) {
                d.setSeconds(d.getSeconds() - offsetSeconds);
            }
            const h = String(d.getHours()).padStart(2, '0');
            const m = String(d.getMinutes()).padStart(2, '0');
            const s = String(d.getSeconds()).padStart(2, '0');
            return `${h}:${m}:${s}`;
        }

        // Initialize alerts
        const activeAlerts = [...initialAlerts];
        activeAlerts[0].timestamp = getFormattedTime(120);
        activeAlerts[1].timestamp = getFormattedTime(480);
        activeAlerts[2].timestamp = getFormattedTime(900);
        activeAlerts[3].timestamp = getFormattedTime(1680);

        let selectedAlertId = null;

        function highlightKQL(query) {
            if (!query) return '';
            
            // Escape HTML
            let html = query
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

            // Highlight Comments first
            html = html.replace(/(\/\/.*)/g, `<span class="kql-comment">$1</span>`);

            // Split on HTML tags so we only highlight raw text segments
            const parts = html.split(/(<[^>]+>)/g);

            const keywords = ['where', 'project', 'summarize', 'by', 'and', 'or', 'has', 'has_any', 'in~', 'matches regex', 'countif', 'in'];
            const operators = ['==', '!=', '\\|', '&gt;', '&lt;', '&gt;=', '&lt;='];

            // Process only text parts (even indices are text, odd indices are HTML tags)
            for (let i = 0; i < parts.length; i += 2) {
                let txt = parts[i];
                if (!txt) continue;

                // Highlight Strings: "..." or '...'
                txt = txt.replace(/(".*?")/g, '<span class="kql-string">$1</span>');
                txt = txt.replace(/('.*?')/g, '<span class="kql-string">$1</span>');

                // Keywords
                keywords.forEach(keyword => {
                    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                    txt = txt.replace(regex, `<span class="kql-keyword">$&</span>`);
                });

                // Operators
                operators.forEach(op => {
                    const regex = new RegExp(op, 'g');
                    const actualOp = op.replace('\\', '');
                    txt = txt.replace(regex, `<span class="kql-operator">${actualOp}</span>`);
                });

                parts[i] = txt;
            }

            return parts.join('');
        }

        function renderStream() {
            streamContainer.innerHTML = '';
            activeAlerts.forEach(alert => {
                const row = document.createElement('div');
                row.className = `soc-alert-row ${selectedAlertId === alert.id ? 'active' : ''} ${alert.contained ? 'contained' : ''}`;
                row.dataset.id = alert.id;

                const isContained = alert.contained;
                
                row.innerHTML = `
                    <div class="flex items-center gap-3">
                        <span class="soc-severity-badge ${alert.severity.toLowerCase()}">${alert.severity}</span>
                        <div>
                            <h4 class="text-xs font-bold text-white font-mono">${alert.id} - ${alert.title}</h4>
                            <span class="text-[10px] text-slate-500 font-mono">${alert.source} • ${alert.host}</span>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] font-mono text-slate-400 block">${alert.timestamp}</span>
                        <span class="text-[9px] font-mono ${isContained ? 'text-red-400 bg-red-400/5 border border-red-500/20' : 'text-accent bg-accent/5 border border-accent/20'} px-1 py-0.5 rounded">
                            ${isContained ? 'CONTAINED' : 'OPEN'}
                        </span>
                    </div>
                `;

                row.addEventListener('click', () => {
                    selectAlert(alert.id);
                });

                streamContainer.appendChild(row);
            });
            updateMetrics();
        }

        function selectAlert(id) {
            selectedAlertId = id;
            
            const rows = streamContainer.querySelectorAll('.soc-alert-row');
            rows.forEach(r => {
                if (r.dataset.id === id) {
                    r.classList.add('active');
                } else {
                    r.classList.remove('active');
                }
            });

            const alert = activeAlerts.find(a => a.id === id);
            if (!alert) return;

            let actionsHTML = '';
            if (alert.contained) {
                actionsHTML = `
                    <div class="bg-red-500/10 border border-red-500/30 rounded-lg p-2 flex items-center justify-center gap-2 text-[10px] font-mono text-red-400 font-bold">
                        <i class="fa-solid fa-shield-halved"></i> INCIDENT CONTAINED
                    </div>
                `;
            } else {
                actionsHTML = `
                    <div class="flex gap-2">
                        <button id="btn-isolate" class="edr-btn edr-btn-isolate flex-1">
                            <i class="fa-solid fa-shield-halved"></i> Isolate Host
                        </button>
                        <button id="btn-block" class="edr-btn edr-btn-block flex-1">
                            <i class="fa-solid fa-ban"></i> Block IP
                        </button>
                    </div>
                    <button id="btn-fp" class="edr-btn edr-btn-fp w-full">
                        <i class="fa-solid fa-circle-check"></i> Mark Clean (False Positive)
                    </button>
                `;
            }

            detailPane.innerHTML = `
                <div class="space-y-4 animate-fade-in flex flex-col h-full">
                    <div>
                        <div class="flex items-center justify-between gap-2 mb-1">
                            <span class="text-xs font-mono font-bold text-accent">${alert.id}</span>
                            <span class="soc-severity-badge ${alert.severity.toLowerCase()}">${alert.severity}</span>
                        </div>
                        <h3 class="text-sm font-mono font-bold text-white leading-tight">${alert.title}</h3>
                        <p class="text-[10px] text-slate-500 font-mono mt-1">${alert.source} • Target: <span class="text-white font-semibold">${alert.host}</span> (${alert.ip})</p>
                    </div>

                    <div class="bg-white/5 p-2.5 rounded-lg border border-white/5 space-y-1.5">
                        <div class="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                            <i class="fa-solid fa-tag text-accent"></i>
                            <span>MITRE: <span class="text-white">${alert.mitreTechnique}</span></span>
                        </div>
                        <p class="text-[10px] text-slate-400 leading-normal">${alert.remediation}</p>
                    </div>

                    <div>
                        <span class="block text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-mono">Detection Query (KQL)</span>
                        <div class="kql-code-panel custom-scrollbar">
                            <pre class="m-0 whitespace-pre-wrap"><code class="font-mono text-[10px]">${highlightKQL(alert.kql)}</code></pre>
                        </div>
                    </div>

                    <div id="edr-remediation-actions" class="space-y-2 mt-auto">
                        ${actionsHTML}
                    </div>
                </div>
            `;

            const isolateBtn = detailPane.querySelector('#btn-isolate');
            const blockBtn = detailPane.querySelector('#btn-block');
            const fpBtn = detailPane.querySelector('#btn-fp');

            if (isolateBtn) {
                isolateBtn.addEventListener('click', () => isolateHostAction(alert));
            }
            if (blockBtn) {
                blockBtn.addEventListener('click', () => blockIPAction(alert));
            }
            if (fpBtn) {
                fpBtn.addEventListener('click', () => markFPAction(alert));
            }
        }

        async function playTerminalSequence(lines, container, onComplete) {
            container.innerHTML = '';
            const term = document.createElement('div');
            term.className = 'soc-terminal-sequence';
            container.appendChild(term);

            for (const line of lines) {
                const lineDiv = document.createElement('div');
                lineDiv.className = 'mb-1 text-[9px] font-mono leading-normal';
                term.appendChild(lineDiv);
                term.scrollTop = term.scrollHeight;

                if (line.startsWith('[API]') || line.startsWith('[SENSOR]') || line.startsWith('[FIREWALL]')) {
                    lineDiv.innerHTML = `<span class="text-blue-400">${line.substring(0, line.indexOf(']') + 1)}</span>${line.substring(line.indexOf(']') + 1)}`;
                } else if (line.startsWith('[STATUS]') || line.startsWith('[SYSTEM]')) {
                    lineDiv.innerHTML = `<span class="text-accent">${line.substring(0, line.indexOf(']') + 1)}</span>${line.substring(line.indexOf(']') + 1)}`;
                } else if (line.startsWith('[ERROR]') || line.startsWith('[ALERT]')) {
                    lineDiv.innerHTML = `<span class="text-red-400">${line.substring(0, line.indexOf(']') + 1)}</span>${line.substring(line.indexOf(']') + 1)}`;
                } else {
                    lineDiv.textContent = line;
                }

                await new Promise(resolve => setTimeout(resolve, Math.random() * 150 + 150));
            }

            if (onComplete) onComplete();
        }

        function isolateHostAction(alert) {
            const container = detailPane.querySelector('#edr-remediation-actions');
            if (!container) return;

            const consoleLines = [
                `[SYSTEM] Initiating EDR Isolation API request...`,
                `[API] Connecting to CrowdStrike Falcon Cloud API (eu-west-1)...`,
                `[API] SSL/TLS Negotiation: SUCCESS (AES-256)`,
                `[API] Target Device: ${alert.host} (${alert.ip})`,
                `[API] Token verified: OK`,
                `[SYSTEM] CrowdStrike EDR isolation triggered...`,
                `[SENSOR] Communicating with Falcon Agent v7.24...`,
                `[SENSOR] Flushing network tables...`,
                `[SENSOR] Applying isolation policies: BLOCK_INBOUND | BLOCK_OUTBOUND`,
                `[SENSOR] Custom exceptions: SIEM Collector (443)`,
                `[STATUS] System ${alert.host} network adapter ISOLATED.`,
                `[SYSTEM] EDR Isolation confirmed. Updating alert state.`
            ];

            playTerminalSequence(consoleLines, container, () => {
                alert.contained = true;
                showToast(`Host ${alert.host} has been successfully isolated via CrowdStrike EDR.`, "success");
                renderStream();
                selectAlert(alert.id);
            });
        }

        function blockIPAction(alert) {
            const container = detailPane.querySelector('#edr-remediation-actions');
            if (!container) return;

            const consoleLines = [
                `[SYSTEM] Connecting to Palo Alto Panorama Firewall Policy Manager...`,
                `[API] Connecting to firewall API (10.10.10.1)...`,
                `[API] Authentication: SECURE_TOKEN_ACCEPTED`,
                `[API] sent command: POST /config/devices/DynamicBlockList`,
                `[SYSTEM] Updating Perimeter rule block tables...`,
                `[FIREWALL] Ingesting dynamic block object: ${alert.ip}`,
                `[FIREWALL] Pushing block rule set to all regional edges...`,
                `[FIREWALL] Commit state: 100% SUCCESS`,
                `[STATUS] IP address ${alert.ip} blocked at Perimeter.`,
                `[SYSTEM] Firewall mitigation confirmed. Updating alert state.`
            ];

            playTerminalSequence(consoleLines, container, () => {
                alert.contained = true;
                showToast(`IP Address ${alert.ip} successfully blocked at Perimeter firewall.`, "success");
                renderStream();
                selectAlert(alert.id);
            });
        }

        function markFPAction(alert) {
            alert.contained = true;
            showToast(`Alert ${alert.id} marked as False Positive. Closing threat ticket.`, "info");
            renderStream();
            selectAlert(alert.id);
        }

        function updateMetrics() {
            const openAlerts = activeAlerts.filter(a => !a.contained);
            const criticalOpen = openAlerts.filter(a => !a.contained && a.severity === 'CRITICAL').length;
            const highOpen = openAlerts.filter(a => !a.contained && a.severity === 'HIGH').length;

            if (threatLevelText) {
                if (criticalOpen > 0) {
                    threatLevelText.textContent = "CRITICAL (SEV-1)";
                    threatLevelText.className = "text-xs font-mono text-red-500 font-semibold";
                } else if (highOpen > 0) {
                    threatLevelText.textContent = "ELEVATED (SEV-2)";
                    threatLevelText.className = "text-xs font-mono text-yellow-500 font-semibold";
                } else if (openAlerts.length > 0) {
                    threatLevelText.textContent = "MEDIUM (SEV-3)";
                    threatLevelText.className = "text-xs font-mono text-amber-400 font-semibold";
                } else {
                    threatLevelText.textContent = "NORMAL (SEV-5)";
                    threatLevelText.className = "text-xs font-mono text-accent font-semibold";
                }
            }
        }

        if (epsCounter) {
            setInterval(() => {
                const currentEPS = (Math.random() * (58.2 - 42.5) + 42.5).toFixed(1);
                epsCounter.textContent = currentEPS;
            }, 1500);
        }

        // Live Log Feed Streaming
        let alertIndex = 0;
        setInterval(() => {
            if (alertIndex >= incomingAlertPool.length) alertIndex = 0;
            
            const alertModel = incomingAlertPool[alertIndex];
            
            if (!activeAlerts.some(a => a.id === alertModel.id)) {
                const newAlert = {
                    ...alertModel,
                    timestamp: getFormattedTime(0),
                    contained: false
                };

                activeAlerts.unshift(newAlert);
                
                if (activeAlerts.length > 8) {
                    activeAlerts.pop();
                }

                renderStream();
                showToast(`NEW SIEM ALERT: ${newAlert.id} - ${newAlert.title}`, "error");
                
                if (!selectedAlertId) {
                    selectAlert(newAlert.id);
                }
            }
            alertIndex++;
        }, 14000);

        // Pre-select first alert on load
        renderStream();
        if (activeAlerts.length > 0) {
            selectAlert(activeAlerts[0].id);
        }
    }

    initSOConsole();
});
