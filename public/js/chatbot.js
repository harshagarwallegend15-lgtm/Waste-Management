// WasteWise Chatbot — casual, friendly AI assistant with voice support
(function () {
  'use strict';

  // ========== KNOWLEDGE BASE ==========
  var KB = [
    // --- General ---
    { keys: ['what is wastewise', 'about wastewise', 'tell me about', 'what do you do', 'what does this', 'who are you', 'introduce', 'about this app', 'what is this'], reply: "Hey there! I'm WasteWise — a smart waste management platform built for Indian communities. We use AI, photo verification, and gamification to make sure waste actually gets collected and neighborhoods stay clean. Think of me as your friendly guide to everything WasteWise!" },
    { keys: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'good afternoon', 'namaste', 'sup', 'yo'], reply: "Hey! Welcome to WasteWise! I'm here to help you with anything about the platform. What would you like to know?" },
    { keys: ['how are you', 'how r u', 'whats up', "what's up"], reply: "I'm doing great, thanks for asking! Ready to help you explore WasteWise. What's on your mind?" },
    { keys: ['thank', 'thanks', 'thx', 'ty'], reply: "You're welcome! Happy to help. Anything else you'd like to know?" },
    { keys: ['bye', 'goodbye', 'see you', 'later'], reply: "Bye! Thanks for chatting. Remember, every small action towards waste management makes a big difference. See you around!" },

    // --- What is WasteWise ---
    { keys: ['vision', 'mission', 'goal', 'why wastewise', 'purpose', 'what is the aim'], reply: "Our vision is simple — cleaner cities through community accountability! We believe when residents, collectors, and municipalities work together with transparent, verified data, waste management actually improves. We're building this for Indian cities specifically." },

    // --- How it works ---
    { keys: ['how does it work', 'how it works', 'steps', 'process', 'workflow', 'explain process'], reply: "It's a 5-step flow:\n\n1. **Request** — A resident snaps a photo of their waste. GPS and timestamp are auto-recorded.\n2. **Route** — Collectors in the area see the pending request and exact location.\n3. **Collect** — The collector arrives, picks up the waste, and uploads an 'after' photo.\n4. **Verify** — Our AI compares both photos using computer vision. Only a verified match earns points.\n5. **Reward** — Points, leaderboards, and community stats update in real time!\n\nIt's like Uber, but for garbage collection with AI proof." },
    { keys: ['step 1', 'first step', 'step one', 'request'], reply: "Step 1 is the **Request**! A resident opens their camera, takes a photo of their waste, and submits it. GPS coordinates and timestamp are captured automatically — no manual entry needed. The waste type (Mixed, Wet, Dry, or Hazardous) can also be selected." },
    { keys: ['step 2', 'second step', 'step two', 'route'], reply: "Step 2 is **Route**! Once a request is submitted, collectors in that area see it on their dashboard. They can see exactly where to go, with a Google Maps link to the resident's doorstep. Smart routing!" },
    { keys: ['step 3', 'third step', 'step three', 'collect'], reply: "Step 3 is **Collect**! The collector physically arrives, picks up the waste, and uses the 'I'm at the location' button with GPS verification. They then snap an 'after' photo to prove the collection happened." },
    { keys: ['step 4', 'fourth step', 'step four', 'verify'], reply: "Step 4 is **Verify** — this is where the magic happens! Our AI uses a 9-signal computer vision system to compare before and after photos. It checks texture, color histograms, edge density, and even asks Groq's AI vision model if the photos show the same waste. Smart, right?" },
    { keys: ['step 5', 'fifth step', 'step five', 'reward'], reply: "Step 5 is **Reward & Improve**! When a collection is verified, the resident gets 20 points and the collector gets 10 points. These feed into leaderboards, society scores, and community challenges. The more you participate, the higher your community ranks!" },

    // --- Features ---
    { keys: ['feature', 'features', 'what can it do', 'capabilities', 'what do you offer'], reply: "We've packed in a ton of features:\n\n- AI-powered photo verification for every collection\n- Real-time leaderboards and society scores\n- GPS-verified collection routing\n- Community challenges with rewards\n- Illegal dumping reports with photo proof\n- Municipality dashboard with hotspots and analytics\n- Multi-language support (English, Hindi, Kannada, Tamil, Bengali)\n- Voice assistant (that's me!)\n- And behaviour-based education to improve segregation!\n\nWant to know more about any of these?" },

    // --- AI / Computer Vision ---
    { keys: ['ai', 'artificial intelligence', 'computer vision', 'machine learning', 'ml', 'how does ai', 'ai verify', 'verification', 'how does verification'], reply: "Great question! We use a two-layer verification system:\n\n1. **Local CV Heuristic** — runs instantly on the server. It analyzes texture variance, edge density, color histograms (8 classes), skin-tone detection (to reject selfies), and background subtraction. If the score is high enough (>= 0.62), it's accepted immediately!\n\n2. **AI Vision Fallback** — for borderline cases, we send the photo to Groq's `qwen/qwen3.6-27b` vision model. It gives a confident yes/no on whether the photo actually shows waste.\n\nThe same tech compares before/after photos using 9 different signals — perceptual hashing, color analysis, texture matching, and more!" },
    { keys: ['garbage gate', 'photo gate', 'photo check', 'garbage check', 'waste photo', 'fake photo', 'wrong photo'], reply: "The Garbage Photo Gate is our anti-fraud system! Before you can submit a waste photo, it checks:\n- Does the image have enough texture (actual objects, not a blank wall)?\n- Is there color variation (waste isn't just one color)?\n- Is there a person in the photo (selfies get rejected!)?\n- Does it look like a landscape or sky (not waste)?\n\nThis prevents people from gaming the system with random photos. Only real waste photos pass through!" },
    { keys: ['perceptual hash', 'phash', 'dhash', 'ahash', 'hash'], reply: "We use three types of image hashing for comparison:\n\n- **pHash** (Perceptual Hash) — 7% weight. Uses DCT transform, robust to scaling and brightness changes.\n- **dHash** (Differential Hash) — 4% weight. Gradient-based, handles lighting differences.\n- **aHash** (Average Hash) — 2% weight. Simple but adds a small signal.\n\nThese help us quickly determine if two photos show visually similar scenes, even if one is brighter or slightly different angle." },
    { keys: ['groq', 'groq api', 'groq model', 'qwen', 'vision model'], reply: "We use Groq's API with the `qwen/qwen3.6-27b` vision model for AI-powered photo analysis. It's fast, accurate, and handles both garbage detection and before/after comparison. The model receives photos as public URLs (we learned base64 doesn't work well with it!) and returns structured verdicts with confidence scores and reasons." },
    { keys: ['match score', 'score', 'confidence', 'verdict', 'verified flagged rejected'], reply: "Every collection gets a match score (0-100%) based on 9 weighted signals:\n- Spatial color histogram (24%)\n- Foreground class histogram (26%)\n- Texture variance (15%)\n- HSV histogram (12%)\n- Perceptual hash (7%)\n- Global class histogram (6%)\n- Edge density (4%)\n- Differential hash (4%)\n- Average hash (2%)\n\nPlus an AI vision verdict. The outcome is:\n- **VERIFIED** — high confidence, points awarded!\n- **FLAGGED** — borderline, admin reviews manually\n- **REJECTED** — clear mismatch" },

    // --- Resident features ---
    { keys: ['resident', 'resident feature', 'as a resident', 'resident can', 'what can resident'], reply: "As a resident, you can:\n- Submit waste collection requests with photo proof\n- Track your request history with status updates\n- Report illegal dumping with GPS and photos\n- Join your society's problem board\n- Earn points for verified collections (+20 pts) and reports (+15 pts)\n- Climb the leaderboard\n- See nearby societies and their scores\n- Participate in community challenges\n- Get behaviour-based education tips\n\nAll in real-time, with multi-language support!" },

    // --- Collector features ---
    { keys: ['collector', 'collector feature', 'as a collector', 'collector can', 'what can collector'], reply: "Collectors have their own powerful dashboard:\n- See residents in your area sorted by pending requests\n- Get exact GPS locations with Google Maps integration\n- Verify arrival with GPS check\n- Upload 'after' photos for verification\n- Earn 10 points per verified collection\n- View your leaderboard ranking\n- Real-time updates when new requests come in\n\nPlus, you can only see residents in YOUR assigned area — fair and organized!" },

    // --- Admin features ---
    { keys: ['admin', 'municipality', 'municipality admin', 'admin feature', 'as an admin', 'what can admin'], reply: "Admins get the full bird's-eye view:\n- Live KPI dashboard (residents, collectors, requests, verifications)\n- Dumping hotspot map with cluster analysis\n- 14-day trend charts\n- Collection verification review with manual override\n- Dumping report review (verify/reject/duplicate)\n- Problem management across all societies\n- Challenge creation and management\n- Three leaderboards (residents, collectors, societies)\n- Full user search and drill-down with activity history\n\nIt's like mission control for city waste management!" },

    // --- Points system ---
    { keys: ['point', 'points', 'earn', 'earn points', 'how many points', 'scoring', 'reward', 'rewards'], reply: "Here's the points breakdown:\n- Verified collection (resident): **+20 points**\n- Verified collection (collector): **+10 points**\n- Verified dumping report: **+15 points**\n- Education lesson completed: **+5 points**\n- Challenge completion: **Variable bonus** for all residents in the society!\n\nPoints are tracked in an immutable ledger — every transaction is recorded with a reason. You can see your full history in the Points Ledger tab!" },
    { keys: ['leaderboard', 'top users', 'ranking', 'who is winning'], reply: "We have leaderboards for everyone:\n- **Residents** — ranked by total points earned\n- **Collectors** — ranked by total points earned\n- **Societies** — ranked by their community score (0-100)\n\nThe resident leaderboard shows the top 15, and the collector leaderboard shows the top 10. Updates happen in real-time!" },

    // --- Society system ---
    { keys: ['society', 'society score', 'community', 'housing', 'complex', 'apartment'], reply: "Each resident belongs to a society (housing community). Societies get scored 0-100 based on:\n- Participation rate (40%) — how many residents are active\n- Disposal rate (30%) — verified vs total requests\n- Segregation rate (15%) — non-mixed vs mixed waste\n- Report score (10%) — dumping reports per resident\n- +5 base score + trend bonus\n\nScore tiers: Green (>=70), Amber (>=40), Red (<40). Higher-scoring societies get priority for reported problems!" },
    { keys: ['join society', 'switch society', 'change society', 'my society'], reply: "You can join or switch your society from the 'My Society' tab on your resident dashboard. Just pick from nearby societies — the system shows you societies sorted by distance from your location. Your points and history stay with you!" },
    { keys: ['nearby', 'near me', 'societies near', 'distance'], reply: "The 'Societies Near You' tab uses your GPS to find housing communities within your city radius. Each society shows its name, score, address, distance from you, member count, and participation stats. It's like a community health check!" },

    // --- Challenges ---
    { keys: ['challenge', 'challenges', 'community challenge'], reply: "Challenges are community-level goals set by admins! There are 4 types:\n- **Collections** — total verified collections in a period\n- **Reports** — total dumping reports submitted\n- **Participation** — unique active residents\n- **Score** — society score target\n\nWhen a society hits the target, ALL residents of that society earn bonus points! You can track your challenge progress with a nice progress bar on your dashboard." },

    // --- Dumping reports ---
    { keys: ['dumping', 'illegal dumping', 'report', 'dumping report', 'illegal waste'], reply: "Spotted illegal dumping? Here's what to do:\n1. Go to the 'Reports' tab on your resident dashboard\n2. Tap 'Report Dumping'\n3. Take a photo of the dumped waste\n4. Add a description of what you see\n5. GPS is auto-captured!\n\nOnce verified by the admin, you earn **15 points**! Your reports help the municipality identify hotspots and take action. Every report counts!" },
    { keys: ['hotspot', 'hotspots', 'dumping hotspot', 'cluster'], reply: "Admins see a Dumping Hotspots map that clusters verified reports into grid cells (~500m). Each cluster shows the incident count, area name, and sample timestamps. They can click to open Google Maps at the exact location. This helps identify patterns and deploy resources efficiently!" },

    // --- Problem board ---
    { keys: ['problem', 'problem board', 'society problem', 'issue', 'complaint', 'streetlight', 'drainage'], reply: "The Society Problem Board is where residents flag local issues — things like broken streetlights, clogged drainage, cleanliness concerns, etc.\n\n- Post a problem with title, description, and optional photo\n- Other residents can comment on it\n- Your society's score determines how quickly admins prioritize it\n- Admins can track status: open, in progress, or resolved\n\nIt's community-driven governance in action!" },

    // --- GPS / Location ---
    { keys: ['gps', 'location', 'geolocation', 'map', 'maps', 'coordinates'], reply: "We use the browser's Geolocation API for precise location tracking:\n- **Residents**: GPS auto-captured when submitting requests\n- **Collectors**: GPS verified when arriving at location\n- **Societies**: Distance calculated from your GPS\n- **Reports**: GPS auto-captured for dumping reports\n\nAll locations open directly in Google Maps with one tap. Coordinates are stored to 5 decimal places (~1 meter accuracy)!" },

    // --- Multi-language ---
    { keys: ['language', 'languages', 'hindi', 'kannada', 'tamil', 'bengali', 'multi language', 'multilingual', 'translation', 'translate'], reply: "We support 5 languages:\n- English\n- Hindi\n- Kannada\n- Tamil\n- Bengali\n\nJust click the language switcher in the header (the globe icon) and pick your language! The entire interface updates instantly — navigation, buttons, status labels, everything. We even load the right fonts for Indian scripts!" },

    // --- Voice ---
    { keys: ['voice', 'speak', 'speech', 'talk', 'listening', 'voice assistant', 'voice mode'], reply: "I'm your voice assistant! I can:\n- Listen to your questions using speech recognition\n- Read my answers aloud using text-to-speech\n\nJust click the microphone button in the chat to ask by voice, and I'll respond both in text and voice. Click the speaker button on any message to hear it again. It's like having a helpful friend who knows everything about WasteWise!" },
    { keys: ['voice not working', 'mic not working', 'microphone', 'cant hear', 'no sound', 'audio'], reply: "If voice features aren't working, here are some tips:\n- Make sure your browser supports Web Speech API (Chrome works best)\n- Allow microphone permission when prompted\n- Check that your device isn't on silent mode\n- For text-to-speech, check your device volume\n\nVoice works best in Chrome on desktop. Safari and Firefox have limited support." },

    // --- Tech stack ---
    { keys: ['tech', 'technology', 'stack', 'built with', 'framework', 'database', 'supabase', 'backend', 'frontend'], reply: "Under the hood:\n- **Frontend**: Vanilla HTML/CSS/JS — no frameworks, just clean code!\n- **Backend**: Express.js 5 on Vercel serverless\n- **Database & Auth**: Supabase (PostgreSQL + realtime subscriptions)\n- **AI Vision**: Groq API with qwen vision model\n- **Image Processing**: Sharp library\n- **Storage**: Supabase Storage for photo uploads\n\nIt's lightweight, fast, and works great even on slow connections!" },

    // --- Camera ---
    { keys: ['camera', 'photo', 'picture', 'snap', 'capture', 'upload'], reply: "We use the browser's camera API (MediaDevices) to capture photos directly from your device. It prefers the rear-facing camera and uses 1280px resolution for quality. If camera access isn't available (like on desktop without a webcam), we show a graceful fallback message." },

    // --- Realtime ---
    { keys: ['realtime', 'real time', 'live', 'auto refresh', 'update', 'websocket'], reply: "Everything updates in real-time using Supabase Postgres Changes! Points, requests, reports, problems, challenges, leaderboards — they all refresh instantly without you having to reload. If real-time is unavailable, we fall back to polling every 8-30 seconds depending on the page." },

    // --- Authentication ---
    { keys: ['login', 'signup', 'sign up', 'register', 'account', 'password', 'email', 'auth', 'authentication'], reply: "Getting started is easy:\n\n1. Click 'Sign In' on the homepage\n2. Choose your role: Resident, Collector, or Admin\n3. **Residents & Collectors**: Sign up with email and password (min 6 chars), then fill in your name, phone, and GPS location\n4. **Admins**: Pre-configured accounts only — no self-registration\n\nYour session is stored securely with JWT tokens. Role mismatch is detected — you can't login with a resident account on the collector page!" },

    // --- Challenges ---
    { keys: ['demo', 'demo account', 'try', 'test', 'play around'], reply: "Want to try it out? We have demo accounts:\n- **Resident**: resident@wastewise.app / Resident@123\n- **Collector**: collector@wastewise.app / Collector@123\n- **Admin**: admin@wastewise.app / Admin@123\n\nYou'll find these pre-filled on each login page. Go ahead and explore — you won't break anything!" },

    // --- Education ---
    { keys: ['education', 'segregation', 'segregate', 'wet waste', 'dry waste', 'hazardous', 'recycling', 'learn'], reply: "We have behaviour-based education! If you submit 2+ mixed waste collections, you'll get a targeted lesson on proper segregation. But if your last 5 collections are all properly segregated, you'll earn a recognition badge and 5 bonus points! We also educate on waste types:\n\n- **Wet**: food scraps, organic matter\n- **Dry**: paper, plastic, metal, glass\n- **Hazardous**: batteries, chemicals, medical waste\n\nProper segregation helps recycling and reduces landfill impact!" },

    // --- API ---
    { keys: ['api', 'endpoint', 'rest api', 'backend api'], reply: "Our backend has a clean REST API with endpoints for:\n- Auth (login, register)\n- Collection requests (create, list, complete)\n- Dumping reports (submit, list, verify)\n- Problems (post, list, comment, status)\n- Challenges (create, list, close)\n- Points & leaderboards\n- Admin dashboards\n- Education\n- Society management\n\nAll protected with JWT auth and role-based access control!" },

    // --- Stats ---
    { keys: ['stat', 'stats', 'numbers', 'data', 'how many', 'community', 'service zone'], reply: "Current platform stats:\n- **6** Communities onboarded\n- **3** Service Zones active\n- **100%** Photo verification rate\n- **33** Verified collections completed\n- **9** Verified dumping reports\n- **13** Open problems tracked\n- **850** Top resident points\n\nAnd these numbers are growing every day as more communities join!" },

    // --- Security ---
    { keys: ['security', 'secure', 'safe', 'privacy', 'data protection'], reply: "Security is important to us:\n- JWT-based authentication\n- Role-based access control (residents can't access collector features)\n- Supabase Row Level Security (RLS) on all tables\n- Photo storage is public for verified content (transparency!)\n- 401 auto-clears session\n- GPS coordinates stored securely\n\nYour data is protected at every layer!" },

    // --- Challenges system ---
    { keys: ['how to earn', 'ways to earn', 'maximum points', 'best way'], reply: "Here's how to maximize your points:\n1. Submit verified collection requests (+20 pts each)\n2. Report illegal dumping (+15 pts per verified report)\n3. Keep segregating waste properly (education bonus +5 pts)\n4. Participate in community challenges (bonus points for your whole society!)\n\nPro tip: Segregated waste gets verified faster than mixed waste. So sort your wet, dry, and hazardous waste separately!" },

    // --- Problem management ---
    { keys: ['problem status', 'open problem', 'resolved', 'in progress'], reply: "Problems go through 3 statuses:\n- **Open** — newly reported, waiting for attention\n- **In Progress** — municipality is working on it\n- **Resolved** — fixed!\n\nHigher-scoring societies get priority attention. So keeping your society active and clean literally helps get your problems resolved faster!" },

    // --- Fallback ---
    { keys: ['help', 'what can you tell me', 'tell me more', 'explain'], reply: "I know a lot about WasteWise! Here are some things I can tell you about:\n\n- What is WasteWise and its vision\n- How the 5-step process works\n- All features for residents, collectors, and admins\n- AI verification and photo checking\n- Points and rewards system\n- Society scores and challenges\n- GPS and location features\n- Multi-language support\n- Voice assistant features\n- Tech stack and security\n- Demo accounts\n\nJust ask me anything!" }
  ];

  // ========== INTENT MATCHING ==========
  function findReply(input) {
    var text = input.toLowerCase().replace(/[?!.,]/g, '').trim();
    if (!text) return null;

    var bestScore = 0;
    var bestReply = null;

    for (var i = 0; i < KB.length; i++) {
      var entry = KB[i];
      var score = 0;
      for (var j = 0; j < entry.keys.length; j++) {
        var key = entry.keys[j];
        if (text === key) { score = 1000; break; }
        if (text.indexOf(key) !== -1) { score = Math.max(score, 100 + key.length); }
        else if (key.indexOf(text) !== -1) { score = Math.max(score, 50 + key.length); }
        else {
          var words = text.split(/\s+/);
          for (var w = 0; w < words.length; w++) {
            if (words[w].length > 2 && key.indexOf(words[w]) !== -1) {
              score = Math.max(score, 10 + words[w].length);
            }
          }
        }
      }
      if (score > bestScore) { bestScore = score; bestReply = entry.reply; }
    }

    if (bestScore >= 10) return bestReply;

    return "Hmm, that's a great question! I'm best at answering things about WasteWise — like how it works, the AI verification, points system, society scores, challenges, and all the features. Could you try rephrasing or ask me something about the platform? Type 'help' to see what I know!";
  }

  // ========== VOICE ==========
  var voiceEnabled = true;
  var recognition = null;
  var synth = window.speechSynthesis || null;
  var speaking = false;

  function initRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    var r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = 'en-IN';
    r.maxAlternatives = 1;
    return r;
  }

  function speakText(text, btn) {
    if (!synth) return;
    synth.cancel();
    var clean = text.replace(/\*\*/g, '').replace(/\n+/g, '. ').replace(/[#*\-_]/g, '');
    var utter = new SpeechSynthesisUtterance(clean);
    utter.lang = 'en-IN';
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    var voices = synth.getVoices();
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].lang.indexOf('en') === 0 && voices[i].localService) { utter.voice = voices[i]; break; }
    }
    speaking = true;
    if (btn) btn.classList.add('speaking');
    utter.onend = function () { speaking = false; if (btn) btn.classList.remove('speaking'); };
    utter.onerror = function () { speaking = false; if (btn) btn.classList.remove('speaking'); };
    synth.speak(utter);
  }

  function startListening(inputEl, sendFn) {
    if (!recognition) recognition = initRecognition();
    if (!recognition) { alert('Voice input is not supported in your browser. Try Chrome!'); return; }
    recognition.onresult = function (e) {
      var transcript = e.results[0][0].transcript;
      inputEl.value = transcript;
      sendFn();
    };
    recognition.onerror = function () {};
    recognition.start();
  }

  // ========== UI ==========
  function createWidget() {
    var wrapper = document.createElement('div');
    wrapper.id = 'ww-chatbot';
    wrapper.innerHTML =
      '<button class="chat-fab" id="chat-fab" aria-label="Open chat assistant">' +
        '<svg viewBox="0 0 24 24" class="chat-fab-icon"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<svg viewBox="0 0 24 24" class="chat-fab-close"><path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<span class="chat-fab-badge">1</span>' +
      '</button>' +
      '<div class="chat-panel" id="chat-panel">' +
        '<div class="chat-header">' +
          '<div class="chat-header-left">' +
            '<div class="chat-avatar">' +
              '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-4 8c0-2.21 1.79-4 4-4s4 1.79 4 4H8z" fill="currentColor"/></svg>' +
            '</div>' +
            '<div class="chat-header-info">' +
              '<span class="chat-header-name">WasteWise Assistant</span>' +
              '<span class="chat-header-status"><span class="chat-online-dot"></span> Online</span>' +
            '</div>' +
          '</div>' +
          '<div class="chat-header-actions">' +
            '<button class="chat-voice-toggle" id="chat-voice-toggle" title="Toggle voice responses">' +
              '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</button>' +
            '<button class="chat-close-btn" id="chat-close" aria-label="Close chat">' +
              '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="chat-messages" id="chat-messages">' +
          '<div class="chat-msg bot">' +
            '<div class="chat-msg-avatar">' +
              '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-4 8c0-2.21 1.79-4 4-4s4 1.79 4 4H8z" fill="currentColor"/></svg>' +
            '</div>' +
            '<div class="chat-msg-body">' +
              '<div class="chat-msg-text">Hey there! I\'m your WasteWise assistant. Ask me anything about the platform — features, how it works, points, AI verification, you name it! You can also tap the mic to ask by voice.</div>' +
              '<div class="chat-msg-actions">' +
                '<button class="chat-speak-btn" title="Read aloud"><svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="chat-quick-replies" id="chat-quick">' +
          '<button class="chat-quick-btn" data-q="What is WasteWise?">What is WasteWise?</button>' +
          '<button class="chat-quick-btn" data-q="How does it work?">How it works</button>' +
          '<button class="chat-quick-btn" data-q="Tell me about AI verification">AI verification</button>' +
          '<button class="chat-quick-btn" data-q="How do I earn points?">Earn points</button>' +
          '<button class="chat-quick-btn" data-q="What features do you have?">Features</button>' +
        '</div>' +
        '<form class="chat-input-area" id="chat-form">' +
          '<button type="button" class="chat-mic-btn" id="chat-mic" title="Ask by voice">' +
            '<svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</button>' +
          '<input type="text" class="chat-input" id="chat-input" placeholder="Ask me anything..." autocomplete="off" />' +
          '<button type="submit" class="chat-send-btn" id="chat-send" title="Send">' +
            '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polygon points="22 2 15 22 11 13 2 9 22 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</button>' +
        '</form>' +
      '</div>';
    document.body.appendChild(wrapper);

    // Load voices
    if (synth) {
      synth.getVoices();
      if (synth.onvoiceschanged !== undefined) { synth.onvoiceschanged = function () { synth.getVoices(); }; }
    }

    var fab = document.getElementById('chat-fab');
    var panel = document.getElementById('chat-panel');
    var closeBtn = document.getElementById('chat-close');
    var form = document.getElementById('chat-form');
    var input = document.getElementById('chat-input');
    var messages = document.getElementById('chat-messages');
    var micBtn = document.getElementById('chat-mic');
    var voiceToggle = document.getElementById('chat-voice-toggle');
    var quickReplies = document.getElementById('chat-quick');
    var badge = wrapper.querySelector('.chat-fab-badge');

    // Toggle panel
    fab.addEventListener('click', function () {
      var open = panel.classList.toggle('open');
      fab.classList.toggle('open', open);
      if (open) { input.focus(); badge.style.display = 'none'; }
    });
    closeBtn.addEventListener('click', function () {
      panel.classList.remove('open');
      fab.classList.remove('open');
    });

    // Voice toggle
    voiceToggle.addEventListener('click', function () {
      voiceEnabled = !voiceEnabled;
      voiceToggle.classList.toggle('off', !voiceEnabled);
      if (!voiceEnabled && synth) { synth.cancel(); speaking = false; document.querySelectorAll('.speaking').forEach(function (el) { el.classList.remove('speaking'); }); }
    });

    // Send message
    function sendMessage() {
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      addMessage(text, 'user');
      hideQuickReplies();

      // Typing indicator
      var typing = addTyping();

      setTimeout(function () {
        var reply = findReply(text);
        typing.remove();
        var msgEl = addMessage(reply, 'bot');
        if (voiceEnabled) {
          var speakBtn = msgEl.querySelector('.chat-speak-btn');
          speakText(reply, speakBtn);
        }
      }, 600 + Math.random() * 600);
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); sendMessage(); });

    // Mic button
    micBtn.addEventListener('click', function () {
      if (recognition && recognition.running) { recognition.stop(); return; }
      micBtn.classList.add('listening');
      startListening(input, function () {
        micBtn.classList.remove('listening');
        sendMessage();
      });
      if (recognition) {
        recognition.onend = function () { micBtn.classList.remove('listening'); };
      }
    });

    // Quick replies
    quickReplies.addEventListener('click', function (e) {
      var btn = e.target.closest('.chat-quick-btn');
      if (!btn) return;
      input.value = btn.getAttribute('data-q');
      sendMessage();
    });

    // Speak buttons (delegated)
    messages.addEventListener('click', function (e) {
      var speakBtn = e.target.closest('.chat-speak-btn');
      if (!speakBtn) return;
      var text = speakBtn.closest('.chat-msg-body').querySelector('.chat-msg-text').textContent;
      speakText(text, speakBtn);
    });
  }

  function addMessage(text, role) {
    var messages = document.getElementById('chat-messages');
    var div = document.createElement('div');
    div.className = 'chat-msg ' + role;

    var avatarSvg = role === 'bot'
      ? '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-4 8c0-2.21 1.79-4 4-4s4 1.79 4 4H8z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    var html =
      '<div class="chat-msg-avatar">' + avatarSvg + '</div>' +
      '<div class="chat-msg-body">' +
        '<div class="chat-msg-text">' + formatMsg(text) + '</div>' +
        (role === 'bot' ? '<div class="chat-msg-actions"><button class="chat-speak-btn" title="Read aloud"><svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>' : '') +
      '</div>';
    div.innerHTML = html;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function addTyping() {
    var messages = document.getElementById('chat-messages');
    var div = document.createElement('div');
    div.className = 'chat-msg bot chat-typing';
    div.innerHTML =
      '<div class="chat-msg-avatar"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-4 8c0-2.21 1.79-4 4-4s4 1.79 4 4H8z" fill="currentColor"/></svg></div>' +
      '<div class="chat-msg-body"><div class="chat-typing-dots"><span></span><span></span><span></span></div></div>';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function hideQuickReplies() {
    var qr = document.getElementById('chat-quick');
    if (qr) qr.style.display = 'none';
  }

  function formatMsg(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  // ========== INIT ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();
