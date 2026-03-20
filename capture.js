/* ============================================
   Gezi Notlarım - Mobile Capture Logic
   ============================================ */

(function () {
    'use strict';

    // ── State ──
    const state = {
        trips: [],        // Array of all trips
        activeTripId: null, // ID of the current active trip
        trip: null,       // Reference to the active trip object { id, name, startDate, entries: [] }
        currentLocation: null,
        isRecording: false,
        mediaRecorder: null,
        audioChunks: [],
        audioBlob: null,
        audioDataUrl: null,
        recordingStartTime: null,
        timerInterval: null,
    };

    // ── Database ──
    const db = {
        name: 'GeziMobileDB',
        version: 1,
        storeName: 'keyval',
        dbInstance: null,
        init() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(this.name, this.version);
                req.onupgradeneeded = (e) => {
                    const database = e.target.result;
                    if (!database.objectStoreNames.contains(this.storeName)) {
                        database.createObjectStore(this.storeName);
                    }
                };
                req.onsuccess = (e) => {
                    this.dbInstance = e.target.result;
                    resolve();
                };
                req.onerror = (e) => reject(e.target.error);
            });
        },
        get(key) {
            return new Promise((resolve, reject) => {
                const tx = this.dbInstance.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        },
        set(key, val) {
            return new Promise((resolve, reject) => {
                const tx = this.dbInstance.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const req = store.put(val, key);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        },
        remove(key) {
            return new Promise((resolve, reject) => {
                const tx = this.dbInstance.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const req = store.delete(key);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }
    };

    // ── DOM References ──
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        // Sections
        tripSetup: $('#trip-setup'),
        tripActive: $('#trip-active'),
        // Trip setup
        existingTrips: $('#existing-trips'),
        tripsList: $('#trips-list'),
        btnImportTrip: $('#btn-import-trip'),
        importInput: $('#import-input'),
        tripNameInput: $('#trip-name'),
        btnStartTrip: $('#btn-start-trip'),
        // Active trip
        activeTripName: $('#active-trip-name'),
        btnEditTripName: $('#btn-edit-trip-name'),
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
        // Notes
        notesContainer: $('#notes-container'),
        notesCount: $('#notes-count'),
        // Modals
        exportModal: $('#export-modal'),
        btnExportSeparate: $('#btn-export-separate'),
        btnExportEmbedded: $('#btn-export-embedded'),
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
    async function loadAllTrips() {
        await db.init();

        // Migration from old single-trip system
        const oldTrip = localStorage.getItem('gezi-current-trip');
        if (oldTrip) {
            try {
                const parsed = JSON.parse(oldTrip);
                parsed.id = parsed.id || 'trip_' + Date.now();
                localStorage.setItem('gezi-trips', JSON.stringify([parsed]));
                localStorage.setItem('gezi-active-trip-id', parsed.id);
                localStorage.removeItem('gezi-current-trip');
            } catch {
                localStorage.removeItem('gezi-current-trip');
            }
        }

        // Migration from localStorage to IndexedDB
        const savedTripsStr = localStorage.getItem('gezi-trips');
        if (savedTripsStr) {
            try {
                const parsed = JSON.parse(savedTripsStr);
                await db.set('gezi-trips', parsed);
                const activeIdStr = localStorage.getItem('gezi-active-trip-id');
                if (activeIdStr) {
                    await db.set('gezi-active-trip-id', activeIdStr);
                }
                localStorage.removeItem('gezi-trips');
                localStorage.removeItem('gezi-active-trip-id');
                console.log('Migrated data from localStorage to IndexedDB');
            } catch(e) { console.error('Migration failed', e); }
        }

        const savedTrips = await db.get('gezi-trips');
        if (savedTrips) {
            state.trips = savedTrips;
        } else {
            state.trips = [];
        }

        renderTripsList();

        const activeId = await db.get('gezi-active-trip-id');
        if (activeId) {
            const found = state.trips.find(t => t.id === activeId);
            if (found) {
                state.activeTripId = activeId;
                state.trip = found;
                showTripActive();
            } else {
                await db.remove('gezi-active-trip-id');
                showTripSetup();
            }
        } else {
            showTripSetup();
        }
    }

    function renderTripsList() {
        if (state.trips.length === 0) {
            dom.existingTrips.classList.add('hidden');
            return;
        }
        dom.existingTrips.classList.remove('hidden');
        
        // Sort by start date descending
        const sorted = [...state.trips].sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
        
        dom.tripsList.innerHTML = sorted.map(t => {
            const date = new Date(t.startDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
            const noteCount = t.entries ? t.entries.length : 0;
            return `
                <div class="trip-list-item" style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg-card); border-radius:var(--radius-md); margin-bottom:8px; border:1px solid var(--border-glass);">
                    <div style="flex:1; cursor:pointer;" onclick="app.resumeTrip('${t.id}')">
                        <h4 style="margin:0; font-size:1rem; font-weight:600; color:var(--text-primary);">${t.name}</h4>
                        <span style="font-size:0.8rem; color:var(--text-secondary);">${date} · ${noteCount} not</span>
                    </div>
                    <button class="icon-btn-sm" style="color:var(--accent-red);" onclick="app.deleteTrip('${t.id}')" title="Geziyi Sil">
                        <span class="material-symbols-rounded">delete</span>
                    </button>
                </div>
            `;
        }).join('');
    }

    async function saveTrips() {
        try {
            await db.set('gezi-trips', state.trips);
            if (state.activeTripId) {
                await db.set('gezi-active-trip-id', state.activeTripId);
            } else {
                await db.remove('gezi-active-trip-id');
            }
        } catch (err) {
            console.error('Storage error:', err);
            showToast('HATA: Gezi verisi kaydedilemedi.', 'error');
            throw err;
        }
    }

    async function resumeTrip(id) {
        const found = state.trips.find(t => t.id === id);
        if (found) {
            state.activeTripId = id;
            state.trip = found;
            await saveTrips();
            showTripActive();
        }
    }

    async function deleteTrip(id) {
        if (!confirm('Bu geziyi ve içindeki tüm notları silmek istediğinize emin misiniz? Bu işlem geri alınamaz!')) return;
        state.trips = state.trips.filter(t => t.id !== id);
        if (state.activeTripId === id) {
            state.activeTripId = null;
            state.trip = null;
            showTripSetup();
        }
        await saveTrips();
        renderTripsList();
        showToast('Gezi silindi', 'info');
    }

    async function startTrip() {
        const name = dom.tripNameInput.value.trim();
        if (!name) {
            showToast('Lütfen gezi adı girin', 'error');
            dom.tripNameInput.focus();
            return;
        }
        const newTrip = {
            id: 'trip_' + Date.now(),
            name: name,
            startDate: new Date().toISOString(),
            entries: [],
        };
        state.trips.unshift(newTrip);
        state.activeTripId = newTrip.id;
        state.trip = newTrip;
        
        await saveTrips();
        showTripActive();
        dom.tripNameInput.value = '';
        showToast('Gezi başlatıldı! İyi yolculuklar 🧳', 'success');
    }

    async function endTrip() {
        if (!state.trip) return;
        state.trip.endDate = new Date().toISOString();
        state.activeTripId = null; // Deactivate
        state.trip = null;
        await saveTrips();
        showTripSetup();
        renderTripsList();
        showToast('Gezi kapatıldı!', 'success');
    }

    async function editTripName() {
        if (!state.trip) return;
        const newName = prompt('Gezi adını düzenleyin:', state.trip.name);
        if (newName !== null && newName.trim() !== '') {
            state.trip.name = newName.trim();
            dom.activeTripName.textContent = state.trip.name;
            await saveTrips();
            renderTripsList();
            showToast('Gezi adı güncellendi', 'success');
        }
    }

    function handleImportIconClick() {
        dom.importInput.click();
    }

    function handleImportFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (!data.tripName || !data.entries) {
                    showToast('Geçersiz dosya formatı', 'error');
                    return;
                }
                
                const newTrip = {
                    id: 'trip_' + Date.now(),
                    name: data.tripName + ' (İçe Aktarıldı)',
                    startDate: data.startDate || new Date().toISOString(),
                    endDate: data.endDate,
                    entries: data.entries || []
                };
                
                state.trips.unshift(newTrip);
                await saveTrips();
                renderTripsList();
                showToast('Gezi başarıyla içe aktarıldı ✓', 'success');
            } catch (err) {
                console.error(err);
                showToast('Dosya okunamadı', 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset input
    }

    function showTripSetup() {
        dom.tripActive.classList.add('hidden');
        dom.tripSetup.classList.remove('hidden');
        renderTripsList();
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
            // Android'deki cızırtıyı ve ses bozulmalarını önlemek için tarayıcının varsayılan
            // ses işleme özelliklerini (yankı engelleme, gürültü azaltma, otomatik kazanç) kapatıyoruz.
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: true, // Sesi mikrofona çok yakınmış gibi hissettirmemesi için kazanç kontrolünü geri açıyoruz
                    channelCount: 1, // Mono kayıt
                    sampleRate: 44100
                }
            });
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
            // Ses kalitesini artırmak için bitrate değerini yükseltiyoruz (128 kbps)
            const options = mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 };
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

    async function saveVoiceNote() {
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

        const added = await addEntry('voice', noteText, [mediaItem]);
        if (added) {
            closePanel('voice-panel');
            showToast(`Sesli not kaydedildi (${formatTime(duration)}) ✓`, 'success');
        }
    }

    // ── Text Note ──
    async function saveTextNote() {
        const text = dom.textNoteInput.value.trim();
        if (!text) {
            showToast('Lütfen not yazın', 'error');
            dom.textNoteInput.focus();
            return;
        }
        const added = await addEntry('text', text);
        if (added) {
            dom.textNoteInput.value = '';
            closePanel('text-panel');
            showToast('Yazılı not kaydedildi ✓', 'success');
        }
    }

    // ── Entry Management ──
    async function addEntry(type, text, media = []) {
        const entry = {
            id: 'entry_' + Date.now(),
            timestamp: new Date().toISOString(),
            location: state.currentLocation ? { ...state.currentLocation } : null,
            type: type,
            text: text,
            media: media,
        };
        state.trip.entries.unshift(entry); // newest first
        try {
            await saveTrips();
            updateStats();
            renderNotes();
            return entry;
        } catch (err) {
            // Revert memory state
            state.trip.entries.shift();
            return null;
        }
    }

    async function deleteEntry(entryId) {
        if (!confirm('Bu notu silmek istediğinize emin misiniz?')) return;
        state.trip.entries = state.trip.entries.filter(e => e.id !== entryId);
        await saveTrips();
        updateStats();
        renderNotes();
        showToast('Not silindi', 'info');
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
                        return `<img src="${m.dataUrl}" class="note-media-thumb" style="cursor:default;" alt="Fotoğraf">`;
                    } else {
                        return `<div class="media-thumb-container" style="cursor:default;">
                                  <video src="${m.dataUrl}" class="note-media-thumb" controls></video>
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
                        <button class="btn-delete" onclick="app.deleteEntry('${entry.id}')">
                            <span class="material-symbols-rounded" style="font-size:16px">delete</span>
                            Sil
                        </button>
                    </div>
                </div>`;
        }).join('');
    }

    // ── Export ──
    function showExportModal() {
        dom.exportModal.classList.remove('hidden');
    }

    function closeExportModal() {
        dom.exportModal.classList.add('hidden');
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

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    // ── Event Bindings ──
    function bindEvents() {
        // Theme
        dom.btnThemeToggle.addEventListener('click', toggleTheme);

        // Trip
        dom.btnStartTrip.addEventListener('click', startTrip);
        dom.btnEndTrip.addEventListener('click', endTrip);
        dom.btnEditTripName.addEventListener('click', editTripName);
        dom.btnImportTrip.addEventListener('click', handleImportIconClick);
        dom.importInput.addEventListener('change', handleImportFile);
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

        // Export
        dom.btnExport.addEventListener('click', showExportModal);
        dom.btnExportSeparate.addEventListener('click', exportSeparate);
        dom.btnExportEmbedded.addEventListener('click', exportEmbedded);

        // Close modals
        $('.btn-close-modal').addEventListener('click', closeExportModal);

        // Close modal on overlay click
        dom.exportModal.addEventListener('click', (e) => {
            if (e.target === dom.exportModal) closeExportModal();
        });
    }

    // ── Public API (for inline onclick handlers) ──
    window.app = {
        deleteEntry,
        resumeTrip,
        deleteTrip,
    };

    // ── Init ──
    async function init() {
        initTheme();
        await loadAllTrips();
        bindEvents();
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
