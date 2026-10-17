// Loads the Google Maps JavaScript API once, on demand, with the page's
// window.CARGOWORKS_MAPS_KEY. Resolves with window.google.maps.
(function(){
  'use strict';
  var pending = null;
  window.cwLoadGoogleMaps = function(){
    if (window.google && window.google.maps && window.google.maps.Map) return Promise.resolve(window.google.maps);
    if (pending) return pending;
    pending = new Promise(function(resolve, reject){
      var key = String(window.CARGOWORKS_MAPS_KEY || '').trim();
      if (!key) { reject(new Error('Maps key not configured')); return; }
      var cb = '__cwGoogleMapsReady';
      window[cb] = function(){ resolve(window.google.maps); };
      var s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
        '&libraries=places&language=es&region=ES&loading=async&callback=' + cb;
      s.async = true;
      s.onerror = function(){ pending = null; reject(new Error('Google Maps failed to load')); };
      document.head.appendChild(s);
    });
    return pending;
  };
})();
