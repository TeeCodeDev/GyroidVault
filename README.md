# 🗄️ GyroidVault

**GyroidVault** is a modern, self-hosted 3D model library and print management platform. Organize your STL, 3MF, and Gcode files, track your print history, and manage your projects in a beautiful, responsive dashboard.

![GyroidVault Dashboard](https://via.placeholder.com/1200x600.png?text=GyroidVault+Dashboard+Preview)

## ✨ Features

- **📂 Smart Library**: Automatic scanning of your local folders or manual uploads.
- **🔮 3D Viewer**: Interactive STL preview directly in your browser.
- **🏗 Project Collections**: Group related models together (e.g., multi-part builds).
- **🔄 Versioning**: Keep track of design iterations (v1, v2, v3) under a single entry.
- **🖨 Print History**: Log your prints, material usage, and success rates.
- **🔗 Public Sharing**: Generate temporary, secure links to share models with friends.
- **🔑 Multi-User**: Role-based access control (Admin/User).
- **🔌 Slicer Integration**: Open files directly in Bambu Studio, PrusaSlicer, or OrcaSlicer.
- **📧 Password Recovery**: Built-in SMTP support for account management.

## 🚀 Quick Start with Docker

The easiest way to run PrintVault is using Docker Compose.

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/YOUR_USERNAME/GyroidVault.git
    cd GyroidVault
    ```

2.  **Configure your library**:
    Open `docker-compose.yml` and map your 3D prints folder to `/library`:
    ```yaml
    volumes:
      - ./data:/app/data
      - /path/to/your/3dprints:/library
    ```

3.  **Start the application**:
    ```bash
    docker-compose up -d --build
    ```

4.  **Access GyroidVault**:
    Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🛠 Manual Installation

If you prefer to run it without Docker:

1.  Install [Node.js](https://nodejs.org/) (v18+).
2.  Clone this repo and run `npm install`.
3.  Set your library path in `server/index.js` or via `LIBRARY_PATH` environment variable.
4.  Run `npm start`.

## 🛡 Security

- First registered user automatically becomes the **Admin**.
- All uploads and system settings are restricted to authenticated users.
- Database is stored locally in SQLite for privacy and easy backups.

## 📜 License

MIT License - feel free to use and contribute!
