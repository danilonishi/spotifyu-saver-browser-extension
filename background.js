import {
    createHandoffUrl,
    DEFAULT_SERVICE_URL,
    getServiceHostPermissionPattern,
    SERVICE_URL_STORAGE_KEY
} from './shared.js';

const PAGE_MENU_ID = 'send-page-to-spotify-saver';
const LINK_MENU_ID = 'send-link-to-spotify-saver';
const BRIDGE_READY_MESSAGE = 'SPOTIFY_SAVER_HANDOFF_BRIDGE_READY';
const COMPLETE_HANDOFF_MESSAGE = 'SPOTIFY_SAVER_HANDOFF_COMPLETE';
const RESIZE_HANDOFF_MESSAGE = 'SPOTIFY_SAVER_HANDOFF_RESIZE';
const HANDOFF_CONTENT_SCRIPT_ID = 'spotify-saver-handoff-bridge';
const HANDOFF_WINDOW_PREFIX = 'spotifySaverHandoffWindow:';
const SOURCE_URL_PATTERNS = [
    '*://*.spotify.com/*',
    '*://youtube.com/*',
    '*://www.youtube.com/*',
    '*://music.youtube.com/*',
    '*://m.youtube.com/*',
    '*://youtu.be/*'
];

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) {
            console.error('Could not reset Spotify Saver context menus:', chrome.runtime.lastError.message);
            return;
        }

        chrome.contextMenus.create({
            id: PAGE_MENU_ID,
            title: 'Send to Spotify Saver',
            contexts: ['page'],
            documentUrlPatterns: SOURCE_URL_PATTERNS
        }, reportContextMenuError);
        chrome.contextMenus.create({
            id: LINK_MENU_ID,
            title: 'Send link to Spotify Saver',
            contexts: ['link'],
            targetUrlPatterns: SOURCE_URL_PATTERNS
        }, reportContextMenuError);
    });
});

chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== PAGE_MENU_ID && info.menuItemId !== LINK_MENU_ID) {
        return;
    }

    const sourceUrl = info.menuItemId === LINK_MENU_ID ? info.linkUrl : info.pageUrl;
    sendToSpotifySaver(sourceUrl).catch((error) => {
        console.error('Could not open Spotify Saver handoff:', error);
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === BRIDGE_READY_MESSAGE) {
        verifyHandoffBridge(sender).then(
            (handoff) => sendResponse(handoff ? { enabled: true, origin: handoff.origin } : { enabled: false }),
            (error) => {
                console.error('Could not validate Spotify Saver handoff bridge:', error);
                sendResponse({ enabled: false });
            }
        );
        return true;
    }

    if (message?.type === COMPLETE_HANDOFF_MESSAGE) {
        closeCompletedHandoff(message, sender).then(
            () => sendResponse({ ok: true }),
            (error) => {
                console.error('Could not close completed Spotify Saver handoff:', error);
                sendResponse({ ok: false });
            }
        );
        return true;
    }

    if (message?.type === RESIZE_HANDOFF_MESSAGE) {
        resizeHandoffWindow(message, sender).then(
            () => sendResponse({ ok: true }),
            (error) => {
                console.error('Could not resize Spotify Saver handoff:', error);
                sendResponse({ ok: false });
            }
        );
        return true;
    }

    return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.remove(`${HANDOFF_WINDOW_PREFIX}${tabId}`).catch((error) => {
        console.error('Could not clear closed Spotify Saver handoff:', error);
    });
});

async function sendToSpotifySaver(sourceUrl) {
    const stored = await chrome.storage.local.get(SERVICE_URL_STORAGE_KEY);
    const serviceUrl = stored[SERVICE_URL_STORAGE_KEY] || DEFAULT_SERVICE_URL;
    const targetUrl = createHandoffUrl(serviceUrl, sourceUrl);
    const target = new URL(targetUrl);
    const hostPermissionPattern = getServiceHostPermissionPattern(serviceUrl);
    const hasHostPermission = await chrome.permissions.contains({
        origins: [hostPermissionPattern]
    });
    if (hasHostPermission) {
        await registerHandoffContentScript(hostPermissionPattern);
    }

    const handoffWindow = await chrome.windows.create({
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

    const key = `${HANDOFF_WINDOW_PREFIX}${handoffTab.id}`;
    await chrome.storage.session.set({
        [key]: { windowId: handoffWindow.id, origin: target.origin }
    });
    await chrome.tabs.update(handoffTab.id, { url: targetUrl });
}

async function registerHandoffContentScript(hostPermissionPattern) {
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
}

async function verifyHandoffBridge(sender) {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    if (!Number.isInteger(tabId) || !Number.isInteger(windowId) || typeof sender.url !== 'string') {
        return null;
    }

    let senderOrigin;
    try {
        senderOrigin = new URL(sender.url).origin;
    } catch {
        return null;
    }

    const stored = await chrome.storage.session.get(`${HANDOFF_WINDOW_PREFIX}${tabId}`);
    const handoff = stored[`${HANDOFF_WINDOW_PREFIX}${tabId}`];
    if (!handoff || handoff.origin !== senderOrigin || handoff.windowId !== windowId) {
        return null;
    }

    return handoff;
}

async function getVerifiedHandoff(message, sender, expectedKeys) {
    const tabId = sender.tab?.id;
    const senderUrl = sender.url;
    if (!Number.isInteger(tabId) ||
        !sender.tab?.windowId ||
        typeof senderUrl !== 'string' ||
        message.version !== 1 ||
        typeof message.origin !== 'string' ||
        Object.keys(message).sort().join(',') !== expectedKeys.join(',')) {
        throw new Error('Invalid Spotify Saver handoff message.');
    }

    const key = `${HANDOFF_WINDOW_PREFIX}${tabId}`;
    const stored = await chrome.storage.session.get(key);
    const handoff = stored[key];
    if (!handoff ||
        message.origin !== handoff.origin ||
        new URL(senderUrl).origin !== handoff.origin ||
        sender.tab.windowId !== handoff.windowId) {
        throw new Error('Spotify Saver message did not match an active handoff window.');
    }

    return { handoff, key };
}

async function closeCompletedHandoff(message, sender) {
    const { handoff, key } = await getVerifiedHandoff(
        message,
        sender,
        ['origin', 'source', 'type', 'version']
    );
    if (message.source !== 'spotify-saver') {
        throw new Error('Invalid Spotify Saver completion source.');
    }

    await chrome.windows.remove(handoff.windowId);
    await chrome.storage.session.remove(key);
}

async function resizeHandoffWindow(message, sender) {
    const { handoff } = await getVerifiedHandoff(
        message,
        sender,
        ['height', 'origin', 'type', 'version', 'width']
    );
    const width = parseResizeDimension(message.width);
    const height = parseResizeDimension(message.height);
    if (width === null || height === null) {
        throw new Error(
            `Invalid Spotify Saver handoff dimensions: width=${String(message.width)}, height=${String(message.height)}.`
        );
    }

    await chrome.windows.update(handoff.windowId, {
        width: Math.min(1200, Math.max(200, Math.round(width))),
        height: Math.min(1200, Math.max(200, Math.round(height)))
    });
}

function parseResizeDimension(value) {
    if (typeof value !== 'number' && typeof value !== 'string') {
        return null;
    }

    if (typeof value === 'string' && !value.trim()) {
        return null;
    }

    const dimension = Number(value);
    return Number.isFinite(dimension) ? dimension : null;
}

function reportContextMenuError() {
    if (chrome.runtime.lastError) {
        console.error('Could not create Spotify Saver context menu:', chrome.runtime.lastError.message);
    }
}
