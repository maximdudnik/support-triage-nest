# Technical Support

## App crashes on file upload
Uploads larger than 25 MB are not supported and can make the mobile app close unexpectedly. Ask the customer to update to the latest app version, check the file size, and try again on Wi-Fi. If it still crashes, ask for the app version, device model and OS version.

## Sync not working
Sync requires the app to be online and signed in. Steps: 1) pull to refresh, 2) sign out and back in, 3) check status.example.com for incidents. Changes made offline sync automatically when the connection returns.

## API errors and rate limits
The public API allows 60 requests per minute per API key. Responses with HTTP 429 mean the limit was exceeded; clients should retry after the number of seconds in the Retry-After header. HTTP 401 means the API key is missing or revoked.

## Slow performance
Clearing the app cache (Settings > Storage > Clear cache) fixes most slowness. Browsers older than two major versions are not supported.
