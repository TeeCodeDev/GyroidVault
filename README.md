# 🗄️ GyroidVault

**GyroidVault** is a modern, self-hosted 3D model library and print management platform designed for enthusiasts and professionals. Organize your STL, 3MF, and Gcode files, track your print history, and manage your projects in a beautiful, responsive dashboard.

![GyroidVault Dashboard](https://via.placeholder.com/1200x600.png?text=GyroidVault+Premium+Dashboard)

## ✨ Features

- **🌓 Theme Support**: Seamlessly toggle between a sleek dark mode and a crisp light mode.
- **⚡️ Batch Operations**: Select multiple models to move, delete, or add to collections in one go.
- **📂 Smart Library**: Automatic background scanning of your local folders or manual web-based uploads.
- **🔮 Interactive 3D Viewer**: High-performance STL and 3MF preview directly in your browser.
- **🏗 Project Collections**: Group related models together for complex, multi-part builds.
- **🔄 Design Iterations**: Keep track of versioning (v1, v2, v3) under a single model entry.
- **🖨 Print History Log**: Track material usage, print times, and success rates.
- **🔗 Secure Public Sharing**: Generate temporary, secure links to share specific models with others.
- **🔌 One-Click Slicing**: Open files directly in **Bambu Studio**, **PrusaSlicer**, **OrcaSlicer**, or **Elegoo Slicer**.
- **🔑 User Management**: Role-based access control (Admin/User) to keep your vault private.
- **🎨 Premium Aesthetics**: Sleek dark mode interface with glassmorphism and smooth animations.

## 🚀 Quick Start with Docker

The easiest way to run GyroidVault is using Docker Compose.

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
    Open [http://localhost:3457](http://localhost:3457) in your browser.

## 🛠 Manual Installation

1.  Install [Node.js](https://nodejs.org/) (v18+).
2.  Clone this repo and run `npm install`.
3.  Copy `.env.example` to `.env` and configure your settings.
4.  Run `npm start`.

## 🛡 Security & Privacy

- **SQLite Database**: Your data stays on your hardware. No external cloud database required.
- **Admin Control**: The first registered user automatically becomes the Admin.
- **Encrypted Files**: Files are handled securely and can be managed directly from the UI.

## 📜 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See the [LICENSE](LICENSE) file for details. This ensures that the software remains free and that any improvements made by the community are shared back.

---
*Built with ❤️ for the 3D Printing Community.*
