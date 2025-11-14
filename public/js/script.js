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
const socket = io();

// Announcements Ticker
(function() {

    let gameLink = window.location.origin + '/game';
    document.getElementById('game-link').textContent = gameLink;
    const tickerContent = document.getElementById('ticker-content');
    let announcements = [
        'Bring Your Genius!',
        'Don\'t forget the semi-colon! It\'s important in Python! 😉',
        'Bring Your Genius!',
    ];

    function updateTicker() {
        if (!tickerContent) return;
        
        // Duplicate content for seamless loop
        const items = announcements.map(msg => 
            `<span class="ticker-item">${msg}</span>`
        ).join('<span class="ticker-separator">•</span>');
        
        // Duplicate for seamless scrolling
        tickerContent.innerHTML = items + '<span class="ticker-separator">•</span>' + items;
    }

    // Listen for ticker updates from server
    socket.on('ticker-update', (data) => {
        if (data.announcements && Array.isArray(data.announcements)) {
            announcements = data.announcements;
            updateTicker();
        }
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
const youtubeAudioPlayer = document.getElementById('youtube-audio-player');

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
        // Clear YouTube iframe src to stop playback
        if (mediaYoutube.src) {
            mediaYoutube.src = '';
        }
    }

    // Show selected media
    if (mode === 'video') {
        if (data.url) {
            // Check if it's a YouTube URL
            if (isYouTubeUrl(data.url)) {
                const videoId = extractYouTubeId(data.url);
                if (videoId) {
                    // Use YouTube embed URL with proper parameters
                    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=1&modestbranding=1&rel=0&enablejsapi=1`;
                    mediaYoutube.src = embedUrl;
                    mediaYoutube.classList.add('active');
                    modeIndicator.textContent = '[YOUTUBE]';
                    
                    // Ensure iframe is visible
                    mediaYoutube.style.display = 'block';
                } else {
                    console.error('Invalid YouTube URL');
                }
            } else {
                // Regular video file
                mediaVideo.src = data.url;
                mediaVideo.classList.add('active');
                mediaVideo.style.display = 'block';
                modeIndicator.textContent = '[VIDEO]';
                if (mediaVideo.src) {
                    mediaVideo.play().catch(e => console.log('Video play failed:', e));
                }
            }
        } else {
            // No URL provided, show video element if it has a source
            if (mediaVideo.src && !isYouTubeUrl(mediaVideo.src)) {
                mediaVideo.classList.add('active');
                mediaVideo.style.display = 'block';
                modeIndicator.textContent = '[VIDEO]';
            } else if (mediaYoutube.src) {
                mediaYoutube.classList.add('active');
                mediaYoutube.style.display = 'block';
                modeIndicator.textContent = '[YOUTUBE]';
            }
        }
    } else if (mode === 'image') {
        if (data.url) {
            mediaImage.src = data.url;
        }
        mediaImage.classList.add('active');
        mediaImage.style.display = 'block';
        modeIndicator.textContent = '[IMAGE]';
    } else if (mode === 'text') {
        if (data.title) {
            mediaText.querySelector('h2').textContent = data.title;
        }
        if (data.content) {
            mediaText.querySelector('p').textContent = data.content;
        }
        mediaText.classList.add('active');
        mediaText.style.display = 'block';
        modeIndicator.textContent = '[TEXT]';
    }
}

function toggleMediaWindow(expand) {
    if (expand) {
        mediaWindow.classList.remove('collapsed', 'hidden');
        mediaWindow.classList.add('expanded');
        mediaWindow.style.display = 'flex';
    } else {
        mediaWindow.classList.remove('expanded');
        mediaWindow.classList.add('hidden');
        mediaWindow.style.display = 'none';
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
    modeIndicator.textContent = '[ONLINE]';
});

socket.on('disconnect', () => {
    console.log('WebSocket disconnected');
    modeIndicator.textContent = '[OFFLINE]';
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
        notification.className = `notification ${type}`;
        notification.setAttribute('data-notification-id', notificationId);
        
        notification.innerHTML = `
            <div class="notification-icon">${notificationIcons[type] || notificationIcons.info}</div>
            <div class="notification-content">
                <div class="notification-title">${title || type.toUpperCase()}</div>
                <div class="notification-message">${message || ''}</div>
            </div>
            <button class="notification-close" onclick="dismissNotification('${notificationId}')">×</button>
        `;

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
            gameWindow.classList.remove('hidden');
            gameWindow.style.display = 'flex';
            // Make sure it's visible
            gameWindow.style.visibility = 'visible';
            gameWindow.style.opacity = '1';
            
            // Reset to waiting state
            resetToWaitingState();
        } else if (data.action === 'hide') {
            console.log('Hiding game window');
            gameWindow.classList.add('hidden');
            gameWindow.style.display = 'none';
            // Exit fullscreen if active
            if (isGameWindowFullscreen) {
                gameWindow.classList.remove('fullscreen');
                isGameWindowFullscreen = false;
            }
            // Reset to waiting state
            resetToWaitingState();
        }
    });

    socket.on('game-window-toggle', () => {
        console.log('Game window toggle received');
        
        if (gameWindow.classList.contains('hidden')) {
            // Show and fullscreen
            gameWindow.classList.remove('hidden');
            gameWindow.style.display = 'flex';
            gameWindow.classList.add('fullscreen');
            isGameWindowFullscreen = true;
            
            // Reset to waiting state
            resetToWaitingState();
        } else if (isGameWindowFullscreen) {
            // Exit fullscreen but keep visible
            gameWindow.classList.remove('fullscreen');
            isGameWindowFullscreen = false;
        } else {
            // Make fullscreen
            gameWindow.classList.add('fullscreen');
            isGameWindowFullscreen = true;
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
            leaderboardList.innerHTML = '';

            if (data.players && data.players.length > 0) {
                data.players.forEach((player) => {
                    const item = document.createElement('div');
                    item.className = `leaderboard-item rank-${player.rank}`;
                    item.innerHTML = `
                        <div class="leaderboard-rank">#${player.rank}</div>
                        <div class="leaderboard-name">${player.name}</div>
                        <div class="leaderboard-score">${player.score} pts</div>
                    `;
                    leaderboardList.appendChild(item);
                });
            } else {
                leaderboardList.innerHTML = '<div style="color: #858585; padding: 20px; text-align: center;">No players participated</div>';
            }
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
            leaderboardList.innerHTML = '';

            if (data.players && data.players.length > 0) {
                data.players.forEach((player) => {
                    const item = document.createElement('div');
                    item.className = `leaderboard-item rank-${player.rank}`;
                    item.innerHTML = `
                        <div class="leaderboard-rank">#${player.rank}</div>
                        <div class="leaderboard-name">${player.name}</div>
                        <div class="leaderboard-score">${player.score} pts</div>
                    `;
                    leaderboardList.appendChild(item);
                });
            } else {
                leaderboardList.innerHTML = '<div style="color: #858585; padding: 20px; text-align: center;">No players participated</div>';
            }
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

    // Game window buttons are handled by the window management system
})();

// Sponsor data from server (injected via Handlebars)
const sponsors = window.SPONSORS_DATA || [];

let currentSponsorIndex = 0;
let sponsorInterval = null;
let eventCountdownInterval = null;
const countdownTimeEl = document.getElementById('countdown-time');
const countdownLabelEl = document.getElementById('countdown-label');
const displayImageEl = document.getElementById('display-image');
const imagePlaceholderEl = document.getElementById('image-placeholder');

// Ensure sponsors array is valid
if (!Array.isArray(sponsors) || sponsors.length === 0) {
    console.warn('No sponsors data available');
}

// Get display duration based on tier (in milliseconds)
function getDisplayDuration(tier) {
    const tierUpper = tier.toUpperCase();
    if (tierUpper === 'GOLD' || tierUpper === 'PLATINUM') {
        return 60000; // 1 minute
    } else if (tierUpper === 'SILVER') {
        return 30000; // 30 seconds
    } else if (tierUpper === 'BRONZE') {
        return 15000; // 15 seconds
    }
    return 4000; // Default fallback
}

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

    // Clear existing interval and set new one based on current sponsor's tier
    if (sponsorInterval) {
        clearInterval(sponsorInterval);
    }

    const duration = getDisplayDuration(currentSponsor.tier || 'BRONZE');

    // Set interval to move to next sponsor
    sponsorInterval = setInterval(() => {
        currentSponsorIndex = (currentSponsorIndex + 1) % sponsors.length;
        updateSponsorDisplay();
    }, duration);
}

// Initialize sponsor display if we have sponsors
if (Array.isArray(sponsors) && sponsors.length > 0) {
    updateSponsorDisplay();
}

// Start event countdown timer
startEventCountdown();

// Window button functionality and desktop icons
(function() {
    // Window management functions
    const windowConfigs = {
        'media-window': { name: 'Media Player', icon: '🎬' },
        'image-window': { name: 'Sponsor Logos', icon: '🖼️' },
        'countdown-window': { name: 'Countdown', icon: '⏱️' },
        'game-window': { name: 'CodeCamp Quiz', icon: '🎮' }
    };

    function getWindow(windowId) {
        if (windowId === 'media-window') {
            return document.getElementById('media-window');
        } else if (windowId === 'image-window') {
            return document.querySelector('.image-window');
        } else if (windowId === 'countdown-window') {
            return document.querySelector('.countdown-window');
        } else if (windowId === 'game-window') {
            return document.getElementById('game-window');
        }
        return null;
    }

    function getTaskbarItem(windowId) {
        return document.querySelector(`[data-window-id="${windowId}"]`);
    }

    function addToTaskbar(windowId) {
        const taskbar = document.getElementById('taskbar');
        if (!taskbar) return;

        // Remove existing taskbar item if present
        removeFromTaskbar(windowId);

        const config = windowConfigs[windowId];
        if (!config) return;

        const taskbarItem = document.createElement('div');
        taskbarItem.className = 'taskbar-item';
        taskbarItem.setAttribute('data-window-id', windowId);
        taskbarItem.textContent = config.name;
        taskbarItem.addEventListener('click', () => {
            restoreWindow(windowId);
        });

        taskbar.appendChild(taskbarItem);
    }

    function removeFromTaskbar(windowId) {
        const taskbarItem = getTaskbarItem(windowId);
        if (taskbarItem) {
            taskbarItem.remove();
        }
    }

    function updateTaskbarActive(windowId) {
        document.querySelectorAll('.taskbar-item').forEach(item => {
            item.classList.remove('active');
        });
        const taskbarItem = getTaskbarItem(windowId);
        if (taskbarItem) {
            taskbarItem.classList.add('active');
        }
    }

    function showWindow(windowId) {
        const window = getWindow(windowId);
        if (window) {
            window.classList.remove('hidden', 'minimized', 'fullscreen');
            window.style.display = '';
            updateTaskbarActive(windowId);
        }
    }

    function hideWindow(windowId) {
        const window = getWindow(windowId);
        if (window) {
            window.classList.add('hidden');
            window.style.display = 'none';
            removeFromTaskbar(windowId);
        }
    }

    function minimizeWindow(windowId) {
        const window = getWindow(windowId);
        if (window) {
            // Store if it was fullscreen before minimizing
            const wasFullscreen = window.classList.contains('fullscreen');
            window.classList.add('minimized');
            window.classList.remove('fullscreen');
            window.style.display = 'none';
            if (wasFullscreen) {
                window.setAttribute('data-was-fullscreen', 'true');
            }
            addToTaskbar(windowId);
        }
    }

    function restoreWindow(windowId) {
        const window = getWindow(windowId);
        if (window) {
            window.classList.remove('minimized', 'hidden');
            const wasFullscreen = window.getAttribute('data-was-fullscreen') === 'true';
            if (wasFullscreen) {
                window.classList.add('fullscreen');
                window.style.display = '';
                window.removeAttribute('data-was-fullscreen');
            } else {
                window.style.display = '';
            }
            updateTaskbarActive(windowId);
        }
    }

    function maximizeWindow(windowId) {
        const window = getWindow(windowId);
        if (window) {
            window.classList.add('fullscreen');
            window.classList.remove('minimized', 'collapsed');
            window.style.display = '';
            updateTaskbarActive(windowId);
        }
    }

    function toggleMaximize(windowId) {
        const window = getWindow(windowId);
        if (window) {
            if (window.classList.contains('fullscreen')) {
                window.classList.remove('fullscreen');
                if (!window.classList.contains('expanded')) {
                    window.classList.add('expanded');
                }
            } else {
                maximizeWindow(windowId);
            }
        }
    }

    function toggleWindow(windowId) {
        const window = getWindow(windowId);
        if (window) {
            if (window.classList.contains('hidden') || window.classList.contains('minimized')) {
                restoreWindow(windowId);
            } else {
                minimizeWindow(windowId);
            }
        }
    }

    // Setup window button handlers
    function setupWindowButtons() {
        // Media window buttons
        const mediaWindow = document.getElementById('media-window');
        if (mediaWindow) {
            const closeBtn = mediaWindow.querySelector('.window-button.close');
            const minimizeBtn = mediaWindow.querySelector('.window-button.minimize');
            const maximizeBtn = mediaWindow.querySelector('.window-button.maximize');
            
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hideWindow('media-window');
                });
            }
            
            if (minimizeBtn) {
                minimizeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    minimizeWindow('media-window');
                });
            }
            
            if (maximizeBtn) {
                maximizeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleMaximize('media-window');
                });
            }
        }

        // Image window buttons
        const imageWindow = document.querySelector('.image-window');
        if (imageWindow) {
            const closeBtn = imageWindow.querySelector('.window-button.close');
            const minimizeBtn = imageWindow.querySelector('.window-button.minimize');
            const maximizeBtn = imageWindow.querySelector('.window-button.maximize');
            
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hideWindow('image-window');
                });
            }
            
            if (minimizeBtn) {
                minimizeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    minimizeWindow('image-window');
                });
            }
            
            if (maximizeBtn) {
                maximizeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleMaximize('image-window');
                });
            }
        }

        // Countdown window buttons
        const countdownWindow = document.querySelector('.countdown-window');
        if (countdownWindow) {
            const closeBtn = countdownWindow.querySelector('.window-button.close');
            const minimizeBtn = countdownWindow.querySelector('.window-button.minimize');
            const maximizeBtn = countdownWindow.querySelector('.window-button.maximize');
            
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hideWindow('countdown-window');
                });
            }
            
            if (minimizeBtn) {
                minimizeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    minimizeWindow('countdown-window');
                });
            }
            
            if (maximizeBtn) {
                maximizeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleMaximize('countdown-window');
                });
            }
        }

        // Game window buttons
        const gameWindow = document.getElementById('game-window');
        if (gameWindow) {
            const closeBtn = gameWindow.querySelector('.window-button.close');
            const minimizeBtn = gameWindow.querySelector('.window-button.minimize');
            const maximizeBtn = gameWindow.querySelector('.window-button.maximize');
            
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hideWindow('game-window');
                });
            }
            
            if (minimizeBtn) {
                minimizeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    minimizeWindow('game-window');
                });
            }
            
            if (maximizeBtn) {
                maximizeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleMaximize('game-window');
                });
            }
        }
    }

    // Setup desktop icon handlers
    function setupDesktopIcons() {
        const imageViewerIcon = document.getElementById('icon-image-viewer');
        const countdownIcon = document.getElementById('icon-countdown');

        if (imageViewerIcon) {
            imageViewerIcon.addEventListener('click', () => {
                toggleWindow('image-window');
            });
        }

        if (countdownIcon) {
            countdownIcon.addEventListener('click', () => {
                toggleWindow('countdown-window');
            });
        }
    }

    // Make windows active when clicked
    function setupWindowFocus() {
        ['media-window', 'image-window', 'countdown-window', 'game-window'].forEach(windowId => {
            const window = getWindow(windowId);
            if (window) {
                window.addEventListener('mousedown', () => {
                    updateTaskbarActive(windowId);
                });
            }
        });
    }

    // Initialize on page load
    setupWindowButtons();
    setupDesktopIcons();
    setupWindowFocus();
})();

// Window reorganization and persistence
(function () {
    const windows = {
        'media-window': document.getElementById('media-window'),
        'image-window': document.querySelector('.image-window'),
        'countdown-window': document.querySelector('.countdown-window'),
        'game-window': document.getElementById('game-window')
    };

    const STORAGE_KEY = 'window-positions';
    let draggedWindow = null;
    let dragOffset = { x: 0, y: 0 };
    let isDragging = false;

    // Load window positions from localStorage
    function loadWindowPositions() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const positions = JSON.parse(saved);
                const container = document.querySelector('.tiling-container');
                if (!container) return;

                Object.keys(positions).forEach(windowId => {
                    const window = windows[windowId];
                    if (window && positions[windowId]) {
                        const pos = positions[windowId];
                        if (pos.x !== undefined && pos.y !== undefined) {
                            window.style.position = 'absolute';
                            window.style.left = `${pos.x}px`;
                            window.style.top = `${pos.y}px`;
                            if (pos.width) window.style.width = `${pos.width}px`;
                            if (pos.height) window.style.height = `${pos.height}px`;
                            window.classList.add('draggable');
                        }
                    }
                });
            }
        } catch (e) {
            console.error('Error loading window positions:', e);
        }
    }

    // Save window positions to localStorage
    function saveWindowPositions() {
        try {
            const container = document.querySelector('.tiling-container');
            if (!container) return;

            const containerRect = container.getBoundingClientRect();
            const positions = {};

            Object.keys(windows).forEach(windowId => {
                const window = windows[windowId];
                if (window && window.classList.contains('draggable')) {
                    const rect = window.getBoundingClientRect();
                    positions[windowId] = {
                        x: rect.left - containerRect.left,
                        y: rect.top - containerRect.top,
                        width: rect.width,
                        height: rect.height
                    };
                }
            });

            if (Object.keys(positions).length > 0) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
            }
        } catch (e) {
            console.error('Error saving window positions:', e);
        }
    }

    // Make window draggable
    function makeWindowDraggable(window, windowBar) {
        if (!window || !windowBar) return;

        windowBar.addEventListener('mousedown', (e) => {
            // Double-click to toggle draggable mode
            if (e.detail === 2) {
                e.preventDefault();
                if (window.classList.contains('draggable')) {
                    window.classList.remove('draggable');
                    window.style.position = '';
                    window.style.left = '';
                    window.style.top = '';
                    window.style.width = '';
                    window.style.height = '';
                } else {
                    window.classList.add('draggable');
                    const rect = window.getBoundingClientRect();
                    window.style.position = 'absolute';
                    window.style.left = `${rect.left}px`;
                    window.style.top = `${rect.top}px`;
                }
                saveWindowPositions();
                return;
            }

            // Single click drag (only if window is already draggable)
            if (window.classList.contains('draggable')) {
                isDragging = true;
                draggedWindow = window;
                window.classList.add('dragging');

                const container = document.querySelector('.tiling-container');
                const containerRect = container.getBoundingClientRect();
                const rect = window.getBoundingClientRect();

                dragOffset.x = e.clientX - rect.left;
                dragOffset.y = e.clientY - rect.top;

                e.preventDefault();
                e.stopPropagation();
            }
        });
    }

    // Handle mouse move for dragging
    document.addEventListener('mousemove', (e) => {
        if (isDragging && draggedWindow) {
            const container = document.querySelector('.tiling-container');
            if (!container) return;

            const containerRect = container.getBoundingClientRect();

            let x = e.clientX - dragOffset.x - containerRect.left;
            let y = e.clientY - dragOffset.y - containerRect.top;

            // Constrain to container bounds
            const maxX = containerRect.width - draggedWindow.offsetWidth;
            const maxY = containerRect.height - draggedWindow.offsetHeight;
            x = Math.max(0, Math.min(x, maxX));
            y = Math.max(0, Math.min(y, maxY));

            draggedWindow.style.left = `${x}px`;
            draggedWindow.style.top = `${y}px`;
        }
    });

    // Handle mouse up to stop dragging
    document.addEventListener('mouseup', () => {
        if (isDragging && draggedWindow) {
            draggedWindow.classList.remove('dragging');
            saveWindowPositions();
        }
        isDragging = false;
        draggedWindow = null;
    });

    // Initialize draggable windows
    Object.keys(windows).forEach(windowId => {
        const window = windows[windowId];
        if (window) {
            const windowBar = window.querySelector('.window-bar') || 
                            window.querySelector('.media-window-bar') ||
                            window.querySelector('.image-window-bar') ||
                            window.querySelector('.countdown-window-bar') ||
                            window.querySelector('.game-window-bar');
            makeWindowDraggable(window, windowBar);
        }
    });

    // Load saved positions on page load
    loadWindowPositions();

    // Save positions periodically and on window resize
    setInterval(saveWindowPositions, 5000);
    window.addEventListener('beforeunload', saveWindowPositions);
})();

// YouTube Audio Player Functions
function playYouTubeAudio(url) {
    if (!youtubeAudioPlayer) {
        console.error('YouTube audio player element not found');
        return;
    }
    
    console.log('Playing YouTube audio:', url);
    
    const videoId = extractYouTubeId(url);
    if (!videoId) {
        console.error('Invalid YouTube URL for audio playback:', url);
        return;
    }
    
    // YouTube embed URL with autoplay and audio-only parameters
    // Start with mute=1 to ensure autoplay works, then unmute
    // controls=0 to hide controls, modestbranding=1 for minimal UI
    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&enablejsapi=1&iv_load_policy=3&fs=0`;
    
    youtubeAudioPlayer.src = embedUrl;
    youtubeAudioPlayer.style.display = 'block';
    
    console.log('YouTube audio player iframe src set:', embedUrl);
    
    // Wait for iframe to load, then try to unmute
    youtubeAudioPlayer.onload = function() {
        console.log('YouTube audio player iframe loaded');
        // Try to unmute after iframe loads
        setTimeout(() => {
            try {
                // Attempt to unmute via postMessage (requires YouTube API)
                youtubeAudioPlayer.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: 'unMute',
                    args: ''
                }), '*');
                console.log('Sent unmute command to YouTube player');
            } catch (e) {
                console.log('Could not unmute YouTube audio automatically:', e);
            }
        }, 2000);
    };
}

function stopYouTubeAudio() {
    if (!youtubeAudioPlayer) return;
    youtubeAudioPlayer.src = '';
    youtubeAudioPlayer.style.display = 'none';
}

// Listen for YouTube audio commands from admin
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


