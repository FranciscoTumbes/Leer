/* =============================================
   SlideVoice — PDF Presenter
   app.js — Core Application Logic
============================================= */

'use strict';

// ─── PDF.js Worker Setup ───────────────────────────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ─── Application State ────────────────────────────────────────────────────
const App = {
  pdfDoc: null,
  slides: [],          // Array of { canvas, text, customAudio }
  totalPages: 0,
  currentSlide: 0,
  isPlaying: false,
  isPaused: false,
  autoMode: false,
  speed: 1.0,
  volume: 1.0,
  selectedVoice: null,
  selectedLang: 'es-ES',
  utterance: null,
  speechSynth: window.speechSynthesis,
  filename: 'documento.pdf',
  transitioning: false,
};

// ─── DOM References ───────────────────────────────────────────────────────
const $$ = id => document.getElementById(id);
const DOM = {
  screens: {
    upload: $$('upload-screen'),
    loading: $$('loading-screen'),
    presentation: $$('presentation-screen'),
  },
  fileInput: $$('file-input'),
  uploadZone: $$('upload-zone'),
  voiceSelect: $$('voice-select'),
  langSelect: $$('lang-select'),
  speedSelectUpload: $$('speed-select'),
  loadingBar: $$('loading-bar'),
  loadingStatus: $$('loading-status'),
  pdfCanvas: $$('pdf-canvas'),
  slideWrap: $$('slide-wrap'),
  thumbStrip: $$('thumb-strip'),
  currentSlideNum: $$('current-slide-num'),
  totalSlidesNum: $$('total-slides-num'),
  slideBadgeNum: $$('slide-badge-num'),
  progressFill: $$('progress-fill'),
  prevBtn: $$('prev-btn'),
  nextBtn: $$('next-btn'),
  playBtn: $$('play-btn'),
  playIcon: $$('play-icon'),
  pauseIcon: $$('pause-icon'),
  stopBtn: $$('stop-btn'),
  autoBtn: $$('auto-btn'),
  voiceWave: $$('voice-wave'),
  voiceNameDisplay: $$('voice-name-display'),
  textPreviewContent: $$('text-preview-content'),
  autoStatus: $$('auto-status'),
  autoStatusText: $$('auto-status-text'),
  volumeSlider: $$('volume-slider'),
  presFilename: $$('pres-filename'),
  fullscreenBtn: $$('fullscreen-btn'),
  closePresBtn: $$('close-pres-btn'),
  editTextBtn: $$('edit-text-btn'),
  uploadAudioBtn: $$('upload-audio-btn'),
  // Modals
  editModal: $$('edit-modal'),
  editTextarea: $$('edit-textarea'),
  modalSlideInfo: $$('modal-slide-info'),
  modalClose: $$('modal-close'),
  modalCancel: $$('modal-cancel'),
  modalSave: $$('modal-save'),
  audioModal: $$('audio-modal'),
  audioModalSlideInfo: $$('audio-modal-slide-info'),
  audioModalClose: $$('audio-modal-close'),
  audioModalCancel: $$('audio-modal-cancel'),
  audioModalSave: $$('audio-modal-save'),
  audioFileInput: $$('audio-file-input'),
  audioUploadZone: $$('audio-upload-zone'),
  audioPreviewWrap: $$('audio-preview-wrap'),
  customAudioPreview: $$('custom-audio-preview'),
  toast: $$('toast'),
};

// ─── Screen Management ────────────────────────────────────────────────────
function showScreen(name) {
  Object.entries(DOM.screens).forEach(([key, el]) => {
    el.classList.remove('active');
    el.style.display = 'none';
    el.style.opacity = '0';
  });
  const target = DOM.screens[name];
  if (!target) return;
  target.style.display = 'flex';
  requestAnimationFrame(() => {
    target.classList.add('active');
    target.style.opacity = '1';
  });
}

// ─── Toast Notifications ──────────────────────────────────────────────────
let toastTimer;
function showToast(message, type = '') {
  const t = DOM.toast;
  t.textContent = message;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.className = 'toast';
  }, 3000);
}

// ─── Voice Management ─────────────────────────────────────────────────────
function loadVoices() {
  const voices = App.speechSynth.getVoices();
  const lang = DOM.langSelect.value || 'es';
  const select = DOM.voiceSelect;
  select.innerHTML = '';

  // Filter voices by language prefix
  const langCode = lang.split('-')[0];
  const filtered = voices.filter(v => v.lang.startsWith(langCode) || v.lang.startsWith(lang));
  const fallback = filtered.length === 0 ? voices.slice(0, 10) : filtered;

  if (fallback.length === 0) {
    select.innerHTML = '<option value="">No se encontraron voces</option>';
    return;
  }

  fallback.forEach((voice, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${voice.name} (${voice.lang})`;
    opt.dataset.index = voices.indexOf(voice);
    select.appendChild(opt);
  });

  // Auto-select first
  if (fallback.length > 0) {
    App.selectedVoice = fallback[0];
    updateVoiceDisplay();
  }
}

function updateVoiceDisplay() {
  if (App.selectedVoice) {
    DOM.voiceNameDisplay.textContent = App.selectedVoice.name;
  }
}

// Init voices
if (App.speechSynth.onvoiceschanged !== undefined) {
  App.speechSynth.onvoiceschanged = loadVoices;
}
setTimeout(loadVoices, 300);

DOM.langSelect.addEventListener('change', () => {
  App.selectedLang = DOM.langSelect.value;
  loadVoices();
});

DOM.voiceSelect.addEventListener('change', (e) => {
  const allVoices = App.speechSynth.getVoices();
  const idx = parseInt(e.target.selectedOptions[0]?.dataset.index);
  if (!isNaN(idx)) {
    App.selectedVoice = allVoices[idx];
    updateVoiceDisplay();
  }
});

// ─── Upload / Drag & Drop ─────────────────────────────────────────────────
DOM.uploadZone.addEventListener('click', e => {
  if (e.target !== DOM.uploadZone && e.target.closest('button')) return;
  DOM.fileInput.click();
});

DOM.uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  DOM.uploadZone.classList.add('drag-over');
});
DOM.uploadZone.addEventListener('dragleave', () => {
  DOM.uploadZone.classList.remove('drag-over');
});
DOM.uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  DOM.uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') {
    processPDF(file);
  } else {
    showToast('Por favor sube un archivo PDF válido', 'error');
  }
});

DOM.fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) processPDF(file);
});

// ─── PDF Processing ───────────────────────────────────────────────────────
async function processPDF(file) {
  App.filename = file.name;
  App.slides = [];
  App.currentSlide = 0;

  // Read settings from upload screen
  App.selectedLang = DOM.langSelect.value;
  App.speed = parseFloat(DOM.speedSelectUpload.value);
  const allVoices = App.speechSynth.getVoices();
  const selectedOpt = DOM.voiceSelect.selectedOptions[0];
  if (selectedOpt && selectedOpt.dataset.index) {
    App.selectedVoice = allVoices[parseInt(selectedOpt.dataset.index)];
  }

  showScreen('loading');
  setLoadingProgress(5, 'Leyendo archivo...');
  activateStep('step-1');

  try {
    const arrayBuffer = await file.arrayBuffer();
    setLoadingProgress(15, 'Cargando documento PDF...');

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    App.pdfDoc = pdf;
    App.totalPages = pdf.numPages;

    setLoadingProgress(30, `Procesando ${App.totalPages} páginas...`);
    activateStep('step-2');

    // Process each page
    for (let i = 1; i <= App.totalPages; i++) {
      const page = await pdf.getPage(i);
      const progress = 30 + Math.round((i / App.totalPages) * 50);
      setLoadingProgress(progress, `Procesando página ${i} de ${App.totalPages}...`);

      // Render to canvas
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;

      // Extract text
      const textContent = await page.getTextContent();
      const text = textContent.items.map(item => item.str).join(' ').trim();

      App.slides.push({
        canvas,
        text: text || `Diapositiva ${i} — Sin texto extraído.`,
        customAudio: null,
        originalText: text || `Diapositiva ${i} — Sin texto extraído.`,
      });
    }

    setLoadingProgress(85, 'Generando miniaturas...');
    activateStep('step-3');
    completeStep('step-1');
    completeStep('step-2');

    await new Promise(r => setTimeout(r, 300));

    setLoadingProgress(100, '¡Listo!');
    completeStep('step-3');

    await new Promise(r => setTimeout(r, 600));

    // Initialize presentation
    initPresentation();

  } catch (err) {
    console.error('Error procesando PDF:', err);
    showToast('Error al procesar el PDF. Verifica el archivo.', 'error');
    showScreen('upload');
  }
}

function setLoadingProgress(pct, status) {
  DOM.loadingBar.style.width = pct + '%';
  DOM.loadingStatus.textContent = status;
}

function activateStep(id) {
  const el = $$(id);
  if (el) {
    el.classList.remove('done');
    el.classList.add('active');
  }
}

function completeStep(id) {
  const el = $$(id);
  if (el) {
    el.classList.remove('active');
    el.classList.add('done');
  }
}

// Reset loading steps
function resetLoadingSteps() {
  ['step-1','step-2','step-3'].forEach(id => {
    const el = $$(id);
    if (el) el.className = 'step';
  });
  DOM.loadingBar.style.width = '0%';
}

// ─── Presentation Initialization ─────────────────────────────────────────
function initPresentation() {
  DOM.presFilename.textContent = App.filename;
  DOM.totalSlidesNum.textContent = App.totalPages;

  // Build thumbnail strip
  DOM.thumbStrip.innerHTML = '';
  App.slides.forEach((slide, i) => {
    const item = document.createElement('div');
    item.className = 'thumb-item' + (i === 0 ? ' active' : '');
    item.dataset.index = i;

    // Draw thumbnail
    const thumbCanvas = document.createElement('canvas');
    const aspectRatio = slide.canvas.height / slide.canvas.width;
    thumbCanvas.width = 120;
    thumbCanvas.height = Math.round(120 * aspectRatio);
    const ctx = thumbCanvas.getContext('2d');
    ctx.drawImage(slide.canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

    const numLabel = document.createElement('span');
    numLabel.className = 'thumb-num';
    numLabel.textContent = i + 1;

    item.appendChild(thumbCanvas);
    item.appendChild(numLabel);
    item.addEventListener('click', () => goToSlide(i));
    DOM.thumbStrip.appendChild(item);
  });

  // Update speed pills to match selected speed
  document.querySelectorAll('.speed-pill').forEach(pill => {
    pill.classList.toggle('active', parseFloat(pill.dataset.speed) === App.speed);
  });

  showScreen('presentation');
  renderSlide(0, true);
  updateVoiceDisplay();
  resetLoadingSteps();
}

// ─── Slide Rendering ──────────────────────────────────────────────────────
async function renderSlide(index, immediate = false) {
  if (index < 0 || index >= App.slides.length) return;
  if (App.transitioning && !immediate) return;

  const slide = App.slides[index];
  App.currentSlide = index;

  if (!immediate) {
    // Transition out
    App.transitioning = true;
    DOM.slideWrap.classList.add('transitioning');
    await new Promise(r => setTimeout(r, 200));
    DOM.slideWrap.classList.remove('transitioning');
    DOM.slideWrap.classList.add('entering');
  }

  // Draw slide on main canvas
  const mainCanvas = DOM.pdfCanvas;
  mainCanvas.width = slide.canvas.width;
  mainCanvas.height = slide.canvas.height;
  const ctx = mainCanvas.getContext('2d');
  ctx.drawImage(slide.canvas, 0, 0);

  if (!immediate) {
    requestAnimationFrame(() => {
      DOM.slideWrap.classList.remove('entering');
      App.transitioning = false;
    });
  }

  // Update UI
  updateSlideUI(index);
}

function updateSlideUI(index) {
  const slide = App.slides[index];
  const num = index + 1;

  DOM.currentSlideNum.textContent = num;
  DOM.slideBadgeNum.textContent = num;
  DOM.progressFill.style.width = (num / App.totalPages * 100) + '%';
  DOM.prevBtn.disabled = index === 0;
  DOM.nextBtn.disabled = index === App.totalPages - 1;

  // Update thumbnails
  document.querySelectorAll('.thumb-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.index) === index);
  });

  // Scroll thumbnail into view
  const activeThumb = DOM.thumbStrip.querySelector('.thumb-item.active');
  if (activeThumb) {
    activeThumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  // Text preview
  const preview = slide.text.substring(0, 150) + (slide.text.length > 150 ? '...' : '');
  DOM.textPreviewContent.textContent = preview || 'Sin texto disponible';
}

// ─── Navigation ───────────────────────────────────────────────────────────
function goToSlide(index) {
  if (index < 0 || index >= App.slides.length || index === App.currentSlide) return;
  stopSpeech();
  renderSlide(index);
}

async function nextSlide() {
  if (App.currentSlide < App.slides.length - 1) {
    await renderSlide(App.currentSlide + 1);
    if (App.autoMode) {
      setTimeout(() => playCurrent(), 300);
    }
  } else if (App.autoMode) {
    stopSpeech();
    setAutoMode(false);
    showToast('Presentación finalizada', 'success');
  }
}

function prevSlide() {
  if (App.currentSlide > 0) {
    stopSpeech();
    renderSlide(App.currentSlide - 1);
  }
}

DOM.prevBtn.addEventListener('click', prevSlide);
DOM.nextBtn.addEventListener('click', () => {
  const wasAuto = App.autoMode;
  if (!wasAuto) stopSpeech();
  goToSlide(App.currentSlide + 1);
});

// Keyboard navigation
document.addEventListener('keydown', e => {
  if (DOM.editModal.classList.contains('open')) return;
  if (DOM.audioModal.classList.contains('open')) return;

  switch(e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
      e.preventDefault();
      if (App.currentSlide < App.slides.length - 1) goToSlide(App.currentSlide + 1);
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      e.preventDefault();
      prevSlide();
      break;
    case ' ':
      e.preventDefault();
      togglePlay();
      break;
    case 'Escape':
      if (document.fullscreenElement) document.exitFullscreen();
      break;
    case 'f':
    case 'F':
      toggleFullscreen();
      break;
  }
});

// ─── Speech / TTS ─────────────────────────────────────────────────────────
function playCurrent() {
  const slide = App.slides[App.currentSlide];
  if (!slide) return;

  // Check for custom audio
  if (slide.customAudio) {
    playCustomAudio(slide.customAudio);
    return;
  }

  const text = slide.text;
  if (!text || text.trim() === '') {
    showToast('No hay texto para narrar en esta diapositiva', '');
    if (App.autoMode) setTimeout(() => nextSlide(), 1000);
    return;
  }

  stopSpeech(true); // stop silently

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = App.selectedLang;
  utterance.rate = App.speed;
  utterance.volume = App.volume;

  if (App.selectedVoice) {
    utterance.voice = App.selectedVoice;
  }

  utterance.onstart = () => {
    App.isPlaying = true;
    App.isPaused = false;
    setPlayState(true);
  };

  utterance.onend = () => {
    App.isPlaying = false;
    App.isPaused = false;
    setPlayState(false);
    if (App.autoMode) {
      setTimeout(() => nextSlide(), 800);
    }
  };

  utterance.onerror = (e) => {
    if (e.error !== 'interrupted' && e.error !== 'canceled') {
      console.warn('Speech error:', e.error);
    }
    App.isPlaying = false;
    App.isPaused = false;
    setPlayState(false);
  };

  App.utterance = utterance;
  App.speechSynth.speak(utterance);
}

function playCustomAudio(audioData) {
  if (App._customAudioEl) {
    App._customAudioEl.pause();
    App._customAudioEl = null;
  }

  const audio = new Audio(audioData);
  audio.playbackRate = App.speed;
  audio.volume = App.volume;
  App._customAudioEl = audio;

  audio.onplay = () => {
    App.isPlaying = true;
    App.isPaused = false;
    setPlayState(true);
  };
  audio.onpause = () => {
    if (!audio.ended) {
      App.isPlaying = false;
      App.isPaused = true;
      setPlayState(false);
    }
  };
  audio.onended = () => {
    App.isPlaying = false;
    App.isPaused = false;
    setPlayState(false);
    if (App.autoMode) setTimeout(() => nextSlide(), 800);
  };

  audio.play();
}

function pauseSpeech() {
  if (App._customAudioEl) {
    App._customAudioEl.pause();
    App.isPaused = true;
    App.isPlaying = false;
    setPlayState(false);
    return;
  }
  if (App.speechSynth.speaking && !App.speechSynth.paused) {
    App.speechSynth.pause();
    App.isPaused = true;
    App.isPlaying = false;
    setPlayState(false);
  }
}

function resumeSpeech() {
  if (App._customAudioEl && App.isPaused) {
    App._customAudioEl.play();
    App.isPaused = false;
    App.isPlaying = true;
    setPlayState(true);
    return;
  }
  if (App.speechSynth.paused) {
    App.speechSynth.resume();
    App.isPaused = false;
    App.isPlaying = true;
    setPlayState(true);
  }
}

function stopSpeech(silent = false) {
  if (App._customAudioEl) {
    App._customAudioEl.pause();
    App._customAudioEl = null;
  }
  App.speechSynth.cancel();
  App.isPlaying = false;
  App.isPaused = false;
  if (!silent) setPlayState(false);
}

function togglePlay() {
  if (App.isPlaying) {
    pauseSpeech();
  } else if (App.isPaused) {
    resumeSpeech();
  } else {
    playCurrent();
  }
}

function setPlayState(playing) {
  DOM.playIcon.style.display = playing ? 'none' : 'block';
  DOM.pauseIcon.style.display = playing ? 'block' : 'none';
  DOM.playBtn.classList.toggle('playing', playing);
  DOM.voiceWave.classList.toggle('playing', playing);
}

// Play/Pause button
DOM.playBtn.addEventListener('click', togglePlay);

// Stop button
DOM.stopBtn.addEventListener('click', () => {
  stopSpeech();
  showToast('Narración detenida');
});

// ─── Auto Mode ────────────────────────────────────────────────────────────
function setAutoMode(active) {
  App.autoMode = active;
  DOM.autoBtn.classList.toggle('active', active);
  DOM.autoStatus.classList.toggle('active', active);
  DOM.autoStatusText.textContent = active ? 'Auto activo' : 'Manual';
}

DOM.autoBtn.addEventListener('click', () => {
  if (!App.autoMode) {
    setAutoMode(true);
    if (!App.isPlaying && !App.isPaused) {
      playCurrent();
    }
    showToast('Modo Auto activado — avance automático al terminar cada narración', 'success');
  } else {
    setAutoMode(false);
    showToast('Modo Auto desactivado');
  }
});

// ─── Speed Control ────────────────────────────────────────────────────────
document.querySelectorAll('.speed-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    const speed = parseFloat(pill.dataset.speed);
    App.speed = speed;
    document.querySelectorAll('.speed-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');

    // Update playing audio
    if (App._customAudioEl) {
      App._customAudioEl.playbackRate = speed;
    }
    // For SpeechSynthesis, restart with new speed if playing
    if (App.isPlaying) {
      const wasAutoMode = App.autoMode;
      stopSpeech(true);
      App.autoMode = false;
      setTimeout(() => {
        App.autoMode = wasAutoMode;
        playCurrent();
      }, 100);
    }
  });
});

// ─── Volume Control ───────────────────────────────────────────────────────
DOM.volumeSlider.addEventListener('input', e => {
  App.volume = parseFloat(e.target.value);
  if (App._customAudioEl) {
    App._customAudioEl.volume = App.volume;
  }
  // Can't change volume of utterance mid-speech, will apply next time
});

// ─── Fullscreen ───────────────────────────────────────────────────────────
function toggleFullscreen() {
  const presScreen = DOM.screens.presentation;
  if (!document.fullscreenElement) {
    presScreen.requestFullscreen().catch(err => {
      showToast('No se pudo activar pantalla completa', 'error');
    });
  } else {
    document.exitFullscreen();
  }
}

DOM.fullscreenBtn.addEventListener('click', toggleFullscreen);

document.addEventListener('fullscreenchange', () => {
  const isFs = !!document.fullscreenElement;
  DOM.fullscreenBtn.innerHTML = isFs
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
});

// ─── Close Presentation ───────────────────────────────────────────────────
DOM.closePresBtn.addEventListener('click', () => {
  if (confirm('¿Cerrar la presentación y volver al inicio?')) {
    stopSpeech();
    setAutoMode(false);
    App.pdfDoc = null;
    App.slides = [];
    App.currentSlide = 0;
    DOM.fileInput.value = '';
    resetLoadingSteps();
    showScreen('upload');
  }
});

// ─── Edit Text Modal ──────────────────────────────────────────────────────
DOM.editTextBtn.addEventListener('click', () => {
  const slide = App.slides[App.currentSlide];
  if (!slide) return;
  DOM.modalSlideInfo.textContent = `Diapositiva ${App.currentSlide + 1}`;
  DOM.editTextarea.value = slide.text;
  DOM.editModal.classList.add('open');
  setTimeout(() => DOM.editTextarea.focus(), 100);
});

function closeEditModal() {
  DOM.editModal.classList.remove('open');
}

DOM.modalClose.addEventListener('click', closeEditModal);
DOM.modalCancel.addEventListener('click', closeEditModal);

DOM.modalSave.addEventListener('click', () => {
  const newText = DOM.editTextarea.value.trim();
  if (!newText) {
    showToast('El texto no puede estar vacío', 'error');
    return;
  }
  App.slides[App.currentSlide].text = newText;
  updateSlideUI(App.currentSlide);
  closeEditModal();

  // If playing, restart with new text
  if (App.isPlaying || App.isPaused) {
    stopSpeech(true);
    setTimeout(() => playCurrent(), 200);
  }
  showToast('Texto actualizado', 'success');
});

DOM.editModal.addEventListener('click', e => {
  if (e.target === DOM.editModal) closeEditModal();
});

// ─── Custom Audio Modal ───────────────────────────────────────────────────
let pendingAudioData = null;

DOM.uploadAudioBtn.addEventListener('click', () => {
  DOM.audioModalSlideInfo.textContent = `Diapositiva ${App.currentSlide + 1}`;
  DOM.audioPreviewWrap.style.display = 'none';
  DOM.customAudioPreview.src = '';
  pendingAudioData = null;
  DOM.audioModal.classList.add('open');
});

function closeAudioModal() {
  DOM.audioModal.classList.remove('open');
  pendingAudioData = null;
}

DOM.audioModalClose.addEventListener('click', closeAudioModal);
DOM.audioModalCancel.addEventListener('click', closeAudioModal);
DOM.audioModal.addEventListener('click', e => {
  if (e.target === DOM.audioModal) closeAudioModal();
});

DOM.audioUploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  DOM.audioUploadZone.classList.add('drag-over');
});
DOM.audioUploadZone.addEventListener('dragleave', () => {
  DOM.audioUploadZone.classList.remove('drag-over');
});
DOM.audioUploadZone.addEventListener('drop', e => {
  e.preventDefault();
  DOM.audioUploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('audio/')) {
    loadAudioFile(file);
  }
});

DOM.audioFileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) loadAudioFile(file);
});

function loadAudioFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    pendingAudioData = e.target.result;
    DOM.customAudioPreview.src = pendingAudioData;
    DOM.audioPreviewWrap.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

DOM.audioModalSave.addEventListener('click', () => {
  if (!pendingAudioData) {
    showToast('Selecciona un archivo de audio primero', 'error');
    return;
  }
  App.slides[App.currentSlide].customAudio = pendingAudioData;
  closeAudioModal();

  if (App.isPlaying || App.isPaused) {
    stopSpeech(true);
    setTimeout(() => playCurrent(), 200);
  }
  showToast('Audio personalizado guardado', 'success');
});

// ─── Initial Setup ────────────────────────────────────────────────────────
showScreen('upload');

// Sync lang select on upload screen language change
document.addEventListener('DOMContentLoaded', () => {
  loadVoices();
});

// Handle visibility changes (fix Chrome speechSynthesis bug)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && App.isPlaying) {
    // Chrome pauses speech when tab is hidden
    App.speechSynth.pause();
  } else if (!document.hidden && App.isPaused && App.speechSynth.paused) {
    App.speechSynth.resume();
  }
});
