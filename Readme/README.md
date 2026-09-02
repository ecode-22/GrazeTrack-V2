#  GrazingTrack

**Rotational grazing management for farmers — offline-first, no account needed.**

GrazingTrack is a Progressive Web App (PWA) that helps farmers plan, track, and optimise rotational grazing cycles. Draw your paddocks on a satellite map, log grazing events, and let the app tell you when each camp is ready to graze again.

Built by a farmer-coder who understands that internet connectivity on a farm isn't guaranteed — so GrazingTrack works completely offline.

---

## 📸 Screenshots

> 

---

## ✨ Features

- **🗺️ Draw your farm on a satellite map** — trace your boundary and the app auto-splits it into camps, or draw each paddock manually
- **🐄 Log grazing events** — record which animal group grazed which camp, and for how long
- **📊 Recovery tracking** — each camp shows its rest progress as a percentage toward its target recovery period
- **📅 Historical analysis** — view past grazing cycles and average recovery times to plan smarter
- **📶 100% offline** — Service Workers cache everything; the app works with zero connectivity
- **🔒 Zero-account privacy** — all data stays on your device via localStorage; nothing is sent to a server

---

## 🚀 Getting Started

### Prerequisites

- A modern browser (Chrome, Firefox, Safari, Edge)
- No installation required — open and use

### Running Locally

```bash
git clone https://github.com/ecode-22/grazingtrack.git
cd grazingtrack
# Open index.html directly, or use a local server:
npx serve .
```

Then open `http://localhost:3000` in your browser.

### Installing as a PWA

On mobile or desktop, your browser will prompt you to **"Add to Home Screen"** — this installs GrazingTrack as a native-feeling app with full offline support.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript, HTML5, CSS3 |
| Maps | [Leaflet.js](https://leafletjs.com/) + satellite tile layer |
| Offline | Service Workers + Cache API |
| Storage | localStorage (device-only, no server) |
| Build | No build step required — plain files |

---

## 📁 Project Structure

```
grazingtrack/
├── index.html          # App entry point
├── style.css           # Styles
├── app.js              # Core app logic
├── map.js              # Leaflet map + paddock drawing
├── storage.js          # localStorage read/write helpers
├── sw.js               # Service Worker (offline caching)
├── manifest.json       # PWA manifest
└── assets/
    └── icons/          # App icons for PWA install
```

---

## 🗺️ How It Works

### 1. Set Up Your Farm
Draw your farm boundary on the satellite map. GrazingTrack can auto-split the boundary into equal camps, or you can draw each paddock manually.

### 2. Log a Grazing Event
When you move animals into a camp, log the event: which animal group, how many head, and the date. The camp is now marked as **resting**.

### 3. Track Recovery
Each camp displays its rest progress as a bar toward its target recovery period (which you set per camp). When a camp hits 100%, it's ready to graze again.

### 4. Analyse & Plan
View historical grazing logs to see how long your camps typically take to recover, and use that data to plan future rotations and stocking density.

---

## 🔒 Privacy

GrazingTrack stores **all data locally on your device** using the browser's localStorage API. No account is required. No data is transmitted to any server. If you clear your browser data, your farm data will be cleared too — consider exporting a backup periodically.

---

## 🛠️ Planned Features (V2)

- [ ] GPS auto-detect farm boundary
- [ ] Export grazing history to CSV
- [ ] Multi-device sync (optional, opt-in)
- [ ] Animal weight gain tracking
- [ ] Camp-level soil recovery notes

---

## 🤝 Contributing

Contributions are welcome! If you're a farmer with feedback, or a developer who wants to help:

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📄 Licence

MIT Licence — see [LICENSE](LICENSE) for details.

---

## 👤 Author

**Ehan Badenhorst**
Junior Software Engineer & Agricultural Enthusiast
🔗 [github.com/ecode-22](https://github.com/ecode-22)
📧 badenhorstehan2@gmail.com

---

*Built because no existing grazing app worked offline and didn't need an account. Sometimes you just have to build the thing yourself.*