/* ============================================
   Gezi Notlarım - Mobile Capture Logic
   ============================================ */

(function () {
    'use strict';

    // ── State ──
    const state = {
        trip: null,       // { name, startDate, entries: [] }
        currentLocation: null,
        isRecording: false,
        recognition: null,
        currentTranscript: '',
    };

    // ── DOM References ──
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        // Sections
        tripSetup: $('#trip-setup'),
        tripActive: $('#trip-active'),
        // Trip setup
        tripNameInput: $('#trip-name'),
        btnStartTrip: $('#btn-start-trip'),
        // Active trip
        activeTripName: $('#active-trip-name'),
        activeTripStats: $('#active-trip-stats'),
        locationText: $('#location-text'),
        btnRefreshLocation: $('#btn-refresh-location'),
        btnExport: $('#btn-export'),
        btnEndTrip: $('#btn-end-trip'),
        // Quick actions
        btnVoiceNote: $('#btn-voice-note'),
        btnTextNote: $('#btn-text-note'),
        btnAddPhoto: $('#btn-add-photo'),
        btnAddVideo: $('#btn-add-video'),
        // Panels
        voicePanel: $('#voice-panel'),
        textPanel: $('#text-panel'),
        // Voice
        voiceVisualizer: $('#voice-visualizer'),
        voiceStatus: $('#voice-status'),
        voiceTranscript: $('#voice-transcript'),
        btnVoiceStart: $('#btn-voice-start'),
        btnVoiceStop: $('#btn-voice-stop'),
        btnVoiceSave: $('#btn-voice-save'),
        // Text
        textNoteInput: $('#text-note-input'),
        btnTextSave: $('#btn-text-save'),
        // Media
        photoInput: $('#photo-input'),
        videoInput: $('#video-input'),
        // Notes
        notesContainer: $('#notes-container'),
        notesCount: $('#notes-count'),
        // Modals
        exportModal: $('#export-modal'),
        btnExportSeparate: $('#btn-export-separate'),
        btnExportEmbedded: $('#btn-export-embedded'),
        mediaModal: $('#media-modal'),
        mediaModalTitle: $('#media-modal-title'),
        mediaModalBody: $('#media-modal-body'),
        // Theme
        btnThemeToggle: $('#btn-theme-toggle'),
        // Toast
        toastContainer: $('#toast-container'),
    };

    // ── Toast ──
    function showToast(message, type = 'info') {
        const icons = { success: 'check_circle', error: 'error', info: 'info' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span class="material-symbols-rounded">${icons[type]}</span>${message}`;
        dom.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ── Theme ──
    function initTheme() {
        const saved = localStorage.getItem('gezi-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        updateThemeIcon(saved);
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('gezi-theme', next);
        updateThemeIcon(next);
    }

    function updateThemeIcon(theme) {
        const icon = dom.btnThemeToggle.querySelector('.material-symbols-rounded');
        icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
    }

    // ── Location ──
    function getLocation() {
        dom.locationText.textContent = 'Konum alınıyor...';
        if (!navigator.geolocation) {
            dom.locationText.textContent = 'Konum desteklenmiyor';
            return;
        }
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                state.currentLocation = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                };
                // Try reverse geocode
                try {
                    const resp = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&accept-language=tr`
                    );
                    const data = await resp.json();
                    const addr = data.address;
                    const parts = [];
                    if (addr.neighbourhood || addr.suburb) parts.push(addr.neighbourhood || addr.suburb);
                    if (addr.town || addr.city || addr.county) parts.push(addr.town || addr.city || addr.county);
                    if (addr.province || addr.state) parts.push(addr.province || addr.state);
                    state.currentLocation.address = parts.join(', ') || data.display_name;
                    dom.locationText.textContent = state.currentLocation.address;
                } catch {
                    state.currentLocation.address = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
                    dom.locationText.textContent = state.currentLocation.address;
                }
            },
            (err) => {
                console.warn('Geolocation error:', err);
                dom.locationText.textContent = 'Konum alınamadı (izin gerekli)';
                state.currentLocation = null;
            },
            { enableHighAccuracy: true, timeout: 15000 }
        );
    }

    // ── Trip Management ──
    function loadTrip() {
        const saved = localStorage.getItem('gezi-current-trip');
        if (saved) {
            try {
                state.trip = JSON.parse(saved);
                showTripActive();
            } catch {
                localStorage.removeItem('gezi-current-trip');
            }
        }
    }

    function saveTrip() {
        if (state.trip) {
            localStorage.setItem('gezi-current-trip', JSON.stringify(state.trip));
        }
    }

    function startTrip() {
        const name = dom.tripNameInput.value.trim();
        if (!name) {
            showToast('Lütfen gezi adı girin', 'error');
            dom.tripNameInput.focus();
            return;
        }
        state.trip = {
            name: name,
            startDate: new Date().toISOString(),
            entries: [],
        };
        saveTrip();
        showTripActive();
        showToast('Gezi başlatıldı! İyi yolculuklar 🧳', 'success');
    }

    function endTrip() {
        if (!state.trip) return;
        if (state.trip.entries.length > 0 && !confirm('Geziyi bitirmek istediğinize emin misiniz? Veriler silinmeyecek, dışa aktarabilirsiniz.')) return;
        state.trip.endDate = new Date().toISOString();
        saveTrip();
        showToast('Gezi tamamlandı!', 'success');
    }

    function showTripActive() {
        dom.tripSetup.classList.add('hidden');
        dom.tripActive.classList.remove('hidden');
        dom.activeTripName.textContent = state.trip.name;
        updateStats();
        getLocation();
        renderNotes();
    }

    function updateStats() {
        if (!state.trip) return;
        const noteCount = state.trip.entries.length;
        const mediaCount = state.trip.entries.reduce((sum, e) => sum + (e.media ? e.media.length : 0), 0);
        dom.activeTripStats.textContent = `${noteCount} not · ${mediaCount} medya`;
        dom.notesCount.textContent = noteCount;
    }

    // ── Panel Toggle ──
    function togglePanel(panelId) {
        const panel = $(`#${panelId}`);
        const isHidden = panel.classList.contains('hidden');
        // Close all panels
        $$('.panel').forEach(p => p.classList.add('hidden'));
        if (isHidden) {
            panel.classList.remove('hidden');
            // Refresh location when opening a panel
            getLocation();
        }
    }

    function closePanel(panelId) {
        $(`#${panelId}`).classList.add('hidden');
        // Reset voice state
        if (panelId === 'voice-panel') {
            stopRecognition();
            state.currentTranscript = '';
            dom.voiceTranscript.textContent = '';
            dom.btnVoiceStart.classList.remove('hidden');
            dom.btnVoiceStop.classList.add('hidden');
            dom.btnVoiceSave.classList.add('hidden');
            dom.voiceVisualizer.classList.remove('recording');
            dom.voiceStatus.textContent = 'Kayıt başlatmak için mikrofona dokunun';
        }
    }

    // ── Speech Recognition ──
    function initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('SpeechRecognition API not available');
            // Don't fully disable - we'll show a message when the user tries
            return;
        }
        // Just verify the API exists; we create a fresh instance each time on mobile
        state.speechApiAvailable = true;
    }

    function createRecognitionInstance() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return null;

        const recognition = new SpeechRecognition();
        recognition.lang = 'tr-TR';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            let interim = '';
            let finalText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalText += transcript + ' ';
                } else {
                    interim = transcript;
                }
            }
            if (finalText) {
                state.currentTranscript += finalText;
            }
            dom.voiceTranscript.textContent = state.currentTranscript + (interim ? interim : '');
            // Show interim text as status
            if (interim) {
                dom.voiceStatus.textContent = '🔴 Dinleniyor...';
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            switch (event.error) {
                case 'not-allowed':
                    showToast('Mikrofon izni verilmedi. Tarayıcı ayarlarından mikrofon iznini açın.', 'error');
                    dom.voiceStatus.textContent = '⚠️ Mikrofon izni gerekli. Tarayıcı ayarlarından izin verin.';
                    stopRecognitionUI();
                    break;
                case 'no-speech':
                    // Silence timeout - auto restart if still recording
                    if (state.isRecording) {
                        dom.voiceStatus.textContent = '🔴 Ses algılanamadı, dinlemeye devam ediliyor...';
                        try {
                            recognition.stop();
                        } catch { /* ignore */ }
                    }
                    break;
                case 'network':
                    showToast('İnternet bağlantısı gerekli (ses tanıma bulut tabanlıdır)', 'error');
                    dom.voiceStatus.textContent = '⚠️ İnternet bağlantısı yok';
                    stopRecognitionUI();
                    break;
                case 'audio-capture':
                    showToast('Mikrofon bulunamadı veya kullanılamıyor', 'error');
                    stopRecognitionUI();
                    break;
                case 'aborted':
                    // Intentional stop, ignore
                    break;
                default:
                    showToast('Ses tanıma hatası: ' + event.error, 'error');
                    if (state.isRecording) {
                        // Try to restart
                        setTimeout(() => {
                            if (state.isRecording) {
                                try { startNewRecognitionSession(); } catch { stopRecognitionUI(); }
                            }
                        }, 500);
                    }
            }
        };

        recognition.onend = () => {
            console.log('Recognition ended, isRecording:', state.isRecording);
            if (state.isRecording) {
                // Auto-restart with a fresh instance (mobile fix)
                setTimeout(() => {
                    if (state.isRecording) {
                        startNewRecognitionSession();
                    }
                }, 300);
            } else {
                stopRecognitionUI();
            }
        };

        return recognition;
    }

    function startNewRecognitionSession() {
        // Create fresh instance each time (fixes mobile Chrome bugs)
        if (state.recognition) {
            try { state.recognition.stop(); } catch { /* ignore */ }
            try { state.recognition.abort(); } catch { /* ignore */ }
        }
        state.recognition = createRecognitionInstance();
        if (state.recognition) {
            try {
                state.recognition.start();
                console.log('Recognition session started');
            } catch (e) {
                console.error('Failed to start recognition:', e);
                showToast('Ses tanıma başlatılamadı', 'error');
                stopRecognitionUI();
            }
        }
    }

    async function startRecognition() {
        // First, explicitly request microphone permission via getUserMedia
        // This is REQUIRED on mobile before SpeechRecognition works
        try {
            dom.voiceStatus.textContent = 'Mikrofon izni isteniyor...';
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Stop the stream immediately - we just needed the permission
            stream.getTracks().forEach(t => t.stop());
            console.log('Microphone permission granted');
        } catch (err) {
            console.error('Microphone permission denied:', err);
            showToast('Mikrofon izni verilmedi. Lütfen izin verin.', 'error');
            dom.voiceStatus.textContent = '⚠️ Mikrofon izni reddedildi';
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            showToast('Bu tarayıcı sesli notu desteklemiyor. Chrome kullanmayı deneyin.', 'error');
            dom.voiceStatus.textContent = '⚠️ Tarayıcınız sesli notu desteklemiyor';
            return;
        }

        state.isRecording = true;
        state.currentTranscript = '';
        dom.voiceTranscript.textContent = '';
        dom.voiceVisualizer.classList.add('recording');
        dom.voiceStatus.textContent = '🔴 Dinleniyor... Konuşmaya başlayın';
        dom.btnVoiceStart.classList.add('hidden');
        dom.btnVoiceStop.classList.remove('hidden');
        dom.btnVoiceSave.classList.add('hidden');

        startNewRecognitionSession();
    }

    function stopRecognition() {
        state.isRecording = false;
        if (state.recognition) {
            try { state.recognition.stop(); } catch { /* ignore */ }
            try { state.recognition.abort(); } catch { /* ignore */ }
        }
        stopRecognitionUI();
    }

    function stopRecognitionUI() {
        state.isRecording = false;
        dom.voiceVisualizer.classList.remove('recording');
        dom.voiceStatus.textContent = 'Kayıt durduruldu';
        dom.btnVoiceStart.classList.remove('hidden');
        dom.btnVoiceStop.classList.add('hidden');
        if (state.currentTranscript.trim()) {
            dom.btnVoiceSave.classList.remove('hidden');
            dom.voiceTranscript.contentEditable = 'true';
            dom.voiceStatus.textContent = '✏️ Metni düzenleyip kaydedebilirsiniz';
        }
    }

    function saveVoiceNote() {
        const text = (dom.voiceTranscript.textContent || dom.voiceTranscript.innerText).trim();
        if (!text) {
            showToast('Kayıt boş', 'error');
            return;
        }
        addEntry('voice', text);
        closePanel('voice-panel');
        showToast('Sesli not kaydedildi ✓', 'success');
    }

    // ── Text Note ──
    function saveTextNote() {
        const text = dom.textNoteInput.value.trim();
        if (!text) {
            showToast('Lütfen not yazın', 'error');
            dom.textNoteInput.focus();
            return;
        }
        addEntry('text', text);
        dom.textNoteInput.value = '';
        closePanel('text-panel');
        showToast('Yazılı not kaydedildi ✓', 'success');
    }

    // ── Entry Management ──
    function addEntry(type, text, media = []) {
        const entry = {
            id: 'entry_' + Date.now(),
            timestamp: new Date().toISOString(),
            location: state.currentLocation ? { ...state.currentLocation } : null,
            type: type,
            text: text,
            media: media,
        };
        state.trip.entries.unshift(entry); // newest first
        saveTrip();
        updateStats();
        renderNotes();
        return entry;
    }

    function deleteEntry(entryId) {
        if (!confirm('Bu notu silmek istediğinize emin misiniz?')) return;
        state.trip.entries = state.trip.entries.filter(e => e.id !== entryId);
        saveTrip();
        updateStats();
        renderNotes();
        showToast('Not silindi', 'info');
    }

    // ── Media Handling ──
    function handleMediaInput(inputElement, mediaType) {
        inputElement.onchange = async (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;

            const mediaItems = [];
            for (const file of files) {
                const reader = new FileReader();
                const dataUrl = await new Promise((resolve) => {
                    reader.onload = (ev) => resolve(ev.target.result);
                    reader.readAsDataURL(file);
                });
                mediaItems.push({
                    type: mediaType,
                    filename: file.name,
                    dataUrl: dataUrl,
                    size: file.size,
                });
            }

            // If there is an existing last entry, add media to it
            // Otherwise create a new entry with just media
            if (state.trip.entries.length > 0) {
                const lastEntry = state.trip.entries[0];
                const timeDiff = Date.now() - new Date(lastEntry.timestamp).getTime();
                // If last note was within 5 minutes, attach media to it
                if (timeDiff < 5 * 60 * 1000) {
                    lastEntry.media = lastEntry.media.concat(mediaItems);
                    // Update location to latest
                    if (state.currentLocation) {
                        lastEntry.location = { ...state.currentLocation };
                    }
                    saveTrip();
                    updateStats();
                    renderNotes();
                    showToast(`${mediaType === 'photo' ? 'Fotoğraf' : 'Video'} son nota eklendi ✓`, 'success');
                    inputElement.value = '';
                    return;
                }
            }

            // Create new entry with media
            addEntry('text', `📸 ${mediaType === 'photo' ? 'Fotoğraf' : 'Video'} eklendi`, mediaItems);
            showToast(`${mediaType === 'photo' ? 'Fotoğraf' : 'Video'} kaydedildi ✓`, 'success');
            inputElement.value = '';
        };
    }

    // ── Render Notes ──
    function renderNotes() {
        if (!state.trip || state.trip.entries.length === 0) {
            dom.notesContainer.innerHTML = `
                <div class="empty-state">
                    <span class="material-symbols-rounded">note_add</span>
                    <p>Henüz not eklenmedi.<br>Yukarıdaki butonları kullanarak not ekleyin.</p>
                </div>`;
            return;
        }

        dom.notesContainer.innerHTML = state.trip.entries.map(entry => {
            const date = new Date(entry.timestamp);
            const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

            const typeBadge = entry.type === 'voice'
                ? '<span class="note-type-badge note-type-voice"><span class="material-symbols-rounded" style="font-size:12px">mic</span> Sesli</span>'
                : '<span class="note-type-badge note-type-text"><span class="material-symbols-rounded" style="font-size:12px">edit_note</span> Yazılı</span>';

            const locationHtml = entry.location
                ? `<div class="note-location">
                     <span class="material-symbols-rounded">location_on</span>
                     ${entry.location.address || `${entry.location.lat.toFixed(4)}, ${entry.location.lng.toFixed(4)}`}
                   </div>`
                : '';

            let mediaHtml = '';
            if (entry.media && entry.media.length > 0) {
                mediaHtml = `<div class="note-media-strip">${entry.media.map((m, i) => {
                    if (m.type === 'photo') {
                        return `<img src="${m.dataUrl}" class="note-media-thumb" onclick="app.showMedia('${entry.id}', ${i})" alt="Fotoğraf">`;
                    } else {
                        return `<div class="media-thumb-container" onclick="app.showMedia('${entry.id}', ${i})">
                                  <video src="${m.dataUrl}" class="note-media-thumb" muted></video>
                                  <span class="video-badge">▶</span>
                                </div>`;
                    }
                }).join('')}</div>`;
            }

            return `
                <div class="note-card" id="${entry.id}">
                    <div class="note-card-header">
                        ${typeBadge}
                        <span class="note-meta">
                            <span class="material-symbols-rounded" style="font-size:14px">schedule</span>
                            ${dateStr} ${timeStr}
                        </span>
                    </div>
                    <div class="note-text-preview">${escapeHtml(entry.text)}</div>
                    ${locationHtml}
                    ${mediaHtml}
                    <div class="note-card-actions">
                        <button onclick="app.addMediaToEntry('${entry.id}', 'photo')">
                            <span class="material-symbols-rounded" style="font-size:16px">add_photo_alternate</span>
                            Fotoğraf Ekle
                        </button>
                        <button class="btn-delete" onclick="app.deleteEntry('${entry.id}')">
                            <span class="material-symbols-rounded" style="font-size:16px">delete</span>
                            Sil
                        </button>
                    </div>
                </div>`;
        }).join('');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ── Add media to specific entry ──
    function addMediaToEntry(entryId, mediaType) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = mediaType === 'photo' ? 'image/*' : 'video/*';
        input.capture = 'environment';
        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;
            const entry = state.trip.entries.find(en => en.id === entryId);
            if (!entry) return;
            for (const file of files) {
                const reader = new FileReader();
                const dataUrl = await new Promise((resolve) => {
                    reader.onload = (ev) => resolve(ev.target.result);
                    reader.readAsDataURL(file);
                });
                entry.media.push({
                    type: mediaType,
                    filename: file.name,
                    dataUrl: dataUrl,
                    size: file.size,
                });
            }
            saveTrip();
            updateStats();
            renderNotes();
            showToast('Medya eklendi ✓', 'success');
        };
        input.click();
    }

    // ── Show Media Modal ──
    function showMedia(entryId, mediaIndex) {
        const entry = state.trip.entries.find(e => e.id === entryId);
        if (!entry || !entry.media[mediaIndex]) return;
        const media = entry.media[mediaIndex];
        dom.mediaModalTitle.textContent = media.type === 'photo' ? 'Fotoğraf' : 'Video';
        if (media.type === 'photo') {
            dom.mediaModalBody.innerHTML = `<img src="${media.dataUrl}" alt="Fotoğraf">`;
        } else {
            dom.mediaModalBody.innerHTML = `<video src="${media.dataUrl}" controls autoplay></video>`;
        }
        dom.mediaModal.classList.remove('hidden');
    }

    // ── Export ──
    function showExportModal() {
        dom.exportModal.classList.remove('hidden');
    }

    function closeExportModal() {
        dom.exportModal.classList.add('hidden');
    }

    function closeMediaModal() {
        dom.mediaModal.classList.remove('hidden');
        dom.mediaModal.classList.add('hidden');
        // Stop any playing video
        const video = dom.mediaModalBody.querySelector('video');
        if (video) video.pause();
    }

    async function exportSeparate() {
        if (!state.trip) return;
        closeExportModal();

        // Build JSON without embedded media
        const exportData = {
            tripName: state.trip.name,
            startDate: state.trip.startDate,
            endDate: state.trip.endDate || new Date().toISOString(),
            exportDate: new Date().toISOString(),
            exportMode: 'separate',
            entries: state.trip.entries.map(entry => ({
                ...entry,
                media: (entry.media || []).map((m, i) => ({
                    type: m.type,
                    filename: m.filename || `${entry.id}_${i}.${m.type === 'photo' ? 'jpg' : 'mp4'}`,
                }))
            }))
        };

        // Download JSON
        downloadFile(
            JSON.stringify(exportData, null, 2),
            `${sanitizeFilename(state.trip.name)}_veriler.json`,
            'application/json'
        );

        // Download each media file separately
        let mediaIndex = 0;
        for (const entry of state.trip.entries) {
            if (!entry.media) continue;
            for (const m of entry.media) {
                if (m.dataUrl) {
                    const filename = m.filename || `${entry.id}_${mediaIndex}.${m.type === 'photo' ? 'jpg' : 'mp4'}`;
                    // Convert dataUrl to blob and download
                    const blob = dataUrlToBlob(m.dataUrl);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);
                    mediaIndex++;
                    // Small delay between downloads
                    await new Promise(r => setTimeout(r, 300));
                }
            }
        }

        showToast('Veriler indirildi ✓', 'success');
    }

    function exportEmbedded() {
        if (!state.trip) return;
        closeExportModal();

        const exportData = {
            tripName: state.trip.name,
            startDate: state.trip.startDate,
            endDate: state.trip.endDate || new Date().toISOString(),
            exportDate: new Date().toISOString(),
            exportMode: 'embedded',
            entries: state.trip.entries.map(entry => ({
                ...entry,
                media: (entry.media || []).map(m => ({
                    type: m.type,
                    filename: m.filename,
                    dataUrl: m.dataUrl, // Keep embedded
                }))
            }))
        };

        downloadFile(
            JSON.stringify(exportData, null, 2),
            `${sanitizeFilename(state.trip.name)}_tam_veri.json`,
            'application/json'
        );

        showToast('Tüm veriler tek dosyada indirildi ✓', 'success');
    }

    function downloadFile(content, filename, mime) {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function dataUrlToBlob(dataUrl) {
        const parts = dataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const binary = atob(parts[1]);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        return new Blob([array], { type: mime });
    }

    function sanitizeFilename(name) {
        return name.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s_-]/g, '').replace(/\s+/g, '_').substring(0, 50);
    }

    // ── Event Bindings ──
    function bindEvents() {
        // Theme
        dom.btnThemeToggle.addEventListener('click', toggleTheme);

        // Trip
        dom.btnStartTrip.addEventListener('click', startTrip);
        dom.btnEndTrip.addEventListener('click', endTrip);
        dom.tripNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') startTrip();
        });

        // Location
        dom.btnRefreshLocation.addEventListener('click', getLocation);

        // Panels
        dom.btnVoiceNote.addEventListener('click', () => togglePanel('voice-panel'));
        dom.btnTextNote.addEventListener('click', () => togglePanel('text-panel'));

        // Close panels
        $$('.btn-close-panel').forEach(btn => {
            btn.addEventListener('click', () => closePanel(btn.dataset.panel));
        });

        // Voice
        dom.btnVoiceStart.addEventListener('click', startRecognition);
        dom.btnVoiceStop.addEventListener('click', stopRecognition);
        dom.btnVoiceSave.addEventListener('click', saveVoiceNote);

        // Text
        dom.btnTextSave.addEventListener('click', saveTextNote);

        // Media
        dom.btnAddPhoto.addEventListener('click', () => dom.photoInput.click());
        dom.btnAddVideo.addEventListener('click', () => dom.videoInput.click());
        handleMediaInput(dom.photoInput, 'photo');
        handleMediaInput(dom.videoInput, 'video');

        // Export
        dom.btnExport.addEventListener('click', showExportModal);
        dom.btnExportSeparate.addEventListener('click', exportSeparate);
        dom.btnExportEmbedded.addEventListener('click', exportEmbedded);

        // Close modals
        $('.btn-close-modal').addEventListener('click', closeExportModal);
        $('.btn-close-media-modal').addEventListener('click', closeMediaModal);

        // Close modal on overlay click
        dom.exportModal.addEventListener('click', (e) => {
            if (e.target === dom.exportModal) closeExportModal();
        });
        dom.mediaModal.addEventListener('click', (e) => {
            if (e.target === dom.mediaModal) closeMediaModal();
        });
    }

    // ── Public API (for inline onclick handlers) ──
    window.app = {
        deleteEntry,
        addMediaToEntry,
        showMedia,
    };

    // ── Init ──
    function init() {
        initTheme();
        initSpeechRecognition();
        loadTrip();
        bindEvents();
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
