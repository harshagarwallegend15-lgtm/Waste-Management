// Geolocation helper. Returns { lat, lng } or throws with a friendly message.
window.WWGps = (() => {
  function get(enableHighAccuracy = true, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error(t('gps.notSupported')));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        (err) => reject(new Error(t('gps.couldNotGet') + ': ' + (err.message || 'denied'))),
        { enableHighAccuracy, timeout: timeoutMs, maximumAge: 30000 }
      );
    });
  }
  function mapsUrl(lat, lng) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  return { get, mapsUrl };
})();
