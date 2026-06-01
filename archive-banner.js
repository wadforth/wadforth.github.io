/**
 * Archive Warning Banner
 * Dynamically injected into archived projects to warn visitors of deprecation/broken backends.
 */
function initArchiveBanner() {
    // 1. Prevent displaying if already dismissed in this session
    if (sessionStorage.getItem('archive_banner_dismissed') === 'true') {
        return;
    }

    // 2. Load FontAwesome and Google Fonts if not already present
    if (!document.querySelector('link[href*="font-awesome"]')) {
        const fa = document.createElement('link');
        fa.rel = 'stylesheet';
        fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        document.head.appendChild(fa);
    }
    if (!document.querySelector('link[href*="fonts.googleapis.com"]')) {
        const font = document.createElement('link');
        font.rel = 'preconnect';
        font.href = 'https://fonts.googleapis.com';
        const font2 = document.createElement('link');
        font2.rel = 'preconnect';
        font2.href = 'https://fonts.gstatic.com';
        font2.crossOrigin = 'anonymous';
        const font3 = document.createElement('link');
        font3.rel = 'stylesheet';
        font3.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap';
        document.head.appendChild(font);
        document.head.appendChild(font2);
        document.head.appendChild(font3);
    }

    // 3. Inject Warning Banner CSS
    const style = document.createElement('style');
    style.textContent = `
        .archive-warning-banner {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 999999;
            background: rgba(15, 12, 10, 0.95);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-bottom: 2px solid #eab308;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(234, 179, 8, 0.05);
            padding: 12px 24px;
            font-family: 'JetBrains Mono', 'Inter', monospace, sans-serif;
            color: #f1f5f9;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            animation: bannerSlideDown 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            transition: all 0.3s ease;
        }

        .archive-banner-content {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
        }

        .archive-banner-icon {
            font-size: 1.25rem;
            color: #eab308;
            animation: archivePulse 2s infinite ease-in-out;
            flex-shrink: 0;
        }

        .archive-banner-text {
            font-size: 13px;
            line-height: 1.5;
            color: #cbd5e1;
        }

        .archive-banner-title {
            color: #eab308;
            font-weight: 700;
            margin-right: 6px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .archive-banner-actions {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-shrink: 0;
        }

        .archive-banner-btn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(234, 179, 8, 0.3);
            color: #eab308;
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            text-decoration: none !important;
            transition: all 0.2s ease;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .archive-banner-btn:hover {
            background: rgba(234, 179, 8, 0.15);
            border-color: #eab308;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(234, 179, 8, 0.1);
        }

        .archive-banner-dismiss {
            background: transparent;
            border: none;
            color: #94a3b8;
            font-size: 16px;
            cursor: pointer;
            padding: 6px;
            border-radius: 4px;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .archive-banner-dismiss:hover {
            color: #f1f5f9;
            background: rgba(255, 255, 255, 0.05);
        }

        body {
            /* Push page down to make room for banner */
            margin-top: 58px !important;
        }

        @keyframes bannerSlideDown {
            from { transform: translateY(-100%); }
            to { transform: translateY(0); }
        }

        @keyframes archivePulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.8; }
        }

        @media (max-width: 768px) {
            .archive-warning-banner {
                flex-direction: column;
                align-items: stretch;
                padding: 14px 16px;
            }
            .archive-banner-actions {
                justify-content: flex-end;
                margin-top: 4px;
            }
            body {
                margin-top: 105px !important;
            }
        }
    `;
    document.head.appendChild(style);

    // 4. Create and Ingest Banner HTML
    const banner = document.createElement('div');
    banner.className = 'archive-warning-banner';
    banner.innerHTML = `
        <div class="archive-banner-content">
            <i class="fa-solid fa-box-archive archive-banner-icon"></i>
            <div class="archive-banner-text">
                <span class="archive-banner-title">Archived Project</span> 
                This project is no longer actively maintained. Dynamic features (especially Netlify/backend integrations) have been removed or may be broken.
            </div>
        </div>
        <div class="archive-banner-actions">
            <a href="/" class="archive-banner-btn">
                <i class="fa-solid fa-arrow-left"></i> Main Portfolio
            </a>
            <button class="archive-banner-dismiss" aria-label="Dismiss">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    `;

    // 5. Append banner to body
    document.body.prepend(banner);

    // 6. Hook up the close action
    const dismissBtn = banner.querySelector('.archive-banner-dismiss');
    dismissBtn.addEventListener('click', () => {
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(-100%)';
        // Reset body margin back to original
        document.body.style.marginTop = '';
        setTimeout(() => {
            banner.remove();
        }, 300);
        sessionStorage.setItem('archive_banner_dismissed', 'true');
    });
}

// 7. Initialize based on readyState to ensure it triggers immediately or at DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initArchiveBanner);
} else {
    initArchiveBanner();
}
