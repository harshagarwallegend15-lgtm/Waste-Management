// Camera capture via getUserMedia. Returns { video, start, stop, capture }.
window.WWCamera = (() => {
  let stream = null;

  async function start(videoEl) {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  // Returns { blob, dataUrl }
  function capture(videoEl) {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 1280;
    canvas.height = videoEl.videoHeight || 960;
    canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve({ blob, dataUrl: canvas.toDataURL('image/jpeg', 0.85) }), 'image/jpeg', 0.85);
    });
  }

  return { start, stop, capture };
})();
