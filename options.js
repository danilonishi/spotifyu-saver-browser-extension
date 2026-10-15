import {
    DEFAULT_SERVICE_URL,
    getServiceHostPermissionPattern,
    normalizeServiceUrl,
    SERVICE_URL_STORAGE_KEY
} from './shared.js';

const form = document.getElementById('settings-form');
const addressInput = document.getElementById('service-url');
const status = document.getElementById('save-status');
const siteAccessButton = document.getElementById('site-access-button');
const siteAccessStatus = document.getElementById('site-access-status');

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = '';
    try {
        const serviceUrl = normalizeServiceUrl(addressInput.value.trim());
        await chrome.storage.local.set({ [SERVICE_URL_STORAGE_KEY]: serviceUrl });
        addressInput.value = serviceUrl;
        status.textContent = 'Address saved.';
        await updateSiteAccessStatus(serviceUrl);
    } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Could not save the address.';
    }
});

siteAccessButton.addEventListener('click', async () => {
    siteAccessButton.disabled = true;
    siteAccessStatus.textContent = '';
    try {
        const serviceUrl = normalizeServiceUrl(addressInput.value.trim());
        const permissionPattern = getServiceHostPermissionPattern(serviceUrl);
        const declaredPatterns = chrome.runtime.getManifest().optional_host_permissions || [];
        const declaredSchemePattern = `${new URL(serviceUrl).protocol}//*/*`;
        if (!declaredPatterns.includes(declaredSchemePattern) &&
            !declaredPatterns.includes(permissionPattern)) {
            throw new Error(
                `This extension version does not declare ${permissionPattern} as optional access. ` +
                'Reload the extension from its updated folder in the browser extensions page, then try again.'
            );
        }

        const granted = await chrome.permissions.request({ origins: [permissionPattern] });
        siteAccessStatus.textContent = granted
            ? 'Site access granted. The extension can close the popup after a successful download.'
            : 'Site access was not granted. Automatic window closing is unavailable.';
    } catch (error) {
        siteAccessStatus.textContent = error instanceof Error
            ? error.message
            : 'Could not request site access.';
    } finally {
        siteAccessButton.disabled = false;
    }
});

addressInput.addEventListener('input', () => {
    updateSiteAccessStatus(addressInput.value.trim());
});

chrome.permissions.onAdded.addListener(() => {
    updateSiteAccessStatus(addressInput.value.trim());
});

chrome.permissions.onRemoved.addListener(() => {
    updateSiteAccessStatus(addressInput.value.trim());
});

async function initialize() {
    try {
        const stored = await chrome.storage.local.get(SERVICE_URL_STORAGE_KEY);
        addressInput.value = normalizeServiceUrl(stored[SERVICE_URL_STORAGE_KEY] || DEFAULT_SERVICE_URL);
        await updateSiteAccessStatus(addressInput.value);
    } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Could not load the saved address.';
    }
}

async function updateSiteAccessStatus(serviceUrl) {
    let normalizedUrl;
    try {
        normalizedUrl = normalizeServiceUrl(serviceUrl);
    } catch {
        siteAccessButton.disabled = false;
        siteAccessStatus.textContent = 'Enter a valid application address to configure site access.';
        return;
    }

    try {
        const hasAccess = await chrome.permissions.contains({
            origins: [getServiceHostPermissionPattern(normalizedUrl)]
        });
        siteAccessButton.disabled = hasAccess;
        siteAccessStatus.textContent = hasAccess
            ? `Site access is enabled for ${new URL(normalizedUrl).origin}.`
            : 'Site access is not enabled. Grant it to allow automatic window closing.';
    } catch (error) {
        siteAccessButton.disabled = false;
        siteAccessStatus.textContent = error instanceof Error
            ? `Could not check site access: ${error.message}`
            : 'Could not check site access.';
    }
}

initialize();
