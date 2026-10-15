import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createHandoffUrl,
    getServiceHostPermissionPattern,
    normalizeServiceUrl,
    normalizeSourceUrl
} from '../shared.js';

test('accepts Spotify album, playlist, and track handoff links', () => {
    for (const url of [
        'https://open.spotify.com/album/example',
        'https://open.spotify.com/playlist/AbC123',
        'https://open.spotify.com/track/AbC123',
        'https://open.spotify.com/intl-en/album/AbC123/',
        'https://open.spotify.com/intl-en-us/playlist/AbC123'
    ]) {
        assert.equal(normalizeSourceUrl(url), new URL(url).href);
    }
});

test('rejects Spotify subdomains and paths the app handoff does not support', () => {
    for (const url of [
        'https://www.spotify.com/album/AbC123',
        'https://evil.open.spotify.com/album/AbC123',
        'https://open.spotify.com/artist/AbC123',
        'https://open.spotify.com/album/AbC123/extra',
        'https://open.spotify.com/intl-eng/album/AbC123',
        'https://open.spotify.com/album/AbC-123'
    ]) {
        assert.equal(normalizeSourceUrl(url), null);
    }
});

test('accepts supported YouTube videos and playlists', () => {
    for (const url of [
        'https://www.youtube.com/watch?v=video',
        'https://www.youtube.com/watch?v=video&list=playlist',
        'https://music.youtube.com/playlist?list=playlist',
        'https://www.youtube.com/shorts/video',
        'https://youtu.be/video'
    ]) {
        assert.equal(normalizeSourceUrl(url), new URL(url).href);
    }
});

test('rejects unsupported hosts, unsupported YouTube pages, and non-web schemes', () => {
    for (const url of [
        'https://notspotify.com/album/example',
        'https://youtube.com/channel/example',
        'https://youtube.com/watch',
        'javascript:alert(1)',
        'ftp://open.spotify.com/album/example',
        'https://user:password@open.spotify.com/album/example'
    ]) {
        assert.equal(normalizeSourceUrl(url), null);
    }
});

test('normalizes the application address and rejects credentials, query, or fragment', () => {
    assert.equal(normalizeServiceUrl('http://localhost:8000/'), 'http://localhost:8000');
    assert.throws(() => normalizeServiceUrl('ftp://example.com'));
    assert.throws(() => normalizeServiceUrl('https://user:password@example.com'));
    assert.throws(() => normalizeServiceUrl('https://example.com/?existing=query'));
    assert.throws(() => normalizeServiceUrl('https://example.com/#fragment'));
});

test('creates a host permission pattern without the configured port', () => {
    assert.equal(
        getServiceHostPermissionPattern('http://127.0.0.1:8000'),
        'http://127.0.0.1/*'
    );
    assert.equal(
        getServiceHostPermissionPattern('https://saver.example.com:8443/app'),
        'https://saver.example.com/*'
    );
});

test('derives a host permission pattern from the origin of a handoff URL', () => {
    const handoffUrl = new URL('http://127.0.0.1:8000/?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2Fabc123');

    assert.equal(
        getServiceHostPermissionPattern(handoffUrl.origin),
        'http://127.0.0.1/*'
    );
});

test('creates a handoff URL with the encoded source URL in the url parameter', () => {
    const target = new URL(createHandoffUrl(
        'http://localhost:8000/',
        'https://open.spotify.com/album/example?si=abc'
    ));

    assert.equal(target.origin, 'http://localhost:8000');
    assert.equal(target.searchParams.get('url'), 'https://open.spotify.com/album/example?si=abc');
});
