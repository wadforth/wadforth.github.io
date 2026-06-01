// EML Sentinel - Core Parser Engine

document.addEventListener('DOMContentLoaded', () => {
    // === 1. DOM Elements ===
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const threatDial = document.getElementById('threat-dial');
    const threatScore = document.getElementById('threat-score');
    const threatBadge = document.getElementById('threat-badge');
    
    // Banners & Stats
    const statVerdict = document.getElementById('stat-verdict');
    const statVerdictIcon = document.getElementById('stat-verdict-icon');
    const statSpf = document.getElementById('stat-spf');
    const statSpfIcon = document.getElementById('stat-spf-icon');
    const statDkim = document.getElementById('stat-dkim');
    const statDkimIcon = document.getElementById('stat-dkim-icon');
    const statDmarc = document.getElementById('stat-dmarc');
    const statDmarcIcon = document.getElementById('stat-dmarc-icon');
    
    const bannerTitle = document.getElementById('banner-title');
    const bannerSubtitle = document.getElementById('banner-subtitle');
    const mainVerdictBanner = document.getElementById('main-verdict-banner');
    const bannerIcon = document.getElementById('banner-icon');
    const btnViewEmail = document.getElementById('btn-view-email');
    const btnViewRaw = document.getElementById('btn-view-raw');

    // Telemetry Grid
    const valSender = document.getElementById('val-sender');
    const valSubject = document.getElementById('val-subject');
    const valReturn = document.getElementById('val-return');
    const valReply = document.getElementById('val-reply');
    const valMsgid = document.getElementById('val-msgid');
    
    const indicatorsContainer = document.getElementById('indicators-container');
    const assetsTableBody = document.getElementById('assets-table-body');
    const rawEmlView = document.getElementById('raw-eml-view');
    const emailPreviewBody = document.getElementById('email-preview-body');

    // === 2. Global State ===
    let threatResultScore = 0;
    let currentRawEML = '';

    // === 3. Preloaded Mock Scenarios ===
    const scenarios = {
        legitimate: `Delivered-To: info@mycompany.com\r\nReceived: from mail.citibank.com (mail.citibank.com [192.193.194.5])\r\nReceived-SPF: pass (citibank.com designates 192.193.194.5 as permitted sender)\r\nAuthentication-Results: mx.google.com; spf=pass; dkim=pass; dmarc=pass\r\nDKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=citibank.com; s=citi2026;\r\nMessage-ID: <CITI-ALERT-892347209-2026@citibank.com>\r\nFrom: "Citi Alerts" <alerts@citibank.com>\r\nTo: <info@mycompany.com>\r\nSubject: Citibank Alert: Authorized Account Sign-in Detected\r\nDate: Sun, 31 May 2026 12:45:00 -0400\r\nReturn-Path: <alerts@citibank.com>\r\nReply-To: <alerts@citibank.com>\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n<html><body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; color: #333;"><div style="background-color: white; padding: 30px; border-radius: 8px; border: 1px solid #ddd; max-width: 600px; margin: 0 auto;"><h2 style="color: #00457C; margin-top: 0;">Authorized Sign-in Detected</h2><p>Dear Customer, a successful sign-in occurred on your Citi Account.</p><p style="margin: 25px 0; text-align: center;"><a href="https://online.citibank.com/US/Welcome.c" style="background-color: #0079C1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Verify Citi Dashboard</a></p></div></body></html>`,
        
        phishing: `Delivered-To: info@mycompany.com\r\nReceived: from mail.netflix-billing-support.gq (mail.netflix-billing-support.gq [103.20.194.14])\r\nReceived-SPF: softfail (google.com: domain of billing-alert@netflix-billing-support.gq does not designate 103.20.194.14 as permitted sender)\r\nAuthentication-Results: mx.google.com; spf=softfail; dkim=none; dmarc=fail\r\nMessage-ID: <NETFLIX-ALERT-8923-2026@netflix-billing-support.gq>\r\nFrom: "Netflix Billing Support" <no-reply@netflix.com>\r\nTo: <info@mycompany.com>\r\nSubject: URGENT: Suspended Account Notice - Immediate Action Required!\r\nDate: Sun, 31 May 2026 14:12:00 -0400\r\nReturn-Path: <billing-alert@netflix-billing-support.gq>\r\nReply-To: <netflix-billing-support-department@gmail.com>\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n<html><body style="font-family: Helvetica, Arial, sans-serif; background-color: #141414; color: #ffffff; padding: 20px;"><div style="background-color: #000000; padding: 40px; border-radius: 6px; border-top: 4px solid #E50914; max-width: 500px; margin: 0 auto; border: left: 1px solid #222; border-right: 1px solid #222; border-bottom: 1px solid #222;"><h2 style="color: #E50914; font-size: 22px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase;">Suspended Account Notice</h2><p style="color: #cccccc; font-size: 13px; line-height: 22px;">Dear Netflix Customer, we were unable to process your subscription renewal charge for this month. As a result, your account has been temporarily <b>SUSPENDED</b>.</p><p style="margin: 30px 0; text-align: center;"><a href="http://netflix-billing-verification.com/login" style="background-color: #E50914; color: #ffffff; padding: 12px 30px; text-decoration: none; font-weight: bold; border-radius: 2px; display: inline-block; font-size: 13px;">https://netflix.com/login</a></p></div></body></html>`,
        
        malware: `Delivered-To: info@mycompany.com\r\nReceived: from mail.fedex-couriers-alert.click (mail.fedex-couriers-alert.click [185.190.140.22])\r\nReceived-SPF: fail\r\nAuthentication-Results: mx.google.com; spf=fail; dkim=none; dmarc=fail\r\nMessage-ID: <FEDEX-PACKAGE-ID-9284729@fedex-couriers-alert.click>\r\nFrom: "FedEx Express Shipping" <delivery@fedex.com>\r\nTo: <info@mycompany.com>\r\nSubject: [SPAM] ACTION REQUIRED: Package Delivery ID-9284729 Failed - Invoice Receipt Attached\r\nDate: Sun, 31 May 2026 15:30:00 -0400\r\nReturn-Path: <shipping-dept@fedex-couriers-alert.click>\r\nReply-To: <delivery-support-express@fedex-couriers-alert.click>\r\nContent-Type: multipart/mixed; boundary="----=_Part_92847"\r\n\r\n------=_Part_92847\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n<html><body><p>Dear Customer, our FedEx courier attempted a home delivery of your package <b>ID-9284729</b>. A package invoice has been compiled and attached. Grab yours now!</p></body></html>\r\n------=_Part_92847\r\nContent-Type: application/vnd.ms-office.activemacro; name="FedEx_Receipt.docm"\r\nContent-Disposition: attachment; filename="FedEx_Receipt.docm"\r\n\r\nMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTEx\r\n------=_Part_92847\r\nContent-Type: application/octet-stream; name="invoice_details.pdf.exe"\r\nContent-Disposition: attachment; filename="invoice_details.pdf.exe"\r\n\r\nMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy\r\n------=_Part_92847--`
    };

    window.injectScenario = function(type) {
        const rawEml = scenarios[type];
        if (rawEml) {
            analyzeRawEML(rawEml);
        }
    };

    // === 4. Drag & Drop Upload Handlers ===
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--accent-blue)';
        dropZone.style.background = 'rgba(59, 130, 246, 0.05)';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border)';
        dropZone.style.background = 'var(--bg-hover)';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border)';
        dropZone.style.background = 'var(--bg-hover)';
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });

    function handleFile(file) {
        if (!file.name.endsWith('.eml')) {
            alert('Please upload a valid .eml file');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            analyzeRawEML(e.target.result);
        };
        reader.readAsText(file);
    }

    // === 5. Parsing Logic ===
    function parseEMLHeaders(rawText) {
        const headers = {};
        const lines = rawText.split(/\r?\n/);
        let currentHeader = '';
        let headerBlock = true;
        let bodyLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (headerBlock) {
                if (line === '') { headerBlock = false; continue; }
                if (line.startsWith('\t') || line.startsWith(' ')) {
                    if (currentHeader) headers[currentHeader] += ' ' + line.trim();
                } else {
                    const match = line.match(/^([a-zA-Z0-9\-]+):\s*(.*)$/);
                    if (match) {
                        currentHeader = match[1].toLowerCase();
                        headers[currentHeader] = headers[currentHeader] ? headers[currentHeader] + '\n' + match[2].trim() : match[2].trim();
                    } else {
                        currentHeader = '';
                    }
                }
            } else {
                bodyLines.push(line);
            }
        }
        return { headers, body: bodyLines.join('\n') };
    }

    function parseAuthHeader(headers, type) {
        const authResults = (headers['authentication-results'] || '').toLowerCase();
        const spfHeaderRaw = (headers['received-spf'] || '');
        const spfHeader = spfHeaderRaw.toLowerCase();
        
        if (type === 'spf') {
            let status = 'NONE';
            if (authResults.includes('spf=pass') || spfHeader.includes('pass')) status = 'PASS';
            else if (authResults.includes('spf=fail') || spfHeader.includes('fail')) status = 'FAIL';
            else if (authResults.includes('spf=softfail') || spfHeader.includes('softfail')) status = 'SOFTFAIL';
            
            let details = spfHeaderRaw ? spfHeaderRaw.trim() : 'No Received-SPF header found.';
            return { status, details };
        }
        if (type === 'dkim') {
            let status = 'NONE';
            if (authResults.includes('dkim=pass')) status = 'PASS';
            else if (authResults.includes('dkim=fail')) status = 'FAIL';
            
            // Extract details from Authentication-Results
            let details = 'No DKIM signatures verified.';
            const match = authResults.match(/dkim=(fail|pass|none)[^;]*(reason="[^"]+"|reason=[^\s;]+)?[^;]*/);
            if (match) {
                details = match[0].trim();
            } else if (headers['dkim-signature']) {
                details = 'DKIM-Signature present, but not validated by receiving server.';
            }
            return { status, details };
        }
        if (type === 'dmarc') {
            let status = 'NONE';
            if (authResults.includes('dmarc=pass')) status = 'PASS';
            else if (authResults.includes('dmarc=fail')) status = 'FAIL';
            
            let details = 'No DMARC policy evaluated.';
            const match = authResults.match(/dmarc=(fail|pass|none)[^;]*/);
            if (match) {
                details = match[0].trim();
            }
            return { status, details };
        }
        return { status: 'NONE', details: '' };
    }

    function getDomainFromEmail(email) {
        const match = email.match(/@([a-zA-Z0-9.-]+)/);
        return match ? match[1].toLowerCase() : '';
    }

    function getBaseDomain(domain) {
        const parts = domain.split('.');
        if (parts.length > 2) return parts.slice(-2).join('.');
        return domain;
    }

    // === 6. Forensic Indicators Engine ===
    function runForensicIndicators(headers, bodyText, rawText) {
        const indicators = [];
        const bodyContentLower = bodyText.toLowerCase();

        const sender = headers['from'] || '';
        const returnPath = headers['return-path'] || '';
        const replyTo = headers['reply-to'] || '';
        const subject = headers['subject'] || '';
        const senderDomain = getDomainFromEmail(sender);
        
        const spf = parseAuthHeader(headers, 'spf');
        const dkim = parseAuthHeader(headers, 'dkim');
        const dmarc = parseAuthHeader(headers, 'dmarc');

        // 1. Gateway Tags
        const subjectLower = subject.toLowerCase();
        const spamTags = ['[spam]', 'spam:', '[phish]', '[suspicious]', '[bulk]'];
        const foundTag = spamTags.find(tag => subjectLower.includes(tag));
        if (foundTag) {
            indicators.push({ level: 'high', category: 'Security Gateway Tag', title: `Subject contains "${foundTag.toUpperCase()}"`, desc: `An upstream security gateway explicitly tagged this email as suspicious.` });
        }

        // 2. Auth Failures
        if (spf.status === 'FAIL' || dmarc.status === 'FAIL') {
            indicators.push({ level: 'high', category: 'Unverified Identity', title: 'Authentication Forgery', desc: `The sender's domain explicitly rejected the sending server's IP via SPF/DMARC alignment.` });
        } else if (spf.status === 'NONE') {
            indicators.push({ level: 'medium', category: 'Weak Authentication', title: 'Missing SPF Record', desc: `The sending server lacks an SPF record, making it highly vulnerable to spoofing.` });
        }

        if (dkim.status === 'NONE') {
            indicators.push({ level: 'medium', category: 'Weak Authentication', title: 'Missing DKIM Signature', desc: `No cryptographic signature found. The email content could have been altered in transit.` });
        }

        // 3. Domain Spoofing
        if (returnPath && getBaseDomain(getDomainFromEmail(returnPath)) !== getBaseDomain(senderDomain)) {
            indicators.push({ level: 'high', category: 'Mismatched Return-Path', title: 'Bounce Routing Anomaly', desc: `The visual "From" domain does not match the underlying bounce routing domain.` });
        }

        if (replyTo && getBaseDomain(getDomainFromEmail(replyTo)) !== getBaseDomain(senderDomain)) {
            indicators.push({ level: 'medium', category: 'External Reply-To', title: 'Deceptive Reply Channel', desc: `Replies are routed to a completely different domain than the sender.` });
        }

        // 4. Heuristic Spam Dictionary
        const spamDict = ['grab yours', 'limited first run', 'urgent action', 'suspend your account', 'verify your account', 'invoice receipt', 'password expiration', 'billing failed', 'wire transfer'];
        spamDict.forEach(phrase => {
            if (bodyContentLower.includes(phrase) || subjectLower.includes(phrase)) {
                indicators.push({ level: 'medium', category: 'Phishing Heuristics', title: `Suspicious Phrase: "${phrase}"`, desc: `The message uses known psychological manipulation tactics or urgency keywords.` });
            }
        });

        // 5. Lookalike Brand / Low Quality TLD
        const badTLDs = ['.gq', '.cf', '.tk', '.ml', '.ga', '.top', '.click', '.bid', '.xyz'];
        badTLDs.forEach(tld => {
            if (senderDomain.endsWith(tld)) {
                indicators.push({ level: 'medium', category: 'High-Risk TLD', title: `Disposable Domain Extension (${tld})`, desc: `The sender domain ends in a low-cost or disposable registration extension often abused by scammers.` });
            }
        });

        // 6. Attachment Executables
        const dangerousExts = ['.exe', '.scr', '.bat', '.js', '.vbs', '.docm'];
        const attachments = extractAttachments(rawText);
        attachments.forEach(a => {
            dangerousExts.forEach(ext => {
                if (a.filename.toLowerCase().endsWith(ext)) {
                    indicators.push({ level: 'high', category: 'Malware Payload', title: `Dangerous Attachment: ${ext.toUpperCase()}`, desc: `The email carries a potentially malicious executable or macro-enabled document '${a.filename}'.` });
                }
            });
        });

        // 7. HTML Forms
        if (bodyContentLower.includes('<form') && (bodyContentLower.includes('password') || bodyContentLower.includes('credit'))) {
            indicators.push({ level: 'high', category: 'Embedded Form', title: 'Credential Theft Form Embedded', desc: `The email body requests sensitive credentials directly inside the message.` });
        }

        return { indicators, attachments };
    }

    function extractAttachments(rawText) {
        const attachments = [];
        const lines = rawText.split(/\r?\n/);
        let inAttachment = false;
        let filename = '';
        
        for (let line of lines) {
            const dispMatch = line.match(/Content-Disposition:\s*attachment;\s*filename=["']?(.*?)["']?/i);
            if (dispMatch) {
                filename = dispMatch[1];
                inAttachment = true;
                attachments.push({ filename, type: 'Binary', hash: 'SHA256: ' + Math.random().toString(16).substr(2, 8).toUpperCase() });
            }
        }
        return attachments;
    }

    function extractLinks(bodyHtml) {
        const links = [];
        const regex = /<a\s+[^>]*href=["'](http[^"']+)["'][^>]*>(.*?)<\/a>/gi;
        let match;
        while ((match = regex.exec(bodyHtml)) !== null) {
            links.push({ url: match[1], label: match[2].replace(/<[^>]+>/g, '').trim() });
        }
        return links;
    }

    // === 7. DOM Rendering & Orchestration ===
    function analyzeRawEML(rawText) {
        currentRawEML = rawText;
        const { headers, body } = parseEMLHeaders(rawText);
        
        const sender = headers['from'] || 'Unknown';
        const subject = headers['subject'] || 'No Subject';
        const date = headers['date'] || 'Unknown Date';
        const returnPath = headers['return-path'] || 'Not Set';
        const replyTo = headers['reply-to'] || 'Not Set';
        const msgId = headers['message-id'] || 'Not Set';

        const spf = parseAuthHeader(headers, 'spf');
        const dkim = parseAuthHeader(headers, 'dkim');
        const dmarc = parseAuthHeader(headers, 'dmarc');

        // Extract and analyze
        const { indicators, attachments } = runForensicIndicators(headers, body, rawText);
        const links = extractLinks(body);

        // Calculate score
        threatResultScore = 0;
        indicators.forEach(ind => {
            if (ind.level === 'high') threatResultScore += 35;
            if (ind.level === 'medium') threatResultScore += 15;
            if (ind.level === 'low') threatResultScore += 5;
        });
        if (threatResultScore > 100) threatResultScore = 100;

        // Render Stats
        statSpf.textContent = spf.status;
        statSpfIcon.className = `stat-icon ${spf.status === 'PASS' ? 'green' : spf.status === 'FAIL' ? 'danger' : 'blue'}`;
        
        statDkim.textContent = dkim.status;
        statDkimIcon.className = `stat-icon ${dkim.status === 'PASS' ? 'green' : dkim.status === 'FAIL' ? 'danger' : 'blue'}`;
        
        statDmarc.textContent = dmarc.status;
        statDmarcIcon.className = `stat-icon ${dmarc.status === 'PASS' ? 'green' : dmarc.status === 'FAIL' ? 'danger' : 'blue'}`;
        
        // Detailed Telemetry View
        document.getElementById('auth-spf-detail').textContent = spf.details;
        document.getElementById('auth-dkim-detail').textContent = dkim.details;
        document.getElementById('auth-dmarc-detail').textContent = dmarc.details;
        
        const isMalicious = threatResultScore >= 70;
        const isWarn = threatResultScore >= 30 && threatResultScore < 70;
        
        statVerdict.textContent = isMalicious ? 'Malicious' : isWarn ? 'Suspicious' : 'Clean';
        statVerdictIcon.className = `stat-icon ${isMalicious ? 'danger' : isWarn ? 'warn' : 'green'}`;
        statVerdictIcon.innerHTML = isMalicious ? '<i class="fa-solid fa-skull"></i>' : isWarn ? '<i class="fa-solid fa-triangle-exclamation"></i>' : '<i class="fa-solid fa-shield-check"></i>';

        // Render Dial
        threatScore.textContent = threatResultScore;
        const offset = 251.2 - (threatResultScore / 100) * 251.2;
        threatDial.style.strokeDashoffset = offset;
        threatDial.style.stroke = isMalicious ? 'var(--threat-danger)' : isWarn ? 'var(--threat-warn)' : 'var(--threat-clean)';
        
        threatBadge.textContent = isMalicious ? 'MALICIOUS THREAT' : isWarn ? 'SUSPICIOUS SENDER' : 'CLEAN & SAFE';
        threatBadge.className = `badge mt-4 mb-4 ${isMalicious ? 'badge-danger' : isWarn ? 'badge-warn' : 'badge-clean'}`;

        // Banner
        mainVerdictBanner.className = `verdict-banner ${isMalicious ? 'danger' : isWarn ? 'warn' : 'clean'}`;
        bannerTitle.textContent = isMalicious ? 'Critical Threat Blocked' : isWarn ? 'Suspicious Indicators Found' : 'Email Validated Securely';
        bannerSubtitle.textContent = isMalicious ? 'This email contains dangerous payloads or forged identities. Do not interact.' : isWarn ? 'Caution advised. Proceed carefully.' : 'All authentication protocols pass.';
        bannerIcon.className = `stat-icon ${isMalicious ? 'danger' : isWarn ? 'warn' : 'green'}`;
        bannerIcon.innerHTML = isMalicious ? '<i class="fa-solid fa-xmark"></i>' : isWarn ? '<i class="fa-solid fa-exclamation"></i>' : '<i class="fa-solid fa-check"></i>';
        
        btnViewEmail.style.display = 'inline-flex';
        btnViewRaw.style.display = 'inline-flex';

        // Telemetry Grid
        valSender.textContent = sender.replace(/[<>"']/g, '');
        valSubject.textContent = subject;
        valReturn.textContent = returnPath.replace(/[<>"']/g, '');
        valReply.textContent = replyTo.replace(/[<>"']/g, '');
        valMsgid.textContent = msgId.replace(/[<>"']/g, '');

        // Indicators List
        indicatorsContainer.innerHTML = '';
        if (indicators.length === 0) {
            indicatorsContainer.innerHTML = `<div class="text-center py-5 text-muted text-sm italic">No threat indicators found.</div>`;
        } else {
            indicators.sort((a,b) => (a.level === 'high' ? -1 : 1)).forEach(ind => {
                indicatorsContainer.innerHTML += `
                    <div class="indicator-card ${ind.level}">
                        <div class="mt-1" style="color: var(--threat-${ind.level === 'high' ? 'danger' : ind.level === 'medium' ? 'warn' : 'clean'})">
                            <i class="fa-solid ${ind.level === 'high' ? 'fa-triangle-exclamation' : 'fa-info-circle'}"></i>
                        </div>
                        <div>
                            <div class="text-sm font-600" style="color: var(--text-main);">${ind.title}</div>
                            <div class="text-xs text-secondary mt-1">${ind.desc}</div>
                        </div>
                    </div>
                `;
            });
        }

        // Assets Table (Links & Attachments)
        assetsTableBody.innerHTML = '';
        if (links.length === 0 && attachments.length === 0) {
            assetsTableBody.innerHTML = `<tr><td colspan="3" class="text-center text-muted text-sm italic py-4">No links or attachments found.</td></tr>`;
        } else {
            attachments.forEach(a => {
                const isDanger = a.filename.match(/\.(exe|js|vbs|docm|scr|bat)$/i);
                assetsTableBody.innerHTML += `
                    <tr>
                        <td><span class="badge badge-gray"><i class="fa-solid fa-paperclip"></i> File</span></td>
                        <td class="font-mono text-xs">${a.filename}</td>
                        <td>${isDanger ? '<span class="badge badge-danger">MALWARE</span>' : '<span class="badge badge-clean">OK</span>'}</td>
                    </tr>
                `;
            });
            links.forEach(l => {
                assetsTableBody.innerHTML += `
                    <tr>
                        <td><span class="badge badge-gray"><i class="fa-solid fa-link"></i> Link</span></td>
                        <td class="font-mono text-xs">${l.url}</td>
                        <td><span class="badge badge-warn">UNVERIFIED</span></td>
                    </tr>
                `;
            });
        }

        // Modals Data
        rawEmlView.textContent = rawText;
        emailPreviewBody.innerHTML = body.replace(/<\/?(html|body|head)[^>]*>/gi, '').trim();
    }

    // Modal Handling
    window.openRawModal = function() {
        document.getElementById('modal-raw').classList.add('active');
    };
    
    window.openEmailModal = function() {
        document.getElementById('modal-email').classList.add('active');
    };

    window.closeModals = function() {
        document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
    };

    window.toggleTheme = function() {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        document.getElementById('theme-btn-text').textContent = isDark ? 'Light Mode' : 'Dark Mode';
    };
});
