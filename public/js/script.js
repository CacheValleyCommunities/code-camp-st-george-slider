// Update clock
function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const date = now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
    document.getElementById('clock').textContent = `${date} ${time}`;
}
updateClock();
setInterval(updateClock, 10000);

// WebSocket connection for media control
const socket = createSocket("/ws/display");

function fillLeaderboard(list, players) {
    list.replaceChildren();
    if (!players || players.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "color: #858585; padding: 20px; text-align: center;";
        empty.textContent = "No players participated";
        list.appendChild(empty);
        return;
    }
    players.forEach((player) => {
        const item = document.createElement("div");
        const rank = Number(player.rank);
        item.className = "leaderboard-item";
        if (Number.isInteger(rank) && rank >= 1 && rank <= 10) {
            item.classList.add("rank-" + rank);
        }
        const rankEl = document.createElement("div");
        rankEl.className = "leaderboard-rank";
        rankEl.textContent = "#" + (Number.isInteger(rank) ? String(rank) : "");
        const nameEl = document.createElement("div");
        nameEl.className = "leaderboard-name";
        nameEl.textContent = String(player.name ?? "");
        const scoreEl = document.createElement("div");
        scoreEl.className = "leaderboard-score";
        scoreEl.textContent = String(player.score ?? 0) + " pts";
        item.append(rankEl, nameEl, scoreEl);
        list.appendChild(item);
    });
}

function roomAnnouncements() {
    const room = window.ROOM_SETTINGS;
    if (room && Array.isArray(room.announcements) && room.announcements.length > 0) {
        return room.announcements.map((line) => String(line));
    }
    return ["Welcome to CodeCamp 2025!"];
}

function applyRoomSettings(data) {
    if (!data || typeof data !== "object") {
        return;
    }
    const title = document.getElementById("event-title");
    if (title && typeof data.eventTitle === "string") {
        title.textContent = data.eventTitle;
    }
    const wifi = document.getElementById("wifi-info");
    if (wifi && typeof data.wifiLabel === "string") {
        wifi.textContent = data.wifiLabel;
        wifi.hidden = data.wifiLabel === "";
    }
    if (data.eventDates && typeof data.eventDates === "object") {
        window.EVENT_DATES = data.eventDates;
    }
}

// Announcements Ticker
(function() {

    let gameLink = window.location.origin + '/game';
    document.getElementById('game-link').textContent = gameLink;
    const tickerContent = document.getElementById('ticker-content');
    let announcements = roomAnnouncements();

    function updateTicker() {
        if (!tickerContent) return;
        
        // Duplicate content for seamless loop
        tickerContent.replaceChildren();
        const appendItems = () => {
            announcements.forEach((msg, index) => {
                if (index > 0) {
                    const separator = document.createElement("span");
                    separator.className = "ticker-separator";
                    separator.textContent = "•";
                    tickerContent.appendChild(separator);
                }
                const item = document.createElement("span");
                item.className = "ticker-item";
                item.textContent = msg;
                tickerContent.appendChild(item);
            });
        };
        appendItems();
        const separator = document.createElement("span");
        separator.className = "ticker-separator";
        separator.textContent = "•";
        tickerContent.appendChild(separator);
        appendItems();
    }

    // Listen for ticker updates from server
    socket.on('ticker-update', (data) => {
        if (data.announcements && Array.isArray(data.announcements)) {
            announcements = data.announcements.map((line) => String(line));
            updateTicker();
        }
    });

    socket.on('room-settings', (data) => {
        applyRoomSettings(data);
        if (data && Array.isArray(data.announcements) && data.announcements.length > 0) {
            announcements = data.announcements.map((line) => String(line));
            updateTicker();
        }
        updateEventCountdown();
    });

    // Initialize ticker
    updateTicker();
})();
const mediaWindow = document.getElementById('media-window');
const mediaVideo = document.getElementById('media-video');
const mediaYoutube = document.getElementById('media-youtube');
const mediaImage = document.getElementById('media-image');
const mediaText = document.getElementById('media-text');
const modeIndicator = document.getElementById('mode-indicator');

function setMode(mode) {
    if (!modeIndicator) {
        return;
    }
    modeIndicator.dataset.mode = mode;
    const labels = {
        offline: 'Offline',
        online: 'Online',
        video: 'Video',
        youtube: 'YouTube',
        image: 'Image',
        text: 'Text'
    };
    modeIndicator.title = labels[mode] || mode;
}

const sessionState = {
    audioUnlocked: false,
    autoplay: true,
    wantsWake: false,
    wakeLock: null
};
let volumeLevel = 80;
let volumeMuted = false;
const ytPlayers = { media: null, audio: null };
let ytReady = false;
const ytQueue = [];

function readStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch (err) {
        return null;
    }
}

function writeStorage(key, value) {
    try {
        if (value === null) {
            localStorage.removeItem(key);
            return;
        }
        localStorage.setItem(key, value);
    } catch (err) {
        console.error('Storage write failed:', err);
    }
}

function readStoredAutoplay() {
    const saved = readStorage('display-autoplay');
    if (saved === null) {
        return true;
    }
    return saved === '1';
}

sessionState.autoplay = readStoredAutoplay();
const storedVolumeRaw = readStorage('display-volume');
if (storedVolumeRaw !== null) {
    const storedVolume = Number(storedVolumeRaw);
    if (Number.isFinite(storedVolume)) {
        volumeLevel = Math.max(0, Math.min(100, storedVolume));
    }
}
volumeMuted = readStorage('display-muted') === '1';
if (mediaVideo) {
    mediaVideo.muted = true;
    mediaVideo.volume = volumeLevel / 100;
}

function shouldHear() {
    return sessionState.audioUnlocked && sessionState.autoplay && !volumeMuted && volumeLevel > 0;
}

function applyMediaElementAudio() {
    if (!mediaVideo) {
        return;
    }
    mediaVideo.volume = Math.max(0, Math.min(1, volumeLevel / 100));
    mediaVideo.muted = !shouldHear();
    const playing = mediaVideo.classList.contains('active') && mediaVideo.src;
    if (shouldHear() && playing) {
        mediaVideo.play().catch((err) => console.log('Video play failed:', err));
    } else if (!sessionState.autoplay) {
        mediaVideo.pause();
    }
}

function applyPlayerAudio(player) {
    if (!player || typeof player.setVolume !== 'function') {
        return;
    }
    const level = volumeMuted ? 0 : volumeLevel;
    try {
        player.setVolume(level);
        if (shouldHear()) {
            player.unMute();
            player.playVideo();
        } else {
            player.mute();
            if (!sessionState.autoplay && typeof player.pauseVideo === 'function') {
                player.pauseVideo();
            }
        }
    } catch (err) {
        console.log('YouTube volume update failed:', err);
    }
}

function applyVolume() {
    applyMediaElementAudio();
    applyPlayerAudio(ytPlayers.media);
    applyPlayerAudio(ytPlayers.audio);
    writeStorage('display-volume', String(volumeLevel));
    writeStorage('display-muted', volumeMuted ? '1' : '0');
    const muteButton = document.getElementById('volume-mute');
    const slider = document.getElementById('volume-slider');
    if (muteButton) {
        const silenced = volumeMuted || volumeLevel === 0;
        muteButton.setAttribute('aria-pressed', silenced ? 'true' : 'false');
        muteButton.setAttribute('aria-label', silenced ? 'Unmute' : 'Mute');
        muteButton.title = silenced ? 'Unmute' : 'Mute';
    }
    if (slider && document.activeElement !== slider) {
        slider.value = String(volumeLevel);
    }
}

function whenYouTubeReady(fn) {
    if (ytReady || (window.YT && window.YT.Player)) {
        ytReady = true;
        fn();
        return;
    }
    ytQueue.push(fn);
}

function flushYouTubeQueue() {
    ytReady = true;
    const pending = ytQueue.splice(0);
    pending.forEach((fn) => fn());
}

window.onYouTubeIframeAPIReady = function() {
    flushYouTubeQueue();
};

if (window.YT && window.YT.Player) {
    ytReady = true;
}

function stopMediaYouTube() {
    const player = ytPlayers.media;
    if (player && typeof player.stopVideo === 'function') {
        try {
            player.stopVideo();
        } catch (err) {
            console.log('YouTube stop failed:', err);
        }
    }
    if (mediaYoutube) {
        mediaYoutube.classList.remove('active');
        mediaYoutube.style.display = 'none';
    }
}

function ensureYouTubePlayer(kind, videoId) {
        const elementId = kind === 'media' ? 'media-youtube-player' : 'youtube-audio-player';
    whenYouTubeReady(() => {
        const existing = ytPlayers[kind];
        if (existing && typeof existing.loadVideoById === 'function') {
            if (sessionState.autoplay) {
                existing.loadVideoById(videoId);
            } else if (typeof existing.cueVideoById === 'function') {
                existing.cueVideoById(videoId);
            }
            applyPlayerAudio(existing);
            return;
        }
        const host = document.getElementById(elementId);
        if (!host) {
            return;
        }
        if (kind === 'media' && mediaYoutube) {
            mediaYoutube.classList.add('active');
            mediaYoutube.style.display = 'block';
        }
        ytPlayers[kind] = new YT.Player(elementId, {
            videoId: videoId,
            playerVars: {
                autoplay: sessionState.autoplay ? 1 : 0,
                mute: sessionState.audioUnlocked ? 0 : 1,
                loop: 1,
                playlist: videoId,
                controls: kind === 'media' ? 1 : 0,
                modestbranding: 1,
                rel: 0,
                iv_load_policy: 3,
                fs: kind === 'media' ? 1 : 0,
                origin: window.location.origin
            },
            events: {
                onReady: function(event) {
                    applyPlayerAudio(event.target);
                }
            }
        });
    });
}

// Extract YouTube video ID from various URL formats
function extractYouTubeId(url) {
    if (!url) return null;

    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }

    return null;
}

// Check if URL is a YouTube URL
function isYouTubeUrl(url) {
    return /youtube\.com|youtu\.be/.test(url);
}

function switchMode(mode, data = {}) {
    // Hide all media
    mediaVideo.classList.remove('active');
    mediaVideo.style.display = 'none';
    mediaYoutube.classList.remove('active');
    mediaYoutube.style.display = 'none';
    mediaImage.classList.remove('active');
    mediaImage.style.display = 'none';
    mediaText.classList.remove('active');
    mediaText.style.display = 'none';

    // Pause video if switching away from video mode
    if (mode !== 'video') {
        mediaVideo.pause();
        stopMediaYouTube();
    }

    // Show selected media
    if (mode === 'video') {
        if (data.url) {
            // Check if it's a YouTube URL
            if (isYouTubeUrl(data.url)) {
                const videoId = extractYouTubeId(data.url);
                if (videoId) {
                    mediaYoutube.classList.add('active');
                    mediaYoutube.style.display = 'block';
                    setMode('youtube');
                    ensureYouTubePlayer('media', videoId);
                } else {
                    console.error('Invalid YouTube URL');
                }
            } else {
                // Regular video file
                mediaVideo.src = data.url;
                mediaVideo.classList.add('active');
                mediaVideo.style.display = 'block';
                setMode('video');
                applyMediaElementAudio();
            }
        } else {
            // No URL provided, show video element if it has a source
            if (mediaVideo.src && !isYouTubeUrl(mediaVideo.src)) {
                mediaVideo.classList.add('active');
                mediaVideo.style.display = 'block';
                setMode('video');
                applyMediaElementAudio();
            } else if (mediaYoutube.classList.contains('active') || ytPlayers.media) {
                mediaYoutube.classList.add('active');
                mediaYoutube.style.display = 'block';
                setMode('youtube');
            }
        }
    } else if (mode === 'image') {
        if (data.url) {
            mediaImage.src = data.url;
        }
        mediaImage.classList.add('active');
        mediaImage.style.display = 'block';
        setMode('image');
    } else if (mode === 'text') {
        if (data.title) {
            mediaText.querySelector('h2').textContent = data.title;
        }
        if (data.content) {
            mediaText.querySelector('p').textContent = data.content;
        }
        mediaText.classList.add('active');
        mediaText.style.display = 'block';
        setMode('text');
    }
}

function toggleMediaWindow(expand) {
    if (!mediaWindow) {
        return;
    }
    if (expand) {
        if (window.DisplayWindows) {
            window.DisplayWindows.show('media-window');
        } else {
            mediaWindow.classList.remove('collapsed', 'hidden', 'minimized');
            mediaWindow.style.display = '';
        }
        mediaWindow.classList.add('expanded');
    } else {
        mediaWindow.classList.remove('expanded');
        if (window.DisplayWindows) {
            window.DisplayWindows.hide('media-window');
        } else {
            mediaWindow.classList.add('hidden');
            mediaWindow.style.display = 'none';
        }
    }
}

// Listen for WebSocket commands
socket.on('media-command', (data) => {
    console.log('Received media command:', data);

    if (data.action === 'show') {
        toggleMediaWindow(true);
        if (data.mode) {
            switchMode(data.mode, data);
        }
    } else if (data.action === 'hide') {
        toggleMediaWindow(false);
    } else if (data.action === 'mode') {
        toggleMediaWindow(true);
        switchMode(data.mode, data);
    } else if (data.action === 'toggle') {
        const isExpanded = mediaWindow.classList.contains('expanded');
        toggleMediaWindow(!isExpanded);
    }
});

socket.on('connect', () => {
    console.log('WebSocket connected');
    setMode('online');
});

socket.on('disconnect', () => {
    console.log('WebSocket disconnected');
    setMode('offline');
});

// Notification system
(function() {
    const notificationsContainer = document.getElementById('notifications-container');
    const notificationIcons = {
        info: 'ℹ️',
        success: '✓',
        warning: '⚠️',
        error: '✕'
    };
    let notificationIdCounter = 0;
    const activeNotifications = new Map(); // Map of notificationId -> notification element

    function showNotification(type, title, message, notificationId = null, autoDismiss = null) {
        if (!notificationsContainer) return;

        // Generate ID if not provided
        if (!notificationId) {
            notificationId = `notif-${Date.now()}-${notificationIdCounter++}`;
        }

        const notification = document.createElement('div');
        const safeType = ["info", "success", "warning", "error"].includes(type) ? type : "info";
        notification.className = `notification ${safeType}`;
        const icon = document.createElement("div");
        icon.className = "notification-icon";
        icon.textContent = notificationIcons[safeType] || notificationIcons.info;
        const content = document.createElement("div");
        content.className = "notification-content";
        const titleEl = document.createElement("div");
        titleEl.className = "notification-title";
        titleEl.textContent = title || safeType.toUpperCase();
        const messageEl = document.createElement("div");
        messageEl.className = "notification-message";
        messageEl.textContent = message || "";
        content.append(titleEl, messageEl);
        const closeButton = document.createElement("button");
        closeButton.className = "notification-close";
        closeButton.type = "button";
        closeButton.textContent = "×";
        closeButton.addEventListener("click", () => dismissNotification(notificationId));
        notification.append(icon, content, closeButton);

        notificationsContainer.appendChild(notification);
        activeNotifications.set(notificationId, notification);
        
        // Auto-dismiss if specified
        if (autoDismiss && autoDismiss > 0) {
            setTimeout(() => {
                dismissNotification(notificationId);
            }, autoDismiss);
        }
    }

    function dismissNotification(notificationId) {
        const notification = activeNotifications.get(notificationId);
        if (notification && notification.parentElement) {
            notification.classList.add('fade-out');
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
                activeNotifications.delete(notificationId);
            }, 300);
        }
    }

    function dismissAllNotifications() {
        activeNotifications.forEach((notification, id) => {
            dismissNotification(id);
        });
    }

    // Listen for notification events from WebSocket
    socket.on('notification', (data) => {
        const { type = 'info', title, message, id, autoDismiss } = data;
        showNotification(type, title, message, id, autoDismiss);
    });

    // Listen for dismiss notification events from WebSocket
    socket.on('dismiss-notification', (data) => {
        const { id } = data;
        if (id === 'all') {
            dismissAllNotifications();
        } else {
            dismissNotification(id);
        }
    });

    // Expose functions globally
    window.showNotification = showNotification;
    window.dismissNotification = dismissNotification;
    window.dismissAllNotifications = dismissAllNotifications;
})();

// Game window functionality
(function() {
    const gameWindow = document.getElementById('game-window');
    if (!gameWindow) return;

    let currentQuestion = null;
    let countdownInterval = null;
    let countdownSeconds = 30;
    let isGameWindowFullscreen = false;

    // Function to reset game window to waiting state
    function resetToWaitingState() {
        const countdownEl = document.getElementById('game-countdown');
        const leaderboardEl = document.getElementById('game-leaderboard');
        const activeEl = document.getElementById('game-active');
        const waitingEl = document.getElementById('game-waiting');
        
        // Hide everything except waiting
        if (countdownEl) {
            countdownEl.classList.add('hidden');
            countdownEl.style.display = 'none';
        }
        if (leaderboardEl) {
            leaderboardEl.classList.add('hidden');
            leaderboardEl.style.display = 'none';
        }
        if (activeEl) {
            activeEl.classList.add('hidden');
            activeEl.style.display = 'none';
        }
        if (waitingEl) {
            waitingEl.classList.remove('hidden');
            waitingEl.style.display = 'block';
        }
        
        // Clear any intervals
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    socket.on('game-command', (data) => {
        console.log('Game command received:', data);
        
        if (data.action === 'show') {
            console.log('Showing game window');
            if (window.DisplayWindows) {
                window.DisplayWindows.show('game-window');
            } else {
                gameWindow.classList.remove('hidden');
                gameWindow.style.display = '';
            }
            gameWindow.style.visibility = 'visible';
            gameWindow.style.opacity = '1';
            resetToWaitingState();
        } else if (data.action === 'hide') {
            console.log('Hiding game window');
            if (isGameWindowFullscreen) {
                gameWindow.classList.remove('fullscreen');
                isGameWindowFullscreen = false;
            }
            if (window.DisplayWindows) {
                window.DisplayWindows.hide('game-window');
            } else {
                gameWindow.classList.add('hidden');
                gameWindow.style.display = 'none';
            }
            resetToWaitingState();
        }
    });

    socket.on('game-window-toggle', () => {
        console.log('Game window toggle received');
        
        if (gameWindow.classList.contains('hidden') || gameWindow.classList.contains('minimized')) {
            if (window.DisplayWindows) {
                window.DisplayWindows.show('game-window');
            } else {
                gameWindow.classList.remove('hidden', 'minimized');
                gameWindow.style.display = '';
            }
            gameWindow.classList.add('fullscreen');
            isGameWindowFullscreen = true;
            resetToWaitingState();
        } else if (isGameWindowFullscreen || gameWindow.classList.contains('fullscreen')) {
            gameWindow.classList.remove('fullscreen');
            isGameWindowFullscreen = false;
        } else {
            gameWindow.classList.add('fullscreen');
            isGameWindowFullscreen = true;
        }
        if (window.DisplayWindows) {
            window.DisplayWindows.refresh('game-window');
        }
    });

    socket.on('game-display-question', (data) => {
        currentQuestion = data;
        const waitingEl = document.getElementById('game-waiting');
        const activeEl = document.getElementById('game-active');
        const leaderboardEl = document.getElementById('game-leaderboard');
        const countdownEl = document.getElementById('game-countdown');

        // Hide waiting and leaderboard
        if (waitingEl) {
            waitingEl.classList.add('hidden');
            waitingEl.style.display = 'none';
        }
        if (leaderboardEl) {
            leaderboardEl.classList.add('hidden');
            leaderboardEl.style.display = 'none';
        }
        
        // Show active question section
        if (activeEl) {
            activeEl.classList.remove('hidden');
            activeEl.style.display = 'block';
        }
        
        // Show countdown timer when question is displayed
        if (countdownEl) {
            countdownEl.classList.remove('hidden');
            countdownEl.style.display = 'block';
        }

        document.getElementById('game-question-number').textContent = 
            `Question ${data.questionNumber} of ${data.totalQuestions}`;
        document.getElementById('game-question-text').textContent = data.question;

        const answersContainer = document.getElementById('game-answers');
        answersContainer.innerHTML = '';
        
        data.answers.forEach((answer, index) => {
            const button = document.createElement('button');
            button.className = 'game-answer-button';
            button.textContent = answer.text;
            answersContainer.appendChild(button);
        });

        countdownSeconds = 30;
        startGameCountdown();
    });

    socket.on('game-question-results', (data) => {
        const buttons = document.querySelectorAll('.game-answer-button');
        const countdownEl = document.getElementById('game-countdown');
        
        buttons.forEach((btn, index) => {
            btn.classList.add('disabled');
            if (index === data.correctAnswerIndex) {
                btn.classList.add('correct');
            }
        });

        // Hide countdown timer after question results
        if (countdownEl) {
            countdownEl.classList.add('hidden');
            countdownEl.style.display = 'none';
        }

        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    });

    socket.on('game-leaderboard', (data) => {
        console.log('Leaderboard received:', data);
        const waitingEl = document.getElementById('game-waiting');
        const activeEl = document.getElementById('game-active');
        const leaderboardEl = document.getElementById('game-leaderboard');
        const countdownEl = document.getElementById('game-countdown');

        // Hide everything except leaderboard
        if (waitingEl) {
            waitingEl.classList.add('hidden');
            waitingEl.style.display = 'none';
        }
        if (activeEl) {
            activeEl.classList.add('hidden');
            activeEl.style.display = 'none';
        }
        if (countdownEl) {
            countdownEl.classList.add('hidden');
            countdownEl.style.display = 'none';
        }
        
        // Show leaderboard
        if (leaderboardEl) {
            leaderboardEl.classList.remove('hidden');
            leaderboardEl.style.display = 'block';
        }

        const leaderboardList = document.getElementById('leaderboard-list');
        if (leaderboardList) {
            fillLeaderboard(leaderboardList, data.players);
        }
    });

    socket.on('game-display-leaderboard', (data) => {
        console.log('Display leaderboard received:', data);
        const waitingEl = document.getElementById('game-waiting');
        const activeEl = document.getElementById('game-active');
        const leaderboardEl = document.getElementById('game-leaderboard');
        const countdownEl = document.getElementById('game-countdown');

        // Hide everything except leaderboard
        if (waitingEl) {
            waitingEl.classList.add('hidden');
            waitingEl.style.display = 'none';
        }
        if (activeEl) {
            activeEl.classList.add('hidden');
            activeEl.style.display = 'none';
        }
        if (countdownEl) {
            countdownEl.classList.add('hidden');
            countdownEl.style.display = 'none';
        }
        
        // Show leaderboard
        if (leaderboardEl) {
            leaderboardEl.classList.remove('hidden');
            leaderboardEl.style.display = 'block';
        }

        const leaderboardList = document.getElementById('leaderboard-list');
        if (leaderboardList) {
            fillLeaderboard(leaderboardList, data.players);
        }
    });

    function startGameCountdown() {
        const countdownEl = document.getElementById('game-countdown');
        if (!countdownEl) return;
        
        countdownEl.textContent = countdownSeconds;

        if (countdownInterval) {
            clearInterval(countdownInterval);
        }

        countdownInterval = setInterval(() => {
            countdownSeconds--;
            if (countdownEl) {
                countdownEl.textContent = countdownSeconds;
            }
            
            if (countdownSeconds <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
        }, 1000);
    }

    // Initialize: ensure waiting state on page load
    resetToWaitingState();

    gameWindow.addEventListener('window-chrome', () => {
        isGameWindowFullscreen = gameWindow.classList.contains('fullscreen');
    });
})();

// Sponsor data from server (injected via Handlebars)
let sponsors = Array.isArray(window.SPONSORS_DATA) ? window.SPONSORS_DATA : [];

let currentSponsorIndex = 0;
let sponsorInterval = null;
let sponsorPaused = false;
let eventCountdownInterval = null;
const countdownTimeEl = document.getElementById('countdown-time');
const countdownLabelEl = document.getElementById('countdown-label');
const displayImageEl = document.getElementById('display-image');
const imagePlaceholderEl = document.getElementById('image-placeholder');

// Ensure sponsors array is valid
if (!Array.isArray(sponsors) || sponsors.length === 0) {
    console.warn('No sponsors data available');
}

// Display duration is stored per logo, in whole seconds.
function sponsorMillis(sponsor) {
    const seconds = Number(sponsor && sponsor.seconds);
    if (!Number.isFinite(seconds) || seconds < 1) {
        return 4000;
    }
    return Math.round(seconds) * 1000;
}

function replaceSponsors(list) {
    sponsors = Array.isArray(list) ? list : [];
    currentSponsorIndex = 0;
    updateSponsorDisplay();
}

socket.on("sponsors", (data) => {
    replaceSponsors(data);
});

// Format time for event countdown (days, hours, minutes, seconds)
function formatEventTime(ms) {
    if (ms <= 0) return '00:00:00:00';

    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Format time as MM:SS (for sponsor countdown)
function formatTime(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Get current event phase and time remaining
function getEventPhase() {
    const now = new Date();
    const eventDates = window.EVENT_DATES || {};

    if (!eventDates.start || !eventDates.dayCampEnd || !eventDates.camp24End) {
        return { phase: 'unknown', timeRemaining: 0, label: 'Event dates not configured' };
    }

    const startDate = new Date(eventDates.start);
    const dayCampEndDate = new Date(eventDates.dayCampEnd);
    const camp24EndDate = new Date(eventDates.camp24End);

    if (now < startDate) {
        // Before event starts
        return {
            phase: 'untilStart',
            timeRemaining: startDate - now,
            label: 'Until Code Camp Starts'
        };
    } else if (now < dayCampEndDate) {
        // During day camp
        return {
            phase: 'untilDayCampEnd',
            timeRemaining: dayCampEndDate - now,
            label: 'Until Day Camp Ends'
        };
    } else if (now < camp24EndDate) {
        // During 24 hour camp
        return {
            phase: 'until24HREnd',
            timeRemaining: camp24EndDate - now,
            label: 'Until 24 HR Camp Ends'
        };
    } else {
        // Event has ended
        return {
            phase: 'ended',
            timeRemaining: 0,
            label: 'Event Ended'
        };
    }
}

// Update event countdown timer
function updateEventCountdown() {
    const phase = getEventPhase();
    countdownTimeEl.textContent = formatEventTime(phase.timeRemaining);
    countdownLabelEl.textContent = phase.label;
}

// Start event countdown timer
function startEventCountdown() {
    updateEventCountdown();

    if (eventCountdownInterval) {
        clearInterval(eventCountdownInterval);
    }

    eventCountdownInterval = setInterval(() => {
        updateEventCountdown();
    }, 1000);
}

// Update image window with current sponsor logo
function updateImageWindow(sponsor) {
    if (sponsor.logo) {
        displayImageEl.src = sponsor.logo;
        displayImageEl.style.display = 'block';
        imagePlaceholderEl.style.display = 'none';
    } else {
        displayImageEl.style.display = 'none';
        imagePlaceholderEl.style.display = 'block';
    }
}

// Update sponsor display (image viewer)
function updateSponsorDisplay() {
    // Check if we have sponsors
    if (!Array.isArray(sponsors) || sponsors.length === 0) {
        if (sponsorInterval) {
            clearInterval(sponsorInterval);
            sponsorInterval = null;
        }
        if (imagePlaceholderEl) {
            imagePlaceholderEl.textContent = 'No sponsors available';
            imagePlaceholderEl.style.display = 'block';
        }
        if (displayImageEl) {
            displayImageEl.style.display = 'none';
        }
        return;
    }

    // Ensure currentSponsorIndex is valid
    if (currentSponsorIndex >= sponsors.length) {
        currentSponsorIndex = 0;
    }

    const currentSponsor = sponsors[currentSponsorIndex];
    if (!currentSponsor) {
        return;
    }

    // Update image window with current sponsor logo
    updateImageWindow(currentSponsor);

    if (sponsorInterval) {
        clearInterval(sponsorInterval);
        sponsorInterval = null;
    }

    if (sponsorPaused) {
        return;
    }

    const duration = sponsorMillis(currentSponsor);

    sponsorInterval = setInterval(() => {
        currentSponsorIndex = (currentSponsorIndex + 1) % sponsors.length;
        updateSponsorDisplay();
    }, duration);
}

function setSponsorPaused(paused) {
    sponsorPaused = paused;
    const button = document.querySelector('[data-action="sponsor-pause"]');
    if (button) {
        button.dataset.state = paused ? 'paused' : 'playing';
        button.title = paused ? 'Resume sponsors' : 'Pause sponsors';
        button.setAttribute('aria-label', button.title);
    }
    if (paused) {
        if (sponsorInterval) {
            clearInterval(sponsorInterval);
            sponsorInterval = null;
        }
        return;
    }
    updateSponsorDisplay();
}

function stepSponsor(delta) {
    if (!Array.isArray(sponsors) || sponsors.length === 0) {
        return;
    }
    currentSponsorIndex = (currentSponsorIndex + delta + sponsors.length) % sponsors.length;
    if (sponsorPaused) {
        const currentSponsor = sponsors[currentSponsorIndex];
        if (currentSponsor) {
            updateImageWindow(currentSponsor);
        }
        return;
    }
    updateSponsorDisplay();
}

window.SponsorControls = {
    previous: function() { stepSponsor(-1); },
    next: function() { stepSponsor(1); },
    togglePause: function() { setSponsorPaused(!sponsorPaused); }
};

// Initialize sponsor display if we have sponsors
if (Array.isArray(sponsors) && sponsors.length > 0) {
    updateSponsorDisplay();
}

// Start event countdown timer
startEventCountdown();

// Window manager, display session, and volume
(function() {
    const WINDOW_IDS = ['media-window', 'image-window', 'countdown-window', 'game-window'];
    const RESIZE_EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    const POSITION_KEY = 'window-positions';
    let windowZ = 40;
    let pointerState = null;

    function getWindowFrame(windowId) {
        return document.querySelector('.window[data-window="' + windowId + '"]');
    }

    function raiseWindow(frame) {
        if (!frame || frame.classList.contains('fullscreen')) {
            return;
        }
        windowZ += 1;
        frame.style.zIndex = String(windowZ);
    }

    function refreshChrome(frame) {
        if (!frame) {
            return;
        }
        const floatButton = frame.querySelector('[data-action="float"]');
        if (floatButton) {
            const floating = frame.classList.contains('floating');
            floatButton.dataset.state = floating ? 'floating' : 'tiled';
            floatButton.title = floating ? 'Tile window' : 'Float window';
            floatButton.setAttribute('aria-label', floatButton.title);
        }
        const maxButton = frame.querySelector('[data-action="maximize"]');
        if (maxButton) {
            const full = frame.classList.contains('fullscreen');
            maxButton.dataset.state = full ? 'full' : 'windowed';
            maxButton.title = full ? 'Restore window' : 'Maximize';
            maxButton.setAttribute('aria-label', maxButton.title);
        }
        frame.dispatchEvent(new CustomEvent('window-chrome'));
    }

    function syncWindowList() {
        document.querySelectorAll('.desktop-icon').forEach((button) => {
            const frame = getWindowFrame(button.dataset.windowId);
            const open = Boolean(frame) && !frame.classList.contains('hidden') && !frame.classList.contains('minimized');
            button.classList.toggle('active', open);
        });
    }

    function showWindow(windowId) {
        const frame = getWindowFrame(windowId);
        if (!frame) {
            return;
        }
        frame.classList.remove('hidden', 'minimized', 'fullscreen');
        frame.style.display = '';
        raiseWindow(frame);
        refreshChrome(frame);
        syncWindowList();
    }

    function hideWindow(windowId) {
        const frame = getWindowFrame(windowId);
        if (!frame) {
            return;
        }
        frame.classList.add('hidden');
        frame.classList.remove('minimized', 'fullscreen');
        frame.style.display = 'none';
        frame.removeAttribute('data-was-fullscreen');
        refreshChrome(frame);
        syncWindowList();
    }

    function minimizeWindow(windowId) {
        const frame = getWindowFrame(windowId);
        if (!frame) {
            return;
        }
        if (frame.classList.contains('fullscreen')) {
            frame.setAttribute('data-was-fullscreen', 'true');
            frame.classList.remove('fullscreen');
        }
        frame.classList.add('minimized');
        frame.classList.remove('hidden');
        frame.style.display = 'none';
        refreshChrome(frame);
        syncWindowList();
    }

    function restoreWindow(windowId) {
        const frame = getWindowFrame(windowId);
        if (!frame) {
            return;
        }
        frame.classList.remove('minimized', 'hidden');
        frame.style.display = '';
        if (frame.getAttribute('data-was-fullscreen') === 'true') {
            frame.classList.add('fullscreen');
            frame.removeAttribute('data-was-fullscreen');
        }
        raiseWindow(frame);
        refreshChrome(frame);
        syncWindowList();
    }

    function toggleMaximize(windowId) {
        const frame = getWindowFrame(windowId);
        if (!frame) {
            return;
        }
        frame.classList.remove('hidden', 'minimized', 'collapsed');
        frame.style.display = '';
        frame.classList.toggle('fullscreen');
        raiseWindow(frame);
        refreshChrome(frame);
        syncWindowList();
    }

    function toggleFromList(windowId) {
        const frame = getWindowFrame(windowId);
        if (!frame) {
            return;
        }
        if (frame.classList.contains('hidden')) {
            showWindow(windowId);
            return;
        }
        if (frame.classList.contains('minimized')) {
            restoreWindow(windowId);
            return;
        }
        minimizeWindow(windowId);
    }

    function readPositions() {
        const raw = readStorage(POSITION_KEY);
        if (!raw) {
            return {};
        }
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (err) {
            console.error('Error loading window positions:', err);
        }
        return {};
    }

    function saveWindowPositions() {
        const container = document.querySelector('.tiling-container');
        if (!container) {
            return;
        }
        const containerRect = container.getBoundingClientRect();
        const previous = readPositions();
        const positions = {};
        WINDOW_IDS.forEach((windowId) => {
            const frame = getWindowFrame(windowId);
            if (!frame || !frame.classList.contains('floating')) {
                return;
            }
            if (frame.classList.contains('fullscreen') && previous[windowId]) {
                positions[windowId] = previous[windowId];
                return;
            }
            const rect = frame.getBoundingClientRect();
            positions[windowId] = {
                x: rect.left - containerRect.left,
                y: rect.top - containerRect.top,
                width: rect.width,
                height: rect.height
            };
        });
        if (Object.keys(positions).length > 0) {
            writeStorage(POSITION_KEY, JSON.stringify(positions));
        } else {
            writeStorage(POSITION_KEY, null);
        }
    }

    function loadWindowPositions() {
        const positions = readPositions();
        Object.keys(positions).forEach((windowId) => {
            const frame = getWindowFrame(windowId);
            const pos = positions[windowId];
            if (!frame || !pos || pos.x === undefined || pos.y === undefined) {
                return;
            }
            frame.classList.add('floating');
            frame.style.position = 'absolute';
            frame.style.left = pos.x + 'px';
            frame.style.top = pos.y + 'px';
            if (pos.width) {
                frame.style.width = pos.width + 'px';
            }
            if (pos.height) {
                frame.style.height = pos.height + 'px';
            }
            refreshChrome(frame);
        });
    }

    function floatWindow(frame) {
        const container = document.querySelector('.tiling-container');
        if (!container || !frame) {
            return;
        }
        if (frame.classList.contains('fullscreen')) {
            frame.classList.remove('fullscreen');
        }
        const containerRect = container.getBoundingClientRect();
        const rect = frame.getBoundingClientRect();
        frame.classList.add('floating');
        frame.style.position = 'absolute';
        frame.style.left = (rect.left - containerRect.left) + 'px';
        frame.style.top = (rect.top - containerRect.top) + 'px';
        frame.style.width = rect.width + 'px';
        frame.style.height = Math.max(rect.height, 120) + 'px';
        raiseWindow(frame);
        refreshChrome(frame);
        saveWindowPositions();
    }

    function tileWindow(frame) {
        frame.classList.remove('floating', 'fullscreen');
        frame.style.position = '';
        frame.style.left = '';
        frame.style.top = '';
        frame.style.width = '';
        frame.style.height = '';
        frame.style.zIndex = '';
        refreshChrome(frame);
        saveWindowPositions();
    }

    function toggleFloat(windowId) {
        const frame = getWindowFrame(windowId);
        if (!frame) {
            return;
        }
        if (frame.classList.contains('floating')) {
            tileWindow(frame);
            return;
        }
        floatWindow(frame);
    }

    function resetLayout() {
        WINDOW_IDS.forEach((windowId) => {
            const frame = getWindowFrame(windowId);
            if (!frame) {
                return;
            }
            frame.classList.remove('floating', 'fullscreen');
            frame.style.position = '';
            frame.style.left = '';
            frame.style.top = '';
            frame.style.width = '';
            frame.style.height = '';
            frame.style.zIndex = '';
            refreshChrome(frame);
        });
        writeStorage(POSITION_KEY, null);
        syncWindowList();
    }

    function handleWindowAction(windowId, action) {
        switch (action) {
            case 'float':
                toggleFloat(windowId);
                break;
            case 'minimize':
                minimizeWindow(windowId);
                break;
            case 'maximize':
                toggleMaximize(windowId);
                break;
            case 'close':
                hideWindow(windowId);
                break;
            case 'sponsor-prev':
                window.SponsorControls.previous();
                break;
            case 'sponsor-next':
                window.SponsorControls.next();
                break;
            case 'sponsor-pause':
                window.SponsorControls.togglePause();
                break;
            default:
                console.warn('Unknown window action:', action);
                break;
        }
    }

    function onPointerMove(event) {
        if (!pointerState) {
            return;
        }
        const container = document.querySelector('.tiling-container');
        if (!container) {
            return;
        }
        const containerRect = container.getBoundingClientRect();
        if (pointerState.type === 'drag') {
            let x = event.clientX - pointerState.offsetX - containerRect.left;
            let y = event.clientY - pointerState.offsetY - containerRect.top;
            const maxX = containerRect.width - pointerState.frame.offsetWidth;
            const maxY = containerRect.height - pointerState.frame.offsetHeight;
            x = Math.max(0, Math.min(x, maxX));
            y = Math.max(0, Math.min(y, maxY));
            pointerState.frame.style.left = x + 'px';
            pointerState.frame.style.top = y + 'px';
            return;
        }
        const dx = event.clientX - pointerState.startX;
        const dy = event.clientY - pointerState.startY;
        const edge = pointerState.edge;
        let left = pointerState.orig.left;
        let top = pointerState.orig.top;
        let width = pointerState.orig.width;
        let height = pointerState.orig.height;
        if (edge.indexOf('e') !== -1) {
            width = Math.max(240, pointerState.orig.width + dx);
        }
        if (edge.indexOf('s') !== -1) {
            height = Math.max(120, pointerState.orig.height + dy);
        }
        if (edge.indexOf('w') !== -1) {
            width = Math.max(240, pointerState.orig.width - dx);
            left = pointerState.orig.left + (pointerState.orig.width - width);
        }
        if (edge.indexOf('n') !== -1) {
            height = Math.max(120, pointerState.orig.height - dy);
            top = pointerState.orig.top + (pointerState.orig.height - height);
        }
        pointerState.frame.style.left = left + 'px';
        pointerState.frame.style.top = top + 'px';
        pointerState.frame.style.width = width + 'px';
        pointerState.frame.style.height = height + 'px';
    }

    function onPointerUp() {
        if (!pointerState) {
            return;
        }
        pointerState.frame.classList.remove('dragging');
        pointerState = null;
        saveWindowPositions();
    }

    function addResizeHandles(frame) {
        RESIZE_EDGES.forEach((edge) => {
            const handle = document.createElement('div');
            handle.className = 'resize-handle ' + edge;
            handle.dataset.edge = edge;
            handle.addEventListener('mousedown', (event) => {
                if (!frame.classList.contains('floating') || frame.classList.contains('fullscreen')) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                const container = document.querySelector('.tiling-container');
                if (!container) {
                    return;
                }
                const containerRect = container.getBoundingClientRect();
                const rect = frame.getBoundingClientRect();
                pointerState = {
                    type: 'resize',
                    frame: frame,
                    edge: edge,
                    startX: event.clientX,
                    startY: event.clientY,
                    orig: {
                        left: rect.left - containerRect.left,
                        top: rect.top - containerRect.top,
                        width: rect.width,
                        height: rect.height
                    }
                };
                raiseWindow(frame);
            });
            frame.appendChild(handle);
        });
    }

    function bindWindow(frame) {
        const windowId = frame.dataset.window;
        const bar = frame.querySelector('.window-bar');
        frame.addEventListener('mousedown', (event) => {
            if (event.target.closest('.resize-handle')) {
                return;
            }
            raiseWindow(frame);
        });
        if (bar) {
            bar.addEventListener('mousedown', (event) => {
                if (event.target.closest('button')) {
                    return;
                }
                if (event.detail === 2) {
                    event.preventDefault();
                    toggleMaximize(windowId);
                    return;
                }
                if (!frame.classList.contains('floating') || frame.classList.contains('fullscreen')) {
                    return;
                }
                const rect = frame.getBoundingClientRect();
                pointerState = {
                    type: 'drag',
                    frame: frame,
                    offsetX: event.clientX - rect.left,
                    offsetY: event.clientY - rect.top
                };
                frame.classList.add('dragging');
                event.preventDefault();
            });
        }
        frame.querySelectorAll('[data-action]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                handleWindowAction(windowId, button.dataset.action);
            });
        });
    }

    function updateWakeButton() {
        const button = document.getElementById('wake-status');
        if (!button) {
            return;
        }
        if (!('wakeLock' in navigator)) {
            button.disabled = true;
            button.classList.add('is-unavailable');
            button.setAttribute('aria-pressed', 'false');
            button.title = 'Wake lock unavailable';
            return;
        }
        const held = Boolean(sessionState.wakeLock);
        button.classList.remove('is-unavailable');
        button.setAttribute('aria-pressed', held ? 'true' : 'false');
        button.title = held ? 'Display is awake' : 'Wake lock released';
    }

    function updateFullscreenButton() {
        const button = document.getElementById('fullscreen-toggle');
        if (!button) {
            return;
        }
        const active = Boolean(document.fullscreenElement);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.title = active ? 'Exit fullscreen' : 'Fullscreen';
        button.setAttribute('aria-label', button.title);
    }

    async function requestWakeLock() {
        if (!('wakeLock' in navigator)) {
            updateWakeButton();
            return;
        }
        try {
            sessionState.wakeLock = await navigator.wakeLock.request('screen');
            sessionState.wakeLock.addEventListener('release', () => {
                sessionState.wakeLock = null;
                updateWakeButton();
            });
        } catch (err) {
            sessionState.wakeLock = null;
            console.log('Wake lock request failed:', err);
        }
        updateWakeButton();
    }

    async function requestDisplayFullscreen() {
        if (document.fullscreenElement) {
            updateFullscreenButton();
            return;
        }
        try {
            await document.documentElement.requestFullscreen();
        } catch (err) {
            console.log('Fullscreen request failed:', err);
        }
        updateFullscreenButton();
    }

    function hideSessionGate() {
        const gate = document.getElementById('session-gate');
        if (gate) {
            gate.hidden = true;
        }
    }

    function startDisplay(autoplay) {
        sessionState.autoplay = autoplay;
        sessionState.audioUnlocked = autoplay;
        sessionState.wantsWake = true;
        writeStorage('display-autoplay', autoplay ? '1' : '0');
        writeStorage('display-session-mode', 'started');
        hideSessionGate();
        // Call these in the same turn as the click so the browser still treats them as a user gesture.
        const wake = requestWakeLock();
        const full = requestDisplayFullscreen();
        applyVolume();
        return Promise.all([wake, full]);
    }

    function chooseSilent() {
        sessionState.audioUnlocked = false;
        sessionState.wantsWake = false;
        writeStorage('display-session-mode', 'silent');
        if (mediaVideo) {
            mediaVideo.pause();
            mediaVideo.muted = true;
        }
        hideSessionGate();
        applyVolume();
    }

    function configureSessionGate() {
        const mode = readStorage('display-session-mode');
        const gate = document.getElementById('session-gate');
        const form = document.getElementById('session-form');
        const startButton = document.getElementById('session-start');
        const silentButton = document.getElementById('session-silent');
        const copy = document.getElementById('session-copy');
        const autoplayRow = document.getElementById('session-autoplay-row');
        const autoplayInput = document.getElementById('session-autoplay');
        if (!gate || !form) {
            return;
        }
        if (autoplayInput) {
            autoplayInput.checked = sessionState.autoplay;
        }
        if (mode === 'silent') {
            gate.hidden = true;
            applyVolume();
            return;
        }
        gate.hidden = false;
        if (mode === 'started') {
            if (startButton) {
                startButton.textContent = 'Resume display';
            }
            if (copy) {
                copy.textContent = 'Resume the display to keep the screen awake and restore fullscreen.';
            }
            if (autoplayRow) {
                autoplayRow.hidden = true;
            }
            if (silentButton) {
                silentButton.hidden = true;
            }
        }
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const autoplay = mode === 'started'
                ? sessionState.autoplay
                : Boolean(autoplayInput && autoplayInput.checked);
            startDisplay(autoplay);
        });
        if (silentButton) {
            silentButton.addEventListener('click', () => {
                chooseSilent();
            });
        }
    }

    function bindSessionControls() {
        const slider = document.getElementById('volume-slider');
        const muteButton = document.getElementById('volume-mute');
        const wakeButton = document.getElementById('wake-status');
        const fullscreenButton = document.getElementById('fullscreen-toggle');
        const resetButton = document.getElementById('layout-reset');
        if (slider) {
            slider.value = String(volumeLevel);
            slider.addEventListener('input', () => {
                volumeLevel = Number(slider.value);
                if (volumeLevel > 0) {
                    volumeMuted = false;
                }
                applyVolume();
            });
        }
        if (muteButton) {
            muteButton.addEventListener('click', () => {
                if (volumeMuted || volumeLevel === 0) {
                    volumeMuted = false;
                    if (volumeLevel === 0) {
                        volumeLevel = 80;
                    }
                } else {
                    volumeMuted = true;
                }
                applyVolume();
            });
        }
        if (wakeButton) {
            wakeButton.addEventListener('click', () => {
                sessionState.wantsWake = true;
                requestWakeLock();
            });
        }
        if (fullscreenButton) {
            fullscreenButton.addEventListener('click', () => {
                if (document.fullscreenElement) {
                    document.exitFullscreen().catch((err) => console.log('Exit fullscreen failed:', err));
                    return;
                }
                requestDisplayFullscreen();
            });
        }
        if (resetButton) {
            resetButton.addEventListener('click', resetLayout);
        }
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && sessionState.wantsWake) {
                requestWakeLock();
            }
        });
        document.addEventListener('fullscreenchange', updateFullscreenButton);
        updateWakeButton();
        updateFullscreenButton();
        applyVolume();
    }

    WINDOW_IDS.forEach((windowId) => {
        const frame = getWindowFrame(windowId);
        if (!frame) {
            return;
        }
        addResizeHandles(frame);
        bindWindow(frame);
    });
    document.querySelectorAll('.desktop-icon').forEach((button) => {
        button.addEventListener('click', () => {
            toggleFromList(button.dataset.windowId);
        });
    });
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
    loadWindowPositions();
    syncWindowList();
    setInterval(saveWindowPositions, 5000);
    window.addEventListener('beforeunload', saveWindowPositions);
    configureSessionGate();
    bindSessionControls();

    window.DisplayWindows = {
        show: showWindow,
        hide: hideWindow,
        minimize: minimizeWindow,
        refresh: function(windowId) {
            refreshChrome(getWindowFrame(windowId));
            syncWindowList();
        }
    };
})();

function playYouTubeAudio(url) {
    const videoId = extractYouTubeId(url);
    if (!videoId) {
        console.error('Invalid YouTube URL for audio playback:', url);
        return;
    }
    ensureYouTubePlayer('audio', videoId);
}

function stopYouTubeAudio() {
    const player = ytPlayers.audio;
    if (player && typeof player.stopVideo === 'function') {
        try {
            player.stopVideo();
        } catch (err) {
            console.log('YouTube audio stop failed:', err);
        }
    }
}

socket.on('youtube-audio', (data) => {
    console.log('Received YouTube audio command:', data);
    if (data.action === 'play' && data.url) {
        playYouTubeAudio(data.url);
    } else if (data.action === 'stop') {
        stopYouTubeAudio();
    } else {
        console.warn('Unknown YouTube audio action:', data);
    }
});
