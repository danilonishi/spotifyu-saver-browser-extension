import test from 'node:test';
import assert from 'node:assert/strict';

function createEvent() {
    const listeners = [];
    return {
        addListener(listener) {
            listeners.push(listener);
        },
        dispatch(...args) {
            return listeners.map((listener) => listener(...args));
        }
    };
}

test('validates the handoff bridge and closes only on verified completion', async () => {
    const runtimeMessages = createEvent();
    const tabRemoved = createEvent();
    const contextMenuClicked = createEvent();
    const serviceUrl = 'http://127.0.0.1:8000';
    const session = new Map();
    const removedWindows = [];
    const resizedWindows = [];
    const handoffWindowId = 10;
    const handoffTabId = 20;
    session.set(`spotifySaverHandoffWindow:${handoffTabId}`, {
        windowId: handoffWindowId,
        origin: serviceUrl
    });

    globalThis.chrome = {
        runtime: {
            lastError: null,
            onInstalled: createEvent(),
            onMessage: runtimeMessages
        },
        contextMenus: {
            onClicked: contextMenuClicked,
            removeAll(callback) { callback(); },
            create(_options, callback) { callback?.(); }
        },
        tabs: {
            onRemoved: tabRemoved,
            async query() { return [{ id: handoffTabId }]; }
        },
        windows: {
            async create() { return { id: handoffWindowId }; },
            async remove(windowId) { removedWindows.push(windowId); },
            async update(windowId, dimensions) { resizedWindows.push({ windowId, ...dimensions }); }
        },
        storage: {
            local: {
                async get() { return { spotifySaverServiceUrl: serviceUrl }; }
            },
            session: {
                async get(key) { return { [key]: session.get(key) }; },
                async set(values) {
                    for (const [key, value] of Object.entries(values)) session.set(key, value);
                },
                async remove(key) { session.delete(key); }
            }
        },
        permissions: {
            async contains() { return true; }
        },
        scripting: {
            async getRegisteredContentScripts() { return []; },
            async registerContentScripts() {},
            async updateContentScripts() {}
        }
    };

    await import('../background.js?background-test');

    async function sendMessage(message, sender = {}) {
        return new Promise((resolve) => {
            const listener = runtimeMessages.dispatch(message, sender, resolve)[0];
            assert.equal(listener, true);
        });
    }

    const sender = {
        tab: { id: handoffTabId, windowId: handoffWindowId },
        url: 'http://127.0.0.1:8000/'
    };
    const bridge = await sendMessage({
        type: 'SPOTIFY_SAVER_HANDOFF_BRIDGE_READY',
        version: 1
    }, sender);
    assert.deepEqual(bridge, { enabled: true, origin: serviceUrl });

    const resized = await sendMessage({
        type: 'SPOTIFY_SAVER_HANDOFF_RESIZE',
        version: 1,
        origin: serviceUrl,
        width: 120,
        height: 1400
    }, sender);
    assert.deepEqual(resized, { ok: true });
    assert.deepEqual(resizedWindows, [{
        windowId: handoffWindowId,
        width: 200,
        height: 1200
    }]);

    const numericStringResize = await sendMessage({
        type: 'SPOTIFY_SAVER_HANDOFF_RESIZE',
        version: 1,
        origin: serviceUrl,
        width: '360',
        height: '480'
    }, sender);
    assert.deepEqual(numericStringResize, { ok: true });
    assert.deepEqual(resizedWindows[1], {
        windowId: handoffWindowId,
        width: 360,
        height: 480
    });

    const originalConsoleError = console.error;
    console.error = () => {};
    const rejected = await sendMessage({
        type: 'SPOTIFY_SAVER_HANDOFF_COMPLETE',
        version: 1,
        source: 'unexpected',
        origin: serviceUrl
    }, sender);
    console.error = originalConsoleError;
    assert.deepEqual(rejected, { ok: false });
    assert.deepEqual(removedWindows, []);

    const completed = await sendMessage({
        type: 'SPOTIFY_SAVER_HANDOFF_COMPLETE',
        version: 1,
        source: 'spotify-saver',
        origin: serviceUrl
    }, sender);
    assert.deepEqual(completed, { ok: true });
    assert.deepEqual(removedWindows, [handoffWindowId]);
    assert.equal(session.has(`spotifySaverHandoffWindow:${handoffTabId}`), false);

    delete globalThis.chrome;
});
