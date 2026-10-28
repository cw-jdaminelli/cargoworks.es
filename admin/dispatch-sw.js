// Registered so Chrome treats the dispatcher as the installable "CW Dispatch"
// phone app (dispatch.webmanifest). It has no fetch handler: every request
// goes straight to the network, so the app always runs the live dispatcher.
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(event){ event.waitUntil(self.clients.claim()); });
