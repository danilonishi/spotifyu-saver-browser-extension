# Spotify Saver browser extension

Send a supported Spotify or YouTube link to Spotify Saver without copying and
pasting it. The extension opens [Spotify Saver](https://github.com/danilonishi/spotify-saver)
with the link prefilled; it does not queue downloads or store credentials.

## Supported links

- Spotify albums, playlists, and tracks on `spotify.com` domains
- YouTube videos, Shorts, embeds, and playlists on YouTube or `youtu.be`

Use the toolbar button to open the current page's link for review in a focused
popup window, or right-click a supported page/link and choose **Send to Spotify
Saver** to open it the same way. The popup window is a standalone browser window
without tabs or an address bar; it does not embed the app in an iframe.
The extension adjusts the popup dimensions to fit the focused download panel
as its contents change.

## Install for development

1. Start Spotify Saver. For a service running on the same computer, the default
   address is `http://127.0.0.1:8000`.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode**, select **Load unpacked**, and choose this folder.
4. Open the extension's **Options** and set the Spotify Saver address. Use the
   address reachable from this browser, such as `http://192.168.1.50:8000` for
   a server on your local network or an HTTPS URL for a remotely hosted
   instance. Save the address, then use **Grant site access** under
   **Automatic window closing** and accept the browser's site-access prompt.

`http://127.0.0.1:8000` is only the default for a local service; it refers to
the machine running the browser. The configured address must be the application
root and reachable from that browser. Prefer HTTPS for remote instances. The
extension hands off the source link as the `url` query parameter. Spotify Saver
is responsible for reading that parameter, prefilling its form for confirmation,
and removing it from browser history.

The extension stores the application address in local browser storage and
handoff window IDs in session storage. It does not call service APIs directly
or store Spotify Saver credentials. The browser navigates to the configured
application when you choose to send a link. Optional host access is requested
only for the configured Spotify Saver origin and is used to inject a completion
listener into the handoff window; the extension closes that window only after
the app reports a successful enqueue. The bridge is registered at document
start and activates only in a window opened by the extension. The app can emit:

```js
window.postMessage(
    { source: 'spotify-saver', type: 'download-queued', version: 1 },
    window.location.origin
);
```

## Tests

Run `npm test` to test supported-link validation and handoff URL construction.
