// ---------- CONFIG ----------
const BACKEND = 'https://hyzelabsdev.vercel.app/api/vibra';
const COOLDOWN_SEC = 1;
let cooldownActive = false;
let cooldownTimer = null;

let player = null;
let isPlaying = false;
let progressInterval = null;
let playerReady = false;
let currentVideoId = null;

const welcomeContainer = document.getElementById('welcomeContainer');
const chatContainer = document.getElementById('chatContainer');
const chatScreen = document.getElementById('chatScreen');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const backBtn = document.getElementById('backBtn');
const chatMessagesDiv = document.getElementById('chatMessages');
const HYZE_LOGO_URL = 'https://i.imgur.com/3TQgMBb.png';

// Music intent detection keywords
const MUSIC_KEYWORDS = [
    'play', 'make', 'create', 'generate', 'produce', 'compose',
    'write a song', 'give me a beat', 'play me', 'make a track',
    'i want music', 'produce a', 'create a song', 'generate music',
    'play some', 'drop a beat', 'hit me with', 'need a track',
    'make me a', 'compose a', 'a song about', 'a beat for'
];

function isMusicIntent(text) {
    const lower = text.toLowerCase().trim();
    // If the message is super short like "hi", "hello", "how are you" -> not music
    if (lower.length < 3 && !lower.includes('play')) return false;
    // Check for music keywords
    for (let keyword of MUSIC_KEYWORDS) {
        if (lower.includes(keyword)) return true;
    }
    // Also detect if the message describes a genre/style without explicit command
    const musicStyleWords = ['beat', 'track', 'song', 'music', 'melody', 'rhythm', 'instrumental', 'ambient', 'lofi', 'edm', 'cinematic', 'orchestral', 'synth', 'piano', 'guitar', 'drum', 'bass', 'electronic', 'hip hop', 'jazz', 'classical', 'rock', 'pop', 'chill', 'relaxing', 'upbeat', 'energetic', 'calm', 'dreamy'];
    let styleMatches = 0;
    for (let word of musicStyleWords) {
        if (lower.includes(word)) styleMatches++;
    }
    // If contains at least 2 style words, likely music request
    if (styleMatches >= 2) return true;
    // If message starts with "i want" or "can you" and has music context
    if ((lower.startsWith('i want') || lower.startsWith('can you')) && (lower.includes('music') || lower.includes('song') || lower.includes('beat'))) return true;
    return false;
}

function getConversationalResponse(message) {
    const lower = message.toLowerCase().trim();
    if (lower === 'hi' || lower === 'hello' || lower === 'hey') {
        return "Hey there! 👋 I'm Hyze Vibra. Describe a song or tell me to 'play something chill' and I'll generate it for you!";
    }
    if (lower.includes('how are you')) {
        return "I'm doing great, ready to make some music! What vibe are you feeling today?";
    }
    if (lower.includes('thank')) {
        return "You're welcome! Let me know if you want another track. 🎵";
    }
    if (lower.includes('what can you do')) {
        return "I generate AI music from your descriptions. Just say 'play lo-fi beats' or 'make an epic cinematic track' and I'll create it instantly!";
    }
    if (lower.includes('help')) {
        return "Sure! Try saying: 'play relaxing piano', 'make upbeat electronic', or 'create dreamy ambient'. I'll turn your words into music.";
    }
    return "I'm here to create music for you! Try saying 'play a chill beat' or 'make something energetic' and I'll generate a track instantly. 🎶";
}

function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmt(seconds) {
    if (isNaN(seconds)) return "0:00";
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m + ":" + (sec < 10 ? "0" : "") + sec;
}

function resetChatSession() {
    while (chatMessagesDiv.firstChild) chatMessagesDiv.removeChild(chatMessagesDiv.firstChild);
    if (progressInterval) clearInterval(progressInterval);
    if (player && typeof player.stopVideo === 'function') player.stopVideo();
    currentVideoId = null;
    isPlaying = false;
}

function showChatScreen() {
    welcomeContainer.style.display = 'none';
    chatContainer.style.display = 'block';
    chatScreen.classList.add('active');
    setTimeout(() => chatInput.focus(), 100);
}

function showWelcomeScreen() {
    if (cooldownTimer) clearTimeout(cooldownTimer);
    cooldownActive = false;
    enableInputs(true);
    resetChatSession();
    chatContainer.style.display = 'none';
    welcomeContainer.style.display = 'block';
    chatScreen.classList.remove('active');
    searchInput.value = '';
    chatInput.value = '';
    hideTyping();
    if (player && typeof player.stopVideo === 'function') player.stopVideo();
    searchInput.focus();
}

function enableInputs(enable) {
    const inputs = [searchInput, chatInput, searchBtn, chatSendBtn];
    inputs.forEach(el => { if(el) el.disabled = !enable; });
    document.querySelectorAll('.quick-prompt').forEach(p => {
        if(enable) p.classList.remove('disabled');
        else p.classList.add('disabled');
    });
}

function startSilentCooldown() {
    if (cooldownActive) return;
    cooldownActive = true;
    enableInputs(false);
    if (cooldownTimer) clearTimeout(cooldownTimer);
    cooldownTimer = setTimeout(() => {
        cooldownActive = false;
        enableInputs(true);
        if (chatContainer.style.display !== 'none') chatInput.focus();
        else searchInput.focus();
        cooldownTimer = null;
    }, COOLDOWN_SEC * 1000);
}

function checkCooldownAndBlock() {
    if (cooldownActive) {
        const box = document.getElementById('chatInputBox') || document.querySelector('.search-box');
        if(box) {
            box.style.transform = 'translateX(3px)';
            setTimeout(() => { if(box) box.style.transform = ''; }, 120);
        }
        return true;
    }
    return false;
}

function addMessage(text, isUser) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
    if (isUser) {
        messageDiv.innerHTML = `<div class="message-content"><div>${escapeHtml(text)}</div><div class="message-time">${getCurrentTime()}</div></div>`;
    } else {
        messageDiv.innerHTML = `
            <div class="bot-avatar"><img src="${HYZE_LOGO_URL}" alt="Hyze" class="bot-avatar-img"></div>
            <div class="message-content"><div>${escapeHtml(text)}</div><div class="message-time">${getCurrentTime()}</div></div>
        `;
    }
    chatMessagesDiv.appendChild(messageDiv);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

function escapeHtml(str) {
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function showTyping() {
    hideTyping();
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
        <div class="bot-avatar"><img src="${HYZE_LOGO_URL}" alt="Hyze" class="bot-avatar-img"></div>
        <div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>
    `;
    chatMessagesDiv.appendChild(typingDiv);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

function hideTyping() {
    const typing = document.getElementById('typingIndicator');
    if (typing) typing.remove();
}

function addMusicCard(title, videoId) {
    currentVideoId = videoId;
    const cardDiv = document.createElement('div');
    cardDiv.className = 'message bot';
    cardDiv.innerHTML = `
        <div class="bot-avatar"><img src="${HYZE_LOGO_URL}" alt="Hyze" class="bot-avatar-img"></div>
        <div class="message-content" style="max-width: 400px;">
            <div style="margin-bottom: 6px; font-weight: 500;">🎵 generated track</div>
            <div class="music-card">
                <div class="music-header"><div class="album-art"><i class="fas fa-play-circle"></i></div><div class="music-info"><h3 id="card-title-${videoId}">${escapeHtml(title)}</h3><p>AI · Hyze Vibra</p></div></div>
                <div class="player-controls"><button class="play-btn" id="play-btn-${videoId}"><i class="fas fa-play"></i></button><div class="progress-section"><div class="progress-bar" id="progress-bar-${videoId}" onclick="window.seekToPlayer(event, this)"><div class="progress-fill" id="progress-fill-${videoId}"></div></div><div class="time-display"><span id="time-current-${videoId}">0:00</span><span id="time-total-${videoId}">0:00</span></div></div></div>
                <div class="volume-control"><i class="fas fa-volume-up" style="font-size: 11px;"></i><input type="range" class="volume-slider" id="vol-slider-${videoId}" min="0" max="100" value="70" oninput="window.setPlayerVolume(this.value)"><span class="volume-value" id="vol-display-${videoId}">70</span></div>
            </div>
            <div class="message-time">${getCurrentTime()}</div>
        </div>
    `;
    chatMessagesDiv.appendChild(cardDiv);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    const volSlider = document.getElementById(`vol-slider-${videoId}`);
    if(volSlider) volSlider.addEventListener('input', (e) => setPlayerVolume(e.target.value));
    const playBtnEl = document.getElementById(`play-btn-${videoId}`);
    if(playBtnEl) playBtnEl.onclick = () => togglePlayback();
}

function updatePlayBtnUI() {
    const btn = document.getElementById(`play-btn-${currentVideoId}`);
    if(btn) btn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
}

function startProgressUpdate() {
    if(progressInterval) clearInterval(progressInterval);
    progressInterval = setInterval(() => {
        if(!player || typeof player.getCurrentTime !== 'function') return;
        try {
            const cur = player.getCurrentTime();
            const dur = player.getDuration();
            if(dur && dur > 0 && currentVideoId) {
                const fill = document.getElementById(`progress-fill-${currentVideoId}`);
                const curSpan = document.getElementById(`time-current-${currentVideoId}`);
                const totalSpan = document.getElementById(`time-total-${currentVideoId}`);
                if(fill) fill.style.width = (cur / dur) * 100 + '%';
                if(curSpan) curSpan.textContent = fmt(cur);
                if(totalSpan) totalSpan.textContent = fmt(dur);
            }
        } catch(e) {}
    }, 400);
}

window.togglePlayback = function() {
    if(!player) return;
    try {
        if(player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
        else player.playVideo();
    } catch(e) {}
};

window.seekToPlayer = function(event, element) {
    if(!player) return;
    try {
        const rect = element.getBoundingClientRect();
        const percent = (event.clientX - rect.left) / rect.width;
        const duration = player.getDuration();
        if(duration && duration > 0) player.seekTo(percent * duration, true);
    } catch(e) {}
};

window.setPlayerVolume = function(val) {
    const display = document.getElementById(`vol-display-${currentVideoId}`);
    if(display) display.textContent = val;
    if(player && typeof player.setVolume === 'function') player.setVolume(parseInt(val));
};

window.onYouTubeIframeAPIReady = function() {
    player = new YT.Player('player', {
        height: '1', width: '1',
        playerVars: { autoplay: 0, controls: 0, modestbranding: 1, playsinline: 1 },
        events: {
            onReady: (e) => { playerReady = true; e.target.setVolume(70); },
            onStateChange: (e) => {
                const state = e.data;
                if(state === YT.PlayerState.PLAYING) { isPlaying = true; updatePlayBtnUI(); startProgressUpdate(); }
                else if(state === YT.PlayerState.PAUSED) { isPlaying = false; updatePlayBtnUI(); }
                else if(state === YT.PlayerState.ENDED) { isPlaying = false; updatePlayBtnUI(); if(progressInterval) clearInterval(progressInterval); }
            }
        }
    });
};

async function generateMusic(query) {
    showTyping();
    if(!playerReady) await new Promise(r => setTimeout(r, 1200));
    if(!playerReady) {
        hideTyping();
        addMessage("✨ Audio engine is warming up. One moment please.", false);
        return false;
    }
    try {
        let data = null;
        const endpoints = [
            `${BACKEND}?q=${encodeURIComponent(query)}`,
            `${BACKEND}?query=${encodeURIComponent(query)}`,
            `${BACKEND}?search=${encodeURIComponent(query)}`
        ];
        for(let url of endpoints) {
            const resp = await fetch(url);
            if(resp.ok) { data = await resp.json(); break; }
        }
        if(!data) throw new Error();
        let videoId = null, title = query;
        if(data.videoId) { videoId = data.videoId; title = data.title || query; }
        else if(data.id) { videoId = data.id; title = data.title || query; }
        else if(data.items && data.items[0]) { const item = data.items[0]; videoId = item.id?.videoId || item.videoId || item.id; title = item.snippet?.title || item.title || query; }
        else if(typeof data === 'string') videoId = data;
        if(!videoId) throw new Error();
        hideTyping();
        addMusicCard(title, videoId);
        player.loadVideoById({ videoId, startSeconds: 0 });
        return true;
    } catch(err) {
        hideTyping();
        addMessage("Couldn't generate that vibe. Try rephrasing: e.g., 'play upbeat synth pop' or 'make calm piano'.", false);
        return false;
    }
}

async function processQuery(rawQuery) {
    const query = rawQuery.trim();
    if(!query) return;
    if(checkCooldownAndBlock()) return;

    showChatScreen();
    addMessage(query, true);
    if(chatInput) chatInput.value = '';
    if(searchInput) searchInput.value = '';

    // Detect if user wants music or just conversation
    if (isMusicIntent(query)) {
        await generateMusic(query);
    } else {
        // Conversational response - no music generation
        showTyping();
        setTimeout(() => {
            hideTyping();
            addMessage(getConversationalResponse(query), false);
        }, 600);
    }
    startSilentCooldown();
}

searchBtn.addEventListener('click', () => processQuery(searchInput.value));
searchInput.addEventListener('keypress', e => { if(e.key === 'Enter') processQuery(searchInput.value); });
chatSendBtn.addEventListener('click', () => processQuery(chatInput.value));
chatInput.addEventListener('keypress', e => { if(e.key === 'Enter') processQuery(chatInput.value); });
backBtn.addEventListener('click', showWelcomeScreen);
document.querySelectorAll('.quick-prompt').forEach(btn => btn.addEventListener('click', () => processQuery(btn.dataset.prompt)));
window.addEventListener('load', () => searchInput.focus());
