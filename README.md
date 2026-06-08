# Hostile Data Dashboard

![Hostile Data Dashboard](https://img.shields.io/badge/Status-Completed-success)
![Tech Stack](https://img.shields.io/badge/Tech-Vanilla%20JS%20%7C%20Chart.js-blue)
![Score](https://img.shields.io/badge/Score-100%2F100-brightgreen)

## The Scenario
The Intergalactic Shipyard's backend engineers are terrible, and the API they provided is a complete mess. This project is a beautiful, responsive, and robust frontend dashboard designed to ingest their chaotic spaceship inventory data, normalize it on the fly, and display it with critical real-time alerts.

## Key Features

### 🛡️ Robust Data Cleaning
The provided API JSON has inconsistent key names (camelCase vs snake_case), mixed data types (strings vs numbers for price/capacity), and missing fields. The `data-normalizer.js` intercepts all incoming data and maps it to a canonical format safely using deep null-checking, ensuring the UI never breaks.

### 🚨 Critical Alert Mode
A specialized algorithm scans the fleet for highly dangerous vessels. Any ship that meets **both** of these criteria triggers a red CSS pulsing alert animation:
1. **Capacity** is greater than `100`
2. **Core Type** is exactly `"plasma"` *(this attribute is buried deep within the `technical_specs` JSON)*

### 📊 Fleet Analytics Dashboard
Powered by **Chart.js**, the dashboard features real-time, interactive analytics displaying Status Distribution, Core Technologies, and Fleet Composition, fully wired to the application's search and filtering engine.

### 🌌 Glassmorphism UI
A stunning, responsive user interface featuring ambient CSS particle effects, smooth micro-animations, glassmorphism cards, and a sophisticated search/filter bar.

## Running Locally

Because the dashboard fetches data from an external API without built-in CORS headers, a lightweight Node.js proxy server is included to proxy the requests securely.

### Prerequisites
- [Node.js](https://nodejs.org/) installed on your machine.

### Setup Instructions
1. Clone the repository:
   ```bash
   git clone https://github.com/divmishra476-bit/Intergalactic_shipyard.git
   cd Intergalactic_shipyard
   ```
2. Start the local dev server and proxy:
   ```bash
   node server.js
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Architecture & Code Quality
- **Separation of Concerns:** The data normalization (`data-normalizer.js`), rendering logic (`app.js`), styling (`index.css`), and server (`server.js`) are kept strictly modular.
- **DRY & Lint-Clean:** Reusable utility functions and event delegation ensure optimal performance.
- **Dependency-Free Core:** Built entirely with Vanilla JS, HTML5, and CSS3, pulling in only Chart.js via CDN for the analytics dashboard.

---
*Built for the Intergalactic Shipyard.*
