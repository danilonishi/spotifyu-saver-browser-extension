import {
    createHandoffUrl,
    DEFAULT_SERVICE_URL,
    getServiceHostPermissionPattern,
    normalizeSourceUrl,
    SERVICE_URL_STORAGE_KEY
} from './shared.js';

const HANDOFF_CONTENT_SCRIPT_ID = 'spotify-saver-handoff-bridge';
const status = document.getElementById('page-status');
const sendButton = document.getElementById('send-button');
const optionsButton = document.getElementById('options-button');
let sourceUrl = null;

optionsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

sendButton.addEventListener('click', async () => {
    sendButton.disabled = true;
    status.textContent = 'Opening Spotify Saver for review…';
    let handoffWindow;
    try {
        const stored = await chrome.storage.local.get(SERVICE_URL_STORAGE_KEY);
        const serviceUrl = stored[SERVICE_URL_STORAGE_KEY] || DEFAULT_SERVICE_URL;
        const handoffUrl = createHandoffUrl(serviceUrl, sourceUrl);
        const targetOrigin = new URL(handoffUrl).origin;
        const hostPermissionPattern = getServiceHostPermissionPattern(serviceUrl);
        if (!await chrome.permissions.contains({ origins: [hostPermissionPattern] })) {
            throw new Error('Grant Spotify Saver site access in the extension Options to enable automatic window closing.');
        }

        const registered = await chrome.scripting.getRegisteredContentScripts({
            ids: [HANDOFF_CONTENT_SCRIPT_ID]
        });
        const registration = {
            id: HANDOFF_CONTENT_SCRIPT_ID,
            matches: [hostPermissionPattern],
            js: ['handoff-content.js'],
            runAt: 'document_start',
            persistAcrossSessions: true
        };
        if (registered.length) {
            await chrome.scripting.updateContentScripts([registration]);
        } else {
            await chrome.scripting.registerContentScripts([registration]);
        }

        handoffWindow = await chrome.windows.create({
            url: 'about:blank',
            type: 'popup',
            width: 500,
            height: 700,
            focused: true
        });
        const [handoffTab] = await chrome.tabs.query({ windowId: handoffWindow.id });
        if (!handoffWindow.id || !handoffTab?.id) {
            throw new Error('Could not track the Spotify Saver popup window.');
        }

        await chrome.storage.session.set({
            [`spotifySaverHandoffWindow:${handoffTab.id}`]: {
                windowId: handoffWindow.id,
                origin: targetOrigin
            }
        });

        await chrome.tabs.update(handoffTab.id, { url: handoffUrl });
        window.close();
    } catch (error) {
        if (handoffWindow?.id) {
            await chrome.windows.remove(handoffWindow.id).catch((closeError) => {
                console.error('Could not close incomplete Spotify Saver popup:', closeError);
            });
        }
        status.textContent = error instanceof Error ? error.message : 'Could not open Spotify Saver.';
        sendButton.disabled = false;
    }
});

async function initialize() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        sourceUrl = tab?.url ? normalizeSourceUrl(tab.url) : null;
        if (!sourceUrl) {
            status.textContent = 'Open a supported Spotify or YouTube page to send a link.';
            return;
        }

        const parsedSource = new URL(sourceUrl);
        status.textContent = `Ready to review a link from ${parsedSource.hostname}.`;
        sendButton.disabled = false;
    } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Could not read the current page.';
    }
}

initialize();
