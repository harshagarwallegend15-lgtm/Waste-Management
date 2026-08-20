// WasteWise Chatbot — casual, friendly AI assistant with voice support
(function () {
  'use strict';

  // ========== KNOWLEDGE BASE (local fallback) ==========
  var KB = [
    // --- Greetings ---
    { keys: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'good afternoon', 'namaste', 'sup', 'yo', 'hola'], reply: "Hey there! Welcome to WasteWise! 😊 I'm your friendly guide to everything waste management. What would you like to know?" },
    { keys: ['how are you', 'how r u', 'whats up', "what's up", 'how do you do'], reply: "I'm doing awesome, thanks for asking! Ready to help you out. What's on your mind?" },
    { keys: ['thank', 'thanks', 'thx', 'ty', 'appreciate'], reply: "You're welcome! Happy to help. Anything else you'd like to know? 😊" },
    { keys: ['bye', 'goodbye', 'see you', 'later', 'gotta go'], reply: "See you later! Remember — every small step towards clean waste management counts. Take care! 🌱" },

    // --- What is WasteWise ---
    { keys: ['what is wastewise', 'about wastewise', 'tell me about', 'who are you', 'what is this', 'what do you do', 'introduce', 'about this app', 'about this platform', 'explain wastewise'], reply: "WasteWise is a smart waste management platform built for Indian communities! We use **AI photo verification**, **GPS tracking**, and **gamification** to make sure waste actually gets collected and neighborhoods stay clean. Think of it like Uber for garbage — but with AI proof that the job was done! 🏙️" },

    // --- How does it work ---
    { keys: ['how does it work', 'how it works', 'process', 'workflow', 'explain process', 'what is the process', 'how do you work'], reply: "It's super simple — 5 steps:\n\n1. **Request** — Snap a photo of your waste, GPS is auto-recorded\n2. **Route** — A collector in your area sees your request\n3. **Collect** — They come pick it up and take an after-photo\n4. **Verify** — AI compares both photos to make sure it's legit\n5. **Reward** — You earn 20 points! 🎉\n\nWant me to go deeper on any step?" },
    { keys: ['step 1', 'first step', 'step one', 'how to request', 'submit request', 'new request', 'how to submit'], reply: "Step 1 — **Request**! Here's how:\n\n1. Log in as a Resident\n2. Go to your dashboard and tap **New Request**\n3. Take a photo of your waste (GPS is auto-captured!)\n4. Pick the waste type: Mixed, Wet, Dry, or Hazardous\n5. Hit submit!\n\nThat's it — a collector will see your request and head your way. Easy, right?" },
    { keys: ['step 2', 'second step', 'step two', 'how does collector', 'collector see', 'collector route'], reply: "Step 2 — **Route**! Once you submit, collectors in your area instantly see your request on their dashboard. They get:\n- Your exact GPS location\n- A Google Maps link for directions\n- Your waste type and description\n\nNo phone calls needed — everything is automatic! 📍" },
    { keys: ['step 3', 'third step', 'step three', 'how does collection', 'collector collect', 'pickup'], reply: "Step 3 — **Collect**! The collector:\n1. Drives to your location (GPS-verified arrival)\n2. Picks up the waste\n3. Taps 'I'm at the location'\n4. Snaps an after-photo as proof\n\nThe whole thing is tracked so you know exactly when it happens! 🚛" },
    { keys: ['step 4', 'fourth step', 'step four', 'how does verify', 'ai verify', 'verification step'], reply: "Step 4 — **Verify** — this is the cool part! 🤖\n\nOur AI compares your before-photo and the collector's after-photo using 9 different signals:\n- Color matching, texture analysis, edge detection\n- Even the Groq AI vision model double-checks!\n\nIf it matches, you're verified. If not, an admin reviews it manually." },
    { keys: ['step 5', 'fifth step', 'step five', 'what do i get', 'what happens after'], reply: "Step 5 — **Reward**! Once verified:\n- You get **+20 points** (collector gets +10)\n- Your leaderboard position updates\n- Your society score improves\n- Community stats update in real-time!\n\nPoints stack up and unlock better rankings for your whole neighborhood! 🏆" },

    // --- Get started ---
    { keys: ['get started', 'start', 'how to start', 'begin', 'how to use', 'how do i use', 'how to join', 'sign up', 'register', 'create account'], reply: "Getting started takes 2 minutes! 🚀\n\n1. Click **Sign In** on the homepage\n2. Choose your role: Resident, Collector, or Admin\n3. Sign up with your email and password\n4. Fill in your name, phone, and allow GPS\n\nOr just try the demo accounts:\n- **Resident**: resident@wastewise.app / Resident@123\n- **Collector**: collector@wastewise.app / Collector@123\n- **Admin**: admin@wastewise.app / Admin@123\n\nWant me to walk you through any of these?" },

    // --- Features ---
    { keys: ['feature', 'features', 'what can it do', 'capabilities', 'what do you offer', 'what features', 'all features'], reply: "We've got a lot packed in! Here are the highlights:\n\n- **AI photo verification** — every collection is verified\n- **GPS tracking** — auto-captured for requests & pickups\n- **Points & leaderboards** — earn rewards for being active\n- **Society scores** — your neighborhood's health grade\n- **Community challenges** — earn bonus points together\n- **Dumping reports** — snap illegal dumping, earn 15 pts\n- **Problem board** — flag local issues (streetlights, drainage)\n- **5 languages** — English, Hindi, Kannada, Tamil, Bengali\n- **Voice assistant** — that's me! Ask by voice too 🎤\n\nWant to know more about any of these?" },

    // --- Points ---
    { keys: ['point', 'points', 'earn', 'earn points', 'how many points', 'scoring', 'reward', 'rewards', 'how to earn', 'ways to earn', 'maximum points', 'best way'], reply: "Here's how you stack up points 💰:\n\n- **+20 pts** per verified collection (your waste gets picked up & AI-verified)\n- **+15 pts** per verified dumping report\n- **+5 pts** for completing education lessons\n- **Bonus** from community challenges (your whole society benefits!)\n\nPro tip: Segregated waste gets verified faster than mixed waste. So sort your wet, dry, and hazardous waste separately!" },
    { keys: ['leaderboard', 'top users', 'ranking', 'who is winning', 'top resident', 'top collector'], reply: "We've got 3 leaderboards:\n\n- **Residents** — ranked by total points (top 15 shown)\n- **Collectors** — ranked by total points (top 10 shown)\n- **Societies** — ranked by community score (0-100)\n\nEverything updates in real-time — so when you earn points, you'll see your rank change instantly! 📊" },

    // --- Society ---
    { keys: ['society', 'society score', 'community', 'housing', 'complex', 'apartment', 'neighborhood', 'what is society'], reply: "Your society score is basically your neighborhood's report card — scored 0 to 100! 🏘️\n\nIt's based on:\n- **Participation** (40%) — how many residents are active\n- **Disposal rate** (30%) — verified vs total requests\n- **Segregation** (15%) — properly sorted waste\n- **Reports** (10%) — dumping reports per resident\n\n**Green** (70+) = great! **Amber** (40-69) = okay. **Red** (<40) = needs work.\n\nHigher score = your problems get fixed faster by the municipality! 💪" },
    { keys: ['join society', 'switch society', 'change society', 'my society', 'which society'], reply: "Joining or switching your society is easy! Go to the **My Society** tab on your resident dashboard. You'll see nearby societies sorted by distance. Just pick one and you're in! Your points and history stay with you. 📍" },
    { keys: ['nearby', 'near me', 'societies near', 'distance', 'find society'], reply: "Check the **Societies Near You** tab — it uses your GPS to find housing communities nearby. Each one shows its name, score, address, distance, member count, and participation stats. It's like a community health check! 🗺️" },

    // --- Challenges ---
    { keys: ['challenge', 'challenges', 'community challenge', 'challenge bonus', 'bonus points'], reply: "Challenges are community-level goals set by admins! There are 4 types:\n\n- **Collections** — hit a target number of verified collections\n- **Reports** — submit a target number of dumping reports\n- **Participation** — get enough unique active residents\n- **Score** — reach a society score target\n\nWhen your society hits the target, **ALL** residents earn bonus points! 🎯" },

    // --- Dumping ---
    { keys: ['dumping', 'illegal dumping', 'report', 'dumping report', 'illegal waste', 'how to report', 'report dumping'], reply: "Spotted illegal dumping? Here's what to do:\n\n1. Go to the **Reports** tab on your dashboard\n2. Tap **Report Dumping**\n3. Take a photo of the dumped waste\n4. Add a description\n5. GPS is auto-captured!\n\nOnce verified by admin, you earn **15 points**! Plus your report helps the municipality identify hotspots and take action. Every report counts! 📸" },
    { keys: ['hotspot', 'hotspots', 'dumping hotspot', 'cluster', 'hotspot map'], reply: "Admins see a **Dumping Hotspot Map** that clusters verified reports into ~500m grid cells. Each cluster shows incident count, area name, and sample timestamps. They can click to open Google Maps at the exact location. This helps them spot patterns and deploy resources where they're needed most! 🗺️" },

    // --- Problem Board ---
    { keys: ['problem', 'problem board', 'society problem', 'issue', 'complaint', 'streetlight', 'drainage', 'post problem'], reply: "The **Society Problem Board** is where you flag local issues — broken streetlights, clogged drains, cleanliness concerns, anything!\n\n- Post a problem with title, description, and photo\n- Other residents can comment on it\n- Higher-scoring societies get **priority attention** from admins\n- Status goes: Open → In Progress → Resolved\n\nSo keeping your society score high literally helps get problems fixed faster! 💡" },

    // --- AI / Verification ---
    { keys: ['ai', 'artificial intelligence', 'computer vision', 'machine learning', 'ml', 'how does ai', 'ai verify', 'verification', 'how does verification', 'how does ai work'], reply: "Great question! We use a **two-layer verification** system:\n\n**Layer 1 — Local CV (instant):**\nRuns on the server. Checks texture, colors, edges, skin-tone (rejects selfies!). If score >= 0.62, it's auto-accepted.\n\n**Layer 2 — Groq AI Vision (borderline cases):**\nUses the qwen/qwen3.6-27b model to confirm it's real waste.\n\nFor collection verification, we compare before/after photos using 9 signals — color histograms, texture matching, edge density, and more. Verdicts: VERIFIED ✅, FLAGGED ⚠️, or REJECTED ❌" },
    { keys: ['garbage gate', 'photo gate', 'photo check', 'garbage check', 'waste photo', 'fake photo', 'wrong photo', 'reject photo', 'why rejected'], reply: "The **Garbage Photo Gate** is our anti-fraud system! Before you can submit, it checks:\n\n- Is there enough texture (actual objects, not a blank wall)?\n- Is there color variation (waste isn't just one solid color)?\n- Is there a person in the photo? (Selfies get rejected! 🤳)\n- Does it look like a landscape or sky? (Not waste!)\n\nThis stops people from gaming the system with random photos. Only real waste photos pass through! ✅" },
    { keys: ['match score', 'score', 'confidence', 'verdict', 'verified flagged rejected', 'what does verified', 'what does flagged'], reply: "Every collection gets a **match score** (0-100%) based on 9 weighted signals:\n\n- Spatial color histogram (24%)\n- Foreground class histogram (26%)\n- Texture variance (15%)\n- HSV histogram (12%)\n- Perceptual hash (7%)\n- Global class histogram (6%)\n- Edge density (4%)\n- Differential hash (4%)\n- Average hash (2%)\n\n**VERIFIED** = high confidence, points awarded! ✅\n**FLAGGED** = borderline, admin reviews ⚠️\n**REJECTED** = clear mismatch ❌" },

    // --- Resident ---
    { keys: ['resident', 'as a resident', 'resident can', 'what can resident', 'resident features', 'i am a resident'], reply: "As a **Resident**, you can:\n- Submit waste collection requests with photo proof\n- Track your request history with status updates\n- Report illegal dumping (+15 pts when verified)\n- Join your society's problem board\n- Earn points for verified collections (+20 pts)\n- Climb the leaderboard\n- See nearby societies and their scores\n- Participate in community challenges\n- Get behaviour-based segregation tips\n\nAll in real-time, with 5 languages! 🌟" },

    // --- Collector ---
    { keys: ['collector', 'as a collector', 'collector can', 'what can collector', 'collector features', 'i am a collector'], reply: "As a **Collector**, you get:\n- See residents in your area with pending requests\n- Exact GPS location + Google Maps link\n- Tap 'I'm at the location' (GPS verified)\n- Snap an after-photo → AI verifies the pickup\n- Earn **10 points** per verified collection\n- Realtime updates when new requests come in\n- Your own leaderboard ranking\n\nPlus, you only see residents in **YOUR** assigned area — fair and organized! 🚛" },

    // --- Admin ---
    { keys: ['admin', 'municipality', 'municipality admin', 'as an admin', 'what can admin', 'admin features', 'i am admin'], reply: "Admins get the full picture:\n- **Live KPI dashboard** — residents, collectors, requests, verifications\n- **Dumping hotspot maps** with cluster analysis\n- **14-day trend charts** for tracking progress\n- **Collection verification review** with manual override\n- **Problem management** across all societies\n- **Challenge creation** and management\n- **Three leaderboards** — residents, collectors, societies\n- **User search & drill-down** with full activity history\n\nIt's like mission control for city waste management! 🏛️" },

    // --- GPS ---
    { keys: ['gps', 'location', 'geolocation', 'map', 'maps', 'coordinates', 'where am i'], reply: "GPS is built into everything! Here's how it's used:\n\n- **Residents**: GPS auto-captured when you submit a request\n- **Collectors**: GPS verified when arriving at location\n- **Reports**: GPS auto-captured for dumping reports\n- **Societies**: Distance calculated from your location\n\nAll locations open in **Google Maps** with one tap. Coordinates stored to 5 decimal places (~1 meter accuracy)! 📍" },

    // --- Language ---
    { keys: ['language', 'languages', 'hindi', 'kannada', 'tamil', 'bengali', 'multi language', 'multilingual', 'translation', 'translate', 'change language'], reply: "We support **5 languages**:\n\n- English\n- Hindi (हिन्दी)\n- Kannada (ಕನ್ನಡ)\n- Tamil (தமிழ்)\n- Bengali (বাংলা)\n\nJust click the **globe icon** in the header and pick your language! The entire interface updates instantly — nav, buttons, status labels, everything. 🌍" },

    // --- Voice ---
    { keys: ['voice', 'speak', 'speech', 'talk', 'listening', 'voice assistant', 'voice mode', 'can you speak'], reply: "I'm your voice assistant! 🎤\n\n- Click the **microphone button** in the chat to ask by voice\n- I'll respond in text AND voice\n- Click the **speaker button** on any message to hear it again\n- Click the **speaker icon** in the header to toggle voice on/off\n\nWorks best in Chrome!" },
    { keys: ['voice not working', 'mic not working', 'microphone', 'cant hear', 'no sound', 'audio', 'not listening'], reply: "Voice not working? Here's what to try:\n\n1. **Use Chrome** — it works best for voice features\n2. **Allow microphone** when your browser asks\n3. **Check device volume** for text-to-speech\n4. **Make sure you're not on silent** mode\n5. **Try refreshing** the page\n\nStill stuck? Tell me exactly what's happening and I'll help! 🔧" },

    // --- Camera ---
    { keys: ['camera', 'photo', 'picture', 'snap', 'capture', 'upload', 'take photo', 'cant take photo', 'camera not working'], reply: "We use your device's camera to snap waste photos! Here's the deal:\n\n- It uses the **rear camera** by default (better quality)\n- Resolution is 1280px — good enough for AI verification\n- GPS and timestamp are auto-recorded\n- If camera isn't available (desktop without webcam), you'll see a fallback message\n\nCamera not working? Make sure you've allowed camera permissions in your browser! 📷" },

    // --- Realtime ---
    { keys: ['realtime', 'real time', 'live', 'auto refresh', 'update', 'websocket', 'page refresh', 'do i need to refresh'], reply: "Everything updates **in real-time** — no page refresh needed! 🔄\n\nPoints, requests, reports, problems, challenges, leaderboards — they all update instantly using Supabase live subscriptions. If real-time isn't available for some reason, we fall back to polling every 8-30 seconds." },

    // --- Auth ---
    { keys: ['login', 'signup', 'sign up', 'register', 'account', 'password', 'email', 'auth', 'authentication', 'log in', 'forgot password'], reply: "Getting started is easy!\n\n1. Click **Sign In** on the homepage\n2. Choose your role: Resident, Collector, or Admin\n3. **Residents & Collectors**: Sign up with email + password (min 6 chars), then fill in name, phone, and GPS\n4. **Admins**: Pre-configured accounts only (no self-registration)\n\nYour session is stored securely with JWT tokens. Can't mix roles — a resident account won't work on the collector page! 🔐" },

    // --- Demo ---
    { keys: ['demo', 'demo account', 'try', 'test', 'play around', 'try it out', 'test account'], reply: "Want to explore? We've got demo accounts ready!\n\n- **Resident**: resident@wastewise.app / Resident@123\n- **Collector**: collector@wastewise.app / Collector@123\n- **Admin**: admin@wastewise.app / Admin@123\n\nThese are pre-filled on each login page. Go ahead and explore — you won't break anything! 🎮" },

    // --- Education ---
    { keys: ['education', 'segregation', 'segregate', 'wet waste', 'dry waste', 'hazardous', 'recycling', 'learn', 'lesson', 'waste type', 'waste types'], reply: "We've got **behaviour-based education**! Here's how it works:\n\n- Submit 2+ **mixed waste** collections → you get a segregation lesson\n- Complete 5 **properly segregated** collections in a row → recognition badge + **5 bonus points**! 🏅\n\nWaste types:\n- **Wet** 🟢: food scraps, organic matter\n- **Dry** 🔵: paper, plastic, metal, glass\n- **Hazardous** 🔴: batteries, chemicals, medical waste\n\nProper segregation helps recycling and reduces landfill impact! ♻️" },

    // --- Tech ---
    { keys: ['tech', 'technology', 'stack', 'built with', 'framework', 'database', 'supabase', 'backend', 'frontend', 'code'], reply: "Under the hood:\n\n- **Frontend**: Vanilla HTML/CSS/JS — no frameworks, just clean code!\n- **Backend**: Express.js 5 on Vercel serverless\n- **Database**: Supabase (PostgreSQL + realtime subscriptions)\n- **AI**: Groq API — qwen vision for photos, llama for chat\n- **Image processing**: Sharp library\n- **Storage**: Supabase Storage for photo uploads\n\nLightweight, fast, works great even on slow connections! ⚡" },

    // --- API ---
    { keys: ['api', 'endpoint', 'rest api', 'backend api', 'http'], reply: "Our REST API covers everything:\n- Auth (login, register)\n- Collection requests (create, list, complete)\n- Dumping reports (submit, list, verify)\n- Problems (post, list, comment, status)\n- Challenges (create, list, close)\n- Points & leaderboards\n- Admin dashboards\n- Education\n- Society management\n- Chat (that's how I work!)\n\nAll protected with JWT auth and role-based access! 🔌" },

    // --- Stats ---
    { keys: ['stat', 'stats', 'numbers', 'data', 'how many', 'community stats', 'platform stats'], reply: "Current platform stats:\n\n- **6** Communities onboarded\n- **3** Service Zones active\n- **100%** Photo verification rate\n- **33** Verified collections completed\n- **9** Verified dumping reports\n- **13** Open problems tracked\n- **850** Top resident score\n\nAnd these numbers are growing every day! 📈" },

    // --- Security ---
    { keys: ['security', 'secure', 'safe', 'privacy', 'data protection', 'is it safe'], reply: "Security is built in at every layer:\n\n- JWT-based authentication\n- Role-based access control (residents can't access collector features)\n- Supabase Row Level Security (RLS) on all tables\n- 401 auto-clears expired sessions\n- GPS coordinates stored securely\n- Photo storage is public only for verified content (transparency!)\n\nYour data is protected! 🔒" },

    // --- Problem status ---
    { keys: ['problem status', 'open problem', 'resolved', 'in progress', 'problem update'], reply: "Problems go through 3 statuses:\n\n- **Open** — newly reported, waiting for attention\n- **In Progress** — municipality is working on it\n- **Resolved** — fixed! 🎉\n\nHigher-scoring societies get priority. So keeping your society active and clean literally helps get problems resolved faster!" },

    // --- Fallback / Help ---
    { keys: ['help', 'what can you tell me', 'tell me more', 'explain', 'what do you know', 'options'], reply: "I know a lot about WasteWise! Here's what I can help with:\n\n- What is WasteWise?\n- How the 5-step process works\n- How to get started\n- Features for residents, collectors, and admins\n- AI verification system\n- Points and rewards\n- Society scores and how they work\n- Community challenges\n- Dumping reports\n- Problem board\n- GPS and location features\n- Multi-language support\n- Voice assistant\n- Demo accounts\n- Tech stack and security\n\nJust ask me anything! 😊" }
  ];

  // ========== INTENT MATCHING ==========
  // ========== CONVERSATION HISTORY ==========
  var chatHistory = [];

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
  var listening = false;
  var synth = window.speechSynthesis || null;
  var speaking = false;

  var LANG_VOICE_MAP = {
    en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN', ta: 'ta-IN', bn: 'bn-IN'
  };

  function getCurLang() {
    return (window.WWI18n && window.WWI18n.getLang()) || 'en';
  }

  function getVoiceLang() {
    return LANG_VOICE_MAP[getCurLang()] || 'en-IN';
  }

  function findVoice(langTag) {
    var voices = synth ? synth.getVoices() : [];
    var prefix = langTag.split('-')[0];
    // Prefer local voice for the language, then any voice matching prefix
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].lang === langTag && voices[i].localService) return voices[i];
    }
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].lang === langTag) return voices[i];
    }
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].lang.indexOf(prefix) === 0 && voices[i].localService) return voices[i];
    }
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].lang.indexOf(prefix) === 0) return voices[i];
    }
    return null;
  }

  function initRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    var r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.lang = getVoiceLang();
    return r;
  }

  function speakText(text, btn) {
    if (!synth) return;
    synth.cancel();
    var clean = text.replace(/\*\*/g, '').replace(/\n+/g, '. ').replace(/[#*\-_]/g, '');
    if (!clean.trim()) return;
    var utter = new SpeechSynthesisUtterance(clean);
    var langTag = getVoiceLang();
    utter.lang = langTag;
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    var voice = findVoice(langTag);
    if (voice) utter.voice = voice;
    speaking = true;
    if (btn) btn.classList.add('speaking');
    utter.onend = function () { speaking = false; if (btn) btn.classList.remove('speaking'); };
    utter.onerror = function () { speaking = false; if (btn) btn.classList.remove('speaking'); };
    synth.speak(utter);
  }

  function stopSpeaking() {
    if (synth) synth.cancel();
    speaking = false;
    document.querySelectorAll('.chat-speak-btn.speaking').forEach(function (b) { b.classList.remove('speaking'); });
  }

  function startListening(inputEl, sendFn) {
    if (!recognition) recognition = initRecognition();
    if (!recognition) {
      alert('Voice input is not supported in your browser. Try Chrome or Edge!');
      return;
    }
    // Stop any ongoing speech before listening
    stopSpeaking();

    recognition.onresult = function (e) {
      var transcript = e.results[0][0].transcript;
      inputEl.value = transcript;
      listening = false;
      sendFn();
    };
    recognition.onerror = function (e) {
      listening = false;
      var micBtn = document.getElementById('chat-mic');
      if (micBtn) micBtn.classList.remove('listening');
      if (e.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone permissions in your browser settings.');
      } else if (e.error === 'no-speech') {
        // Silently handle — user just didn't say anything
      } else if (e.error === 'network') {
        alert('Voice recognition requires an internet connection.');
      }
    };
    recognition.onend = function () {
      listening = false;
      var micBtn = document.getElementById('chat-mic');
      if (micBtn) micBtn.classList.remove('listening');
    };
    try {
      listening = true;
      recognition.start();
    } catch (err) {
      listening = false;
    }
  }

  function stopListening() {
    if (recognition) {
      try { recognition.stop(); } catch (e) { /* ignore */ }
    }
    listening = false;
    var micBtn = document.getElementById('chat-mic');
    if (micBtn) micBtn.classList.remove('listening');
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

    // Load voices and re-init recognition on language change
    if (synth) {
      synth.getVoices();
      if (synth.onvoiceschanged !== undefined) { synth.onvoiceschanged = function () { synth.getVoices(); }; }
    }
    document.addEventListener('ww:i18n', function () {
      recognition = null; // force re-init with new language on next mic press
      stopSpeaking();
    });

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

    // Voice toggle — enable/disable voice responses
    voiceToggle.addEventListener('click', function () {
      voiceEnabled = !voiceEnabled;
      voiceToggle.classList.toggle('off', !voiceEnabled);
      if (!voiceEnabled) stopSpeaking();
    });

    // Send message — tries Groq API first, falls back to local KB
    function sendMessage() {
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      addMessage(text, 'user');
      hideQuickReplies();

      // Add to history
      chatHistory.push({ role: 'user', content: text });

      // Typing indicator
      var typing = addTyping();

      // Try Groq API first — send current language for multilingual replies
      var curLang = (window.WWI18n && window.WWI18n.getLang()) || 'en';
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: chatHistory.slice(-12), lang: curLang })
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        typing.remove();
        if (data.reply) {
          chatHistory.push({ role: 'assistant', content: data.reply });
          var msgEl = addMessage(data.reply, 'bot');
          if (voiceEnabled) {
            var speakBtn = msgEl.querySelector('.chat-speak-btn');
            speakText(data.reply, speakBtn);
          }
        } else {
          // API returned no reply — use local KB
          fallbackReply(text);
        }
      })
      .catch(function () {
        typing.remove();
        fallbackReply(text);
      });
    }

    function fallbackReply(text) {
      var reply = findReply(text);
      chatHistory.push({ role: 'assistant', content: reply });
      var msgEl = addMessage(reply, 'bot');
      if (voiceEnabled) {
        var speakBtn = msgEl.querySelector('.chat-speak-btn');
        speakText(reply, speakBtn);
      }
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); sendMessage(); });

    // Mic button — toggle voice input
    micBtn.addEventListener('click', function () {
      if (listening) {
        stopListening();
        return;
      }
      micBtn.classList.add('listening');
      startListening(input, function () {
        micBtn.classList.remove('listening');
        sendMessage();
      });
    });

    // Quick replies
    quickReplies.addEventListener('click', function (e) {
      var btn = e.target.closest('.chat-quick-btn');
      if (!btn) return;
      input.value = btn.getAttribute('data-q');
      sendMessage();
    });

    // Speak buttons (delegated) — toggle play/stop
    messages.addEventListener('click', function (e) {
      var speakBtn = e.target.closest('.chat-speak-btn');
      if (!speakBtn) return;
      if (speakBtn.classList.contains('speaking')) {
        stopSpeaking();
        return;
      }
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
