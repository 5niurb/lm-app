## Summary

Solid MMS implementation with good structural choices (proxy auth, blob caching, cleanup on removal), but has three issues that need fixing before this ships: a server-side open-proxy vulnerability, silent multer rejection that corrupts outbound sends, and a blob URL memory leak in the media cache.

## Issues

- **[severity: high]** Security — `api/routes/messages.js` lines 477-487: The media proxy at `GET /:id/media/:index` looks up a URL from `messages.media_urls[idx]` and then fetches it using Twilio credentials with no restriction on what domain that URL can point to. Any media_urls value in the database — whether written by a webhook, a bad data migration, or a compromised record — will be fetched with `TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN` Basic auth attached. If an attacker can write an arbitrary URL into `media_urls` (e.g. via a crafted Twilio webhook payload before signature verification), the server will make an authenticated request to an attacker-controlled host, leaking the Twilio credentials in the Authorization header. Fix: before fetching, assert that the URL hostname is `api.twilio.com` or `media.twiliocdn.com`. Reject anything else with a 403.

  ```js
  const TWILIO_MEDIA_HOST = /^(api|media)\.twilio(cdn)?\.com$/;
  const parsed = new URL(mediaUrl);
  if (!TWILIO_MEDIA_HOST.test(parsed.hostname)) {
    return res.status(403).json({ error: 'Invalid media URL' });
  }
  ```

- **[severity: high]** Correctness — `api/routes/messages.js` line 15: The multer `fileFilter` calls `cb(null, false)` to silently reject disallowed MIME types, but there is no check after `upload.single('image')` middleware runs to detect that the file was rejected. When a user submits a multipart request with a non-image file, multer sets `req.file = undefined` and the route proceeds as if no file was attached. The validation at line 181 (`!body && !req.file`) will not catch a case where `body` is present — the message will be sent as SMS-only without any error surfaced to the user. Worse, the MIME type used is `req.file.mimetype` which is the browser-reported type; a renamed file can spoof this. Fix: throw a multer error from the fileFilter (`cb(new Error('Invalid file type'))`) and add an Express error handler after the upload middleware, OR check `req.file === undefined && <original request had a file field>` by inspecting `req.headers['content-type']`. The simplest correct fix is to emit a proper error:

  ```js
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
    }
  }
  ```

  Then add a multer error handler before the generic error handler in `server.js`.

- **[severity: medium]** Memory — `src/lib/components/messaging/ChatsTab.svelte` lines 68-108: `mediaCache` is a module-level `Map` that accumulates blob URLs for the lifetime of the page session. Blob URLs created with `URL.createObjectURL()` hold a reference to the underlying `Blob` in memory and are never released because `URL.revokeObjectURL()` is never called. On a long session with many MMS conversations, this leaks unbounded memory. The cache also has no eviction policy (no max size, no LRU). Fix: revoke blob URLs when they are evicted or when the component that owns the cache is destroyed. The simplest approach is to revoke on conversation switch — resolve the promises to get the URL strings, then call `revokeObjectURL` for each cached entry when `selectedConvo` changes. A stricter fix is a bounded LRU cache (e.g., cap at 50 entries).

- **[severity: medium]** Correctness — `api/routes/messages.js` lines 199-219: If the Supabase upload succeeds but the subsequent `client.messages.create()` call (line 228) throws, the image has already been stored in the `mms` bucket but no message record references it. The orphaned file will persist in storage indefinitely. This is not a crash, but it accumulates dead objects on every transient Twilio error. Fix: wrap the Twilio call and, on failure, delete the uploaded file before returning the 500 response:

  ```js
  } catch (err) {
    if (storagePath) {
      await supabaseAdmin.storage.from('mms').remove([storagePath]);
    }
    return res.status(500).json({ error: 'Failed to send message' });
  }
  ```

  This requires hoisting `storagePath` to the outer scope.

- **[severity: medium]** Security — `api/routes/messages.js` lines 202-204: The file extension is extracted from `req.file.originalname` using a simple `.split('.').pop()` without sanitization. A filename like `../../etc/passwd.jpg` would yield `jpg`, which is safe in this case since the extension is appended to a UUID. However, `originalname.split('.').pop()` on a file with no extension returns the full filename, and on a filename like `.htaccess` returns `htaccess`. The UUID prefix prevents path traversal but the extension could still produce unexpected Storage object keys. Fix: validate the extension against an allowlist before use:

  ```js
  const extMap = {
    'image/jpeg': 'jpg', 'image/png': 'png',
    'image/gif': 'gif', 'image/webp': 'webp'
  };
  const ext = extMap[req.file.mimetype] || 'jpg';
  ```

  This also removes the reliance on the browser-supplied filename entirely.

- **[severity: medium]** Security — The `mms` Supabase Storage bucket is used with `getPublicUrl()` (line 218), meaning the bucket must be configured as public. All uploaded MMS images — including inbound patient images and outbound clinical images — are world-readable by anyone who knows (or guesses) the URL. There is no signed URL with expiry. Given the HIPAA-adjacent nature of this data (patients may send photos of skin conditions, treatment areas, etc.), storing them in a public bucket is a significant exposure risk. Fix: make the bucket private and use `createSignedUrl()` with a short TTL (e.g., 1 hour) instead of `getPublicUrl()`. This requires passing the signed URL to Twilio as `mediaUrl`, which Twilio will fetch once at send time — this is fully supported.

- **[severity: low]** Correctness — `api/routes/messages.js` lines 499-507: The stream loop uses `ReadableStream.getReader()` and writes chunks synchronously to the Express response without checking `res.writableEnded` or the return value of `res.write()`. If the client disconnects mid-stream, `res.write()` will throw or be ignored, and the `reader` will not be cancelled — the Twilio connection stays open until the response body is fully consumed. Fix: check `req.on('close', ...)` and cancel the reader on early client disconnect:

  ```js
  req.on('close', () => reader.cancel());
  ```

- **[severity: low]** Correctness — `src/lib/components/messaging/ChatsTab.svelte` line 77-79: `isPublicMediaUrl` returns `true` for any HTTPS URL that is not `api.twilio.com`. This means a future media_url from a different provider (e.g. a direct S3 URL, a CDN, a third-party service) would be rendered directly without auth — possibly correctly, but also possibly exposing a URL that was intended to be proxied. The logic is implicitly "public if not Twilio" rather than explicitly "public if Supabase Storage." Consider making the check positive: check for your Supabase project hostname rather than excluding Twilio. This is low severity because the current data set is either Twilio or Supabase, but it is a correctness risk as integrations grow.

- **[severity: low]** Error handling — `api/routes/messages.js` lines 270-288: If the `messages` insert fails (`msgErr` is set), the error is logged but the route continues and returns a 200 with `data: undefined` (since `msg` would be null/undefined). The client receives a success response for a message that was not persisted. The Twilio send already succeeded at this point so the message was delivered — but the app will not show it in the thread until the next poll cycle when the webhook write arrives. This is a tolerable degradation, but the response should signal the partial failure rather than a clean 200. Consider returning a `202 Accepted` with a `warning` field in this case.

## Verdict

NEEDS CHANGES — the open proxy (HIGH) and silent multer rejection (HIGH) are blocking. The blob URL leak (MEDIUM) and public bucket (MEDIUM) should also be resolved before this feature is used with real patient data.
