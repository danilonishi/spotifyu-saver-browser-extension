const BRIDGE_READY_MESSAGE = 'SPOTIFY_SAVER_HANDOFF_BRIDGE_READY';
const COMPLETE_HANDOFF_MESSAGE = 'SPOTIFY_SAVER_HANDOFF_COMPLETE';
const RESIZE_HANDOFF_MESSAGE = 'SPOTIFY_SAVER_HANDOFF_RESIZE';

async function initializeHandoffBridge() {
    try {
        const response = await chrome.runtime.sendMessage({
            type: BRIDGE_READY_MESSAGE,
            version: 1
        });
        if (!response?.enabled || response.origin !== window.location.origin) {
            return;
        }

        listenForCompletion(response.origin);
        observePanelSize(response.origin);
    } catch (error) {
        console.error('Could not initialize Spotify Saver handoff bridge:', error);
    }
}

function listenForCompletion(expectedOrigin) {
    let sent = false;
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (sent ||
            event.source !== window ||
            event.origin !== expectedOrigin ||
            !data ||
            typeof data !== 'object' ||
            Array.isArray(data) ||
            Object.keys(data).length !== 3 ||
            data.source !== 'spotify-saver' ||
            data.type !== 'download-queued' ||
            data.version !== 1) {
            return;
        }

        sent = true;
        chrome.runtime.sendMessage({
            type: COMPLETE_HANDOFF_MESSAGE,
            version: 1,
            source: 'spotify-saver',
            origin: event.origin
        }).catch((error) => {
            console.error('Could not report Spotify Saver handoff completion:', error);
        });
    });
}

function observePanelSize(expectedOrigin) {
    let lastSize = '';
    let observedPanel = null;
    let resizeScheduled = false;
    const panelObserver = new ResizeObserver(scheduleResize);
    const contentObserver = new MutationObserver(scheduleResize);

    function scheduleResize() {
        if (resizeScheduled) {
            return;
        }

        resizeScheduled = true;
        requestAnimationFrame(() => {
            resizeScheduled = false;
            resizePanel();
        });
    }

    function resizePanel() {
        if (!document.body?.classList.contains('download-handoff-mode')) {
            return;
        }

        const panel = document.getElementById('download-settings-panel');
        if (!panel) {
            return;
        }

        if (panel !== observedPanel) {
            observedPanel = panel;
            panelObserver.observe(panel);
        }

        const bounds = panel.getBoundingClientRect();
        const frameWidth = Math.max(0, window.outerWidth - window.innerWidth);
        const frameHeight = Math.max(0, window.outerHeight - window.innerHeight);
        const measuredWidth = bounds.width + bounds.left * 2 + frameWidth;
        const measuredHeight = bounds.height + bounds.top * 2 + frameHeight;
        if (!Number.isFinite(measuredWidth) || !Number.isFinite(measuredHeight)) {
            console.error('Could not measure Spotify Saver handoff panel dimensions:', {
                width: measuredWidth,
                height: measuredHeight
            });
            return;
        }

        const width = Math.min(1200, Math.max(200, Math.ceil(measuredWidth)));
        const height = Math.min(1200, Math.max(200, Math.ceil(measuredHeight)));
        const size = `${width}x${height}`;
        if (size !== lastSize) {
            lastSize = size;
            chrome.runtime.sendMessage({
                type: RESIZE_HANDOFF_MESSAGE,
                version: 1,
                origin: expectedOrigin,
                width,
                height
            }).catch((error) => {
                console.error('Could not request Spotify Saver handoff resize:', error);
            });
        }

        if (areFolderListsLoaded()) {
            panelObserver.disconnect();
            contentObserver.disconnect();
        }
    }

    contentObserver.observe(document, {
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden'],
        characterData: true,
        childList: true,
        subtree: true
    });
    document.addEventListener('DOMContentLoaded', scheduleResize, { once: true });
    scheduleResize();
}

function areFolderListsLoaded() {
    const folderLists = [
        document.getElementById('output-dir-options'),
        document.getElementById('video-output-dir-options')
    ];
    return folderLists.every((list) => list && list.textContent.trim() !== 'Loading folders...');
}

initializeHandoffBridge();
