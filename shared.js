export const DEFAULT_SERVICE_URL = 'http://127.0.0.1:8000';
export const SERVICE_URL_STORAGE_KEY = 'spotifySaverServiceUrl';
export const HANDOFF_PARAMETER = 'url';

const YOUTUBE_HOSTS = new Set([
    'youtube.com',
    'www.youtube.com',
    'music.youtube.com',
    'm.youtube.com',
    'youtu.be'
]);
const SPOTIFY_HANDOFF_PATH = /^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(?:track|album|playlist)\/[a-zA-Z0-9]+\/?$/;

export function normalizeSourceUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        return null;
    }

    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        return null;
    }

    const hostname = url.hostname.toLowerCase();
    if (hostname === 'open.spotify.com' && SPOTIFY_HANDOFF_PATH.test(url.pathname)) {
        return url.href;
    }

    if (!YOUTUBE_HOSTS.has(hostname)) {
        return null;
    }

    const path = url.pathname.replace(/\/$/, '');
    const isPlaylist = ['/playlist', '/watch'].includes(path) && Boolean(url.searchParams.get('list'));
    const isWatchVideo = path === '/watch' && Boolean(url.searchParams.get('v'));
    const isShortOrEmbed = /^\/(shorts|embed)\/[^/]+/.test(path);
    const isShortLink = hostname === 'youtu.be' && Boolean(path.slice(1));

    return isPlaylist || isWatchVideo || isShortOrEmbed || isShortLink ? url.href : null;
}

export function normalizeServiceUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error('Enter a valid Spotify Saver address.');
    }

    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash) {
        throw new Error('Use an HTTP(S) application address without credentials, a query, or a fragment.');
    }

    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.href.replace(/\/$/, '');
}

export function getServiceHostPermissionPattern(serviceUrl) {
    const url = new URL(normalizeServiceUrl(serviceUrl));
    return `${url.protocol}//${url.hostname}/*`;
}

export function createHandoffUrl(serviceUrl, sourceUrl) {
    const supportedSource = normalizeSourceUrl(sourceUrl);
    if (!supportedSource) {
        throw new Error('This is not a supported Spotify or YouTube link.');
    }

    const target = new URL(normalizeServiceUrl(serviceUrl));
    target.searchParams.set(HANDOFF_PARAMETER, supportedSource);
    return target.href;
}
