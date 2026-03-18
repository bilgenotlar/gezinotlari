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
        mediaRecorder: null,
        audioChunks: [],
        audioBlob: null,
        audioDataUrl: null,
        recordingStartTime: null,
        timerInterval: null,
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
        voiceTimer: $('#voice-timer'),
        voicePreview: $('#voice-preview'),
        voiceAudio: $('#voice-audio'),
        voiceNoteField: $('#voice-note-field'),
        voiceNoteText: $('#voice-note-text'),
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
            stopRecording();
            resetVoiceUI();
        }
    }

    function resetVoiceUI() {
        state.audioChunks = [];
        state.audioBlob = null;
        state.audioDataUrl = null;
        dom.btnVoiceStart.classList.remove('hidden');
        dom.btnVoiceStop.classList.add('hidden');
        dom.btnVoiceSave.classList.add('hidden');
        dom.voiceVisualizer.classList.remove('recording');
        dom.voiceStatus.textContent = 'Ses kaydı başlatmak için butona dokunun';
        dom.voiceTimer.classList.add('hidden');
        dom.voiceTimer.textContent = '00:00';
        dom.voicePreview.classList.add('hidden');
        dom.voiceNoteField.classList.add('hidden');
        dom.voiceNoteText.value = '';
        dom.voiceAudio.src = '';
    }

    // ── Audio Recording (MediaRecorder) ──
    function formatTime(seconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    async function startRecording() {
        // Request microphone permission
        let stream;
        try {
            dom.voiceStatus.textContent = 'Mikrofon izni isteniyor...';
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            console.error('Microphone permission denied:', err);
            showToast('Mikrofon izni verilmedi. Lütfen izin verin.', 'error');
            dom.voiceStatus.textContent = '⚠️ Mikrofon izni reddedildi';
            return;
        }

        // Determine best mime type
        const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', ''];
        let mimeType = '';
        for (const mt of mimeTypes) {
            if (!mt || MediaRecorder.isTypeSupported(mt)) {
                mimeType = mt;
                break;
            }
        }

        state.audioChunks = [];
        state.audioBlob = null;
        state.audioDataUrl = null;

        try {
            const options = mimeType ? { mimeType } : {};
            state.mediaRecorder = new MediaRecorder(stream, options);
        } catch (err) {
            console.error('MediaRecorder error:', err);
            showToast('Ses kaydı başlatılamadı', 'error');
            stream.getTracks().forEach(t => t.stop());
            return;
        }

        state.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                state.audioChunks.push(e.data);
            }
        };

        state.mediaRecorder.onstop = () => {
            // Stop all tracks
            stream.getTracks().forEach(t => t.stop());

            // Build blob
            const actualMime = state.mediaRecorder.mimeType || 'audio/webm';
            state.audioBlob = new Blob(state.audioChunks, { type: actualMime });

            // Convert to dataUrl for storage
            const reader = new FileReader();
            reader.onload = (ev) => {
                state.audioDataUrl = ev.target.result;
                // Show preview
                dom.voiceAudio.src = URL.createObjectURL(state.audioBlob);
                dom.voicePreview.classList.remove('hidden');
                dom.voiceNoteField.classList.remove('hidden');
                dom.btnVoiceSave.classList.remove('hidden');
                dom.voiceStatus.textContent = '✅ Kayıt tamamlandı. Dinleyip kaydedebilirsiniz.';
            };
            reader.readAsDataURL(state.audioBlob);
        };

        state.mediaRecorder.onerror = (e) => {
            console.error('MediaRecorder error:', e);
            showToast('Ses kaydı hatası', 'error');
            stopRecording();
        };

        // Start recording
        state.mediaRecorder.start(1000); // collect data every second
        state.isRecording = true;

        // UI updates
        dom.voiceVisualizer.classList.add('recording');
        dom.voiceStatus.textContent = '🔴 Kayıt yapılıyor... Konuşun';
        dom.voiceTimer.classList.remove('hidden');
        dom.voicePreview.classList.add('hidden');
        dom.voiceNoteField.classList.add('hidden');
        dom.btnVoiceStart.classList.add('hidden');
        dom.btnVoiceStop.classList.remove('hidden');
        dom.btnVoiceSave.classList.add('hidden');

        // Timer
        state.recordingStartTime = Date.now();
        state.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - state.recordingStartTime) / 1000);
            dom.voiceTimer.textContent = formatTime(elapsed);
        }, 1000);
    }

    function stopRecording() {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
        state.isRecording = false;
        dom.voiceVisualizer.classList.remove('recording');
        dom.btnVoiceStop.classList.add('hidden');
        dom.btnVoiceStart.classList.remove('hidden');

        if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
            try {
                state.mediaRecorder.stop();
            } catch { /* ignore */ }
        }
    }

    function saveVoiceNote() {
        if (!state.audioDataUrl) {
            showToast('Ses kaydı bulunamadı', 'error');
            return;
        }

        const noteText = (dom.voiceNoteText.value || '').trim() || '🎤 Sesli not';
        const duration = state.recordingStartTime
            ? Math.floor((Date.now() - state.recordingStartTime) / 1000)
            : 0;

        // Determine file extension from mime
        const mime = state.audioBlob ? state.audioBlob.type : 'audio/webm';
        let ext = 'webm';
        if (mime.includes('ogg')) ext = 'ogg';
        else if (mime.includes('mp4')) ext = 'mp4';

        const filename = `ses_${Date.now()}.${ext}`;

        const mediaItem = {
            type: 'audio',
            filename: filename,
            dataUrl: state.audioDataUrl,
            duration: duration,
            mimeType: mime,
        };

        addEntry('voice', noteText, [mediaItem]);
        closePanel('voice-panel');
        showToast(`Sesli not kaydedildi (${formatTime(duration)}) ✓`, 'success');
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
                const mediaItems = entry.media.map((m, i) => {
                    if (m.type === 'audio') {
                        const dur = m.duration ? ` (${Math.floor(m.duration/60).toString().padStart(2,'0')}:${(m.duration%60).toString().padStart(2,'0')})` : '';
                        return `<div class="note-audio-player">
                                    <audio src="${m.dataUrl}" controls preload="metadata" style="width:100%;height:36px;border-radius:8px;"></audio>
                                    <small style="color:var(--text-secondary);font-size:0.75rem;">🎤 Ses kaydı${dur}</small>
                                </div>`;
                    } else if (m.type === 'photo') {
                        return `<img src="${m.dataUrl}" class="note-media-thumb" onclick="app.showMedia('${entry.id}', ${i})" alt="Fotoğraf">`;
                    } else {
                        return `<div class="media-thumb-container" onclick="app.showMedia('${entry.id}', ${i})">
                                  <video src="${m.dataUrl}" class="note-media-thumb" muted></video>
                                  <span class="video-badge">▶</span>
                                </div>`;
                    }
                });
                // Separate audio from visual media
                const audioItems = mediaItems.filter((_, i) => entry.media[i].type === 'audio');
                const visualItems = mediaItems.filter((_, i) => entry.media[i].type !== 'audio');
                if (audioItems.length) mediaHtml += audioItems.join('');
                if (visualItems.length) mediaHtml += `<div class="note-media-strip">${visualItems.join('')}</div>`;
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

        if (media.type === 'audio') {
            dom.mediaModalTitle.textContent = 'Ses Kaydı';
            dom.mediaModalBody.innerHTML = `<audio src="${media.dataUrl}" controls autoplay style="width:100%"></audio>`;
        } else if (media.type === 'photo') {
            dom.mediaModalTitle.textContent = 'Fotoğraf';
            dom.mediaModalBody.innerHTML = `<img src="${media.dataUrl}" alt="Fotoğraf">`;
        } else {
            dom.mediaModalTitle.textContent = 'Video';
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
        dom.btnVoiceStart.addEventListener('click', startRecording);
        dom.btnVoiceStop.addEventListener('click', stopRecording);
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
